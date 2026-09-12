import { useMemo, useState } from "react";
import { TripStore } from "../hooks/useTrip";
import {
  NewReservation,
  RESERVATION_KIND_ICONS,
  RESERVATION_KIND_LABELS,
  RESERVATION_KINDS,
  Reservation,
  ReservationKind,
} from "../types";
import { daysUntil, formatDateLabel } from "../utils/date";
import { mapsSearchUrl } from "../utils/maps";

export function ReservationsTab({ trip }: { trip: TripStore }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (run: () => Promise<unknown>) => {
    try {
      setSaveError(null);
      await run();
      return true;
    } catch (err) {
      console.error("reservation save failed", err);
      setSaveError(
        err instanceof Error ? err.message : "保存できませんでした。時間をおいて再度お試しください。",
      );
      return false;
    }
  };

  const sorted = useMemo(
    () =>
      [...trip.reservations].sort(
        (a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"),
      ),
    [trip.reservations],
  );

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>予約・チケット ({trip.reservations.length})</h2>
        {!adding && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            + 追加
          </button>
        )}
      </div>

      {saveError && <p className="save-error">⚠️ {saveError}</p>}

      {adding && (
        <ReservationForm
          defaultDate={trip.tripInfo.startDate}
          onSubmit={async (r) => {
            if (await save(() => trip.addReservation(r))) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {sorted.length === 0 && !adding && (
        <p className="empty-state">
          レストラン・ショー・展望台などの予約を登録しておくと、確認番号を探し回らずに済みます。
          登録した予約は「今日」と「しおり」にも自動で出ます。
        </p>
      )}

      {sorted.map((r) =>
        editingId === r.id ? (
          <ReservationForm
            key={r.id}
            initial={r}
            defaultDate={r.date}
            onSubmit={async (patch) => {
              if (await save(() => trip.updateReservation(r.id, patch))) setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
            onDelete={async () => {
              if (!confirm(`「${r.title}」を削除しますか?`)) return;
              if (await save(() => trip.removeReservation(r.id))) setEditingId(null);
            }}
          />
        ) : (
          <ReservationCard key={r.id} reservation={r} onEdit={() => setEditingId(r.id)} />
        ),
      )}
    </div>
  );
}

/**
 * Compact form used on the "today" screen and the itinerary, where a full
 * card would crowd out the schedule.
 */
export function ReservationLine({ reservation }: { reservation: Reservation }) {
  return (
    <div className="rv-line">
      <span className="rv-line-icon">{RESERVATION_KIND_ICONS[reservation.kind]}</span>
      <span className="rv-line-main">
        <span className="rv-line-title">
          {reservation.time && <strong>{reservation.time}</strong>} {reservation.title}
        </span>
        {reservation.confirmationNo && (
          <span className="rv-line-conf">確認番号 {reservation.confirmationNo}</span>
        )}
      </span>
    </div>
  );
}

function ReservationCard({
  reservation: r,
  onEdit,
}: {
  reservation: Reservation;
  onEdit: () => void;
}) {
  const link = r.mapsUrl || mapsSearchUrl(`${r.title} ${r.address ?? "New York"}`.trim());
  // A cancellation deadline is only useful while you can still act on it.
  const cancelIn = r.cancelBy ? daysUntil(r.cancelBy) : null;
  const cancelSoon = cancelIn !== null && cancelIn >= 0 && cancelIn <= 3;

  return (
    <div className="rv-card">
      <div className="rv-card-head">
        <span className="rv-kind">
          {RESERVATION_KIND_ICONS[r.kind]} {RESERVATION_KIND_LABELS[r.kind]}
        </span>
        <span className="rv-when">
          {formatDateLabel(r.date)}
          {r.time && ` ${r.time}`}
        </span>
      </div>
      <strong className="rv-title">{r.title}</strong>

      <dl className="rv-details">
        {r.confirmationNo && (
          <div>
            <dt>確認番号</dt>
            <dd className="rv-conf">{r.confirmationNo}</dd>
          </div>
        )}
        {r.partySize ? (
          <div>
            <dt>人数</dt>
            <dd>{r.partySize}名</dd>
          </div>
        ) : null}
        {r.address && (
          <div>
            <dt>場所</dt>
            <dd>{r.address}</dd>
          </div>
        )}
      </dl>

      {r.note && <p className="rv-note">{r.note}</p>}

      {r.cancelBy && (
        <p className={`rv-cancel ${cancelSoon ? "soon" : ""}`}>
          {cancelIn !== null && cancelIn < 0
            ? `無料キャンセル期限 ${formatDateLabel(r.cancelBy)} は過ぎています`
            : `無料キャンセル期限 ${formatDateLabel(r.cancelBy)}${
                cancelIn === 0 ? "(今日まで)" : cancelIn !== null ? `(あと${cancelIn}日)` : ""
              }`}
        </p>
      )}

      <div className="rv-actions">
        <a className="btn-small" href={link} target="_blank" rel="noreferrer">
          🗺️ マップ
        </a>
        <button className="btn-small" onClick={onEdit}>
          編集
        </button>
      </div>
    </div>
  );
}

function ReservationForm({
  initial,
  defaultDate,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: Reservation;
  defaultDate: string;
  onSubmit: (reservation: NewReservation) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<ReservationKind>(initial?.kind ?? "restaurant");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [time, setTime] = useState(initial?.time ?? "");
  const [confirmationNo, setConfirmationNo] = useState(initial?.confirmationNo ?? "");
  const [partySize, setPartySize] = useState(initial?.partySize?.toString() ?? "2");
  const [cancelBy, setCancelBy] = useState(initial?.cancelBy ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [note, setNote] = useState(initial?.note ?? "");

  return (
    <form
      className="packing-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const size = parseInt(partySize, 10);
        onSubmit({
          title: title.trim(),
          kind,
          date,
          time: time || undefined,
          confirmationNo: confirmationNo.trim() || undefined,
          partySize: Number.isFinite(size) && size > 0 ? size : undefined,
          cancelBy: cancelBy || undefined,
          address: address.trim() || undefined,
          mapsUrl: initial?.mapsUrl,
          note: note.trim() || undefined,
        });
      }}
    >
      <label>
        予約名
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例:Katz's Delicatessen"
          autoFocus
        />
      </label>
      <div className="form-row">
        <label>
          種類
          <select value={kind} onChange={(e) => setKind(e.target.value as ReservationKind)}>
            {RESERVATION_KINDS.map((k) => (
              <option key={k} value={k}>
                {RESERVATION_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          人数
          <input
            type="number"
            min="1"
            value={partySize}
            onChange={(e) => setPartySize(e.target.value)}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          日付
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          時刻(現地)
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label>
        確認番号(任意)
        <input
          value={confirmationNo}
          onChange={(e) => setConfirmationNo(e.target.value)}
          placeholder="予約サイトの番号"
        />
      </label>
      <label>
        無料キャンセル期限(任意)
        <input type="date" value={cancelBy} onChange={(e) => setCancelBy(e.target.value)} />
      </label>
      <label>
        住所(任意)
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label>
        メモ(任意)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ドレスコード、入口の場所など"
        />
      </label>
      <div className="form-actions">
        {onDelete && (
          <button type="button" className="btn-small btn-danger" onClick={onDelete}>
            削除
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn-primary">
          保存
        </button>
      </div>
    </form>
  );
}
