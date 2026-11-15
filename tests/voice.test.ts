// "Say a world": listening always ends (result, error, cancel, or timeout), so the button never sticks on
// "Listening…" and the next press works. A fake recognizer stands in for the browser's.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

class FakeRec {
  static last: FakeRec | null = null;
  static count = 0;
  lang = '';
  interimResults = true;
  maxAlternatives = 0;
  continuous = true;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  onnomatch: (() => void) | null = null;
  started = false;
  aborted = false;
  constructor() {
    FakeRec.last = this;
    FakeRec.count++;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.aborted = true;
    this.onerror?.({ error: 'aborted' });
    this.onend?.();
  }
  say(text: string) {
    this.onresult?.({ results: [[{ transcript: text }]] });
    this.onend?.();
  }
}

let voice: typeof import('../src/ui/voice');
beforeAll(async () => {
  vi.stubGlobal('webkitSpeechRecognition', FakeRec);
  voice = await import('../src/ui/voice');
});
afterEach(() => {
  voice.stopListening();
  vi.useRealTimers();
});

function listen() {
  const states: [boolean, string | undefined][] = [];
  const phrases: string[] = [];
  voice.listenOnce((t) => phrases.push(t), (on, err) => states.push([on, err]), 8000);
  return { states, phrases, rec: FakeRec.last! };
}

describe('Say a world', () => {
  it('a spoken phrase becomes the world; listening ends once', () => {
    const { states, phrases, rec } = listen();
    expect(voice.isListening()).toBe(true);
    rec.say('a rainy street');
    expect(phrases).toEqual(['a rainy street']);
    expect(states).toEqual([[true, undefined], [false, undefined]]);
    expect(voice.isListening()).toBe(false);
  });

  it('a recognizer that never answers times out instead of sticking on "Listening", and the next press works', () => {
    vi.useFakeTimers();
    const a = listen();
    vi.advanceTimersByTime(7999);
    expect(voice.isListening()).toBe(true);
    vi.advanceTimersByTime(2);
    expect(a.states).toEqual([[true, undefined], [false, 'timeout']]);
    expect(voice.isListening()).toBe(false);
    const b = listen();
    expect(b.rec).not.toBe(a.rec);
    b.rec.say('the moon');
    expect(b.phrases).toEqual(['the moon']);
  });

  it('pressing again while listening cancels (no phrase), and the press after that listens again', () => {
    const a = listen();
    const before = FakeRec.count;
    voice.listenOnce(() => {}, () => {}); // second press: toggle off
    expect(FakeRec.count).toBe(before); // no new recognizer
    expect(a.states.at(-1)).toEqual([false, 'aborted']);
    expect(voice.isListening()).toBe(false);
    const b = listen();
    expect(b.states).toEqual([[true, undefined]]);
  });

  it('picking a preset world while listening cancels it; a later phrase from it is ignored', () => {
    const a = listen();
    voice.stopListening();
    expect(a.states).toEqual([[true, undefined], [false, 'aborted']]);
    a.rec.say('late phrase');
    expect(a.phrases).toEqual([]);
    expect(a.states.length).toBe(2);
  });

  it('errors end listening with a reason the user can read', () => {
    const a = listen();
    a.rec.onerror?.({ error: 'not-allowed' });
    a.rec.onend?.();
    expect(a.states).toEqual([[true, undefined], [false, 'not-allowed']]);
    expect(voice.voiceErrorText('not-allowed')).toBe('Microphone blocked: allow it for this site');
    expect(voice.voiceErrorText('timeout')).toBe("Didn't catch that: try again, a bit louder");
    expect(voice.voiceErrorText('aborted')).toBeNull();
    expect(voice.voiceErrorText(undefined)).toBeNull();
  });

  it('the browser ending on its own without a phrase counts as "no speech"', () => {
    const a = listen();
    a.rec.onend?.();
    expect(a.states).toEqual([[true, undefined], [false, 'no-speech']]);
  });
});
