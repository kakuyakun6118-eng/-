// 都市をタップしたときに、画面の下に出る情報パネル。
import type { City, Faction } from "../data/types";

export class InfoPanel {
  private readonly name: HTMLElement;
  private readonly reading: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly faction: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly description: HTMLElement;

  constructor(private readonly root: HTMLElement, onClose: () => void) {
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    this.name = q(".info-name");
    this.reading = q(".info-reading");
    this.chip = q(".info-chip");
    this.faction = q(".info-faction");
    this.detail = q(".info-detail");
    this.description = q(".info-description");
    q(".info-close").addEventListener("click", onClose);
  }

  show(city: City, faction: Faction | undefined): void {
    this.name.textContent = city.name;
    this.reading.textContent = city.reading;
    this.chip.style.background = faction ? faction.color : "#9a9a9a";
    this.faction.textContent = faction ? faction.name : "所属なし";
    this.detail.textContent = faction ? `${faction.people} ・ 君主 ${faction.ruler}` : "";
    this.description.textContent = city.description;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
