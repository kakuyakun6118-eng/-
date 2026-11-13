// 会戦中の画面表示。上部に戦況、左右に両軍の部隊一覧、下部に選択中の部隊と命令、終了後に結果を出す。
import { factionById } from "../data";
import type { BattleSim } from "../battle/BattleSim";
import { unitClasses } from "../battle/deploy";
import type { BattleResult, BattleUnit, CommanderFate, SideId, SideResult, UnitState } from "../battle/types";

export interface BattleHudActions {
  onSelect(unitId: string): void;
  onHold(): void;
  onPursue(): void;
  onRetreatUnit(): void;
  onFollow(): void;
  onOverview(): void;
  onRotate(direction: number): void;
  onAdvanceAll(): void;
  onRetreatAll(): void;
  onPause(): void;
  onSpeed(): void;
  /** 結果画面の「戦略マップへ戻る」 */
  onLeave(): void;
}

const STATE_TEXT: Record<UnitState, string> = {
  idle: "待機", moving: "移動中", melee: "交戦中", shooting: "射撃中", routing: "敗走", retreating: "撤退中", gone: "壊滅",
};
const OUTCOME_TEXT: Record<SideResult["outcome"], string> = {
  victory: "勝利", retreated: "撤退", routed: "敗走", annihilated: "壊滅", draw: "引き分け",
};
const FATE_TEXT: Record<CommanderFate, string> = { healthy: "健在", wounded: "負傷", captured: "捕虜", killed: "戦死" };
/** 決着の理由(敗れた側がどうなったか) */
const REASON_TEXT: Record<BattleResult["reason"], string> = {
  annihilated: "壊滅した", routed: "主力が崩れて敗走した", retreated: "全軍を撤退させた", timeout: "",
};

const fmt = (n: number): string => Math.round(n).toLocaleString("ja-JP");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text) e.textContent = text;
  return e;
}

export class BattleHud {
  private readonly q: (sel: string) => HTMLElement;
  private readonly chips = new Map<string, { root: HTMLElement; men: HTMLElement; bar: HTMLElement }>();

  constructor(private readonly root: HTMLElement, private readonly sim: BattleSim, actions: BattleHudActions) {
    this.q = (sel) => root.querySelector(sel) as HTMLElement;
    const on = (sel: string, fn: () => void): void => {
      // ボタンは作り直さないので、前の戦闘の分が残らないよう onclick で差し替える
      (this.q(sel) as HTMLButtonElement).onclick = fn;
    };
    on(".hud-hold", actions.onHold);
    on(".hud-pursue", actions.onPursue);
    on(".hud-retreat", actions.onRetreatUnit);
    on(".hud-follow", actions.onFollow);
    on(".hud-overview", actions.onOverview);
    on(".hud-rotate-left", () => actions.onRotate(-1));
    on(".hud-rotate-right", () => actions.onRotate(1));
    on(".hud-advance-all", actions.onAdvanceAll);
    on(".hud-retreat-all", actions.onRetreatAll);
    on(".hud-pause", actions.onPause);
    on(".hud-speed", actions.onSpeed);
    on(".hud-leave", actions.onLeave);

    this.q(".hud-name").textContent = sim.setup.name;
    for (const side of ["attacker", "defender"] as SideId[]) {
      const info = side === "attacker" ? sim.setup.attacker : sim.setup.defender;
      const color = factionById(info.factionId)?.color ?? "#9a9a9a";
      root.style.setProperty(side === "attacker" ? "--att" : "--def", color);
      this.q(`.hud-side-name.${side}`).textContent = info.name;
      // 部隊一覧
      const list = this.q(`.hud-list.${side}`);
      list.replaceChildren();
      for (const u of sim.units.filter((k) => k.side === side)) {
        const chip = el("button", "hud-chip");
        chip.type = "button";
        const men = el("span", "hud-chip-men");
        const bar = el("i", "");
        const track = el("span", "hud-chip-bar");
        track.appendChild(bar);
        chip.append(el("span", "hud-chip-name", u.isCommand ? "本陣" : unitClasses[u.classId].name), men, track);
        if (side === sim.playerSide) chip.onclick = () => actions.onSelect(u.id);
        else chip.disabled = true;
        list.appendChild(chip);
        this.chips.set(u.id, { root: chip, men, bar });
      }
    }
    this.q(".hud-result").hidden = true;
    this.q(".hud-confirm").hidden = true;
    this.setSelected(null);
    this.setPaused(false);
    this.setSpeed(1);
    root.hidden = false;
  }

  /** 地形データの出どころを表示する。低解像度のときは、目立つ色にする */
  setTerrainInfo(text: string, coarse: boolean): void {
    const el = this.q(".hud-terrain");
    el.textContent = `地形:${text}`;
    el.dataset.coarse = String(coarse);
  }

  setPaused(paused: boolean): void {
    this.q(".hud-pause").textContent = paused ? "▶ 再開" : "Ⅱ 停止";
  }

  setSpeed(speed: number): void {
    this.q(".hud-speed").textContent = `速度 ×${speed}`;
  }

  setFollowing(on: boolean): void {
    this.q(".hud-follow").setAttribute("aria-pressed", String(on));
  }

