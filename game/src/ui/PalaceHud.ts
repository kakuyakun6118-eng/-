// 皇帝生活モードの画面の欄:時刻・場所・時間を進める・上奏(報告)・重臣・後宮の人々・子女・宴・人物との交流。
import { persons } from "../data";
import type { Campaign } from "../sim/Campaign";
import { EDU_LABEL, type EduPolicy } from "../sim/court";
import { ACTION_LABEL, AREA_LABEL, PalaceSystem, RANK_NAME, SLOT_LABEL, type Action, type PalaceNpc } from "../sim/palace";
import { ENDING_LABEL } from "../sim/palaceStories";
import type { Expr } from "../sim/palaceText";
import { GIFT_COST, GIFT_LABEL, type Gift } from "../sim/palaceText";
import { fillPortrait } from "./portrait";

export interface PalaceHudDeps {
  palace: PalaceSystem;
  campaign: Campaign;
  /** 時を進める(刻の数) */
  advance(slots: number): void;
  /** 政務に戻る(委任をやめて、戦略マップへ) */
  exit(): void;
  /** 人物のいる所へ歩く */
  walkToNpc(id: string): void;
  /** メニュー(セーブ・ロード・設定)を開く */
  openMenu(): void;
  /** 画質(低・中・高) */
  quality(): "low" | "mid" | "high";
  setQuality(q: "low" | "mid" | "high"): void;
}

