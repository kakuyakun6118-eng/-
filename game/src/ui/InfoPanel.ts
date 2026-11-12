// 都市をタップしたときに、画面の下に出る情報パネル。
import { cityLevels } from "../data";
import type { City, Faction } from "../data/types";

export class InfoPanel {
  private readonly name: HTMLElement;
  private readonly reading: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly faction: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly description: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly level: HTMLElement;
  private readonly population: HTMLElement;
  private readonly defense: HTMLElement;

  constructor(private readonly root: HTMLElement, onClose: () => void) {
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    this.name = q(".info-name");
    this.reading = q(".info-reading");
    this.chip = q(".info-chip");
    this.faction = q(".info-faction");
    this.detail = q(".info-detail");
    this.description = q(".info-description");
    this.stats = q(".info-stats");
    this.level = q(".info-level");
    this.population = q(".info-population");
    this.defense = q(".info-defense");
    q(".info-close").addEventListener("click", onClose);
  }

  show(city: City, faction: Faction | undefined): void {
    this.name.textContent = city.name;
    this.reading.textContent = city.reading;
    this.chip.style.background = faction ? faction.color : "#9a9a9a";
    this.faction.textContent = faction ? faction.name : "所属なし";
    this.detail.textContent = faction ? `${faction.people} ・ 君主 ${faction.ruler}` : "";
    this.description.textContent = city.description;
    // 規模・人口・防御力は、データのある都市だけ表示する
    this.stats.hidden = !city.level;
    if (city.level) {
      this.level.textContent = `${cityLevels[String(city.level)].label}(レベル${city.level})`;
      this.population.textContent = city.population ? `${city.population.toLocaleString("ja-JP")}人` : "不明";
      this.defense.textContent = city.defense !== undefined ? String(city.defense) : "不明";
    }
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
