import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
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

/** Keeps the study history from growing without bound. */
function trimHistory(history: Record<string, number>): Record<string, number> {
  const keys = Object.keys(history).sort();
  if (keys.length <= 30) return history;
  return Object.fromEntries(keys.slice(-30).map((k) => [k, history[k]]));
}

export function useLearners() {
  const [learners, setLearners] = useState<Learners>(emptyLearners);
  const [learnerId, setLearnerId] = useState<LearnerId>(readActiveLearner);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Writes are computed from the newest record, not the one a callback closed over. */
  const latest = useRef<Learners>(learners);
  latest.current = learners;

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      const unsubs = LEARNER_IDS.map((id) =>
        localDocs[id].subscribe((value) =>
          setLearners((prev) => ({ ...prev, [id]: hydrate(id, value) })),
        ),
      );
      return () => unsubs.forEach((unsub) => unsub());
    }

    let unsubs: (() => void)[] = [];
    let cancelled = false;
    authReady.then(() => {
      if (cancelled || !db) return;
      unsubs = LEARNER_IDS.map((id) =>
        onSnapshot(
          doc(db!, "trips", TRIP_ID, "learners", id),
          (snap) => {
            setLearners((prev) => ({
              ...prev,
              [id]: hydrate(id, snap.exists() ? (snap.data() as LearnerProgress) : undefined),
            }));
          },
          (err) => console.error("learner subscription failed", err),
        ),
      );
    });
    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  const persist = useCallback(async (id: LearnerId, next: LearnerProgress) => {
    // Show the new score straight away; the sync below only confirms it.
    setLearners((prev) => ({ ...prev, [id]: next }));
    try {
      setSaveError(null);
      if (isFirebaseConfigured && db) {
        await setDoc(doc(db, "trips", TRIP_ID, "learners", id), next, { merge: true });
      } else {
        localDocs[id].update(next);
      }
    } catch (err) {
      console.error("saving progress failed", err);
      setSaveError(
        err instanceof Error ? err.message : "学習の記録を保存できませんでした。",
      );
    }
  }, []);

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
      isShared: isFirebaseConfigured,
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
    [learners, learnerId, saveError, patchActive],
  );

  return api;
}

export type LearnerStore = ReturnType<typeof useLearners>;