/** 架空の女官の似顔(衣の色と髪の形から作る絵。写実ではない) */
export function ladyPortrait(n: PalaceNpc, expr: Expr = n.expr ?? "normal"): string {
  const hair = ["<circle cx='48' cy='20' r='9' fill='#1a1412'/>", "<circle cx='38' cy='22' r='7' fill='#1a1412'/><circle cx='58' cy='22' r='7' fill='#1a1412'/>", "<circle cx='48' cy='16' r='6' fill='#1a1412'/><circle cx='48' cy='26' r='8' fill='#1a1412'/>", "<ellipse cx='48' cy='30' rx='16' ry='9' fill='#1a1412'/>"][n.looks.hair] ?? "";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><rect width='96' height='96' fill='#241812'/>` +
    `<path d='M14 96c2-22 16-32 34-32s32 10 34 32z' fill='${n.looks.robe}'/><path d='M36 66l12 14 12-14' stroke='${n.looks.trim}' stroke-width='4' fill='none'/>` +
    `${hair}<ellipse cx='48' cy='42' rx='15' ry='18' fill='#e9c9a8'/><path d='M33 38c3-12 27-12 30 0c-6-6-24-6-30 0z' fill='#1a1412'/>` +
    `${FACE[expr] ?? FACE.normal}` +
    `<line x1='56' y1='20' x2='68' y2='14' stroke='${n.looks.trim}' stroke-width='2'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** 表情の差分(似顔の目・眉・口・頬) */
const FACE: Record<Expr, string> = {
  normal: "<circle cx='42' cy='43' r='1.6' fill='#2a1a14'/><circle cx='54' cy='43' r='1.6' fill='#2a1a14'/><path d='M44 52q4 2 8 0' stroke='#a85a50' stroke-width='1.6' fill='none'/>",
  smile: "<path d='M39 43q3-2 6 0M51 43q3-2 6 0' stroke='#2a1a14' stroke-width='1.4' fill='none'/><path d='M43 51q5 4 10 0' stroke='#a85a50' stroke-width='1.6' fill='none'/>",
  joy: "<path d='M39 43q3-3 6 0M51 43q3-3 6 0' stroke='#2a1a14' stroke-width='1.6' fill='none'/><path d='M42 50q6 7 12 0z' fill='#a85a50'/><circle cx='38' cy='48' r='3' fill='#e89a90' opacity='0.5'/><circle cx='58' cy='48' r='3' fill='#e89a90' opacity='0.5'/>",
  sad: "<path d='M39 40l6 2M57 40l-6 2' stroke='#2a1a14' stroke-width='1.2'/><circle cx='42' cy='44' r='1.5' fill='#2a1a14'/><circle cx='54' cy='44' r='1.5' fill='#2a1a14'/><path d='M44 54q4-3 8 0' stroke='#a85a50' stroke-width='1.6' fill='none'/><path d='M41 47v3' stroke='#7ab0d8' stroke-width='1.2'/>",
  angry: "<path d='M38 39l7 3M58 39l-7 3' stroke='#2a1a14' stroke-width='1.8'/><circle cx='42' cy='44' r='1.6' fill='#2a1a14'/><circle cx='54' cy='44' r='1.6' fill='#2a1a14'/><path d='M44 53h8' stroke='#a85a50' stroke-width='1.8'/>",
  puzzled: "<path d='M39 40l6-1M51 38l6 2' stroke='#2a1a14' stroke-width='1.2'/><circle cx='42' cy='43' r='1.6' fill='#2a1a14'/><circle cx='54' cy='43' r='1.6' fill='#2a1a14'/><path d='M44 53q2-2 4 0t4 0' stroke='#a85a50' stroke-width='1.4' fill='none'/>",
  surprised: "<circle cx='42' cy='43' r='2.4' fill='none' stroke='#2a1a14' stroke-width='1.2'/><circle cx='54' cy='43' r='2.4' fill='none' stroke='#2a1a14' stroke-width='1.2'/><ellipse cx='48' cy='53' rx='2.2' ry='3' fill='#a85a50'/>",
  shy: "<path d='M39 44q3 2 6 0M51 44q3 2 6 0' stroke='#2a1a14' stroke-width='1.4' fill='none'/><path d='M45 52q3 2 6 0' stroke='#a85a50' stroke-width='1.4' fill='none'/><ellipse cx='38' cy='48' rx='4' ry='2.4' fill='#e8808a' opacity='0.6'/><ellipse cx='58' cy='48' rx='4' ry='2.4' fill='#e8808a' opacity='0.6'/>",
};

const REPORT_KIND: Record<string, string> = { war: "軍事", city: "都市", court: "宮廷", event: "事件", diplomacy: "外交", palace: "後宮", finance: "財政" };

export class PalaceHud {
  private readonly q: <T extends HTMLElement = HTMLElement>(sel: string) => T;
  private selected: string | null = null;
  private nearId: string | null = null;
  private seenReports = 0;
  /** 時の流れ:自動のとき、この秒数で次の刻へ */
  autoSeconds = 120;
  auto = true;
  private autoLeft = 120;

  constructor(root: HTMLElement, private readonly d: PalaceHudDeps) {
    this.q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    root.innerHTML = `
      <div class="ph-top"><div class="ph-where"><b class="ph-area"></b><span class="ph-slot"></span><span class="ph-date"></span></div>
        <div class="ph-time"><button type="button" data-t="1">時を進める</button><button type="button" data-t="day">一日を終える</button><button type="button" data-t="10">十日を過ごす</button><button type="button" data-t="30">一月を過ごす</button>
        <label class="ph-auto"><input type="checkbox" checked /> 時の流れ(<span class="ph-auto-left"></span>)</label></div></div>
      <div class="ph-side"><button type="button" data-s="reports">上奏<i class="ph-badge" hidden></i></button><button type="button" data-s="ministers">重臣</button><button type="button" data-s="roster">後宮の人々</button>
        <button type="button" data-s="children">子女</button><button type="button" data-s="banquet">宴を開く</button><button type="button" class="ph-quality">画質</button><button type="button" class="menu-open ph-menu">メニュー</button><button type="button" data-s="exit" class="ph-exit">政務に戻る</button></div>
      <button type="button" class="ph-near" hidden></button>
      <p class="ph-hint">PC:WASD・矢印で歩く/Fで話しかける/クリックした所へ歩く/ドラッグで視点/ホイールで拡大。iPhone:左下のスティックで歩く/タップした所へ歩く/ドラッグで視点/2本指で拡大。人物をタップすると話しかけます</p>
      <section class="ph-panel" hidden></section>
      <section class="ph-sheet" hidden></section>`;
    root.querySelectorAll<HTMLButtonElement>(".ph-time button").forEach((b) => b.addEventListener("click", () => this.time(b.dataset.t!)));
    root.querySelectorAll<HTMLButtonElement>(".ph-side button[data-s]").forEach((b) => b.addEventListener("click", () => this.sheet(b.dataset.s!)));
    this.q<HTMLInputElement>(".ph-auto input").addEventListener("change", (e) => (this.auto = (e.target as HTMLInputElement).checked));
    this.q(".ph-near").addEventListener("click", () => this.nearId && this.openNpc(this.nearId));
    this.q(".ph-side .menu-open").addEventListener("click", () => this.d.openMenu());
    const qb = this.q(".ph-quality");
    const ql = { low: "低", mid: "中", high: "高" } as const;
    qb.textContent = `画質:${ql[this.d.quality()]}`;
    qb.addEventListener("click", () => {
      const order = ["low", "mid", "high"] as const;
      const next = order[(order.indexOf(this.d.quality()) + 1) % 3];
      this.d.setQuality(next);
    });
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  // ===================== 時刻 =====================

  private time(t: string): void {
    const P = this.d.palace;
    if (t === "day") this.d.advance(4 - P.slot);
    else if (t === "1") this.d.advance(1);
    else this.d.advance(Number(t) * 4 - P.slot);
    this.autoLeft = this.autoSeconds;
    this.refresh();
    if (this.selected) this.openNpc(this.selected);
  }

  /** 毎フレーム(時の流れ・表示の更新) */
  tick(dt: number): void {
    if (this.auto && this.q(".ph-sheet").hidden && this.q(".ph-panel").hidden) {
      this.autoLeft -= dt;
      if (this.autoLeft <= 0) {
        this.autoLeft = this.autoSeconds;
        this.d.advance(1);
        this.refresh();
      }
    }
    this.q(".ph-auto-left").textContent = this.auto ? `次の刻まで${Math.ceil(this.autoLeft)}秒` : "止めている";
  }

  refresh(): void {
    const P = this.d.palace;
    this.q(".ph-slot").textContent = `${SLOT_LABEL[P.slot]}`;
    this.q(".ph-date").textContent = this.d.campaign.dateText();
    const n = P.reports.length - this.seenReports;
    const badge = this.q(".ph-badge");
    badge.hidden = n <= 0;
    badge.textContent = String(Math.min(99, n));
  }

  setArea(label: string): void {
    this.q(".ph-area").textContent = label;
  }

  setNear(id: string | null): void {
    this.nearId = id;
    const b = this.q(".ph-near");
    const n = id ? this.d.palace.npc(id) : undefined;
    b.hidden = !n;
    if (n) b.textContent = `${n.name}(${n.title})に話しかける`;
  }

  // ===================== 人物との交流 =====================

  openNpc(id: string): void {
    const P = this.d.palace;
    const n = P.npc(id);
    if (!n) return;
    this.selected = id;
    this.q(".ph-sheet").hidden = true;
    const box = this.q(".ph-panel");
    box.replaceChildren();
    box.hidden = false;
    const head = this.el("div", "ph-head");
    const img = this.el("img", "ph-face");
    img.alt = "";
    const p = n.personId ? persons.find((x) => x.id === n.personId) : undefined;
    // 肖像の絵があれば、それを。なければ衣の色と髪の形から作った似顔(写実ではない)
    if (!p || !fillPortrait(img, p)) img.src = ladyPortrait(n);
    const where = P.whereAt(n);
    head.append(img, this.el("div", "ph-name", `${n.name}`), this.el("span", "ph-title", `${RANK_NAME[n.rank]}・${n.title}`), this.el("span", "ph-doing", `${AREA_LABEL[where.area]}で${where.doing.split("・").pop()}`));
    const close = this.el("button", "ph-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "閉じる");
    close.addEventListener("click", () => this.closeNpc());
    head.append(close);
    box.append(head);
    // 数値
    const meters = this.el("div", "ph-meters");
    for (const [k, v] of [["親密度", n.intimacy], ["信頼", n.trust], ["恋愛感情", n.romance], ["皇帝への評価", n.regard], ["嫉妬", n.jealousy]] as [string, number][]) {
      const m = this.el("div", "ph-meter");
      const bar = this.el("span");
      const fill = this.el("b");
      fill.style.width = `${Math.round(v)}%`;
      bar.append(fill);
      m.append(this.el("em", "", k), bar, this.el("i", "", String(Math.round(v))));
      meters.append(m);
    }
    box.append(meters);
    const card = this.el("dl", "ph-card");
    for (const [k, v] of Object.entries(P.card(n))) card.append(this.el("dt", "", k), this.el("dd", "", v));
    box.append(card);
    // 個別の物語(Version 53)
    const st = P.storyStatus(n);
    if (st.arc) {
      const sb = this.el("div", "ph-story");
      sb.append(this.el("b", "", `物語「${st.title}」 ${Math.min(5, st.stage)}/5`));
      if (st.ending) sb.append(this.el("span", "ph-note", `結末:${ENDING_LABEL[st.ending] ?? st.ending}`));
      else if (st.ready) {
        const go = this.el("button", "ph-story-go", `第${st.stage + 1}段階へ進む`);
        go.type = "button";
        go.addEventListener("click", () => this.storyScene(n));
        sb.append(go);
      } else sb.append(this.el("span", "ph-note", `次へ:${st.hint}`));
      box.append(sb);
    }
    // 約束
    const ps = P.openPromises(n);
    if (ps.length) {
      const pb = this.el("div", "ph-promises");
      for (const pr of ps) {
        const row = this.el("div", "ph-promise");
        row.append(this.el("span", "", `約束:${pr.text}(${pr.status === "doing" ? "手を打った・結果待ち" : `期限まで${Math.max(0, pr.due - Math.floor(this.d.campaign.day))}日`})`));
        const how = PalaceSystem.FULFILL[pr.kind];
        if (pr.status === "open" && how) {
          const b = this.el("button", "", how.label);
          b.type = "button";
          b.dataset.promise = pr.id;
          b.addEventListener("click", () => { const r = P.fulfill(pr.id); this.openNpc(id); this.say([], r); });
          row.append(b);
        } else if (pr.status === "open") row.append(this.el("span", "ph-note", "(相手を実際に訪ねて話すと果たされます)"));
        pb.append(row);
      }
      box.append(pb);
    }
    const talk = this.el("div", "ph-talk");
    box.append(talk);
    const acts = this.el("div", "ph-actions");
    box.append(acts);
    const say = (lines: string[], effect?: string): void => {
      talk.replaceChildren(...lines.map((l) => this.el("p", "", `「${l}」`)), ...(effect ? [this.el("p", "ph-effect", effect)] : []));
    };
    const redo = (): void => this.openNpc(id);
    const actions: Action[] = ["talk", "gift", "garden", "meal", "arts", "consult", "confess", "consort", "empress"];
    for (const a of actions) {
      const why = P.canDo(n, a);
      // 恋愛の選択肢は、恋愛の相手になれない人には出さない(近親・皇族・他人の妻・未成年)
      if ((a === "confess" || a === "consort" || a === "empress") && P.romanceBlock(n)) continue;
      if (a === "empress" && n.rank !== "consort") continue;
      if (a === "consort" && n.bond === "spouse") continue;
      if (a === "confess" && n.bond !== "none") continue;
      const b = this.el("button", "", ACTION_LABEL[a]);
      b.type = "button";
      b.dataset.a = a;
      if (why) {
        b.disabled = true;
        b.title = why;
      }
      b.addEventListener("click", () => {
        if (a === "talk") {
          const r = P.talk(n);
          redo();
          this.say(r.lines, r.effect);
        } else if (a === "gift") this.giftMenu(n, acts, (l, e) => { redo(); this.say([l], e); });
        else if (a === "garden" || a === "meal") {
          const r = P.invite(n, a);
          redo();
          this.say([r.line], r.effect);
        } else if (a === "arts") {
          const r = P.arts(n);
          redo();
          this.say([r.line], r.effect);
        } else if (a === "consult") this.consultMenu(n, acts, (l, e) => { redo(); this.say([l], e); });
        else {
          const r = P.propose(n, a);
          redo();
          if (typeof r === "string") this.say([], r);
          else this.say([r.line], r.effect);
        }
      });
      acts.append(b);
    }
    const why = acts.querySelector<HTMLButtonElement>("button:disabled");
    if (why) acts.append(this.el("p", "ph-why", "灰色の項目は、押せない理由を、指を置く(マウスを重ねる)と示します"));
    if (n.concern) say([n.concern.text], "相談したいことがあるようです");
    this.say = say;
  }

  private say: (lines: string[], effect?: string) => void = () => {};

  /** 物語の場面:文と選択肢。選ぶと段階が進み、反応と結果が出る */
  storyScene(n: PalaceNpc): void {
    const P = this.d.palace;
    const sc = P.storyScene(n);
    const box = this.q(".ph-panel");
    if (!sc) return;
    const wrap = this.el("div", "ph-scene");
    wrap.append(this.el("h4", "", `${sc.title}`));
    const face = this.el("img", "ph-face ph-scene-face");
    face.alt = "";
    face.src = ladyPortrait(n, sc.lines[sc.lines.length - 1]?.e ?? "normal");
    wrap.append(face);
    for (const l of sc.lines) {
      const pp = this.el("p", "", l.t);
      if (l.e) pp.dataset.expr = l.e;
      wrap.append(pp);
    }
    const x = P.storyCtx(n);
    const acts = this.el("div", "ph-actions");
    for (const ch of sc.choices) {
      const b = this.el("button", "", ch.label);
      b.type = "button";
      b.dataset.choice = ch.id;
      const why = ch.need?.(x);
      if (why) { b.disabled = true; b.title = why; }
      b.addEventListener("click", () => {
        const r = P.storyChoose(n, ch.id);
        this.openNpc(n.id);
        if (typeof r === "string") this.say([], r);
        else {
          this.say([r.text.replace(/^「|」$/g, "")], r.ending ? `物語の結末:${ENDING_LABEL[r.ending] ?? r.ending}` : "物語が進んだ");
          const img = this.q<HTMLImageElement>(".ph-panel .ph-face");
          if (img && (!n.personId || n.fictional)) img.src = ladyPortrait(n, r.expr);
          img.dataset.expr = r.expr;
        }
      });
      acts.append(b);
    }
    wrap.append(acts);
    box.replaceChildren(wrap);
  }

  private giftMenu(n: PalaceNpc, box: HTMLElement, done: (line: string, effect: string) => void): void {
    box.replaceChildren(this.el("p", "ph-sub", "贈り物を選んでください(国庫の金を使います)"));
    for (const g of Object.keys(GIFT_LABEL) as Gift[]) {
      const b = this.el("button", "", `${GIFT_LABEL[g]}(金${GIFT_COST[g]})`);
      b.type = "button";
      b.dataset.g = g;
      b.addEventListener("click", () => {
        const r = this.d.palace.gift(n, g);
        if (typeof r === "string") done("", r);
        else done(r.line, r.effect);
      });
      box.append(b);
    }
  }

  private consultMenu(n: PalaceNpc, box: HTMLElement, done: (line: string, effect: string) => void): void {
    box.replaceChildren(this.el("p", "ph-sub", n.concern?.text ?? ""));
    for (const o of this.d.palace.consultOptions(n)) {
      const b = this.el("button", "", o.label);
      b.type = "button";
      b.dataset.o = o.id;
      b.addEventListener("click", () => {
        const r = this.d.palace.consult(n, o.id);
        if (typeof r === "string") done("", r);
        else done(r.line, r.effect);
      });
      box.append(b);
    }
  }

  closeNpc(): void {
    this.selected = null;
    this.q(".ph-panel").hidden = true;
  }

  // ===================== 一覧の画面 =====================

  sheet(kind: string): void {
    if (kind === "exit") return this.d.exit();
    const P = this.d.palace;
    const box = this.q(".ph-sheet");
    this.q(".ph-panel").hidden = true;
    box.replaceChildren();
    box.hidden = false;
    box.dataset.kind = kind;
    const head = this.el("div", "ph-sheet-head");
    const close = this.el("button", "ph-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "閉じる");
    close.addEventListener("click", () => (box.hidden = true));
    const body = this.el("div", "ph-sheet-body");
    box.append(head, body);
    if (kind === "reports") {
      head.append(this.el("h3", "", "上奏(重臣からの報告。自国に関わる重要なことだけ)"), close);
      this.seenReports = P.reports.length;
      this.refresh();
      const list = [...P.reports].reverse().slice(0, 60);
      if (!list.length) body.append(this.el("p", "", "いまのところ、報告はありません"));
      for (const r of list) body.append(this.el("p", "ph-report", `【${REPORT_KIND[r.kind] ?? ""}】${r.date} ${r.text}`));
      const go = this.el("button", "ph-go", "政務に介入する(戦略マップへ戻る)");
      go.type = "button";
      go.addEventListener("click", () => this.d.exit());
      body.append(go);
    } else if (kind === "ministers") {
      head.append(this.el("h3", "", "重臣(政治・軍事・外交・財政を任せています)"), close);
      for (const m of P.ministers()) {
        const row = this.el("div", "ph-row");
        const img = this.el("img", "ph-face-s");
        img.alt = "";
        fillPortrait(img, m.person);
        row.append(img, this.el("b", "", `${m.role}:${m.person?.name ?? "(なし)"}`), this.el("span", "", m.summary));
        body.append(row);
      }
      body.append(this.el("p", "ph-note", "重臣は、ほかの国と同じ考え方(戦略AI)で、出兵・防衛・外交・内政・財政を決めます。介入したいときは「政務に戻る」で戦略マップへ戻ってください"));
    } else if (kind === "roster") {
      head.append(this.el("h3", "", `後宮の人々(${P.present().length}人)`), close);
      const groups = P.factions();
      if (groups.length) body.append(this.el("p", "ph-note", `派閥:${groups.map((g) => `${g.leader.name}派(${[g.leader, ...g.members].length}人${g.sons.length ? `・子 ${g.sons.join("・")}` : ""})`).join(" / ")}`));
      for (const n of P.present()) {
        const row = this.el("button", "ph-row");
        row.type = "button";
        const img = this.el("img", "ph-face-s");
        img.alt = "";
        const p = n.personId ? persons.find((x) => x.id === n.personId) : undefined;
        if (!p || !fillPortrait(img, p)) img.src = ladyPortrait(n);
        const w = P.whereAt(n);
        row.append(img, this.el("b", "", n.name), this.el("span", "", `${RANK_NAME[n.rank]}・${P.ageOf(n)}歳・${AREA_LABEL[w.area]}・親密${Math.round(n.intimacy)} 信頼${Math.round(n.trust)} 恋愛${Math.round(n.romance)}${n.bond === "lover" ? "・想い人" : n.bond === "spouse" ? "・妃" : ""}`));
        row.addEventListener("click", () => {
          box.hidden = true;
          this.d.walkToNpc(n.id);
        });
        body.append(row);
      }
    } else if (kind === "children") {
      head.append(this.el("h3", "", "皇子・皇女(養育。恋愛・交流の相手ではありません)"), close);
      const kids = P.children();
      if (!kids.length) body.append(this.el("p", "", "子女はまだいません"));
      for (const k of kids) {
        const row = this.el("div", "ph-row");
        row.append(this.el("b", "", `${k.p.name}${k.heir ? "(後継者)" : ""}`), this.el("span", "", `${k.p.gender === "female" ? "皇女" : "皇子"}・${k.age ?? "?"}歳・母 ${k.mother ?? "不明"}${k.minor ? "" : "・成人"}`));
        if (k.minor && (k.age ?? 0) >= 6) {
          const sel = this.el("select");
          sel.setAttribute("aria-label", `${k.p.name}の教育の方針`);
          for (const [v, l] of Object.entries(EDU_LABEL)) {
            const o = document.createElement("option");
            o.value = v;
            o.textContent = `教育:${l}`;
            sel.append(o);
          }
          sel.value = k.edu ?? "balanced";
          sel.addEventListener("change", () => this.d.campaign.court.setEducation(k.p.id, sel.value as EduPolicy));
          row.append(sel);
        } else if (k.minor) row.append(this.el("span", "ph-note", "幼いので、乳母と母のもとで育っています"));
        body.append(row);
      }
    } else if (kind === "banquet") {
      head.append(this.el("h3", "", `宴を開く(金200・夕か夜)${P.festivalToday() ? `:今日は${P.festivalToday()}` : ""}`), close);
      const picked = new Set<string>();
      for (const n of P.present()) {
        const lab = this.el("label", "ph-row");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = n.id;
        cb.addEventListener("change", () => (cb.checked ? picked.add(n.id) : picked.delete(n.id)));
        lab.append(cb, this.el("b", "", n.name), this.el("span", "", `${RANK_NAME[n.rank]}・${n.title}`));
        body.append(lab);
      }
      const out = this.el("p", "ph-effect");
      const go = this.el("button", "ph-go", "宴を開く");
      go.type = "button";
      go.addEventListener("click", () => {
        const r = P.banquet([...picked].map((id) => P.npc(id)!).filter(Boolean));
        out.textContent = typeof r === "string" ? r : `${r.text}。${r.effects.join("。")}`;
      });
      body.append(go, out);
    }
  }
}
