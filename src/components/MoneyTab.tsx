import { useMemo, useState } from "react";
import { TripStore } from "../hooks/useTrip";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_ICONS,
  EXPENSE_CATEGORY_LABELS,
  Expense,
  ExpenseCategory,
  NewExpense,
  PAYER_LABELS,
  Payer,
} from "../types";
import { calcTip, formatUsd, formatYen, NYC_SALES_TAX, settle, TIP_PRESETS, toYen } from "../utils/money";
import { formatDateLabel, todayKey } from "../utils/date";

const PAYERS: Payer[] = ["me", "partner", "shared"];

export function MoneyTab({ trip }: { trip: TripStore }) {
  const [view, setView] = useState<"tip" | "log">("tip");
  const rate = trip.tripInfo.usdJpy;

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>お金</h2>
        <span className="mn-rate">
          $1 = {rate && rate > 0 ? `¥${rate}` : "未設定"}
        </span>
      </div>

      <div className="mn-switch">
        <button
          className={`mn-switch-btn ${view === "tip" ? "active" : ""}`}
          onClick={() => setView("tip")}
        >
          チップ計算
        </button>
        <button
          className={`mn-switch-btn ${view === "log" ? "active" : ""}`}
          onClick={() => setView("log")}
        >
          支出メモ
        </button>
      </div>

      {view === "tip" ? <TipCalculator trip={trip} /> : <ExpenseLog trip={trip} />}

      <p className="mn-rate-note">
        円の表示はあくまで目安です。レートは設定タブで変更できます
        {rate && rate > 0 ? `(現在 $1 = ¥${rate})` : ""}。
      </p>
    </div>
  );
}

function TipCalculator({ trip }: { trip: TripStore }) {
  const [amount, setAmount] = useState("");
  const [includesTax, setIncludesTax] = useState(true);
  const [tipPercent, setTipPercent] = useState(20);
  const [customTip, setCustomTip] = useState("");
  const [split, setSplit] = useState(1);
  const [logged, setLogged] = useState(false);

  const rate = trip.tripInfo.usdJpy;
  const value = parseFloat(amount);
  const effectiveTip = customTip.trim() ? parseFloat(customTip) : tipPercent;
  const pct = Number.isFinite(effectiveTip) ? effectiveTip : 0;
  const result = calcTip(value, pct, includesTax, split);
  const ready = Number.isFinite(value) && value > 0;

  return (
    <>
      <div className="card mn-calc">
        <label className="mn-amount-label">
          会計金額(USD)
          <div className="mn-amount-wrap">
            <span className="mn-dollar">$</span>
            <input
              className="mn-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                setLogged(false);
              }}
              placeholder="0.00"
            />
          </div>
        </label>

        {/* Tipping on top of the tax is the classic accidental overpay, so
            which number you typed has to be an explicit choice. */}
        <div className="mn-taxmode">
          <button
            className={`mn-taxmode-btn ${includesTax ? "active" : ""}`}
            onClick={() => setIncludesTax(true)}
          >
            税込みの合計
          </button>
          <button
            className={`mn-taxmode-btn ${!includesTax ? "active" : ""}`}
            onClick={() => setIncludesTax(false)}
          >
            税抜きの小計
          </button>
        </div>

        <div className="mn-tips">
          {TIP_PRESETS.map((p) => (
            <button
              key={p}
              className={`mn-tip-btn ${!customTip.trim() && tipPercent === p ? "active" : ""}`}
              onClick={() => {
                setTipPercent(p);
                setCustomTip("");
              }}
            >
              {p}%
            </button>
          ))}
          <input
            className="mn-tip-custom"
            type="text"
            inputMode="decimal"
            value={customTip}
            onChange={(e) => setCustomTip(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="任意%"
          />
        </div>

        <div className="mn-split">
          <span>割り勘</span>
          {[1, 2].map((n) => (
            <button
              key={n}
              className={`mn-split-btn ${split === n ? "active" : ""}`}
              onClick={() => setSplit(n)}
            >
              {n === 1 ? "まとめて" : "2人で"}
            </button>
          ))}
        </div>
      </div>

      <div className="card mn-result">
        <Row label={`チップ (${pct || 0}%)`} usd={result.tip} rate={rate} />
        <Row
          label={includesTax ? "税込み会計" : `税込み会計 (税 ${(NYC_SALES_TAX * 100).toFixed(3)}%)`}
          usd={result.total - result.tip}
          rate={rate}
        />
        <div className="mn-total">
          <span>支払い合計</span>
          <strong>{formatUsd(result.total)}</strong>
        </div>
        {rate && rate > 0 && (
          <p className="mn-total-yen">およそ {formatYen(toYen(result.total, rate))}</p>
        )}
        {split > 1 && (
          <div className="mn-perperson">
            1人あたり <strong>{formatUsd(result.perPerson)}</strong>
            {rate && rate > 0 && ` (約${formatYen(toYen(result.perPerson, rate))})`}
          </div>
        )}
        <p className="mn-hint">
          チップは税抜きの {formatUsd(result.tipBase)} に対して計算しています。
          NYでは「税額の約2倍」が20%前後の目安としてよく使われます。
        </p>
      </div>

      <button
        className="btn-primary btn-block"
        disabled={!ready || logged}
        onClick={async () => {
          await trip.addExpense({
            amountUsd: Number(result.total.toFixed(2)),
            category: "food",
            payer: "shared",
            date: todayKey(),
            note: `チップ${pct}%込み`,
          });
          setLogged(true);
        }}
      >
        {logged ? "✓ 支出メモに追加しました" : "この金額を支出メモに追加"}
      </button>
    </>
  );
}

