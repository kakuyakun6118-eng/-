import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, DocumentReference, setDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { authReady, db, isFirebaseConfigured, TRIP_ID } from "../firebase";
import { LocalDoc } from "../data/local";
import {
  defaultLearner,
  LEARNER_IDS,
  LearnerId,
  LearnerProgress,
} from "../types";
import { nextStat, PhraseStat, scoreFor } from "../phrases/quiz";
import { todayKey, yesterdayKey } from "../utils/date";

/** Both learners' records live here so each phone can show the other's score. */
type Learners = Record<LearnerId, LearnerProgress>;

/**
 * Progress is stored as a `learners` field *inside* the trip document rather
 * than in a collection of its own. The Firestore rules already published for
 * this app (see firestore.rules) grant access to `trips/{tripId}` but not to
 * new subcollections, so keeping it here means the phrase tab works on an
 * existing setup with no changes in the Firebase console.
 */
interface TripDocWithLearners {
  learners?: Partial<Record<LearnerId, LearnerProgress>>;
}

function emptyLearners(): Learners {
  return { me: defaultLearner("me"), partner: defaultLearner("partner") };
}

const localDocs: Record<LearnerId, LocalDoc<LearnerProgress>> = {
  me: new LocalDoc<LearnerProgress>("ny-trip:learner:me", defaultLearner("me")),
  partner: new LocalDoc<LearnerProgress>("ny-trip:learner:partner", defaultLearner("partner")),
};

/** Which traveller is holding this phone. Always device-local, never synced. */
const ACTIVE_KEY = "ny-trip:learner-active";

function readActiveLearner(): LearnerId {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw === "me" || raw === "partner") return raw;
  } catch {
    // Private browsing — fall through to the default.
  }
  return "me";
}

/** Old records may predate a field, so fill the gaps before use. */
function hydrate(id: LearnerId, value: Partial<LearnerProgress> | undefined): LearnerProgress {
  return { ...defaultLearner(id), ...(value ?? {}) };
}

/** True while nothing has been studied under this record yet. */
function isUntouched(learner: LearnerProgress): boolean {
  return learner.xp === 0 && Object.keys(learner.stats).length === 0;
}

/** Keeps the study history from growing without bound. */
function trimHistory(history: Record<string, number>): Record<string, number> {
  const keys = Object.keys(history).sort();
  if (keys.length <= 30) return history;
  return Object.fromEntries(keys.slice(-30).map((k) => [k, history[k]]));
}

/**
 * Replaces one learner's record.
 *
 * `updateDoc` with a dotted path swaps the whole nested object, which
 * `setDoc(..., { merge: true })` would not: merging leaves deleted keys
 * behind, so resetting progress would keep every old phrase stat. The
 * `setDoc` below is only for the case where the trip document doesn't exist
 * yet (a brand new trip whose first write happens to be a quiz answer).
 */
async function writeLearner(tripRef: DocumentReference, id: LearnerId, next: LearnerProgress) {
  try {
    await updateDoc(tripRef, { [`learners.${id}`]: next });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // "not-found" means the trip document itself hasn't been created yet.
    // Anything else (a rejected write, say) fails again below and is reported.
    if (code && code !== "not-found") throw err;
    await setDoc(tripRef, { learners: { [id]: next } }, { merge: true });
  }
}

