import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, setDoc } from "firebase/firestore";
import { TripStore } from "../hooks/useTrip";
import {
  AuthStatus,
  authReady,
  db,
  isFirebaseConfigured,
  subscribeAuthStatus,
  TRIP_ID,
} from "../firebase";
import { storageAvailable } from "../data/local";

/** Plain-language explanation of the Firebase setup step that is missing. */
function authAdvice(status: AuthStatus): string | null {
  if (status.state !== "error") return null;
  if (status.code.includes("operation-not-allowed")) {
    return "Firebaseコンソールで匿名ログインが有効になっていません。Authentication → Sign-in method →「匿名」を有効にしてください。";
  }
  if (status.code.includes("api-key") || status.code.includes("invalid")) {
    return "Firebaseの接続情報が正しくない可能性があります。GitHubのSecretsに設定した値をご確認ください。";
  }
  if (status.code.includes("network")) {
    return "Firebaseに接続できませんでした。通信環境をご確認ください。";
  }
  return status.message;
}

/**
 * Facts about the device that decide whether saving can work at all. Shown in
 * the app so a problem can be reported from a screenshot instead of guessed at.
 */
function Diagnostics({ trip }: { trip: TripStore }) {
  const [auth, setAuth] = useState<AuthStatus>({ state: "pending" });
  const [probe, setProbe] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => subscribeAuthStatus(setAuth), []);

  /** Attempts the exact write the app performs, and reports the real error. */
  const testWrite = async () => {
    setProbing(true);
    setProbe(null);
    try {
      if (!isFirebaseConfigured || !db) {
        setProbe("この端末のみで動作中です(Firebase未設定)。書き込みは端末内に保存されます。");
        return;
      }
      await authReady;
      // Firestore queues writes while offline and never settles the promise,
      // so each step needs a deadline of its own.
      const withTimeout = <R,>(p: Promise<R>) =>
        Promise.race([
          p,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject({ code: "timeout" }), 10000),
          ),
        ]);

      await withTimeout(
        setDoc(doc(db, "trips", TRIP_ID), { probedAt: Date.now() }, { merge: true }),
      );

      // Places live in a subcollection, and Firestore rules that cover only the
      // parent document still reject those writes. Testing the document alone
      // would report success while registering a place keeps failing.
      const probeDoc = await withTimeout(
        addDoc(collection(db, "trips", TRIP_ID, "places"), {
          name: "__接続テスト__",
          category: "other",
          priority: "if-time",
          createdAt: Date.now(),
        }),
      );
      await withTimeout(deleteDoc(probeDoc)).catch(() => {
        // Leaving the probe behind is untidy but not a failure worth reporting.
      });

      setProbe("✅ 場所の保存に成功しました。登録できる状態です。");
    } catch (err) {
      const e = err as { code?: string; message?: string };
      const code = e?.code ?? "unknown";
      let hint = e?.message ?? String(err);
      if (code.includes("permission-denied")) {
        hint =
          "Firestoreのルールに拒否されました。ルールが trips/{tripId} だけを対象にしていると、" +
          "その配下の places(場所)への書き込みは拒否されます。" +
          "リポジトリの firestore.rules の内容をそのまま貼り付けて公開してください。";
      } else if (code.includes("unauthenticated")) {
        hint = "ログインできていません。Authentication →「匿名」を有効にしてください。";
      } else if (code.includes("not-found")) {
        hint = "Firestoreデータベースがまだ作成されていない可能性があります。";
      } else if (code === "timeout") {
        hint =
          "10秒以内に応答がありませんでした。Firebaseに接続できていない可能性があります(通信環境、またはFirestoreデータベースが未作成)。";
      }
      setProbe(`❌ 書き込み失敗 (${code})\n${hint}`);
    } finally {
      setProbing(false);
    }
  };

  /**
   * Last resort when the home-screen app keeps serving a stale build: drop the
   * service worker and its caches, then reload. Saved data lives in
   * localStorage/Firestore and is untouched.
   */
  const forceUpdate = async () => {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.error("cache clear failed", err);
    }
    location.reload();
  };

  const authLabel =
    auth.state === "ok"
      ? "ログイン済み"
      : auth.state === "pending"
        ? "確認中…"
        : auth.state === "disabled"
          ? "未使用(端末内保存)"
          : `失敗 (${auth.code})`;

  const canMakeId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS predates the standard media query.
      (window.navigator as { standalone?: boolean }).standalone === true);

  const rows: [string, string, boolean][] = [
    ["バージョン", __BUILD_TIME__, true],
    ["保存領域", storageAvailable ? "使用可" : "使用不可(閉じると消えます)", storageAvailable],
    ["ID採番", canMakeId ? "標準" : "代替方式", true],
    ["共有", trip.isShared ? `Firebase (${TRIP_ID})` : "この端末のみ", true],
    ["ログイン", authLabel, auth.state !== "error"],
    ["登録数", `場所 ${trip.places.length} / 予定 ${trip.scheduleItems.length}`, true],
    ["起動方法", standalone ? "ホーム画面から" : "ブラウザから", true],
  ];

  const advice = authAdvice(auth);

  return (
    <section className="diagnostics">
      <h3>動作状況</h3>
      <p className="hint">うまく登録できないときは、この内容をお知らせください。</p>
      <dl className="diag-list">
        {rows.map(([label, value, ok]) => (
          <div key={label} className={`diag-row ${ok ? "" : "bad"}`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {advice && <p className="save-error">⚠️ {advice}</p>}

      {!storageAvailable && (
        <p className="save-error">
          ⚠️ この端末では保存領域が使えません。Safariの設定で「すべてのCookieをブロック」が
          有効になっているか、プライベートブラウズで開いている可能性があります。
          解除すると登録した内容が残るようになります。
        </p>
      )}

      <button className="btn-secondary btn-block" onClick={testWrite} disabled={probing}>
        {probing ? "確認中…" : "保存できるかテストする"}
      </button>
      {probe && <p className="probe-result">{probe}</p>}

      <button className="btn-secondary btn-block" onClick={forceUpdate}>
        最新版に更新する
      </button>
      <p className="hint">
        上のバージョンが古いままのときに押してください。保存済みの内容は消えません。
      </p>
    </section>
  );
}

export function SettingsTab({ trip }: { trip: TripStore }) {
  const info = trip.tripInfo;
  const [startDate, setStartDate] = useState(info.startDate);
  const [endDate, setEndDate] = useState(info.endDate);
  const [hotelName, setHotelName] = useState(info.hotelName ?? "");
  const [hotelAddress, setHotelAddress] = useState(info.hotelAddress ?? "");
  const [hotelMapsUrl, setHotelMapsUrl] = useState(info.hotelMapsUrl ?? "");
  const [checkIn, setCheckIn] = useState(info.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(info.checkOut ?? "");
  const [notes, setNotes] = useState(info.notes ?? "");
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    trip.updateTripInfo({
      startDate,
      endDate,
      hotelName: hotelName.trim() || undefined,
      hotelAddress: hotelAddress.trim() || undefined,
      hotelMapsUrl: hotelMapsUrl.trim() || undefined,
      checkIn: checkIn.trim() || undefined,
      checkOut: checkOut.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="tab-content">
      <h2>設定</h2>

      <div className={`share-status ${trip.isShared ? "ok" : "warn"}`}>
        {trip.isShared ? (
          <p>✅ 共有モード: 2人の端末でリアルタイムに同期されます(旅行ID: {TRIP_ID})</p>
        ) : (
          <p>
            ⚠️ 未共有モード: このデータは今の端末にしか保存されません。夫婦で共有するには
            README.md の手順でFirebaseを設定してください。
          </p>
        )}
      </div>

      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label>
            出発日
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            帰国日
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>

        <h3>宿泊先</h3>
        <label>
          ホテル名
          <input value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
        </label>
        <label>
          住所
          <input value={hotelAddress} onChange={(e) => setHotelAddress(e.target.value)} />
        </label>
        <label>
          GoogleマップURL(任意)
          <input value={hotelMapsUrl} onChange={(e) => setHotelMapsUrl(e.target.value)} inputMode="url" />
        </label>
        <div className="form-row">
          <label>
            チェックイン
            <input value={checkIn} onChange={(e) => setCheckIn(e.target.value)} placeholder="15:00" />
          </label>
          <label>
            チェックアウト
            <input value={checkOut} onChange={(e) => setCheckOut(e.target.value)} placeholder="11:00" />
          </label>
        </div>

        <label>
          旅のメモ
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        <button type="submit" className="btn-primary">
          保存{saved && " ✓"}
        </button>
      </form>

      <Diagnostics trip={trip} />
    </div>
  );
}
