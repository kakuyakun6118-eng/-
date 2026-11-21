// 会戦準備画面。攻撃側を左、防御側を右に置き、中央は戦略マップ(戦場と両軍の陣営)をそのまま見せる。
// 「両軍情報」で、兵力・士気などを左右の棒で比べる表に切り替える。
import { playerSideOf } from "../sim/battle";
import { estimateWinRate } from "../sim/autoBattle";
import { fillPortrait } from "./portrait";
import { factionById, terrainRules } from "../data";
import type { BattleSetup, BattleSide } from "../data/types";
import type { ComparisonRow } from "../sim/battle";

export interface BattlePrepActions {
  /** 「戦闘開始」が押された。side は、プレイヤーが指揮する側 */
  onStart(side: "attacker" | "defender"): void;
  /** 「戦略マップに戻る」が押された(戦闘は保留) */
  onBack(): void;
  /** 「自動戦闘」「戦闘をスキップ」が押された(Version 42。どちらも自動戦闘と同じ計算) */
  onAuto?(mode: "auto" | "skip"): void;
}

const TYPE_TEXT = { field_battle: "野戦", siege_battle: "攻城戦" } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text) e.textContent = text;
  return e;
}

const fmt = (n: number): string => Math.round(n).toLocaleString("ja-JP");
const total = (s: BattleSide): number => s.troops.infantry + s.troops.cavalry + s.troops.archer;

/** 指揮官・守将の行。人物がいれば、肖像(人物画面と同じ処理)を添える */
function commanderLine(side: BattleSide): HTMLElement {
  const line = document.createElement("p");
  line.className = "battle-commander";
  if (side.commander) {
    const img = document.createElement("img");
    img.className = "battle-face";
    img.alt = "";
    fillPortrait(img, side.commander);
    line.append(img);
  }
  line.append(side.commander ? `${side.kind === "city" ? "守将" : "指揮官"} ${side.commander.name}` : side.kind === "city" ? "守将 不明" : "指揮官なし");
  return line;
}

export class BattlePrep {
  /** いま開いている会戦の設定(点検用) */
  setup: BattleSetup | null = null;
  private readonly q: (sel: string) => HTMLElement;
  private detailOpen = false;
  /** プレイヤーが指揮する側(もう一方は自動で動く) */
  private playerSide: "attacker" | "defender" = "attacker";

  /** プレイヤーの陣営が決まっている(通常のプレイ)なら、切り替えられない */
  private locked = false;

  private setPlayerSide(side: "attacker" | "defender"): void {
    this.playerSide = side;
    const siege = this.setup?.battleType === "siege_battle";
    const label = side === "attacker" ? (siege ? "攻城側" : "攻撃側") : siege ? "守城側" : "防衛側";
    this.q(".battle-command").textContent = this.locked ? `あなたの陣営:${label}` : `指揮:${label}(観賞・編集モードでは切り替えられます)`;
    (this.q(".battle-command") as HTMLButtonElement).disabled = this.locked;
    this.q(".battle-side.attacker").classList.toggle("commanded", side === "attacker");
    this.q(".battle-side.defender").classList.toggle("commanded", side === "defender");
  }

