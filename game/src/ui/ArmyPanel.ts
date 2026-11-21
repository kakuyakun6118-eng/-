// 軍団をタップしたときに、画面の下に出る詳細パネル。移動の指示もここから出す。
import { fillPortrait } from "./portrait";
import { terrainRules, totalTroops } from "../data";
import type { TerrainKind } from "../data/types";
import type { SupplyState } from "../sim/Campaign";
import type { ArmyMarker } from "../world/Armies";
import { STATUS_TEXT } from "./ArmyLabels";

/** パネルの表示の段階:通常 / 移動先を選んでいる / 経路を確認している */
export type ArmyPanelMode = "info" | "pick" | "draw" | "confirm";

export interface ArmyPanelActions {
  onClose(): void;
  /** 「移動」が押された */
  onMove(): void;
  /** 「確定」が押された */
  onConfirm(): void;
  /** 「キャンセル」が押された */
  onCancel(): void;
  /** 「停止」が押された */
  onHalt(): void;
  /** 「会戦準備」が押された */
  onBattle(): void;
  /** 「経路を描く」が押された(Version 41) */
  onDraw?(): void;
  /** 「退却」が押された(Version 41) */
  onRetreat?(): void;
  /** 「帰城」が押された(Version 51) */
  onReturn?(): void;
  /** 「軍団結合」が押された(Version 51) */
  onMerge?(): void;
}

/** 帰城先の候補(Version 51) */
export interface ReturnChoice {
  cityId: string;
  name: string;
  tags: string[];
  km: number;
  days: number;
  foodUse: number;
  foodLeft: number;
  besieged: boolean;
}

/** 結合できる軍団の候補(Version 51) */
export interface MergeChoice {
  armyId: string;
  name: string;
  troops: number;
  km: number;
  commander: string;
}

/** 軍団のデータ以外に、パネルへ渡す情報 */
export interface ArmyPanelInfo {
  location: string;
  terrain: TerrainKind;
  speed: number;
  supply: SupplyState;
  supplied: boolean;
  /** 敵と対峙していて、会戦準備画面を開けるか */
  canBattle: boolean;
  /** 副将・配下武将の名前(Version 51) */
  people?: string;
  /** 帰城・結合の進み具合や、取り消しの理由(Version 51) */
  note?: string;
}

const SUPPLY_TEXT: Record<SupplyState, string> = { good: "良好", low: "残りわずか", out: "欠乏" };

export class ArmyPanel {
  private readonly q: (sel: string) => HTMLElement;

  constructor(private readonly root: HTMLElement, actions: ArmyPanelActions) {
    this.q = (sel) => root.querySelector(sel) as HTMLElement;
    this.q(".army-close").addEventListener("click", actions.onClose);
    this.q(".army-move").addEventListener("click", actions.onMove);
    this.q(".army-confirm").addEventListener("click", actions.onConfirm);
    this.q(".army-cancel").addEventListener("click", actions.onCancel);
    this.q(".army-halt").addEventListener("click", actions.onHalt);
    this.q(".army-battle").addEventListener("click", actions.onBattle);
    this.q(".army-draw").addEventListener("click", () => actions.onDraw?.());
    this.q(".army-retreat").addEventListener("click", () => actions.onRetreat?.());
    this.q(".army-return").addEventListener("click", () => actions.onReturn?.());
    this.q(".army-merge").addEventListener("click", () => actions.onMerge?.());
  }

  show(marker: ArmyMarker, info: ArmyPanelInfo): void {
    const a = marker.state.army;
    this.q(".army-title").textContent = a.name;
    this.q(".army-chip").style.background = marker.faction ? marker.faction.color : "#9a9a9a";
    this.q(".army-faction").textContent = marker.faction ? marker.faction.name : "所属なし";
    // 指揮官:肖像(人物画面と同じ処理)と、統率・武力・知力
    const c = marker.commander;
    const face = this.q(".army-face") as HTMLImageElement;
    face.hidden = !c;
    if (c) fillPortrait(face, c);
    this.q(".army-commander-name").textContent = c ? `指揮官 ${c.name}(統${c.leadership} 武${c.war} 知${c.intelligence})` : "指揮官なし";
    const badge = this.q(".army-badge");
    badge.textContent = STATUS_TEXT[marker.state.status];
    badge.dataset.status = marker.state.status;
    this.q(".army-location").textContent = `${info.location}(${terrainRules[info.terrain].name})`;

    const n = (v: number): string => Math.round(v).toLocaleString("ja-JP");
    this.q(".army-total").textContent = n(totalTroops(a));
    this.q(".army-infantry").textContent = n(a.troops.infantry);
    this.q(".army-cavalry").textContent = n(a.troops.cavalry);
    this.q(".army-archer").textContent = n(a.troops.archer);

    this.meter(".army-morale", a.morale);
    this.meter(".army-fatigue", a.fatigue);
    const food = this.q(".army-food");
    food.textContent = `${Math.round(a.food)}日分`;
    food.dataset.level = info.supply;
    this.q(".army-speed").textContent = `${info.speed}km/日`;
    const supply = this.q(".army-supply");
    supply.textContent = info.supplied ? `${SUPPLY_TEXT[info.supply]}・補給線あり` : SUPPLY_TEXT[info.supply];
    supply.dataset.level = info.supply;

    const people = this.q(".army-people");
    people.textContent = info.people ?? "";
    people.hidden = !info.people;
    const note = this.q(".army-note");
    note.textContent = info.note ?? "";
    note.hidden = !info.note;
    this.q(".army-halt").hidden = marker.state.status !== "marching";
    this.q(".army-retreat").hidden = (this.root.dataset.mode ?? "info") !== "info";
    this.q(".army-battle").hidden = !info.canBattle;
    // 対峙中に移動を命じると、戦闘をやめてその場を離れることになる
    this.q(".army-move").textContent = info.canBattle ? "離脱" : "移動";
    this.root.hidden = false;
  }

