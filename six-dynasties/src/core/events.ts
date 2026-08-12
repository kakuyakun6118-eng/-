import eventsData from '../data/events.json';
import { modifiersOf } from './constants';
import type { GameState, HistoricalEvent, StateCondition } from './types';
import { clamp, clamp100, readPath, writePath } from './util';

const EVENTS = eventsData as HistoricalEvent[];

export function findEvent(id: string): HistoricalEvent | undefined {
  return EVENTS.find((event) => event.id === id);
}

export function allEvents(): HistoricalEvent[] {
  return EVENTS;
}

function compare(actual: unknown, condition: StateCondition): boolean {
  const expected = condition.value;
  if (typeof actual === 'number' && typeof expected === 'number') {
    switch (condition.operator) {
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
    }
  }
  // null と 0 を「まだ起きていない」の同義として扱う。
  // crossedSouthYear のように「年が入るか null」の欄を条件に書けるようにするため
  const left = actual === null ? 0 : actual;
  if (condition.operator === 'eq') return left === expected;
  if (condition.operator === 'neq') return left !== expected;
  return false;
}

function conditionsMet(state: GameState, event: HistoricalEvent): boolean {
  const { condition } = event;
  if (condition.year !== undefined && state.year !== condition.year) return false;
  if (condition.minYear !== undefined && state.year < condition.minYear) return false;
  if (condition.maxYear !== undefined && state.year > condition.maxYear) return false;
  for (const stateCondition of condition.stateConditions ?? []) {
    if (!compare(readPath(state, stateCondition.field), stateCondition)) return false;
  }
  return true;
}

/** 7パラメータのうち 0〜100 に収めるもの */
const BOUNDED_FIELDS = new Set([
  'taxBase',
  'mandate',
  'gentry',
  'princeLoyalty',
  'tribalLoyalty',
]);

/**
 * 歴史イベントの発火判定。
 *
 * 緩和は `harmful: true` のイベントにだけ掛ける。
 * 淝水の戦いのような有益なイベントまで弱めると、初級のほうが不利になるため。
 * 条件を満たしても見送ったイベントは `firedEventIds` に入れないので、
 * 条件が続く限り翌年以降に改めて判定される
 */
export function applyHistoricalEvents(state: GameState, rng: () => number): GameState {
  const severity = modifiersOf(state.difficulty).historicalSeverityMultiplier;
  let next = state;

  for (const event of EVENTS) {
    if (event.onceOnly && next.firedEventIds.includes(event.id)) continue;
    if (!conditionsMet(next, event)) continue;

    const probability = (event.probability ?? 1) * (event.harmful ? severity : 1);
    if (rng() >= probability) continue;

    for (const effect of event.effects) {
      if (effect.set !== undefined) {
        next = writePath(next, effect.field, effect.set);
        continue;
      }
      if (effect.delta === undefined) continue;

      const current = readPath(next, effect.field);
      if (typeof current !== 'number') continue;
      // 被害だけを難易度で和らげる。恩恵はそのまま通す
      const delta = effect.delta < 0 && event.harmful ? effect.delta * severity : effect.delta;
      const raw = current + delta;

      const leaf = effect.field.split('.').pop() ?? '';
      const bounded =
        BOUNDED_FIELDS.has(effect.field) || leaf === 'control'
          ? clamp100(raw)
          : leaf === 'strength' || leaf === 'garrison'
            ? Math.max(0, raw)
            : effect.field === 'treasury'
              ? raw
              : clamp(raw, 0, Number.MAX_SAFE_INTEGER);
      next = writePath(next, effect.field, bounded);
    }

    next = { ...next, firedEventIds: [...next.firedEventIds, event.id] };
  }

  return next;
}
