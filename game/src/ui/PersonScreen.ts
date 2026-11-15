import { factionById, persons, scenario } from "../data";
import { fillPortrait } from "./portrait";
import type { Person, PersonRole, PersonStatus } from "../data/types";
import type { Campaign } from "../sim/Campaign";

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
    for (const sel of [".persons-faction", ".persons-role", ".persons-sort"]) {
      this.q(sel).addEventListener("change", () => this.renderList());
    }
    this.q(".person-appoint").addEventListener("click", () => this.appoint());
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  open(personId?: string): void {
    const player = this.actions.playerFactionId();
    if (player) this.q<HTMLSelectElement>(".persons-faction").value = player;
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
    const list = persons.filter((p) => (!faction || p.factionId === faction) && (!role || (role === "female" ? p.gender === "female" : p.role === role)));
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
        sub.textContent = `${factionById(p.factionId)?.name ?? ""}・${ROLE_LABEL[p.role]}${status === "active" ? "" : `・${STATUS_LABEL[status]}`}`;
        const stats = document.createElement("span");
        stats.className = "person-row-stats";
        stats.textContent = STATS.map(([key, label]) => `${label[0]}${p[key]}`).join(" ");
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
    this.q(".person-post").textContent = `状態:${STATUS_LABEL[status]} / 役目:${post ? post.label : "なし"}`;
    this.q(".person-stats").replaceChildren(
      ...STATS.map(([key, label]) => {
        const row = document.createElement("div");
        const value = p[key] as number;
        row.innerHTML = `<span>${label}</span><i><b style="width:${value}%"></b></i><em>${value}</em>`;
        return row;
      }),
    );
    this.q(".person-traits").textContent = [...p.traits, p.favoredUnit ? `得意:${{ infantry: "歩兵", cavalry: "騎兵", archer: "弓兵" }[p.favoredUnit]}` : ""].filter(Boolean).join("・");
    const items = campaign.spoils.equippedBy(p.id).map((t) => t.name);
    const extra = [
      p.gender === "female" ? "女性" : "",
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
        if (s.army.factionId === p.factionId) options.push(new Option(`指揮官:${s.army.name}`, `army:${s.army.id}`));
      }
      for (const c of campaign.cities) {
        if (scenario.cityOwners[c.id] === p.factionId) options.push(new Option(`${c.kind === "pass" ? "守将" : "太守"}:${c.name}`, `city:${c.id}`));
      }
      if (post) options.push(new Option("いまの役目を解く", "none"));
    }
    select.replaceChildren(...options);
    this.q(".person-appoint-box").hidden = !can;
    this.q(".person-message").textContent = can ? "" : status !== "active" ? "この人物は、いま任命できません" : "ほかの勢力の人物は任命できません";
  }

  private appoint(): void {
    const value = this.q<HTMLSelectElement>(".person-target").value;
    if (!value || !this.selectedId) return;
    const [kind, id] = value.split(":");
    const error = this.actions.campaign().appoint(this.selectedId, value === "none" ? null : { kind: kind as "city" | "army", id });
    this.actions.onAppointed();
    this.renderList();
    this.q(".person-message").textContent = error ?? "任命しました";
  }
}
