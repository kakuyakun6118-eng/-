import { START_YEAR } from './constants';
import type { GameState } from './types';

const FORMAT = 'six-dynasties-save';
/*
 * 保存の版。**状態に欄を足したら必ず上げる。**
 *
 * 上げずにいたときは、古い保存（`retiredPrinceIds` や城の耐久を持たない）が
 * そのまま受け入れられ、年を送った瞬間に
 * 「state.retiredPrinceIds is not iterable」で落ちた。
 * 読めないものは読めないと言って断るほうが、黙って壊れるよりよい
 */
const VERSION = 2;

interface SaveFile {
  format: string;
  version: number;
  savedAt: string;
  state: GameState;
}

export function serialize(state: GameState, savedAt: string): string {
  const file: SaveFile = { format: FORMAT, version: VERSION, savedAt, state };
  return JSON.stringify(file, null, 2);
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; error: string };

export function deserialize(contents: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { ok: false, error: 'ファイルの形式が読めません' };
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, error: 'ファイルの形式が読めません' };
  }
  const file = parsed as Partial<SaveFile>;
  if (file.format !== FORMAT) {
    return { ok: false, error: 'このアプリのセーブデータではありません' };
  }
  if (file.version !== VERSION) {
    return {
      ok: false,
      error: `古い版のセーブデータです（版 ${file.version}／いまは版 ${VERSION}）。仕様が変わったため読み込めません`,
    };
  }
  const state = file.state;
  if (
    state === undefined ||
    typeof state.year !== 'number' ||
    state.year < START_YEAR ||
    typeof state.provinces !== 'object' ||
    state.provinces === null
  ) {
    return { ok: false, error: 'セーブデータが壊れています' };
  }

  /*
   * 版が合っていても、欄が揃っているかは別に確かめる。
   * 手で書き換えた記録や、途中で切れた書き出しを受け入れると
   * 読み込んだあとの年送りで落ちる
   */
  const missing = [
    !Array.isArray(state.retiredPrinceIds) && 'retiredPrinceIds',
    !Array.isArray(state.firedEventIds) && 'firedEventIds',
    !Array.isArray(state.princes) && 'princes',
    (state.dynasty === undefined || state.dynasty === null) && 'dynasty',
    (state.factions === undefined || state.factions === null) && 'factions',
    Object.values(state.provinces).some(
      (p) => typeof p?.wall !== 'number' || typeof p?.wallMax !== 'number',
    ) && '城の耐久',
  ].filter((x): x is string => typeof x === 'string');

  if (missing.length > 0) {
    return { ok: false, error: `セーブデータに欠けている項目があります（${missing.join('、')}）` };
  }
  // 戦場を挟んだまま保存されたものは、戦場を畳んだ状態で読み込む
  return { ok: true, state: { ...state, battlefield: null } };
}

export function suggestFileName(state: GameState): string {
  return `${state.dynasty.houseName}-${state.year}年.json`;
}

// ── 端末への自動保存 ──────────────────────────────────

const STORAGE_KEY = 'six-dynasties:autosave';

/** 年送りのたびに端末へ控えを残す。誤って閉じても続きから遊べる */
export function writeAutosave(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state, new Date().toISOString()));
  } catch {
    // 保存できない環境（容量超過・プライベートモード）では黙って諦める
  }
}

export function readAutosave(): GameState | null {
  try {
    const contents = localStorage.getItem(STORAGE_KEY);
    if (contents === null) return null;
    const result = deserialize(contents);
    return result.ok ? result.state : null;
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても遊びには差し支えない
  }
}
