import { useCallback, useEffect, useMemo, useState } from 'react';

import dynastyData from '../data/dynasty.json';
import factionsData from '../data/factions.json';
import homelandsData from '../data/homelands.json';
import officialsData from '../data/officials.json';
import princesData from '../data/princes.json';
import provincesData from '../data/provinces.json';
import { MAX_ACTIONS_PER_TURN } from '../core/constants';
import { renameRuler } from '../core/dynasty';
import { createInitialState } from '../core/economy';
import { findEvent } from '../core/events';
import {
  clearAutosave,
  deserialize,
  readAutosave,
  serialize,
  suggestFileName,
  writeAutosave,
} from '../core/save';
import {
  advanceBattle,
  beginTurn,
  concludeBattle,
  consumesActionSlot,
  deployBattle,
  evaluateScore,
} from '../core/tick';
import type {
  BattleDeployment,
  BattleOrders,
  Difficulty,
  Dynasty,
  Faction,
  GameState,
  Homeland,
  Official,
  PlayerAction,
  Prince,
  Province,
  ProvinceId,
} from '../core/types';
import { FACTION_LABELS, PROVINCE_LABELS, TURN_EVENT_LABELS } from './catalogue';

/** JSON をそのまま渡すと複数の局で同じ物を触ることになるので複製する */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function buildInitialState(difficulty: Difficulty): GameState {
  const inspectors = (
    officialsData.inspectors as ({ provinceId: string } & Official)[]
  ).map((entry) => ({
    provinceId: entry.provinceId as ProvinceId,
    // 名簿の欄がそのまま武将の欄なので、丸ごと渡す
  official: entry as Official,
  }));

  return createInitialState(
    clone(provincesData) as Province[],
    clone(factionsData) as Faction[],
    clone(homelandsData) as Homeland[],
    clone(princesData) as Prince[],
    clone(dynastyData) as Dynasty,
    clone(officialsData.chancellor) as Official,
    inspectors,
    difficulty,
  );
}

/**
 * 画面の状態と core の橋渡しだけを行う。
 * 計算はすべて core/ の関数に任せ、ここには計算式を書かない
 */
export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [runSeed, setRunSeed] = useState(0);
  const [selected, setSelected] = useState<PlayerAction[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * 1年前の状態。状況表示に前年からの増減を添えるために持つ。
   * 表示のためだけの控えで、どの計算にも渡さない
   */
  const [previous, setPrevious] = useState<GameState | null>(null);
  /** 端末に残っている続き。タイトル画面から再開できる */
  const [resumable, setResumable] = useState<GameState | null>(null);

  useEffect(() => {
    setResumable(readAutosave());
  }, []);

  const start = useCallback((difficulty: Difficulty, rulerName: string) => {
    // 乱数の種はここで一度だけ引く。tick() 自体は seed から決定的に動く
    setRunSeed(Math.floor(Math.random() * 1_000_000_000));
    setState(renameRuler(buildInitialState(difficulty), rulerName));
    setSelected([]);
    setLog([]);
    setPrevious(null);
    setLoadError(null);
  }, []);

  const resume = useCallback(() => {
    const saved = readAutosave();
    if (saved === null) return;
    setRunSeed(Math.floor(Math.random() * 1_000_000_000));
    setState(saved);
    setSelected([]);
    setLog([`${saved.year}年 — 続きから再開した`]);
    setPrevious(null);
  }, []);

  const toggleAction = useCallback((action: PlayerAction, key: string) => {
    setSelected((current) => {
      const existing = current.findIndex((a) => actionKey(a) === key);
      if (existing >= 0) return current.filter((_, i) => i !== existing);
      // 枠を消費しない行動は上限の判定から外す
      if (
        consumesActionSlot(action) &&
        current.filter(consumesActionSlot).length >= MAX_ACTIONS_PER_TURN
      ) {
        return current;
      }
      return [...current, action];
    });
  }, []);

  const clearActions = useCallback(() => setSelected([]), []);

  /** 在位中の帝の名を付け替える。表示だけの変更でターンは進まない */
  const rename = useCallback((name: string) => {
    setState((current) => (current === null ? current : renameRuler(current, name)));
  }, []);

  /*
   * setState の更新関数の中で他の状態を触らない。
   * React は更新関数を複数回呼ぶことがあり、副作用を持たせると
   * 記録が二重に積まれる
   */
  const endTurn = useCallback(() => {
    if (state === null || state.status !== 'ongoing') return;
    /*
     * 枠の勘定は tick() が行う。ここで一律に切ると、枠を消費しない
     * 行動（要求への応答・官職の任命）が3つめ以降に来たときに黙って捨てられる
     */
    const next = beginTurn(state, selected, runSeed + state.turn);
    setState(next);
    // 会戦が選ばれた年はまだ進んでいない。記録は決着してから作る
    if (next.battlefield !== null) return;
    setPrevious(state);
    setLog((entries) => [describeTurn(state, next), ...entries].slice(0, 60));
    setSelected([]);
    writeAutosave(next);
  }, [state, selected, runSeed]);

  /** 戦場に布陣する。年はまだ進まない */
  const deploy = useCallback((deployment: BattleDeployment) => {
    setState((current) => (current === null ? current : deployBattle(current, deployment)));
  }, []);

  /*
   * 一度の激突。乱数の種は年と激突の回数からずらす。
   * 同じ種を使い回すと、どの回も同じ目になる
   */
  const fight = useCallback(
    (orders: BattleOrders) => {
      setState((current) =>
        current === null || current.battlefield === null
          ? current
          : advanceBattle(current, orders, runSeed + current.turn * 100 + current.battlefield.round),
      );
    },
    [runSeed],
  );

  /** 決着した戦場を畳み、預けていた行動でその年を進める */
  const finishBattle = useCallback(() => {
    if (state === null || state.battlefield === null) return;
    const next = concludeBattle(state, runSeed + state.turn);
    setState(next);
    setPrevious(state);
    setLog((entries) => [describeTurn(state, next), ...entries].slice(0, 60));
    setSelected([]);
    writeAutosave(next);
  }, [state, runSeed]);

  const save = useCallback(() => {
    if (state === null) return;
    download(serialize(state, new Date().toISOString()), suggestFileName(state));
  }, [state]);

  const load = useCallback(async (file: File) => {
    const result = deserialize(await file.text());
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setRunSeed(Math.floor(Math.random() * 1_000_000_000));
    setState(result.state);
    setSelected([]);
    setLog([`${result.state.year}年 — 記録を読み込んだ`]);
    // 読み込んだ直後は比べる前年が無い
    setPrevious(null);
  }, []);

  const quit = useCallback(() => {
    setState(null);
    setSelected([]);
    setLog([]);
    setPrevious(null);
    setResumable(readAutosave());
  }, []);

  const abandon = useCallback(() => {
    clearAutosave();
    setResumable(null);
    setState(null);
    setSelected([]);
    setLog([]);
    setPrevious(null);
  }, []);

  const score = useMemo(() => (state ? evaluateScore(state) : null), [state]);

  return {
    state,
    previous,
    selected,
    log,
    score,
    loadError,
    resumable,
    start,
    resume,
    toggleAction,
    clearActions,
    rename,
    endTurn,
    deploy,
    fight,
    finishBattle,
    quit,
    abandon,
    save,
    load,
  };
}

