// Polish: a spoken phrase becomes a custom world. Feature-detected; buttons remain the baseline.
// One recognizer at a time. Listening always ends: on a result, an error, the browser's own end, a cancel
// (pressing the button again or picking a preset world), or after VOICE_TIMEOUT_MS. The Quest Browser can start
// listening and then never report anything, which used to leave the button stuck on "Listening…".
import { VOICE_TIMEOUT_MS } from '../config';

type Rec = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous?: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onnomatch?: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
};

const ctor = () => (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

export const voiceSupported = typeof ctor() === 'function';

let cancelActive: (() => void) | null = null;

export const isListening = (): boolean => cancelActive !== null;

/** Stop listening now (no phrase is used). Safe to call when not listening. */
export function stopListening(): void {
  cancelActive?.();
}

/**
 * Listen for one phrase. onState(true) when listening starts; onState(false, error?) exactly once when it ends.
 * error: 'timeout' | 'no-speech' | 'not-allowed' | 'network' | 'aborted' | ... (none after a phrase).
 * Calling it while already listening cancels the current listen instead (the button toggles).
 */
export function listenOnce(onPhrase: (text: string) => void, onState: (listening: boolean, err?: string) => void, timeoutMs = VOICE_TIMEOUT_MS): void {
  const C = ctor();
  if (typeof C !== 'function') return;
  if (cancelActive) {
    stopListening();
    return;
  }
  const r: Rec = new C();
  let done = false;
  const halt = () => {
    try {
      if (r.abort) r.abort();
      else r.stop();
    } catch {
      /* already stopped */
    }
  };
  const finish = (err?: string) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    cancelActive = null;
    onState(false, err);
  };
  // finish first: stopping the recognizer may fire its own error/end events, which must not change the reason
  const timer = setTimeout(() => {
    finish('timeout');
    halt();
  }, timeoutMs);
  cancelActive = () => {
    finish('aborted');
    halt();
  };
  r.lang = 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = false;
  r.onresult = (e) => {
    if (done) return; // cancelled or timed out: a late phrase is ignored
    const text = e.results[0]?.[0]?.transcript?.trim();
    finish(text ? undefined : 'no-speech');
    if (text) onPhrase(text);
  };
  r.onnomatch = () => finish('no-match');
  r.onerror = (e) => finish(e.error || 'error');
  r.onend = () => finish('no-speech');
  onState(true);
  try {
    r.start();
  } catch (e) {
    finish(String((e as Error)?.message ?? e));
  }
}

/** What to tell the user when listening ended without a phrase (null: nothing to say, e.g. they cancelled). */
export function voiceErrorText(err: string | undefined): string | null {
  if (!err || err === 'aborted') return null;
  if (err === 'timeout' || err === 'no-speech' || err === 'no-match') return "Didn't catch that: try again, a bit louder";
  if (err === 'not-allowed' || err === 'service-not-allowed') return 'Microphone blocked: allow it for this site';
  if (err === 'audio-capture') return 'No microphone found';
  if (err === 'network') return 'Speech service unreachable (network)';
  return `Voice error: ${err}`;
}