  /** 上部の戦況と、左右の部隊一覧を、いまの状態に合わせる */
  update(selected: BattleUnit | null): void {
    const sim = this.sim;
    const m = Math.floor(sim.time / 60);
    const s = Math.floor(sim.time % 60);
    this.q(".hud-time").textContent = `${m}:${String(s).padStart(2, "0")}`;
    for (const side of ["attacker", "defender"] as SideId[]) {
      const men = sim.menOf(side, true);
      this.q(`.hud-men.${side}`).textContent = fmt(men);
      (this.q(`.hud-strength.${side} i`) as HTMLElement).style.width = `${(men / sim.initialMenOf(side)) * 100}%`;
    }
    for (const u of sim.units) {
      const chip = this.chips.get(u.id)!;
      chip.men.textContent = u.state === "gone" || u.escaped ? "—" : fmt(u.men);
      chip.bar.style.width = `${u.morale}%`;
      chip.root.dataset.state = u.escaped ? "gone" : u.state;
      chip.root.classList.toggle("selected", u === selected);
    }
    this.setSelected(selected);
  }

  /** 下部の部隊パネル */
  private setSelected(u: BattleUnit | null): void {
    this.q(".hud-unit").hidden = u === null;
    this.q(".hud-tip").hidden = u !== null;
    if (!u) return;
    const side = u.side === "attacker" ? this.sim.setup.attacker : this.sim.setup.defender;
    this.q(".hud-unit-name").textContent = u.name;
    this.q(".hud-unit-class").textContent = unitClasses[u.classId].name;
    const state = this.q(".hud-unit-state");
    state.textContent = STATE_TEXT[u.escaped ? "gone" : u.state];
    state.dataset.state = u.state;
    this.q(".hud-unit-men").textContent = `${fmt(u.men)} / ${fmt(u.maxMen)}`;
    (this.q(".hud-unit-morale i") as HTMLElement).style.width = `${u.morale}%`;
    this.q(".hud-unit-morale b").textContent = String(Math.round(u.morale));
    (this.q(".hud-unit-fatigue i") as HTMLElement).style.width = `${u.fatigue}%`;
    this.q(".hud-unit-fatigue b").textContent = String(Math.round(u.fatigue));
    this.q(".hud-unit-commander").textContent = side.commander ? `指揮官 ${side.commander.name}` : "指揮官なし";
    const usable = this.sim.isActive(u);
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(".hud-order")) b.disabled = !usable;
    this.q(".hud-pursue").setAttribute("aria-pressed", String(u.order.kind === "pursue"));
  }

  /** 「全軍撤退」の確認を出す。「撤退する」が押されたら onYes を呼ぶ */
  confirmRetreat(onYes: () => void): void {
    const box = this.q(".hud-confirm");
    box.hidden = false;
    (this.q(".hud-confirm-yes") as HTMLButtonElement).onclick = () => {
      box.hidden = true;
      onYes();
    };
    (this.q(".hud-confirm-no") as HTMLButtonElement).onclick = () => {
      box.hidden = true;
    };
  }

  /** 戦闘結果の画面 */
  showResult(result: BattleResult): void {
    const sim = this.sim;
    const won = result.winner === sim.playerSide;
    const title = this.q(".hud-result-title");
    title.textContent = result.winner === "draw" ? "引き分け" : won ? "勝利" : "敗北";
    title.dataset.outcome = result.winner === "draw" ? "draw" : won ? "win" : "lose";
    const m = Math.floor(result.durationSeconds / 60);
    const s = result.durationSeconds % 60;
    const names = { attacker: sim.setup.attacker.name, defender: sim.setup.defender.name };
    const story =
      result.winner === "draw"
        ? "決着が付かず、両軍とも兵を引いた"
        : `${names[result.winner]}の勝利。${names[result.winner === "attacker" ? "defender" : "attacker"]}は${REASON_TEXT[result.reason]}`;
    this.q(".hud-result-summary").textContent = `${sim.setup.name}。${story}。戦闘時間 ${m}分${s}秒`;

    const table = this.q(".hud-result-table");
    table.replaceChildren();
    const total = (t: Record<string, number>): number => t.infantry + t.cavalry + t.archer;
    const a = result.sides.attacker;
    const d = result.sides.defender;
    const row = (label: string, x: string, y: string): void => {
      const r = el("div", "hud-result-row");
      r.append(el("span", "attacker", x), el("span", "label", label), el("span", "defender", y));
      table.appendChild(r);
    };
    row("", sim.setup.attacker.name, sim.setup.defender.name);
    row("結果", OUTCOME_TEXT[a.outcome], OUTCOME_TEXT[d.outcome]);
    row("戦闘前", fmt(total(a.before)), fmt(total(d.before)));
    row("残存兵力", fmt(total(a.after)), fmt(total(d.after)));
    row("戦死", fmt(a.killed), fmt(d.killed));
    row("負傷", fmt(a.wounded), fmt(d.wounded));
    row("捕虜", fmt(a.captured), fmt(d.captured));
    row("逃散", fmt(a.scattered), fmt(d.scattered));
    row("士気", String(a.morale), String(d.morale));
    row("指揮官", sim.setup.attacker.commander ? FATE_TEXT[a.commander] : "—", sim.setup.defender.commander ? FATE_TEXT[d.commander] : "—");
    this.q(".hud-result").hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
