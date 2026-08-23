import { FormEvent, useState } from "react";
import { TripStore } from "../hooks/useTrip";
import { TRIP_ID } from "../firebase";
import { storageAvailable } from "../data/local";

/**
 * Facts about the device that decide whether saving can work at all. Shown in
 * the app so a problem can be reported from a screenshot instead of guessed at.
 */
function Diagnostics({ trip }: { trip: TripStore }) {
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
    ["登録数", `場所 ${trip.places.length} / 予定 ${trip.scheduleItems.length}`, true],
    ["起動方法", standalone ? "ホーム画面から" : "ブラウザから", true],
  ];

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
      {!storageAvailable && (
        <p className="save-error">
          ⚠️ この端末では保存領域が使えません。Safariの設定で「すべてのCookieをブロック」が
          有効になっているか、プライベートブラウズで開いている可能性があります。
          解除すると登録した内容が残るようになります。
        </p>
      )}
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