export function useLearners() {
  const [learners, setLearners] = useState<Learners>(emptyLearners);
  const [learnerId, setLearnerId] = useState<LearnerId>(readActiveLearner);
  /** Sharing was refused mid-session, so this device keeps its own record. */
  const [deviceOnly, setDeviceOnly] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Writes are computed from the newest record, not the one a callback closed over. */
  const latest = useRef<Learners>(learners);
  latest.current = learners;

  const shared = isFirebaseConfigured && !!db && !deviceOnly;

  /**
   * Sharing failed: keep what's on screen on this device and carry on there.
   * The tab shows a standing notice while this is the case, so an answer is
   * never lost to a rejected write and the user knows sync is off.
   */
  const fallBackToDevice = useCallback((reason: string) => {
    console.warn("phrase progress falling back to this device:", reason);
    for (const id of LEARNER_IDS) localDocs[id].update(latest.current[id]);
    setDeviceOnly(true);
  }, []);

  useEffect(() => {
    if (!shared) {
      const unsubs = LEARNER_IDS.map((id) =>
        localDocs[id].subscribe((value) =>
          setLearners((prev) => ({ ...prev, [id]: hydrate(id, value) })),
        ),
      );
      return () => unsubs.forEach((unsub) => unsub());
    }

    let unsub = () => {};
    let cancelled = false;
    let seeded = false;
    authReady.then(() => {
      if (cancelled || !db) return;
      const tripRef = doc(db, "trips", TRIP_ID);
      unsub = onSnapshot(
        tripRef,
        (snap) => {
          const stored = (snap.data() as TripDocWithLearners | undefined)?.learners;
          const next = {
            me: hydrate("me", stored?.me),
            partner: hydrate("partner", stored?.partner),
          };
          setLearners(next);
          // Anything studied on this phone before sharing was switched on (or
          // before this feature synced) would otherwise vanish behind an empty
          // shared record. Push it up once, the first time we see the trip.
          if (!seeded) {
            seeded = true;
            for (const id of LEARNER_IDS) {
              const onDevice = hydrate(id, localDocs[id].read());
              if (isUntouched(next[id]) && !isUntouched(onDevice)) {
                writeLearner(tripRef, id, onDevice).catch(console.error);
              }
            }
          }
        },
        (err) => {
          console.error("learner subscription failed", err);
          fallBackToDevice("subscription failed");
        },
      );
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [shared, fallBackToDevice]);

  const persist = useCallback(
    async (id: LearnerId, next: LearnerProgress) => {
      // Show the new score straight away; the sync below only confirms it.
      setLearners((prev) => ({ ...prev, [id]: next }));
      try {
        if (shared && db) {
          await writeLearner(doc(db, "trips", TRIP_ID), id, next);
        } else {
          localDocs[id].update(next);
        }
        setSaveError(null);
      } catch (err) {
        console.error("saving progress failed", err);
        if (shared) {
          // Never lose an answer to a rejected write — keep it on the phone.
          fallBackToDevice("write rejected");
        } else {
          setSaveError(
            err instanceof Error ? err.message : "学習の記録を保存できませんでした。",
          );
        }
      }
    },
    [shared, fallBackToDevice],
  );

  const patchActive = useCallback(
    (patch: (current: LearnerProgress) => LearnerProgress) => {
      const current = latest.current[learnerId];
      return persist(learnerId, patch(current));
    },
    [learnerId, persist],
  );

  const api = useMemo(
    () => ({
      learners,
      learnerId,
      me: learners[learnerId],
      other: learners[learnerId === "me" ? "partner" : "me"],
      /** Records are syncing between the two phones right now. */
      isShared: shared,
      /** Firebase is set up at all — false means this app is solo by design. */
      canShare: isFirebaseConfigured,
      /** Sharing is configured but unreachable, so this device is on its own. */
      deviceOnly: isFirebaseConfigured && !shared,
      saveError,

      chooseLearner: (id: LearnerId) => {
        setLearnerId(id);
        try {
          localStorage.setItem(ACTIVE_KEY, id);
        } catch {
          // Not being able to remember the choice is survivable.
        }
      },

      /** Records one answer: review box, XP, combo record and the day streak. */
      recordAnswer: (phraseId: string, correct: boolean, combo: number) =>
        patchActive((current) => {
          const today = todayKey();
          const streak =
            current.lastStudyDate === today
              ? current.streak
              : current.lastStudyDate === yesterdayKey()
                ? current.streak + 1
                : 1;
          return {
            ...current,
            xp: current.xp + (correct ? scoreFor(combo) : 0),
            bestCombo: Math.max(current.bestCombo, correct ? combo + 1 : 0),
            streak,
            lastStudyDate: today,
            stats: { ...current.stats, [phraseId]: nextStat(current.stats[phraseId], correct) },
            history: trimHistory({
              ...current.history,
              [today]: (current.history[today] ?? 0) + 1,
            }),
          };
        }),

      toggleFavourite: (phraseId: string) =>
        patchActive((current) => {
          const stat: PhraseStat = current.stats[phraseId] ?? {
            box: 0,
            due: 0,
            right: 0,
            wrong: 0,
            last: 0,
          };
          return {
            ...current,
            stats: { ...current.stats, [phraseId]: { ...stat, fav: !stat.fav } },
          };
        }),

      rename: (name: string) => patchActive((current) => ({ ...current, name })),

      setDailyGoal: (dailyGoal: number) => patchActive((current) => ({ ...current, dailyGoal })),

      resetProgress: () =>
        patchActive((current) => ({
          ...defaultLearner(learnerId),
          name: current.name,
          dailyGoal: current.dailyGoal,
        })),
    }),
    [learners, learnerId, shared, saveError, patchActive],
  );

  return api;
}

export type LearnerStore = ReturnType<typeof useLearners>;
