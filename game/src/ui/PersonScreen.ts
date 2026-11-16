import { factionById, persons, scenario } from "../data";
import { fillPortrait } from "./portrait";
import type { Person, PersonRole, PersonStatus } from "../data/types";
import type { Campaign } from "../sim/Campaign";
import { affinity, loyaltyBand } from "../sim/loyalty";
import { LOCATION_LABEL } from "../sim/placement";

const ROLE_LABEL: Record<PersonRole, string> = { ruler: "君主", general: "武将", strategist: "軍師", minister: "文官" };
const STATUS_LABEL: Record<PersonStatus, string> = { active: "健在", wounded: "負傷", captured: "捕虜", dead: "死亡", protected: "保護" };
const STATS: [keyof Person, string][] = [
  ["leadership", "統率"],
  ["war", "武力"],
  ["intelligence", "知力"],
  ["politics", "政治"],
  ["charisma", "魅力"],
];

export interface PersonScreenActions {
  campaign: () => Campaign;
  /** 操作している勢力(null なら、すべての勢力を操作できる) */
  playerFactionId: () => string | null;
  /** 任命のあと、地図の表示を合わせる */
  onAppointed: () => void;
  /** 家系図(皇室の画面)を開く */
  openFamily?: (personId: string) => void;
  /** 所在地(都市か軍団)を地図で選ぶ */
  focusPlace?: (where: { cityId?: string; armyId?: string }) => void;
}

/** 人物の一覧と詳細。任命(太守・守将・軍団の指揮官)もここから行う */
export class PersonScreen {
  private readonly q: <T extends HTMLElement = HTMLElement>(sel: string) => T;
  private selectedId: string | null = null;

