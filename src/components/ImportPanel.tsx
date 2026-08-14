import { ChangeEvent, useState } from "react";
import {
  CATEGORY_LABELS,
  Category,
  NewPlace,
  PRIORITY_LABELS,
  Priority,
} from "../types";
import {
  guessCategory,
  ImportedPlace,
  normalizeName,
  parseImportFile,
  parsePastedList,
  placeNameFromMapsUrl,
} from "../utils/importers";
import { guessArea, readPlaceFromImage } from "../utils/ocr";
import { readImportableFiles } from "../utils/zip";

type Mode = "menu" | "screenshot" | "paste" | "csv";

/** A row in the review list, editable before anything is saved. */
interface Draft {
  id: string;
  name: string;
  category: Category;
  priority: Priority;
  area?: string;
  mapsUrl?: string;
  note?: string;
  /** Other OCR candidates, so a wrong guess is one tap from being fixed. */
  alternatives?: string[];
  /** Already in the trip — pre-unchecked so it isn't added twice. */
  duplicate?: boolean;
  include: boolean;
}

let draftSeq = 0;
function toDraft(p: ImportedPlace, alternatives?: string[]): Draft {
  return {
    id: `d${draftSeq++}`,
    name: p.name,
    category: guessCategory(p.name),
    priority: "want",
    area: p.area,
    mapsUrl: p.mapsUrl,
    note: p.note,
    alternatives,
    include: true,
  };
}

