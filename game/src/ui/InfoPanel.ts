// 都市をタップしたときに、画面の下に出る情報パネル。
import { fillPortrait } from "./portrait";
import { governorIdOf } from "../sim/battle";
import { cityLevelOf, cityLevels, personById } from "../data";
import type { Person, City, CityState, Faction } from "../data/types";

export class InfoPanel {
  private readonly name: HTMLElement;
  private readonly reading: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly faction: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly description: HTMLElement;
  private readonly level: HTMLElement;
  private readonly population: HTMLElement;
  private readonly defense: HTMLElement;

  /** onZoom は「広域・中距離・近距離」ボタンが押されたとき、その距離を受け取る */
  constructor(private readonly root: HTMLElement, onClose: () => void, onZoom: (distance: number) => void) {
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    this.name = q(".info-name");
    this.reading = q(".info-reading");
    this.chip = q(".info-chip");
    this.faction = q(".info-faction");
    this.detail = q(".info-detail");
    this.description = q(".info-description");
    this.level = q(".info-level");
    this.population = q(".info-population");
    this.defense = q(".info-defense");
    q(".info-close").addEventListener("click", onClose);
    root.querySelectorAll<HTMLButtonElement>(".info-zoom button").forEach((b) => {
      b.addEventListener("click", () => onZoom(Number(b.dataset.distance)));
    });
  }

  /** state は、いまの都市の状態(守備兵・守将)。uncertain は、所属が推定かどうか */
  /**
   * 都市の情報。residents は滞在している人物(太守・后妃など)、treasureCount は蔵の名品の数。
   */
  show(city: City, faction: Faction | undefined, state?: CityState, uncertain = false, residents: Person[] = [], treasureCount = 0): void {
    const box = this.root.querySelector(".info-residents") as HTMLElement;
    box.replaceChildren(...residents.slice(0, 6).map((p) => {
      const chip = document.createElement("span");
      chip.className = "info-resident";
      const img = document.createElement("img");
      img.alt = "";
      fillPortrait(img, p);
      chip.append(img, p.name);
      return chip;
    }));
    if (treasureCount > 0) {
      const t = document.createElement("span");
      t.className = "info-resident info-treasure";
      t.textContent = `蔵の名品 ${treasureCount}点`;
      box.append(t);
    }
    if (state?.prosperity !== undefined && state.prosperity < 100) {
      const t = document.createElement("span");
      t.className = "info-resident info-treasure";
      t.textContent = `繁栄 ${Math.round(state.prosperity)}・治安 ${Math.round(state.order ?? 70)}`;
      box.append(t);
    }
    box.hidden = box.childElementCount === 0;
    this.name.textContent = city.name;
    this.reading.textContent = city.reading;
    this.chip.style.background = faction ? faction.color : "#9a9a9a";
    this.faction.textContent = (faction ? faction.name : "所属なし") + (uncertain ? "(推定)" : "");
    this.detail.textContent = faction ? `${faction.people} ・ 君主 ${faction.ruler}` : "";
    const governor = personById(governorIdOf(city, state));
    const extra = [
      `守備兵 ${(state?.garrison ?? city.garrison ?? 0).toLocaleString("ja-JP")}`,
      governor ? `${city.kind === "pass" ? "守将" : "太守"} ${governor.name}` : city.kind === "pass" ? "守将なし" : "太守なし",
      city.economy !== undefined ? `経済 ${city.economy}` : "",
      city.food !== undefined ? `食糧生産 ${city.food}` : "",
      city.transport !== undefined ? `交通 ${"★".repeat(city.transport)}` : "",
      city.military !== undefined ? `軍事 ${"★".repeat(city.military)}` : "",
    ].filter(Boolean).join("・");
    this.description.textContent = `${extra}。${city.description}`;
    const level = cityLevelOf(city);
    this.level.textContent = city.kind === "pass" ? "関所・要衝" : `${cityLevels[String(level)].label}(レベル${level})`;
    this.population.textContent = city.kind === "pass" ? "—" : city.population ? `${city.population.toLocaleString("ja-JP")}人` : "不明";
    this.defense.textContent = city.defense !== undefined ? String(city.defense) : "不明";
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
