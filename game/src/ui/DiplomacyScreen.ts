import { scenario } from "../data";
import type { Campaign } from "../sim/Campaign";

const RELATION_LABEL = { war: "戦争", peace: "和平", alliance: "同盟" } as const;

export interface DiplomacyActions {
  campaign: () => Campaign;
  playerFactionId: () => string | null;
  /** 関係が変わったあと、地図の表示(軍団のパネルなど)を合わせる */
  onChanged: () => void;
}

/** 外交と情勢:各勢力との関係・兵力・都市の数、宣戦・和睦・同盟、申し入れへの返事、最近の出来事 */
export class DiplomacyScreen {
  private readonly q: <T extends HTMLElement = HTMLElement>(sel: string) => T;

  constructor(private readonly root: HTMLElement, private readonly actions: DiplomacyActions) {
    this.q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.q(".diplomacy-close").addEventListener("click", () => (this.root.hidden = true));
  }

  open(): void {
    this.root.hidden = false;
    this.say("");
    this.render();
  }

  private say(text: string): void {
    this.q(".diplomacy-message").textContent = text;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  private render(): void {
    const c = this.actions.campaign();
    const me = this.actions.playerFactionId();
    this.q(".diplomacy-hint").textContent = me
      ? "和平の相手とは戦いにならず、関所は同盟の相手だけが通れます。関係は、変えてから90日は変えられません。"
      : "メニューで「操作する勢力」を選ぶと、ほかの勢力が自動で動きはじめ、ここから外交ができます。";

    const rows = scenario.factions.map((f) => {
      const row = document.createElement("div");
      row.className = "diplomacy-row";
      const cities = c.cities.filter((x) => scenario.cityOwners[x.id] === f.id).length;
      const relation = me && me !== f.id ? c.relationOf(me, f.id) : null;
      const chip = document.createElement("i");
      chip.style.background = f.color;
      const name = document.createElement("span");
      name.className = "diplomacy-name";
      name.textContent = f.name;
      const info = document.createElement("span");
      info.className = "diplomacy-info";
      info.textContent = cities === 0 ? "滅亡(都市なし)" : `都市${cities}・兵${Math.round(c.strengthOf(f.id) / 1000)}千`;
      const state = document.createElement("span");
      state.className = "diplomacy-state";
      state.dataset.relation = relation ?? "";
      state.textContent = f.id === me ? "自勢力" : relation ? RELATION_LABEL[relation] : "—";
      const acts = document.createElement("span");
      acts.className = "diplomacy-acts";
      if (relation && cities > 0) {
        const act = (action: "war" | "peace" | "alliance") => () => {
          this.say(c.diplomacy(f.id, action));
          this.actions.onChanged();
          this.render();
        };
        if (relation !== "war") acts.append(this.button("宣戦", act("war")));
        if (relation === "war") acts.append(this.button("和睦", act("peace")));
        if (relation === "peace") acts.append(this.button("同盟", act("alliance")));
      }
      row.append(chip, name, info, state, acts);
      return row;
    });
    this.q(".diplomacy-factions").replaceChildren(...rows);

    const proposals = c.proposals.map((x) => {
      const row = document.createElement("div");
      row.className = "diplomacy-proposal";
      const name = scenario.factions.find((f) => f.id === x.from)?.name ?? "";
      const text = document.createElement("span");
      text.textContent = `${name}が${x.kind === "peace" ? "和睦" : "同盟"}を求めています`;
      const answer = (accept: boolean) => () => {
        c.answerProposal(x.from, accept);
        this.say(accept ? `${name}の申し入れを受けました` : `${name}の申し入れを断りました`);
        this.actions.onChanged();
        this.render();
      };
      row.append(text, this.button("受ける", answer(true)), this.button("断る", answer(false)));
      return row;
    });
    this.q(".diplomacy-proposals").replaceChildren(...proposals);

    const news = [...c.news].reverse().map((n) => {
      const li = document.createElement("li");
      li.textContent = n.text;
      return li;
    });
    if (news.length === 0) {
      const li = document.createElement("li");
      li.textContent = "まだ、出来事はありません";
      news.push(li);
    }
    this.q(".diplomacy-news").replaceChildren(...news);
  }
}