export function ImportPanel({
  existingNames,
  onImport,
  onClose,
}: {
  /** Names already in the trip, used to flag duplicates. */
  existingNames: string[];
  onImport: (places: NewPlace[]) => Promise<void> | void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Which files inside the archive actually yielded places. */
  const [sources, setSources] = useState<string[]>([]);

  const addDrafts = (items: Draft[]) => {
    if (items.length === 0) {
      setError("読み取れる場所が見つかりませんでした。");
      return;
    }
    setError(null);

    setDrafts((prev) => {
      // Selecting both Takeout exports yields the same place twice, so drop
      // repeats inside this batch and flag ones already in the trip.
      const seen = new Set(prev.map((d) => normalizeName(d.name)));
      const registered = new Set(existingNames.map(normalizeName));
      const next: Draft[] = [];

      for (const item of items) {
        const key = normalizeName(item.name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const duplicate = registered.has(key);
        next.push({ ...item, duplicate, include: !duplicate });
      }
      return [...prev, ...next];
    });
  };

  const handleScreenshots = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setError(null);
    const found: Draft[] = [];
    for (const [i, file] of files.entries()) {
      setBusy(`画像を読み取り中… (${i + 1}/${files.length})`);
      try {
        const result = await readPlaceFromImage(file);
        if (result.name) {
          found.push(
            toDraft(
              { name: result.name, area: guessArea(result.fullText) },
              result.alternatives,
            ),
          );
        }
      } catch (err) {
        console.error("OCR failed", err);
        setError(
          "画像の読み取りに失敗しました。初回は文字認識データのダウンロードが必要なため、通信環境の良い場所でお試しください。",
        );
      }
    }
    setBusy(null);
    addDrafts(found);
  };

  const handleCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setError(null);
    const found: Draft[] = [];
    const readFiles: string[] = [];
    try {
      for (const [i, file] of files.entries()) {
        setBusy(`ファイルを読み込み中… (${i + 1}/${files.length})`);
        // Zips are expanded here, so the Takeout download works untouched.
        for (const part of await readImportableFiles(file)) {
          const parsed = parseImportFile(part.text);
          if (parsed.length > 0) readFiles.push(`${part.name} (${parsed.length}件)`);
          found.push(...parsed.map((p) => toDraft(p)));
        }
      }
    } catch (err) {
      console.error("import failed", err);
      setError("ファイルを読み込めませんでした。zipが壊れていないかご確認ください。");
      setBusy(null);
      return;
    }
    setBusy(null);
    setSources(readFiles);
    addDrafts(found);
  };

  const handlePaste = () => {
    const parsed = parsePastedList(pasteText).map((p) => {
      // A full Maps URL carries a better name than a hand-typed line.
      const fromUrl = p.mapsUrl ? placeNameFromMapsUrl(p.mapsUrl) : undefined;
      return toDraft({ ...p, name: p.name || fromUrl || "" });
    });
    addDrafts(parsed.filter((d) => d.name));
    setPasteText("");
  };

  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const save = async () => {
    const selected = drafts.filter((d) => d.include && d.name.trim());
    if (selected.length === 0) return;
    setBusy("保存中…");
    await onImport(
      selected.map((d) => ({
        name: d.name.trim(),
        category: d.category,
        priority: d.priority,
        area: d.area?.trim() || undefined,
        mapsUrl: d.mapsUrl?.trim() || undefined,
        note: d.note?.trim() || undefined,
      })),
    );
    setBusy(null);
    onClose();
  };

  const selectedCount = drafts.filter((d) => d.include && d.name.trim()).length;

  return (
    <div className="import-panel">
      <div className="tab-header-row">
        <h3>まとめて取り込み</h3>
        <button className="btn-small" onClick={onClose}>
          閉じる
        </button>
      </div>

      {mode === "menu" && (
        <div className="import-modes">
          <button className="import-mode" onClick={() => setMode("csv")}>
            <span className="import-mode-icon">📄</span>
            <span>
              <strong>Googleマップの保存リストから</strong>
              <small>いちばん確実。CSV / JSON のどちらでも、全部の場所を一度に</small>
            </span>
          </button>
          <button className="import-mode" onClick={() => setMode("paste")}>
            <span className="import-mode-icon">📋</span>
            <span>
              <strong>まとめて貼り付け</strong>
              <small>1行に1件。名前でもマップのリンクでもOK</small>
            </span>
          </button>
          <button className="import-mode" onClick={() => setMode("screenshot")}>
            <span className="import-mode-icon">📷</span>
            <span>
              <strong>スクショから読み取り</strong>
              <small>複数枚まとめて選べます(文字認識のため精度は目安)</small>
            </span>
          </button>
        </div>
      )}

      {mode === "csv" && (
        <div className="import-body">
          <button className="link-button" onClick={() => setMode("menu")}>
            ← 方法を選び直す
          </button>
          <ol className="howto">
            <li>
              ブラウザで{" "}
              <a href="https://takeout.google.com/" target="_blank" rel="noreferrer">
                Google データエクスポート
              </a>{" "}
              を開く
            </li>
            <li>
              「選択をすべて解除」→ <strong>保存済み</strong> と{" "}
              <strong>マップ(自分の場所)</strong> の2つにチェック
              <br />
              <small>
                前者は行きたい場所リストのCSV、後者は保存した場所のJSONです。
                どちらの形式でも取り込めるので、両方選んでおくと確実です
              </small>
            </li>
            <li>エクスポートを作成(数分〜数十分でダウンロードのメールが届きます)</li>
            <li>
              届いた <strong>zipファイルをそのまま</strong> 下のボタンで選ぶ
              <br />
              <small>
                解凍は不要です。中から場所のデータだけを自動で探して取り込みます
              </small>
            </li>
          </ol>
          <label className="file-button">
            zip / CSV / JSON を選ぶ(複数可)
            <input
              type="file"
              accept=".zip,.csv,.json,application/zip,text/csv,application/json"
              multiple
              onChange={handleCsv}
              hidden
            />
          </label>
          <p className="hint">
            解凍済みの <code>.csv</code> / <code>.json</code> を直接選んでも構いません。
            名前の列があるCSVなら形式は問いません。
          </p>
        </div>
      )}

      {mode === "paste" && (
        <div className="import-body">
          <button className="link-button" onClick={() => setMode("menu")}>
            ← 方法を選び直す
          </button>
          <p className="hint">
            1行に1件で貼り付けてください。行の中にGoogleマップのリンクが混ざっていても大丈夫です。
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={8}
            placeholder={"MoMA\nセントラルパーク\nKatz's Delicatessen\nhttps://www.google.com/maps/place/..."}
          />
          <button className="btn-primary btn-block" onClick={handlePaste} disabled={!pasteText.trim()}>
            読み込む
          </button>
        </div>
      )}

      {mode === "screenshot" && (
        <div className="import-body">
          <button className="link-button" onClick={() => setMode("menu")}>
            ← 方法を選び直す
          </button>
          <p className="hint">
            Googleマップで場所を開いた画面のスクショを選んでください。複数枚まとめて選べます。
            いちばん大きな文字を場所名として読み取ります。
          </p>
          <label className="file-button">
            スクショを選ぶ(複数可)
            <input type="file" accept="image/*" multiple onChange={handleScreenshots} hidden />
          </label>
          <p className="hint">
            初回だけ文字認識データ(数MB)をダウンロードします。Wi-Fi環境での実行をおすすめします。
          </p>
        </div>
      )}

      {busy && <p className="busy-line">{busy}</p>}
      {error && <p className="warn-line warn">{error}</p>}

      {sources.length > 0 && (
        <p className="source-line">
          読み込んだファイル: {sources.join(" / ")}
        </p>
      )}

      {drafts.length > 0 && (
        <div className="draft-list">
          <div className="tab-header-row">
            <h4>取り込む内容の確認 ({selectedCount}件)</h4>
            <button className="btn-small" onClick={() => setDrafts([])}>
              クリア
            </button>
          </div>
          <p className="hint">保存前に名前やカテゴリを直せます。不要な行はチェックを外してください。</p>

          {drafts.map((d) => (
            <div key={d.id} className={`draft-row ${d.include ? "" : "excluded"}`}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={d.include}
                  onChange={(e) => update(d.id, { include: e.target.checked })}
                />
                <input
                  className="draft-name"
                  value={d.name}
                  onChange={(e) => update(d.id, { name: e.target.value })}
                  placeholder="場所の名前"
                />
              </label>
              {d.duplicate && <span className="dup-tag">登録済み</span>}

              {d.alternatives && d.alternatives.length > 0 && (
                <div className="alt-row">
                  <span className="field-label">候補:</span>
                  {d.alternatives.map((alt) => (
                    <button
                      key={alt}
                      type="button"
                      className="alt-chip"
                      onClick={() => update(d.id, { name: alt })}
                    >
                      {alt}
                    </button>
                  ))}
                </div>
              )}

              <div className="form-row">
                <select
                  value={d.category}
                  onChange={(e) => update(d.id, { category: e.target.value as Category })}
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  value={d.priority}
                  onChange={(e) => update(d.id, { priority: e.target.value as Priority })}
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          <button
            className="btn-primary btn-block"
            onClick={save}
            disabled={selectedCount === 0 || busy !== null}
          >
            {selectedCount}件を追加する
          </button>
        </div>
      )}
    </div>
  );
}