  constructor(private readonly root: HTMLElement, private readonly actions: PersonScreenActions) {
    this.q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.q(".persons-close").addEventListener("click", () => this.close());
    const faction = this.q<HTMLSelectElement>(".persons-faction");
    faction.replaceChildren(new Option("すべての勢力", ""), ...scenario.factions.map((f) => new Option(f.name, f.id)));
    for (const sel of [".persons-faction", ".persons-role", ".persons-sort", ".persons-place"]) {
      this.q(sel).addEventListener("change", () => this.renderList());
    }
    this.q(".person-appoint").addEventListener("click", () => this.appoint());
    this.q(".person-office-set").addEventListener("click", () => {
      if (!this.selectedId) return;
      const v = this.q<HTMLSelectElement>(".person-office").value;
      const err = this.actions.campaign().economy.setOffice(this.selectedId, v === "none" ? null : v);
      this.renderList();
      this.q(".person-message").textContent = err ?? "官職を改めました";
    });
    this.q(".person-reward").addEventListener("click", () => {
      if (!this.selectedId) return;
      const err = this.actions.campaign().loyalty.reward(this.selectedId, 100);
      this.actions.onAppointed();
      this.renderList();
      this.q(".person-message").textContent = err ?? "褒賞を与えました";
    });
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  open(personId?: string, cityId?: string): void {
    const sel = this.q<HTMLSelectElement>(".persons-faction");
    const keep = sel.value;
    sel.replaceChildren(new Option("すべての勢力", ""), ...scenario.factions.map((f) => new Option(f.name + (f.fallen ? "(滅亡)" : ""), f.id)));
    sel.value = keep;
    const player = this.actions.playerFactionId();
    if (player) this.q<HTMLSelectElement>(".persons-faction").value = player;
    // 所在の絞り込み:都市ごと(都市の情報から開いたときは、その都市)
    const place = this.q<HTMLSelectElement>(".persons-place");
    const camp = this.actions.campaign();
    place.replaceChildren(new Option("すべての所在", ""), new Option("出陣中・軍団", "@army"), ...camp.cities.filter((c) => scenario.cityOwners[c.id]).map((c) => new Option(c.name, c.id)));
    place.value = cityId ?? "";
    if (cityId) {
      this.q<HTMLSelectElement>(".persons-faction").value = "";
      this.selectedId = null;
    }
    this.root.hidden = false;
    this.selectedId = personId ?? this.selectedId;
    this.renderList();
  }

  close(): void {
    this.root.hidden = true;
  }

  private filtered(): Person[] {
    const faction = this.q<HTMLSelectElement>(".persons-faction").value;
    const role = this.q<HTMLSelectElement>(".persons-role").value;
    const sort = this.q<HTMLSelectElement>(".persons-sort").value as keyof Person | "";
    const place = this.root.querySelector<HTMLSelectElement>(".persons-place")?.value ?? "";
    const pl = this.actions.campaign().placement;
    const list = persons.filter((p) => (!faction || p.factionId === faction) && (!role || (role === "female" ? p.gender === "female" : p.role === role)))
      .filter((p) => {
        if (!place) return true;
        const l = pl.locationOf(p.id);
        if (place === "@army") return l.kind === "army" || l.kind === "moving";
        return (l.kind === "city" || l.kind === "pass" || l.kind === "court") && l.cityId === place;
      });
    if (sort) list.sort((a, b) => (b[sort] as number) - (a[sort] as number));
    return list;
  }

  private renderList(): void {
    const campaign = this.actions.campaign();
    const list = this.filtered();
    if (!list.some((p) => p.id === this.selectedId)) this.selectedId = list[0]?.id ?? null;
    this.q(".persons-count").textContent = `${list.length}人`;
    const box = this.q(".persons-list");
    box.replaceChildren(
      ...list.map((p) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "person-row";
        row.dataset.id = p.id;
        row.setAttribute("aria-pressed", String(p.id === this.selectedId));
        const img = document.createElement("img");
        fillPortrait(img, p);
        img.alt = "";
        const name = document.createElement("span");
        name.className = "person-row-name";
        name.textContent = p.name;
        const sub = document.createElement("span");
        sub.className = "person-row-sub";
        const status = campaign.personStatus(p.id);
        const age = campaign.court.age(p);
        const where = campaign.placement.locationOf(p.id);
        sub.textContent = `${factionById(p.factionId)?.name ?? ""}・${ROLE_LABEL[p.role]}${age !== null ? `・${age}歳` : ""}${status === "active" ? "" : `・${STATUS_LABEL[status]}`}・${where.label}`;
        const stats = document.createElement("span");
        stats.className = "person-row-stats";
        stats.textContent = STATS.map(([key, label]) => `${label[0]}${p[key]}`).join(" ");
        // 忠誠の低い人には、印を付ける
        const loy = campaign.loyalty.loyalty[p.id];
        if (p.role !== "ruler" && loy !== undefined && loy < 50) {
          row.dataset.risk = loy < 30 ? "high" : "mid";
          name.textContent = `${p.name} ${loy < 30 ? "⚠離反の危険大" : "⚠不満"}`;
        }
        row.append(img, name, sub, stats);
        row.addEventListener("click", () => {
          this.selectedId = p.id;
          for (const r of box.querySelectorAll(".person-row")) r.setAttribute("aria-pressed", String((r as HTMLElement).dataset.id === p.id));
          this.renderDetail();
        });
        return row;
      }),
    );
    this.renderDetail();
  }

