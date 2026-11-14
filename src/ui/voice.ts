// Polish: a spoken phrase becomes a custom world. Feature-detected; buttons remain the baseline.
type Rec = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

const Ctor = (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;

export const voiceSupported = typeof Ctor === 'function';

export function listenOnce(onPhrase: (text: string) => void, onState: (listening: boolean, err?: string) => void): void {
  if (!voiceSupported) return;
  const r: Rec = new Ctor();
  r.lang = 'en-US';
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript?.trim();
    if (text) onPhrase(text);
  };
  r.onerror = (e) => onState(false, e.error);
  r.onend = () => onState(false);
  onState(true);
  r.start();
}
