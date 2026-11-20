// 攻城戦の救援軍の決まり(Version 42)。手動の3Dの攻城戦と、AIどうしの自動の攻城戦で、同じ決まりを使う。
// ・到着の時刻:戦略マップの経路の「手間」(km × 地形の通りにくさ)から決める。1km の手間あたり 1.5秒(戦いの1日 = 20秒)
// ・参加できる兵:その軍団の、いまの兵・士気・疲労・兵糧(兵糧が尽きていれば、士気が下がる)
// ・妨害:道が、攻める側の(包囲している軍団とは別の)軍団の近くを通るなら、救援軍は着けない
// ・着く前に戦いが終われば、その救援軍は戦いに加わらず、兵も失わない

/** 戦いの1日の秒数(siege.ts の SECONDS_PER_DAY と同じ) */
export const RELIEF_SECONDS_PER_DAY = 20;
/** 手間 1km あたりの秒数 */
export const RELIEF_SECONDS_PER_KM = 1.5;

/** 到着までの秒数(最短20秒・最長300秒) */
export function reliefArrivalSeconds(effortKm: number): number {
  return Math.min(300, Math.max(20, Math.round(effortKm * RELIEF_SECONDS_PER_KM)));
}

/** 到着までの、攻城戦の日数 */
export function reliefArrivalDays(arriveSec: number): number {
  return arriveSec / RELIEF_SECONDS_PER_DAY;
}

/** 兵糧と疲労を考えた、救援軍の士気(兵糧が尽きていれば -15、疲労が高ければ下がる) */
export function reliefMorale(morale: number, efficiency: number, food: number, fatigue: number): number {
  return Math.max(5, Math.round(morale * efficiency - (food <= 0 ? 15 : 0) - Math.max(0, fatigue - 50) * 0.3));
}
