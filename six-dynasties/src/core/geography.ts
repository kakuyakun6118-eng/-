/*
 * 州と州のつながり。
 *
 * これまでこの模型に地理は無かった。**北伐は「失った州を選んで一度賽を振る」**
 * だけだったので、嶺南の交州から幽州へ、隣も通らずに軍が届いた。
 * 部隊を出して州から州へ動かすには、どこの隣がどこかを持たねばならない。
 *
 * 辺は無向で、淮水も長江も越える（この三百年、軍はどちらも越えた）。
 * 対称であることは `npm run audit` が毎回確かめる
 */
import type { GameState, ProvinceId } from './types';

/**
 * 隣り合う州。
 *
 * 涼州は雍州にしか繋がらない袋小路で、荊州は七州に接する天下の十字路になる。
 * **荊州が上流から都を睨む方鎮だったのはこの形のため**で、
 * 地図をそのまま辺にすると、桓温も桓玄も劉裕も荊州から出た理由が形に出る
 */
export const NEIGHBOURS: Record<ProvinceId, ProvinceId[]> = {
  Si: ['Yong', 'Bing', 'Ji', 'Yu', 'Jing'],
  Yong: ['Si', 'Liang', 'Bing', 'Yi', 'Jing'],
  Liang: ['Yong'],
  Bing: ['Si', 'Yong', 'Ji', 'You'],
  Ji: ['Si', 'Bing', 'You', 'Qing', 'Yu'],
  You: ['Bing', 'Ji'],
  Qing: ['Ji', 'Yu'],
  Yu: ['Si', 'Ji', 'Qing', 'Yang', 'Jing'],
  Yang: ['Yu', 'Jing', 'Jiang'],
  Jing: ['Si', 'Yong', 'Yu', 'Yang', 'Jiang', 'Yi', 'Guang'],
  Jiang: ['Yang', 'Jing', 'Guang'],
  Yi: ['Yong', 'Jing', 'Ning'],
  Ning: ['Yi', 'Guang', 'Jiao'],
  Guang: ['Jing', 'Jiang', 'Ning', 'Jiao'],
  Jiao: ['Guang', 'Ning'],
};

export function areNeighbours(a: ProvinceId, b: ProvinceId): boolean {
  return NEIGHBOURS[a].includes(b);
}

/**
 * 行軍の路。`from` を含まず、`to` で終わる州の並びを返す。届かなければ空。
 *
 * **敵地を通る路は高くつく。** 自領を歩くのは 1、敵の握る州へ踏み込むのは 4 と
 * 数えるので、部隊は回り道ができるならまわる。等しい重みで最短だけを見ていた
 * ときは、洛陽から涼州へ出す軍が途中の敵領を三つ踏み越えて、
 * 目的の州に着く前にすり潰れた
 */
export function marchPath(
  state: GameState,
  from: ProvinceId,
  to: ProvinceId,
): ProvinceId[] {
  if (from === to) return [];

  const costOf = (id: ProvinceId): number => (state.provinces[id].holder === null ? 1 : 4);

  const dist = new Map<ProvinceId, number>([[from, 0]]);
  const prev = new Map<ProvinceId, ProvinceId>();
  const queue: ProvinceId[] = [from];

  // 15州しかないので、素朴に「いちばん近い未確定の州」を毎回探す
  const settled = new Set<ProvinceId>();
  while (queue.length > 0) {
    let best = 0;
    for (let i = 1; i < queue.length; i++) {
      if ((dist.get(queue[i]) ?? Infinity) < (dist.get(queue[best]) ?? Infinity)) best = i;
    }
    const current = queue.splice(best, 1)[0];
    if (settled.has(current)) continue;
    settled.add(current);
    if (current === to) break;

    for (const next of NEIGHBOURS[current]) {
      const through = (dist.get(current) ?? Infinity) + costOf(next);
      if (through >= (dist.get(next) ?? Infinity)) continue;
      dist.set(next, through);
      prev.set(next, current);
      queue.push(next);
    }
  }

  if (!dist.has(to)) return [];
  const path: ProvinceId[] = [];
  let cursor: ProvinceId | undefined = to;
  while (cursor !== undefined && cursor !== from) {
    path.unshift(cursor);
    cursor = prev.get(cursor);
  }
  return cursor === from ? path : [];
}