  private renderDetail(): void {
    const campaign = this.actions.campaign();
    const p = persons.find((x) => x.id === this.selectedId);
    const detail = this.q(".person-detail");
    detail.hidden = !p;
    if (!p) return;
    const faction = factionById(p.factionId);
    const real = fillPortrait(this.q<HTMLImageElement>(".person-portrait"), p);
    this.q(".person-portrait-note").textContent = real ? "創作肖像(同時代の肖像は残っていない)" : "肖像は未登録(仮のシルエット)";
    this.q(".person-name").textContent = p.name;
    this.q(".person-reading").textContent = p.reading;
    const year = campaign.calendar().year;
    const years = `${p.born ?? "?"}〜${p.died ?? "?"}年${p.datesUncertain ? "(異説あり)" : ""}`;
    const age = p.born ? `・${year - p.born}歳ごろ` : "・年齢不明";
    this.q(".person-years").textContent = years + age;
    const status = campaign.personStatus(p.id);
    const post = campaign.postOf(p.id);
    this.q(".person-line").textContent = `${faction?.name ?? "所属なし"}・${ROLE_LABEL[p.role]}・${p.title || "官職不明"}${p.people ? `・${p.people}${p.peopleNote ? "(注)" : ""}` : ""}`;
    // 婚姻(人物IDで記録):史実の婚姻と、ゲームの中で結んだ婚姻を分けて示す
    const spouses = campaign.diplo.marriages.filter((m) => m.husband === p.id || m.wife === p.id).map((m) => {
      const other = persons.find((x) => x.id === (m.husband === p.id ? m.wife : m.husband));
      return `${other?.name ?? "?"}(${m.historic ? "史実" : "ゲーム内"}${m.husband === p.id ? `・${m.kind === "primary" ? "正室" : "側室"}` : ""})`;
    });
    this.q(".person-post").textContent = `状態:${STATUS_LABEL[status]} / 役目:${post ? post.label : "なし"}${spouses.length ? ` / 配偶者:${spouses.join("、")}` : ""}`;
    // 所在:都市・関所・宮廷・軍団・移動中・捕虜など。史実の確かさと出典も示す
    const loc = campaign.placement.locationOf(p.id);
    let where = this.root.querySelector<HTMLElement>(".person-where");
    if (!where) {
      where = document.createElement("div");
      where.className = "person-where";
      this.q(".person-post").after(where);
    }
    const wt = document.createElement("span");
    wt.textContent = `所在:${loc.label}(${LOCATION_LABEL[loc.kind]})/確かさ:${loc.certainty}${loc.source ? `/出典:${loc.source}` : ""}${loc.note ? `/${loc.note}` : ""}`;
    const go = document.createElement("button");
    go.type = "button";
    go.className = "person-where-go";
    go.textContent = "所在地へ";
    go.hidden = !loc.cityId && !loc.armyId;
    go.addEventListener("click", () => {
      this.close();
      this.actions.focusPlace?.({ cityId: loc.cityId, armyId: loc.armyId });
    });
    where.replaceChildren(wt, go);
    // 家系:父・母・兄弟・子女(人物IDでつながる。史料にない親子は出さない)と、家系図の釦
    const ct = campaign.court;
    const names = (xs: { name: string; fictional?: boolean }[]): string => xs.map((x) => x.name + (x.fictional ? "*" : "")).join("、") || "記録なし";
    const pa = [ct.fatherOf(p.id), ct.motherOf(p.id)].map((id) => persons.find((x) => x.id === id)).filter((x): x is Person => !!x);
    let fam = this.root.querySelector<HTMLElement>(".person-family");
    if (!fam) {
      fam = document.createElement("div");
      fam.className = "person-family";
      this.q(".person-post").after(fam);
    }
    const txt = document.createElement("span");
    const title = ct.royalTitle(p);
    const cause = ct.causeOf(p.id);
    const sure = p.fictional ? "架空の人物" : p.certainty ?? (p.datesUncertain || p.note ? "推定を含む" : "史実確認済み");
    txt.textContent = `${title ? `身分:${title} / ` : ""}${ct.stageOf(p)} / 父母:${names(pa)} / 兄弟:${names(ct.siblingsOf(p.id))} / 子女:${names(ct.childrenOf(p.id))} / 確かさ:${sure}${cause ? ` / 死因:${{ illness: "病死", old_age: "老衰", battle: "戦死", execution: "処刑", assassination: "暗殺", suicide: "自害", unknown: "不明" }[cause.cause]}` : ""}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "person-family-open";
    btn.textContent = "家系図";
    btn.addEventListener("click", () => this.actions.openFamily?.(p.id));
    fam.replaceChildren(txt, btn);
    this.q(".person-stats").replaceChildren(
      ...STATS.map(([key, label]) => {
        const row = document.createElement("div");
        const value = p[key] as number;
        row.innerHTML = `<span>${label}</span><i><b style="width:${value}%"></b></i><em>${value}</em>`;
        return row;
      }),
    );
    this.q(".person-traits").textContent = [...p.traits, p.favoredUnit ? `得意:${{ infantry: "歩兵", cavalry: "騎兵", archer: "弓兵" }[p.favoredUnit]}` : ""].filter(Boolean).join("・");
    // 忠誠・名声・君主との相性・離反の危険と、その理由
    const L = campaign.loyalty;
    const ruler = L.ruler(p.factionId);
    const loy = Math.round(L.loyalty[p.id] ?? 0);
    const band = loyaltyBand(loy);
    const aff = ruler && ruler.id !== p.id ? affinity(p, ruler) : null;
    const lo = this.q(".person-loyalty");
    lo.textContent = p.role === "ruler"
      ? `君主・名声${Math.round(L.fame[p.id] ?? 0)}・威信${L.prestige(p.factionId)}`
      : `忠誠${loy}(${band.label})・名声${Math.round(L.fame[p.id] ?? 0)}・君主との相性${aff?.value ?? "—"}・離反の危険:${band.risk}`;
    lo.dataset.risk = p.role === "ruler" ? "" : loy < 30 ? "high" : loy < 50 ? "mid" : "";
    const why = this.q(".person-loyalty-why");
    if (p.role === "ruler") why.textContent = "";
    else {
      const t = L.target(p);
      const recent = (L.log[p.id] ?? []).slice(-3).reverse().map((x) => `${x.text}${x.delta ? (x.delta > 0 ? `+${x.delta}` : x.delta) : ""}`);
      why.textContent = `忠誠の目安${Math.round(t.value)}:${t.parts.join("・")}${aff ? `(相性:${aff.note})` : ""}${recent.length ? ` / 最近の変動:${recent.join("・")}` : ""}`;
    }
    const items = campaign.spoils.equippedBy(p.id).map((t) => t.name);
    const office = campaign.economy.officeOf(p.id);
    const extra = [
      p.gender === "female" ? "女性" : "",
      office ? `官職:${office.name}(俸禄${office.salary})` : p.role !== "ruler" ? "官職なし" : "",
      p.diplomacy !== undefined ? `外交${p.diplomacy}` : "",
      p.culture !== undefined ? `文化${p.culture}` : "",
      p.residence ? `滞在:${campaign.cities.find((c) => c.id === p.residence)?.name ?? ""}` : "",
      items.length ? `装備:${items.join("・")}` : "",
    ].filter(Boolean).join("・");
    this.q(".person-bio").textContent = (extra ? `【${extra}】` : "") + p.bio;
    const uncertain = this.q(".person-uncertain");
    uncertain.textContent = p.note ? `注記:${p.note}` : "";
    uncertain.hidden = !p.note;

    // 任命:操作している勢力の、健在の人物だけ
    const player = this.actions.playerFactionId();
    const can = status === "active" && (!player || player === p.factionId);
    const select = this.q<HTMLSelectElement>(".person-target");
    const options: HTMLOptionElement[] = [new Option("任命先を選ぶ", "")];
    if (can) {
      for (const s of campaign.armies) {
        if (s.army.factionId === p.factionId) options.push(new Option(`指揮官:${s.army.name}`, `army:${s.army.id}`), new Option(`副将:${s.army.name}`, `deputy:${s.army.id}`));
      }
      for (const c of campaign.cities) {
        if (scenario.cityOwners[c.id] === p.factionId) options.push(new Option(`${c.kind === "pass" ? "守将" : "太守"}:${c.name}`, `city:${c.id}`));
      }
      if (post) options.push(new Option("いまの役目を解く", "none"));
    }
    select.replaceChildren(...options);
    this.q(".person-appoint-box").hidden = !can;
    this.q(".person-reward").hidden = p.role === "ruler";
    // 官職:この勢力の官制から選ぶ(定員と条件は、授けるときに調べる)
    const eco = campaign.economy;
    const sys = eco.systemOf(p.factionId);
    const cur = eco.officeOf(p.id);
    const sel = this.q<HTMLSelectElement>(".person-office");
    sel.replaceChildren(new Option(cur ? `いまの官職:${cur.name}` : "官職なし", ""), ...sys.offices.map((o) => {
      const held = persons.filter((x) => x.factionId === p.factionId && eco.offices[x.id] === o.id).length;
      return new Option(`${o.name}(${o.rank}等・俸禄${o.salary}・${held}/${o.quota}人)`, o.id);
    }), new Option("官職を解く", "none"));
    sel.hidden = this.q(".person-office-set").hidden = p.role === "ruler" || !can;
    this.q(".person-message").textContent = can ? "" : status !== "active" ? "この人物は、いま任命できません" : "ほかの勢力の人物は任命できません";
  }

  private appoint(): void {
    const value = this.q<HTMLSelectElement>(".person-target").value;
    if (!value || !this.selectedId) return;
    const [kind, id] = value.split(":");
    const error = this.actions.campaign().appoint(this.selectedId, value === "none" ? null : { kind: kind as "city" | "army" | "deputy", id });
    this.actions.onAppointed();
    this.renderList();
    this.q(".person-message").textContent = error ?? "任命しました";
  }
}
