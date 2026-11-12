// 軍団をタップしたときに、画面の下に出る詳細パネル。移動の指示もここから出す。
import { terrainRules, totalTroops } from "../data";
import type { TerrainKind } from "../data/types";
import type { SupplyState } from "../sim/Campaign";
import type { ArmyMarker } from "../world/Armies";
import { STATUS_TEXT } from "./ArmyLabels";

/** パネルの表示の段階:通常 / 移動先を選んでいる / 経路を確認している */
export type ArmyPanelMode = "info" | "pick" | "confirm";

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
}

/** 軍団のデータ以外に、パネルへ渡す情報 */
export interface ArmyPanelInfo {
  location: string;
  terrain: TerrainKind;
  speed: number;
  supply: SupplyState;
  supplied: boolean;
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
  }

  show(marker: ArmyMarker, info: ArmyPanelInfo): void {
    const a = marker.state.army;
    this.q(".army-title").textContent = a.name;
    this.q(".army-chip").style.background = marker.faction ? marker.faction.color : "#9a9a9a";
    this.q(".army-faction").textContent = marker.faction ? marker.faction.name : "所属なし";
    this.q(".army-commander").textContent = marker.commander ? `指揮官 ${marker.commander.name}` : "指揮官なし";
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

    this.q(".army-halt").hidden = marker.state.status !== "marching";
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
    this.q(".army-confirm").hidden = mode !== "confirm";
    this.q(".army-cancel").hidden = mode === "info";
    if (mode !== "info") this.q(".army-halt").hidden = true;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
