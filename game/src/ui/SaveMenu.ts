// メニュー画面。セーブとロード(オートセーブ + 手動3つ)、書き出しと読み込み、ゲームの設定をまとめる。
import { scenario } from "../data";
import type { SaveRecord, SaveStore } from "../core/saveStore";
import type { GameSettings, SaveData } from "../sim/save";

export const AUTO_SLOT = "auto";
const SLOTS: { id: string; name: string }[] = [
  { id: AUTO_SLOT, name: "オートセーブ" },
  { id: "slot1", name: "セーブ1" },
  { id: "slot2", name: "セーブ2" },
  { id: "slot3", name: "セーブ3" },
];

export interface SaveMenuActions {
  /** いまの状態を、セーブデータとして作る */
  buildSave(): SaveData;
  /** セーブデータを読み込んで、ゲームの状態を戻す。失敗したら例外を投げる */
  applySave(data: unknown): void;
  settings(): GameSettings;
  changeSettings(change: Partial<GameSettings>): void;
}

export class SaveMenu {
  private readonly q: <T extends HTMLElement = HTMLElement>(sel: string) => T;

  constructor(private readonly root: HTMLElement, private readonly store: SaveStore, private readonly actions: SaveMenuActions) {
    this.q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.q("#menu-close").addEventListener("click", () => this.close());

    // 設定
    const faction = this.q<HTMLSelectElement>("#menu-faction");
    faction.replaceChildren(new Option("すべての勢力(制限なし)", ""), ...scenario.factions.map((f) => new Option(f.name, f.id)));
    faction.addEventListener("change", () => actions.changeSettings({ playerFactionId: faction.value || null }));
    const difficulty = this.q<HTMLSelectElement>("#menu-difficulty");
    difficulty.addEventListener("change", () => actions.changeSettings({ difficulty: difficulty.value as GameSettings["difficulty"] }));
    const opacity = this.q<HTMLInputElement>("#menu-opacity");
    opacity.addEventListener("input", () => actions.changeSettings({ territoryOpacity: Number(opacity.value) }));

    // 書き出しと読み込み
    const text = this.q<HTMLTextAreaElement>("#menu-json");
    this.q("#menu-export").addEventListener("click", () => {
      text.value = JSON.stringify(actions.buildSave());
      text.select();
      // コピーは、できる環境でだけ行う(できなくても、欄から手でコピーできる)
      navigator.clipboard?.writeText(text.value).then(
        () => this.say("セーブデータを書き出して、コピーしました"),
        () => this.say("セーブデータを書き出しました。欄の文字をコピーして保管してください"),
      );
      if (!navigator.clipboard) this.say("セーブデータを書き出しました。欄の文字をコピーして保管してください");
    });
    this.q("#menu-import").addEventListener("click", () => this.importText(text.value));
    this.q<HTMLInputElement>("#menu-file").addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.importText(String(reader.result));
      reader.readAsText(file);
    });
  }

  private say(message: string, bad = false): void {
    const el = this.q("#menu-message");
    el.textContent = message;
    el.dataset.bad = String(bad);
  }

  private importText(textValue: string): void {
    if (!textValue.trim()) return this.say("読み込むセーブデータを、欄に貼り付けてください", true);
    let parsed: unknown;
    try {
      parsed = JSON.parse(textValue);
    } catch {
      return this.say("読み込めませんでした:セーブデータの文字が途中で切れているか、別の文字が混ざっています", true);
    }
    try {
      this.actions.applySave(parsed);
      this.close();
    } catch (err) {
      this.say(`読み込めませんでした:${err instanceof Error ? err.message : "形式が正しくありません"}`, true);
    }
  }

  async open(): Promise<void> {
    const s = this.actions.settings();
    this.q<HTMLSelectElement>("#menu-faction").value = s.playerFactionId ?? "";
    this.q<HTMLSelectElement>("#menu-difficulty").value = s.difficulty;
    this.q<HTMLInputElement>("#menu-opacity").value = String(s.territoryOpacity);
    this.say("");
    this.root.hidden = false;
    await this.refresh();
  }

  close(): void {
    this.root.hidden = true;
  }

  /** スロットの一覧を書き直す */
  private async refresh(): Promise<void> {
    const records = new Map<string, SaveRecord>((await this.store.list()).map((r) => [r.slot, r]));
    this.q("#menu-storage").textContent = this.store.persistent
      ? "保存先:この端末のブラウザ(IndexedDB)"
      : "この環境では端末に保存できません。ページを閉じると消えるので、「書き出す」で保管してください";
    const list = this.q("#menu-slots");
    list.replaceChildren();
    for (const slot of SLOTS) {
      const record = records.get(slot.id);
      const row = document.createElement("div");
      row.className = "menu-slot";
      const info = document.createElement("div");
      info.className = "menu-slot-info";
      const name = document.createElement("strong");
      name.textContent = slot.name;
      const meta = document.createElement("span");
      if (record) {
        const d = record.data;
        const when = new Date(d.savedAt);
        const pad = (n: number): string => String(n).padStart(2, "0");
        meta.textContent =
          `${d.summary.date}(${d.summary.season})・${d.summary.playerFaction}・` +
          `${when.getFullYear()}/${when.getMonth() + 1}/${when.getDate()} ${pad(when.getHours())}:${pad(when.getMinutes())} 保存`;
      } else {
        meta.textContent = "データなし";
      }
      info.append(name, meta);
      row.appendChild(info);
      const button = (label: string, run: () => Promise<void>, enabled = true): void => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.disabled = !enabled;
        b.addEventListener("click", () => {
          run().catch((err) => this.say(`失敗しました:${err instanceof Error ? err.message : err}`, true));
        });
        row.appendChild(b);
      };
      if (slot.id !== AUTO_SLOT) {
        button("セーブ", async () => {
          await this.store.put(slot.id, this.actions.buildSave());
          await this.refresh();
          this.say(`${slot.name}に保存しました`);
        });
      }
      button("ロード", async () => {
        const r = await this.store.get(slot.id);
        if (!r) return;
        this.actions.applySave(r.data);
        this.close();
      }, !!record);
      button("削除", async () => {
        await this.store.remove(slot.id);
        await this.refresh();
        this.say(`${slot.name}を削除しました`);
      }, !!record);
      list.appendChild(row);
    }
  }
}