function Row({ label, usd, rate }: { label: string; usd: number; rate?: number }) {
  return (
    <div className="mn-row">
      <span>{label}</span>
      <span>
        {formatUsd(usd)}
        {rate && rate > 0 && <em className="mn-yen">{formatYen(toYen(usd, rate))}</em>}
      </span>
    </div>
  );
}

function ExpenseLog({ trip }: { trip: TripStore }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const rate = trip.tripInfo.usdJpy;

  const save = async (run: () => Promise<unknown>) => {
    try {
      setSaveError(null);
      await run();
      return true;
    } catch (err) {
      console.error("expense save failed", err);
      setSaveError(
        err instanceof Error ? err.message : "保存できませんでした。時間をおいて再度お試しください。",
      );
      return false;
    }
  };

  const summary = useMemo(() => settle(trip.expenses), [trip.expenses]);

  const byDate = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of trip.expenses) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [trip.expenses]);

  return (
    <>
      {saveError && <p className="save-error">⚠️ {saveError}</p>}

      <div className="card mn-summary">
        <div className="mn-summary-total">
          <span>旅の合計</span>
          <strong>{formatUsd(summary.totalUsd)}</strong>
        </div>
        {rate && rate > 0 && (
          <p className="mn-total-yen">およそ {formatYen(toYen(summary.totalUsd, rate))}</p>
        )}
        <div className="mn-summary-payers">
          {PAYERS.map((p) => (
            <div key={p} className="mn-summary-payer">
              <span>{PAYER_LABELS[p]}</span>
              <strong>{formatUsd(summary.byPayer[p])}</strong>
            </div>
          ))}
        </div>
        <p className="mn-settle">
          {summary.owed ? (
            <>
              精算:<strong>{PAYER_LABELS[summary.owed.from]}</strong> が{" "}
              <strong>{PAYER_LABELS[summary.owed.to]}</strong> に{" "}
              <strong>{formatUsd(summary.owed.amountUsd)}</strong>
              {rate && rate > 0 && `(約${formatYen(toYen(summary.owed.amountUsd, rate))})`}
            </>
          ) : (
            "精算:2人の立て替えはつり合っています"
          )}
        </p>
      </div>

      {!adding && (
        <button className="btn-primary btn-block" onClick={() => setAdding(true)}>
          + 支出を追加
        </button>
      )}

      {adding && (
        <ExpenseForm
          onSubmit={async (expense) => {
            if (await save(() => trip.addExpense(expense))) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
          defaultDate={trip.tripInfo.startDate}
        />
      )}

      {trip.expenses.length === 0 && !adding && (
        <p className="empty-state">
          支出はまだありません。使った金額をドルで入れておくと、合計と2人の精算額が自動で出ます。
        </p>
      )}

      {byDate.map(([date, items]) => {
        const dayTotal = items.reduce((sum, e) => sum + e.amountUsd, 0);
        return (
          <section key={date} className="mn-day">
            <h3>
              <span>{formatDateLabel(date)}</span>
              <span className="mn-day-total">{formatUsd(dayTotal)}</span>
            </h3>
            {items.map((e) =>
              editingId === e.id ? (
                <ExpenseForm
                  key={e.id}
                  initial={e}
                  defaultDate={e.date}
                  onSubmit={async (patch) => {
                    if (await save(() => trip.updateExpense(e.id, patch))) setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                  onDelete={async () => {
                    if (!confirm("この支出を削除しますか?")) return;
                    if (await save(() => trip.removeExpense(e.id))) setEditingId(null);
                  }}
                />
              ) : (
                <button key={e.id} className="mn-item" onClick={() => setEditingId(e.id)}>
                  <span className="mn-item-icon">{EXPENSE_CATEGORY_ICONS[e.category]}</span>
                  <span className="mn-item-main">
                    <span className="mn-item-title">
                      {e.note?.trim() || EXPENSE_CATEGORY_LABELS[e.category]}
                    </span>
                    <span className="mn-item-payer">{PAYER_LABELS[e.payer]}が支払い</span>
                  </span>
                  <span className="mn-item-amount">
                    {formatUsd(e.amountUsd)}
                    {rate && rate > 0 && (
                      <em className="mn-yen">{formatYen(toYen(e.amountUsd, rate))}</em>
                    )}
                  </span>
                </button>
              ),
            )}
          </section>
        );
      })}
    </>
  );
}

function ExpenseForm({
  initial,
  defaultDate,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: Expense;
  defaultDate: string;
  onSubmit: (expense: NewExpense) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [amount, setAmount] = useState(initial ? String(initial.amountUsd) : "");
  const [category, setCategory] = useState<ExpenseCategory>(initial?.category ?? "food");
  const [payer, setPayer] = useState<Payer>(initial?.payer ?? "me");
  const [date, setDate] = useState(initial?.date ?? todayKey() ?? defaultDate);
  const [note, setNote] = useState(initial?.note ?? "");

  const value = parseFloat(amount);

  return (
    <form
      className="packing-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!Number.isFinite(value) || value <= 0) return;
        onSubmit({
          amountUsd: Number(value.toFixed(2)),
          category,
          payer,
          date,
          note: note.trim() || undefined,
        });
      }}
    >
      <label>
        金額(USD)
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          autoFocus
        />
      </label>
      <div className="form-row">
        <label>
          誰が払った
          <select value={payer} onChange={(e) => setPayer(e.target.value as Payer)}>
            {PAYERS.map((p) => (
              <option key={p} value={p}>
                {PAYER_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          分類
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        日付
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        メモ(任意)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="店名など" />
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