/** 選択済み判定のための一意キー。表示用であって計算ではない */
export function actionKey(action: PlayerAction): string {
  const parts: string[] = [action.type];
  if ('factionId' in action) parts.push(action.factionId);
  if ('provinceId' in action) parts.push(action.provinceId);
  if ('homelandId' in action) parts.push(action.homelandId);
  if ('princeId' in action) parts.push(action.princeId);
  // 同じ官職の候補どうしを区別する。入れないと3人の候補が同じキーになる
  if ('officialId' in action) parts.push(action.officialId);
  // 出征は「誰を」「どこへ」で別の行動になる
  if ('officerId' in action && action.officerId !== undefined) parts.push(action.officerId);
  if ('corpsId' in action) parts.push(action.corpsId);
  if ('target' in action) {
    parts.push(
      action.target.kind === 'north'
        ? 'north'
        : action.target.kind === 'gentry'
          ? action.target.houseId
          : action.target.factionId,
    );
  }
  // 会戦は「誰と戦うか」と「誰が率いるか」で別の行動になる
  if ('foe' in action) {
    parts.push(
      action.foe.kind === 'faction'
        ? action.foe.factionId
        : action.foe.kind === 'prince'
          ? action.foe.princeId
          : 'north',
    );
    parts.push(action.leader);
    if (action.mobilize && action.mobilize.length > 0) parts.push(action.mobilize.join('+'));
  }
  return parts.join(':');
}

/** 1ターンで何が起きたかを日本語にする。差分を読むだけで計算はしない */
function describeTurn(before: GameState, after: GameState): string {
  const events: string[] = [];

  const delta = Math.round(after.treasury - before.treasury);
  events.push(`国庫 ${delta >= 0 ? '+' : ''}${delta}`);

  // 状態の差分からは読み取れない出来事は core が記録している
  for (const id of after.turnEvents) events.push(TURN_EVENT_LABELS[id]);

  if (after.dynasty.history.length > before.dynasty.history.length) {
    const record = after.dynasty.history[after.dynasty.history.length - 1];
    events.push(
      `${record.name}${record.cause === 'assassination' ? 'が弑された' : 'が崩じた'}`,
      record.outcome === 'crisis'
        ? `${after.dynasty.houseName}が興った`
        : `${after.dynasty.ruler.name}が継いだ（${record.outcome === 'heir' ? '嫡子' : '傍系'}）`,
    );
  }

  for (const id of after.firedEventIds) {
    if (before.firedEventIds.includes(id)) continue;
    const event = findEvent(id);
    if (event) events.push(`【${event.title}】`);
  }

  for (const id of Object.keys(after.provinces) as ProvinceId[]) {
    const was = before.provinces[id].holder;
    const now = after.provinces[id].holder;
    if (was === null && now !== null) events.push(`${PROVINCE_LABELS[id]}を失った`);
    if (was !== null && now === null) events.push(`${PROVINCE_LABELS[id]}を回復した`);
  }

  for (const id of Object.keys(after.factions) as (keyof typeof after.factions)[]) {
    const was = before.factions[id].stance;
    const now = after.factions[id].stance;
    if (was === now) continue;
    if (now === 'enfeoffed') {
      events.push(`${FACTION_LABELS[id]}が${after.factions[id].kingdomName ?? '国'}を建てた`);
    } else if (now === 'auxiliary') {
      events.push(`${FACTION_LABELS[id]}が帰順した`);
    } else if (was === 'auxiliary') {
      events.push(`${FACTION_LABELS[id]}が離反した`);
    }
  }

  return `${after.year}年 — ${events.join(' / ')}`;
}

/** 文字列をファイルとして保存させる。ブラウザ固有の処理なので ui 側に置く */
function download(contents: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
