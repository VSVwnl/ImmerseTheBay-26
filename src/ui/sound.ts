// Tiny WebAudio feedback tones. No asset files.
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
  }
  void ctx?.resume();
}

function tone(freq: number, startS: number, durS: number, gain = 0.15, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const t0 = ctx.currentTime + startS;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + durS + 0.02);
}

export const sfx = {
  tick: () => tone(660, 0, 0.12, 0.1),
  go: () => tone(990, 0, 0.25, 0.14),
  ding: () => tone(1320, 0, 0.15, 0.1),
  success: () => {
    tone(784, 0, 0.18);
    tone(988, 0.12, 0.18);
    tone(1319, 0.24, 0.35);
  },
  fail: () => {
    tone(330, 0, 0.25, 0.12, 'triangle');
    tone(247, 0.2, 0.4, 0.12, 'triangle');
  },
  click: () => tone(1800, 0, 0.04, 0.06, 'square'),
  /** a failed grab: the tool slips */
  slip: () => {
    tone(420, 0, 0.07, 0.1, 'sawtooth');
    tone(250, 0.06, 0.16, 0.1, 'sawtooth');
  },
};
