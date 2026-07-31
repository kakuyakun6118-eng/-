import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 背景音楽。
 *
 * 音源ファイルはリポジトリに含めない。権利のある音源を
 * public/music/ に置くとそのまま鳴る（置き方は同フォルダの README）。
 * ファイルが無い場合は再生ボタンを出さず、音が無いだけで遊べる。
 *
 * 自動再生はブラウザが操作なしでは許さないので、最初の操作
 * （難易度の選択、または音のボタン）まで待ってから鳴らす
 */

/** public/ 以下の配信パス。差し替えはファイルを置き換えるだけで済む */
const TRACK_URL = '/music/theme.mp3';

/** 音量。管弦楽の音源を想定して控えめに始める */
const DEFAULT_VOLUME = 0.4;

/** 前回の選択を覚えておく。毎回鳴らされるのを嫌う人がいるため */
const STORAGE_KEY = 'westrome.music';

function storedPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function storePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // プライベートモードなどで書けなくても再生自体は続けられる
  }
}

export interface Music {
  /** 音源ファイルが見つかったか。無ければ操作を出さない */
  available: boolean;
  playing: boolean;
  toggle: () => void;
  /** 最初の操作で呼ぶ。前回「切」を選んでいれば鳴らさない */
  startIfAllowed: () => void;
}

export function useMusic(): Music {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio(TRACK_URL);
    audio.loop = true;
    audio.volume = DEFAULT_VOLUME;
    audio.preload = 'auto';
    audio.addEventListener('canplaythrough', () => setAvailable(true));
    audio.addEventListener('error', () => setAvailable(false));
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (audio === null) return;
    // 操作なしの再生はブラウザに拒否される。拒否されても壊さない
    void audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (audio === null) return;
    if (audio.paused) {
      storePreference(true);
      play();
    } else {
      audio.pause();
      storePreference(false);
      setPlaying(false);
    }
  }, [play]);

  const startIfAllowed = useCallback(() => {
    if (!storedPreference()) return;
    play();
  }, [play]);

  return { available, playing, toggle, startIfAllowed };
}
