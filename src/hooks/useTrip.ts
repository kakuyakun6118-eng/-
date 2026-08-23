import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { authReady, db, isFirebaseConfigured, TRIP_ID } from "../firebase";
import { LocalCollection, LocalDoc } from "../data/local";
import {
  DEFAULT_TRIP_INFO,
  NewPlace,
  NewScheduleItem,
  Place,
  ScheduleItem,
  TripInfo,
} from "../types";

/**
 * Firestore rejects `undefined` outright ("Unsupported field value: undefined"),
 * while the local store silently drops it. Optional fields are modelled as
 * `undefined` throughout the app, so every Firestore write has to be
 * normalised here — otherwise saving anything with a blank optional field
 * fails, and only in shared mode.
 */
function forCreate<T extends object>(data: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

/** On update, an omitted value means "clear this field". */
function forUpdate<T extends object>(data: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === undefined ? deleteField() : v]),
  );
}

const localTripInfo = new LocalDoc<TripInfo>("ny-trip:info", DEFAULT_TRIP_INFO);
const localPlaces = new LocalCollection<Place>("ny-trip:places");
const localScheduleItems = new LocalCollection<ScheduleItem>("ny-trip:schedule");

export function useTrip() {
  const [tripInfo, setTripInfo] = useState<TripInfo>(DEFAULT_TRIP_INFO);
  const [places, setPlaces] = useState<Place[]>([]);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** Firestore refused to stream the data — otherwise the list just stays
   *  empty with no explanation of why. */
  const [syncError, setSyncError] = useState<string | null>(null);

  const onSyncError = (err: { code?: string; message?: string }) => {
    console.error("firestore subscription failed", err);
    const code = err?.code ?? "unknown";
    setSyncError(
      code.includes("permission-denied")
        ? "共有サーバーからデータを読み取れません(権限エラー)。Firestoreのルールと匿名ログインの設定をご確認ください。"
        : `共有サーバーに接続できません (${code})`,
    );
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      const unsubInfo = localTripInfo.subscribe(setTripInfo);
      const unsubPlaces = localPlaces.subscribe((items) =>
        setPlaces([...items].sort((a, b) => a.createdAt - b.createdAt)),
      );
      const unsubSchedule = localScheduleItems.subscribe(setScheduleItems);
      setLoading(false);
      return () => {
        unsubInfo();
        unsubPlaces();
        unsubSchedule();
      };
    }

    let unsubInfo = () => {};
    let unsubPlaces = () => {};
    let unsubSchedule = () => {};
    let cancelled = false;

    authReady.then(() => {
      if (cancelled || !db) return;

      const tripRef = doc(db, "trips", TRIP_ID);
      unsubInfo = onSnapshot(
        tripRef,
        (snap) => {
          setSyncError(null);
          if (snap.exists()) {
            setTripInfo({ ...DEFAULT_TRIP_INFO, ...(snap.data() as TripInfo) });
          } else {
            setDoc(tripRef, forCreate(DEFAULT_TRIP_INFO)).catch(console.error);
          }
        },
        onSyncError,
      );

      const placesRef = collection(db, "trips", TRIP_ID, "places");
      unsubPlaces = onSnapshot(
        placesRef,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Place);
          items.sort((a, b) => a.createdAt - b.createdAt);
          setPlaces(items);
        },
        onSyncError,
      );

      const scheduleRef = collection(db, "trips", TRIP_ID, "scheduleItems");
      unsubSchedule = onSnapshot(
        scheduleRef,
        (snap) => {
          setScheduleItems(
            snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ScheduleItem),
          );
        },
        onSyncError,
      );

      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubInfo();
      unsubPlaces();
      unsubSchedule();
    };
  }, []);

  return useMemo(
    () => ({
      loading,
      isShared: isFirebaseConfigured,
      syncError,
      tripInfo,
      places,
      scheduleItems,

      updateTripInfo: async (patch: Partial<TripInfo>) => {
        if (isFirebaseConfigured && db) {
          await setDoc(doc(db, "trips", TRIP_ID), forUpdate(patch), { merge: true });
        } else {
          localTripInfo.update(patch);
        }
      },

      addPlace: async (place: NewPlace) => {
        const withTimestamp = { ...place, createdAt: Date.now() };
        if (isFirebaseConfigured && db) {
          await addDoc(collection(db, "trips", TRIP_ID, "places"), forCreate(withTimestamp));
        } else {
          localPlaces.add(withTimestamp);
        }
      },
      updatePlace: async (id: string, patch: Partial<Place>) => {
        if (isFirebaseConfigured && db) {
          await updateDoc(doc(db, "trips", TRIP_ID, "places", id), forUpdate(patch));
        } else {
          localPlaces.update(id, patch);
        }
      },
      removePlace: async (id: string) => {
        if (isFirebaseConfigured && db) {
          await deleteDoc(doc(db, "trips", TRIP_ID, "places", id));
        } else {
          localPlaces.remove(id);
        }
      },

      addScheduleItem: async (item: NewScheduleItem) => {
        if (isFirebaseConfigured && db) {
          await addDoc(collection(db, "trips", TRIP_ID, "scheduleItems"), forCreate(item));
        } else {
          localScheduleItems.add(item);
        }
      },
      updateScheduleItem: async (id: string, patch: Partial<ScheduleItem>) => {
        if (isFirebaseConfigured && db) {
          await updateDoc(doc(db, "trips", TRIP_ID, "scheduleItems", id), forUpdate(patch));
        } else {
          localScheduleItems.update(id, patch);
        }
      },
      removeScheduleItem: async (id: string) => {
        if (isFirebaseConfigured && db) {
          await deleteDoc(doc(db, "trips", TRIP_ID, "scheduleItems", id));
        } else {
          localScheduleItems.remove(id);
        }
      },
    }),
    [loading, syncError, tripInfo, places, scheduleItems],
  );
}

export type TripStore = ReturnType<typeof useTrip>;