  private meter(sel: string, value: number): void {
    const el = this.q(sel);
    (el.querySelector("i") as HTMLElement).style.width = `${Math.max(0, Math.min(100, value))}%`;
    (el.querySelector("b") as HTMLElement).textContent = String(Math.round(value));
  }

  /** 表示の段階を切り替える。message は、移動先の指定中に出す案内や、経路の距離と日数 */
  setMode(mode: ArmyPanelMode, message = ""): void {
    this.root.dataset.mode = mode;
    this.q(".army-message").textContent = message;
    this.q(".army-move").hidden = mode !== "info";
    this.q(".army-draw").hidden = mode !== "info";
    this.q(".army-retreat").hidden = mode !== "info";
    this.q(".army-return").hidden = mode !== "info";
    this.q(".army-merge").hidden = mode !== "info";
    if (mode !== "info") this.closeChooser();
    this.q(".army-confirm").hidden = mode !== "confirm";
    this.q(".army-cancel").hidden = mode === "info";
    if (mode !== "info") {
      this.q(".army-halt").hidden = true;
      this.q(".army-battle").hidden = true;
    }
  }

  hide(): void {
    this.closeChooser();
    this.root.hidden = true;
  }

  /** 選ぶ欄を閉じる */
  closeChooser(): void {
    const box = this.q(".army-choose");
    box.hidden = true;
    box.replaceChildren();
  }

  get chooserOpen(): boolean {
    return !this.q(".army-choose").hidden;
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  /** 帰城先の一覧(Version 51):出発元・最寄り・首都の印と、距離・日数・兵糧の見込み */
  showReturnChoices(list: ReturnChoice[], onPick: (c: ReturnChoice) => void): void {
    const box = this.q(".army-choose");
    box.replaceChildren(this.el("h3", "", list.length ? "帰城先を選んでください(自国の都市)" : "帰城できる自国の都市への道がありません"));
    const n = (v: number): string => Math.round(v).toLocaleString("ja-JP");
    for (const c of list) {
      const row = this.el("button", "choose-row");
      row.type = "button";
      row.dataset.city = c.cityId;
      row.append(this.el("b", "", c.name));
      for (const t of c.tags) row.append(this.el("span", "tag", t));
      row.append(this.el("small", "", c.days === 0 ? `すぐそば(${n(c.km)}km)・その場で入城` : `${n(c.km)}km・約${c.days}日・道中の兵糧の消費 ${n(c.foodUse)}日分・着いたときの残り ${n(c.foodLeft)}日分${c.besieged ? "・包囲されている" : ""}`));
      row.addEventListener("click", () => onPick(c));
      box.append(row);
    }
    box.hidden = false;
  }

  /**
   * 軍団結合の選択(Version 51):結合する軍団(複数可)と総指揮官を選び、結合後の兵力・兵糧・士気・疲労・指揮官を確かめてから決める。
   * preview は、選んだ内容から見込みの文(と、決められるか)を返す。
   */
  showMergeChoices(list: MergeChoice[], commanders: (ids: string[]) => { id: string; label: string }[], preview: (ids: string[], cmd: string) => { text: string; ok: boolean }, onGo: (ids: string[], cmd: string) => void): void {
    const box = this.q(".army-choose");
    box.replaceChildren(this.el("h3", "", list.length ? "この軍団に結合する軍団を選んでください(同じ国の軍団)" : "結合できる同じ国の軍団がありません"));
    const n = (v: number): string => Math.round(v).toLocaleString("ja-JP");
    const picked = new Set<string>();
    const sel = this.el("select", "choose-commander");
    sel.setAttribute("aria-label", "結合後の総指揮官");
    const out = this.el("p", "choose-preview");
    const go = this.el("button", "choose-go", "結合する");
    go.type = "button";
    const refresh = (): void => {
      const ids = [...picked];
      const prev = sel.value;
      sel.replaceChildren(...commanders(ids).map((c) => {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.label;
        return o;
      }));
      if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
      const pv = preview(ids, sel.value);
      out.textContent = pv.text;
      if (pv.ok) delete out.dataset.bad;
      else out.dataset.bad = "1";
      go.disabled = !pv.ok;
    };
    for (const c of list) {
      const row = this.el("label", "choose-row");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = c.armyId;
      cb.addEventListener("change", () => {
        if (cb.checked) picked.add(c.armyId);
        else picked.delete(c.armyId);
        refresh();
      });
      row.append(cb, this.el("b", "", c.name), this.el("small", "", `${n(c.troops)}人・${c.commander || "指揮官なし"}・${n(c.km)}km${c.km > 40 ? "(合流してから結合)" : ""}`));
      box.append(row);
    }
    if (list.length) {
      const lab = this.el("small", "", "結合後の総指揮官");
      sel.addEventListener("change", refresh);
      go.addEventListener("click", () => onGo([...picked], sel.value));
      box.append(lab, sel, out, go);
      refresh();
    }
    box.hidden = false;
  }
}
