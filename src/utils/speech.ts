/**
 * Reads a phrase out loud with the browser's built-in speech synthesis.
 *
 * iOS Safari only exposes voices after the first user gesture and silently
 * ignores playback outside one, so nothing here throws — callers check
 * `speechAvailable()` and fall back to the katakana reading.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;

export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!speechAvailable()) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null; // Not loaded yet; the default voice still works.
  cachedVoice =
    voices.find((v) => v.lang === "en-US" && /samantha|ava|allison|google us/i.test(v.name)) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null;
  return cachedVoice;
}

if (speechAvailable() && typeof window.speechSynthesis.addEventListener === "function") {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    cachedVoice = null;
    pickVoice();
  });
}

/** Speaks English text. `rate` below 1 is the slow "もう一度ゆっくり" playback. */
export function speak(text: string, rate = 0.95): void {
  if (!speechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error("speech synthesis failed", err);
  }
}

export function stopSpeaking(): void {
  if (!speechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing to do — playback is a nice-to-have.
  }
}