  constructor(private readonly root: HTMLElement, actions: BattlePrepActions) {
    this.q = (sel) => root.querySelector(sel) as HTMLElement;
    this.q(".battle-start").addEventListener("click", () => actions.onStart(this.playerSide));
    this.q(".battle-command").addEventListener("click", () => {
      if (!this.locked) this.setPlayerSide(this.playerSide === "attacker" ? "defender" : "attacker");
    });
    this.q(".battle-auto").addEventListener("click", () => actions.onAuto?.("auto"));
    this.q(".battle-skip").addEventListener("click", () => actions.onAuto?.("skip"));
    this.q(".battle-back").addEventListener("click", actions.onBack);
    this.q(".battle-handoff-back").addEventListener("click", actions.onBack);
    this.q(".battle-info").addEventListener("click", () => this.setDetail(!this.detailOpen));
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /** いま指揮する陣営 */
  get side(): "attacker" | "defender" {
    return this.playerSide;
  }

  show(setup: BattleSetup, rows: ComparisonRow[], notes: string[], playerFactionId: string | null = null): void {
    this.root.dataset.type = setup.battleType;
    this.setup = setup;
    this.q(".battle-type").textContent = TYPE_TEXT[setup.battleType];
    this.q(".battle-name").textContent = setup.name;
    this.q(".battle-meta").textContent =
      `${setup.location.name}・${terrainRules[setup.terrain].name}・${setup.createdAt.text}`;
    // 比較表の棒にも、両勢力の色を使う
    this.root.style.setProperty("--att", factionById(setup.attacker.factionId)?.color ?? "#9a9a9a");
    this.root.style.setProperty("--def", factionById(setup.defender.factionId)?.color ?? "#9a9a9a");
    this.fillSide(this.q(".battle-side.attacker"), setup.attacker);
    this.fillSide(this.q(".battle-side.defender"), setup.defender);

    // 両軍の比較表
    const table = this.q(".battle-rows");
    table.replaceChildren();
    for (const r of rows) {
      const max = Math.max(r.attacker, r.defender, 1);
      const line = el("div", "battle-row");
      const left = el("span", "battle-value attacker", `${fmt(r.attacker)}${r.unit}`);
      const right = el("span", "battle-value defender", `${fmt(r.defender)}${r.unit}`);
      if (r.lead === "attacker") left.classList.add("lead");
      if (r.lead === "defender") right.classList.add("lead");
      const barL = el("span", "battle-bar attacker");
      const barR = el("span", "battle-bar defender");
      (barL.appendChild(el("i", "")) as HTMLElement).style.width = `${(r.attacker / max) * 100}%`;
      (barR.appendChild(el("i", "")) as HTMLElement).style.width = `${(r.defender / max) * 100}%`;
      line.append(left, barL, el("span", "battle-label", r.label), barR, right);
      table.appendChild(line);
    }
    // 勝率の目安(自動戦闘と同じ強さの式から出す)
    const odds = estimateWinRate(setup);
    const pa = Math.round(odds.attacker * 100);
    this.q(".battle-odds-value.attacker").textContent = `攻 ${pa}%`;
    this.q(".battle-odds-value.defender").textContent = `守 ${100 - pa}%`;
    (this.q(".battle-odds-bar").firstElementChild as HTMLElement).style.width = `${pa}%`;
    this.q(".battle-odds-note").textContent = "勝率の目安(兵力・兵種・地形・士気・疲労・指揮官・城壁から計算。指揮しだいで変わります)";
    this.root.dataset.odds = String(pa);
    const noteList = this.q(".battle-notes");
    noteList.replaceChildren(...[...notes, ...odds.factors.map((f) => `勝率の目安に効いているもの:${f}`)].map((n) => el("li", "", n)));

    this.q(".battle-handoff").hidden = true;
    // プレイヤーの陣営:プレイヤーの国を、攻撃側・防衛側の国と照らし合わせて決める(Version 42)
    const mine = playerSideOf(setup, playerFactionId);
    this.locked = mine !== null;
    const who = (side: BattleSide, role: "attacker" | "defender"): string => `${factionById(side.factionId)?.name ?? side.name}(${mine === role ? "プレイヤー" : mine ? "AI" : "観賞"})`;
    const siege = setup.battleType === "siege_battle";
    this.q(".battle-roles").textContent = `攻撃側:${who(setup.attacker, "attacker")} / 防衛側:${who(setup.defender, "defender")}${mine ? ` / あなたの陣営:${mine === "attacker" ? (siege ? "攻城側" : "攻撃側") : siege ? "守城側" : "防衛側"}` : ""}`;
    this.setPlayerSide(mine ?? "attacker");
    this.setDetail(false);
    this.root.hidden = false;
  }

  /** 片方の陣営のカードを書く */
  private fillSide(card: HTMLElement, side: BattleSide): void {
    const faction = factionById(side.factionId);
    card.style.setProperty("--faction", faction ? faction.color : "#9a9a9a");
    const body = card.querySelector(".battle-side-body") as HTMLElement;
    body.replaceChildren();
    body.append(
      el("p", "battle-faction", faction ? faction.name : "所属なし"),
      el("h3", "battle-army", side.name),
      commanderLine(side),
    );
    const stats = el("dl", "battle-stats");
    const add = (label: string, value: string): void => {
      // 文字数の多い値(城壁の規模など)は、1行をまるごと使う
      const row = el("div", value.length > 6 ? "wide" : "");
      row.append(el("dt", "", label), el("dd", "", value));
      stats.appendChild(row);
    };
    add(side.kind === "city" ? "守備兵力" : "総兵力", fmt(total(side)));
    add("歩兵", fmt(side.troops.infantry));
    add("騎兵", fmt(side.troops.cavalry));
    add("弓兵", fmt(side.troops.archer));
    if (side.fortification) {
      // 都市のときは、城壁の規模と防御施設を表示する
      add("城壁", side.fortification.scale);
      add("城防御", String(side.fortification.defense));
    } else {
      add("士気", String(Math.round(side.morale)));
      add("疲労", String(Math.round(side.fatigue)));
      add("食糧", `${Math.round(side.food)}日分`);
    }
    body.appendChild(stats);
    if (side.fortification) body.appendChild(el("p", "battle-facilities", `防御施設:${side.fortification.facilities.join("・")}`));
  }

  /** 中央を、戦場の眺めと「両軍情報」の表とで切り替える */
  private setDetail(open: boolean): void {
    this.detailOpen = open;
    this.q(".battle-detail").hidden = !open;
    this.q(".battle-info").textContent = open ? "戦場を見る" : "両軍情報";
    this.q(".battle-info").setAttribute("aria-pressed", String(open));
  }

  /** 「戦闘開始」のあと、次段階の3D戦闘へ引き継ぐデータを確かめる画面を出す */
  showHandOff(setup: BattleSetup): void {
    const list = this.q(".battle-handoff-list");
    const side = (s: BattleSide): string =>
      `${s.name}(${s.commander ? s.commander.name : "指揮官なし"})歩兵${fmt(s.troops.infantry)}・騎兵${fmt(s.troops.cavalry)}・弓兵${fmt(s.troops.archer)}、士気${Math.round(s.morale)}、疲労${Math.round(s.fatigue)}`;
    list.replaceChildren(
      el("li", "", `戦闘ID:${setup.battleId}`),
      el("li", "", `形式:${TYPE_TEXT[setup.battleType]}`),
      el("li", "", `戦場:${setup.location.name}(${terrainRules[setup.terrain].name})`),
      el("li", "", `攻撃側:${side(setup.attacker)}`),
      el("li", "", `防御側:${side(setup.defender)}`),
    );
    this.q(".battle-handoff").hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
