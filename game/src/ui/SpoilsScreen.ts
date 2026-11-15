// 名品・戦利品の画面と、都市を落としたときの処置の画面
import { cityLevelOf, factionById, personById, persons } from "../data";
import type { Campaign } from "../sim/Campaign";
import { CATEGORY_LABEL, effectText, RARITY_LABEL, type PendingCapture, type Treasure } from "../sim/spoils";
import { fillPortrait } from "./portrait";

export interface SpoilsActions {
  campaign: () => Campaign;
  playerFactionId: () => string | null;
  cityName: (id: string) => string;
  /** 処置のあと、地図と時間の表示を合わせる */
  onChanged: () => void;
}

/** 名品の絵の代わりの印(画像はまだ無い。種類を一字で表す仮の表示) */
const GLYPH: Record<string, string> = { jade: "玉", jewelry: "金", arms: "武", culture: "書", court: "宝", religion: "仏" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function button(label: string, onClick: () => void, cls = ""): HTMLButtonElement {
  const b = el("button", cls, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}
function seal(t: Treasure): HTMLElement {
  const s = el("span", `treasure-seal rarity-${t.rarity}`, GLYPH[t.category] ?? "宝");
  s.title = "名品の絵はまだありません(種類を表す仮の印)";
  return s;
}
function face(personId: string): HTMLImageElement {
  const img = el("img", "spoils-face");
  img.alt = "";
  fillPortrait(img, personById(personId));
  return img;
}

export class SpoilsScreen {
  private tab: "items" | "people" | "records" = "items";
  private filter = "mine";
  private selected: string | null = null;

  constructor(private readonly root: HTMLElement, private readonly capture: HTMLElement, private readonly actions: SpoilsActions) {
    (root.querySelector(".spoils-close") as HTMLElement).addEventListener("click", () => (this.root.hidden = true));
    for (const b of root.querySelectorAll<HTMLElement>(".spoils-tab")) {
      b.addEventListener("click", () => {
        this.tab = b.dataset.tab as typeof this.tab;
        this.render();
      });
    }
    (root.querySelector(".spoils-filter") as HTMLSelectElement).addEventListener("change", (e) => {
      this.filter = (e.target as HTMLSelectElement).value;
      this.render();
    });
  }

  open(tab?: typeof this.tab): void {
    if (tab) this.tab = tab;
    this.root.hidden = false;
    this.say("");
    this.render();
  }

  private say(text: string): void {
    (this.root.querySelector(".spoils-message") as HTMLElement).textContent = text;
  }

  private me(): string | null {
    return this.actions.playerFactionId();
  }

  private render(): void {
    for (const b of this.root.querySelectorAll<HTMLElement>(".spoils-tab")) b.setAttribute("aria-pressed", String(b.dataset.tab === this.tab));
    const filter = this.root.querySelector(".spoils-filter") as HTMLSelectElement;
    filter.hidden = this.tab !== "items";
    const body = this.root.querySelector(".spoils-body") as HTMLElement;
    if (this.tab === "items") this.renderItems(body);
    else if (this.tab === "people") this.renderPeople(body);
    else this.renderRecords(body);
  }

  // ===== 名品 =====
  private renderItems(body: HTMLElement): void {
    const sp = this.actions.campaign().spoils;
    const me = this.me();
    let list = sp.treasures;
    if (this.filter === "mine") list = list.filter((t) => !sp.state[t.id].cityId && (me ? sp.state[t.id].owner === me : true));
    else if (this.filter === "city") list = list.filter((t) => sp.state[t.id].cityId && (!me || sp.ownerOf(t.id) === me));
    list = [...list].sort((a, b) => b.rarity - a.rarity);
    if (!list.some((t) => t.id === this.selected)) this.selected = list[0]?.id ?? null;
    const rows = el("div", "spoils-list");
    if (list.length === 0) rows.append(el("p", "spoils-empty", this.filter === "mine" ? "収蔵している名品はまだありません。都市を落として接収すると、ここに加わります" : "該当する名品はありません"));
    for (const t of list) {
      const row = el("button", "spoils-row");
      row.type = "button";
      row.setAttribute("aria-pressed", String(t.id === this.selected));
      const owner = sp.ownerOf(t.id);
      const where = sp.state[t.id].cityId ? `${this.actions.cityName(sp.state[t.id].cityId!)}の蔵` : sp.state[t.id].holderId ? `${personById(sp.state[t.id].holderId!)?.name}が装備` : "収蔵";
      row.append(seal(t), el("strong", "", t.name), el("span", "spoils-sub", `${RARITY_LABEL[t.rarity - 1]}・${CATEGORY_LABEL[t.category]}・${factionById(owner ?? "")?.name ?? "持ち主なし"}・${where}`));
      row.addEventListener("click", () => {
        this.selected = t.id;
        this.render();
      });
      rows.append(row);
    }
    const detail = el("div", "spoils-detail");
    const t = list.find((x) => x.id === this.selected);
    if (t) {
      const s = sp.state[t.id];
      const owner = sp.ownerOf(t.id);
      const head = el("div", "spoils-detail-head");
      head.append(seal(t), el("h3", "", t.name));
      detail.append(
        head,
        el("p", "spoils-meta", `${RARITY_LABEL[t.rarity - 1]}・${CATEGORY_LABEL[t.category]}(${t.kind})・${t.historicity}`),
        el("p", "", t.description),
        el("p", "spoils-history", `歴史:${t.history}`),
        el("p", "spoils-effect", `効果:${effectText(t.effects)}${t.equip ? "(人物に装備できる)" : "(勢力の収蔵品として効く)"}`),
        el("p", "spoils-meta", `持ち主:${factionById(owner ?? "")?.name ?? "なし"}${s.acquired ? `/入手:${this.actions.cityName(s.acquired.cityId)}・${s.acquired.how}・ゲーム開始から${s.acquired.day}日目` : "/開始時から"}`),
        el("p", "spoils-note", "名品の絵はまだありません(種類を表す仮の印)。効果はゲーム上の設定です。"),
      );
      const can = !me || owner === me;
      if (can && s.cityId) detail.append(button("この名品を接収する", () => { sp.confiscate(t.id, Math.floor(this.actions.campaign().day)); this.say(`${t.name}を収蔵品に加えました`); this.actions.onChanged(); this.render(); }, "spoils-act"));
      if (can && !s.cityId && t.equip) {
        const sel = el("select", "spoils-equip");
        sel.append(new Option("装備させる人物を選ぶ", ""), new Option("装備を外す", "none"));
        for (const p of persons.filter((x) => x.factionId === owner && this.actions.campaign().personStatus(x.id) === "active")) sel.append(new Option(`${p.name}(${p.title || ""})`, p.id));
        const holder = s.holderId ? personById(s.holderId) : undefined;
        detail.append(el("p", "spoils-meta", `いま:${holder ? `${holder.name}が装備` : "だれも装備していない"}`), sel,
          button("決める", () => {
            if (!sel.value) return;
            const err = sp.equip(t.id, sel.value === "none" ? null : sel.value);
            this.say(err ?? (sel.value === "none" ? `${t.name}を外しました` : `${personById(sel.value)?.name}が${t.name}を装備しました`));
            this.actions.onChanged();
            this.render();
          }, "spoils-act"));
      }
    }
    const fx = me ? sp.factionEffects(me) : null;
    body.replaceChildren(
      ...(fx ? [el("p", "spoils-total", `${factionById(me!)?.name}の収蔵品の効果:収入+${fx.income}%・威信${fx.prestige}・外交+${fx.diplomacy}・士気+${fx.morale}・文化${fx.culture}`)] : []),
      el("div", "spoils-split", ""),
    );
    (body.lastElementChild as HTMLElement).append(rows, detail);
  }

  // ===== 捕虜・保護 =====
  private renderPeople(body: HTMLElement): void {
    const c = this.actions.campaign();
    const me = this.me();
    const list = c.spoils.custody.filter((x) => !me || x.holder === me);
    const box = el("div", "spoils-people");
    if (list.length === 0) box.append(el("p", "spoils-empty", "捕虜も、保護している人物もいません"));
    for (const x of list) {
      const p = personById(x.personId);
      if (!p) continue;
      const row = el("div", "spoils-person");
      const info = el("div", "spoils-person-info");
      info.append(el("strong", "", `${p.name}${p.gender === "female" ? "(女性)" : ""}`),
        el("span", "spoils-sub", `${x.kind === "captive" ? "捕虜" : "保護中"}・もと${factionById(x.from)?.name ?? ""}・${p.title || ""}・${x.cityId ? `${this.actions.cityName(x.cityId)}で` : "会戦で"}`),
        el("span", "spoils-sub", `統${p.leadership} 武${p.war} 知${p.intelligence} 政${p.politics} 魅${p.charisma}${p.diplomacy !== undefined ? ` 外${p.diplomacy}` : ""}${p.culture !== undefined ? ` 文${p.culture}` : ""}`));
      const acts = el("div", "spoils-acts");
      const act = (label: string, a: Parameters<Campaign["custodyAction"]>[1]): HTMLButtonElement => button(label, () => {
        this.say(c.custodyAction(x.personId, a));
        this.actions.onChanged();
        this.render();
      });
      if (!me || x.holder === me) {
        if (x.kind === "captive") acts.append(act("登用する", "recruit"), act("解放する", "release"), act("身代金を求める", "ransom"), act("和睦の交渉に使う", "negotiate"));
        else acts.append(act("保護を続ける", "keep"), act("登用する", "recruit"), act("宮廷に迎える", "court"), act("旧勢力へ帰す", "return"), act("解放する", "release"), act("和睦の交渉に使う", "negotiate"));
      }
      row.append(face(x.personId), info, acts);
      box.append(row);
    }
    body.replaceChildren(el("p", "spoils-note", "登用や宮廷に迎えることは、本人が応じたときだけ成り立ちます(王族や、元の勢力が残っている人は応じにくい)。応じなければ、日をあらためて持ちかけられます。"), box);
  }

  // ===== 記録 =====
  private renderRecords(body: HTMLElement): void {
    const c = this.actions.campaign();
    const list = [...c.spoils.records].reverse();
    const ul = el("ul", "spoils-records");
    if (list.length === 0) ul.append(el("li", "", "まだ都市を落とした記録はありません"));
    const names = (ids: string[]): string => ids.map((id) => personById(id)?.name ?? id).join("・");
    const items = (ids: string[]): string => ids.map((id) => c.spoils.treasure(id)?.name ?? id).join("・");
    for (const r of list) {
      ul.append(el("li", "", `${r.date} ${factionById(r.captor)?.name}が${this.actions.cityName(r.cityId)}を落とし、${r.choice === "loot" ? "略奪" : "保全"}。金${r.gold}・糧${r.grain}` +
        `${r.treasures.length ? `、名品:${items(r.treasures)}` : ""}${r.evacuated.length ? `、敵が運び出した:${items(r.evacuated)}` : ""}${r.captives.length ? `、捕虜:${names(r.captives)}` : ""}${r.protected.length ? `、保護:${names(r.protected)}` : ""}`));
    }
    body.replaceChildren(ul);
  }

  // ===== 陥落の処置 =====
  showCapture(pc: PendingCapture): void {
    const c = this.actions.campaign();
    const box = this.capture;
    const city = c.cities.find((x) => x.id === pc.cityId)!;
    (box.querySelector(".capture-title") as HTMLElement).textContent = `${city.name}を落としました`;
    (box.querySelector(".capture-meta") as HTMLElement).textContent =
      `もと${factionById(pc.from)?.name ?? ""}の${cityLevelOf(city) >= 3 ? "大きな都市" : "都市"}。攻城の損傷 ${Math.round(pc.damage * 100)}%。`;
    const people = box.querySelector(".capture-people") as HTMLElement;
    people.replaceChildren(...(pc.people.length ? pc.people.map((x) => {
      const p = personById(x.personId)!;
      const row = el("div", "capture-person");
      row.append(face(x.personId), el("span", "", `${p.name}・${p.title || ""}(${x.kind === "captive" ? "捕虜" : "保護"})`));
      return row;
    }) : [el("p", "spoils-empty", "城内に、名のある人物はいませんでした")]));
    const items = box.querySelector(".capture-items") as HTMLElement;
    items.replaceChildren(
      ...(pc.treasures.length ? pc.treasures.map((id) => { const t = c.spoils.treasure(id)!; const r = el("div", "capture-item"); r.append(seal(t), el("span", "", `${t.name}(${RARITY_LABEL[t.rarity - 1]})`)); return r; }) : [el("p", "spoils-empty", "蔵に名品は残っていませんでした")]),
      ...(pc.evacuated.length ? [el("p", "spoils-note", `敵が落城の前に運び出した名品:${pc.evacuated.map((id) => c.spoils.treasure(id)?.name).join("・")}`)] : []),
    );
    box.hidden = false;
  }

  bindCapture(onDone: (text: string) => void): void {
    const box = this.capture;
    const decide = (choice: "loot" | "preserve"): void => {
      const confiscate = (box.querySelector(".capture-confiscate") as HTMLInputElement).checked;
      const rec = this.actions.campaign().resolveCapture(choice, confiscate);
      box.hidden = true;
      this.actions.onChanged();
      if (rec) onDone(`${this.actions.cityName(rec.cityId)}を${choice === "loot" ? "略奪" : "保全"}しました。金${rec.gold}・糧${rec.grain}、名品${rec.treasures.length}点。捕虜・保護した人物は「名品」の画面の「捕虜・保護」で処置できます`);
    };
    (box.querySelector(".capture-loot") as HTMLElement).addEventListener("click", () => decide("loot"));
    (box.querySelector(".capture-preserve") as HTMLElement).addEventListener("click", () => decide("preserve"));
  }
}


