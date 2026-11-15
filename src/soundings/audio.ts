const RECORDING = '/audio/humpback.mp3';

/** Unlock from the same input event that starts the dock check or enters XR. */
export class SoundingsAudio {
  private context: AudioContext | null = null;
  private buffer: Promise<AudioBuffer> | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private playback = 0;
  muted = false;

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.muted ? 0 : 0.8;
      this.gain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(value ? 0 : 0.8, this.context.currentTime, 0.015);
    }
  }

  async recover(): Promise<boolean> {
    this.reset();
    const playback = this.playback;
    try {
      await this.unlock();
      const context = this.context!;
      if (!this.buffer) {
        this.buffer = fetch(RECORDING).then(async (response) => {
          if (!response.ok) throw new Error('Hydrophone audio unavailable');
          return context.decodeAudioData(await response.arrayBuffer());
        });
      }
      const decoded = await this.buffer;
      if (playback !== this.playback) return false;
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(this.gain!);
      this.source = source;
      source.onended = () => {
        source.disconnect();
        if (this.source === source) this.source = null;
      };
      source.start();
      return true;
    } catch {
      this.buffer = null;
      return false;
    }
  }

  reset(): void {
    this.playback++;
    if (this.source) {
      this.source.stop();
      this.source = null;
    }
  }

  dispose(): void {
    this.reset();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.buffer = null;
  }
}
