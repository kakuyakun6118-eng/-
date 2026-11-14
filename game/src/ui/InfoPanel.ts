// 都市をタップしたときに、画面の下に出る情報パネル。
import { cityLevelOf, cityLevels, personById } from "../data";
import type { City, CityState, Faction } from "../data/types";

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
  show(city: City, faction: Faction | undefined, state?: CityState, uncertain = false): void {
    this.name.textContent = city.name;
    this.reading.textContent = city.reading;
    this.chip.style.background = faction ? faction.color : "#9a9a9a";
    this.faction.textContent = (faction ? faction.name : "所属なし") + (uncertain ? "(推定)" : "");
    this.detail.textContent = faction ? `${faction.people} ・ 君主 ${faction.ruler}` : "";
    const governor = personById(state?.governorId ?? city.governorId);
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
