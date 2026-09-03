/**
 * The synthesized monitor feed.
 *
 * BMAT cannot reach live broadcast streams from this environment, so the audio
 * widget plays a locally generated stand-in for a station's incoming feed. It is
 * real Web Audio: the same `AnalyserNode` that feeds the waveform visualizer is
 * in the signal path, so the picture on screen is the sound you hear rather than
 * an animation running beside it.
 *
 * Swap `start()` for a `<audio src={station.streamUrl}>` + `createMediaElementSource`
 * when stream capture is available — nothing downstream changes.
 */

export interface MonitorFeedOptions {
  /** 0..1 */
  volume?: number;
  /** Seed-ish offset so two stations do not sound identical. */
  seed?: number;
}

export function audioContextAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof AudioContext !== "undefined"
  );
}

export class MonitorFeed {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private master: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private volume: number;
  private seed: number;
  private started = false;

  constructor(options: MonitorFeedOptions = {}) {
    this.volume = options.volume ?? 0.12;
    this.seed = options.seed ?? 1;
  }

  get playing(): boolean {
    return this.started;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  async start(): Promise<boolean> {
    if (this.started) return true;
    if (!audioContextAvailable()) return false;

    try {
      const ctx = this.ctx ?? new AudioContext();
      this.ctx = ctx;

      if (ctx.state === "suspended") await ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;

      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(analyser);
      analyser.connect(ctx.destination);

      this.analyser = analyser;
      this.master = master;

      this.buildNoise(ctx, master);
      this.buildTone(ctx, master, 110 * this.seed, 0.05);
      this.buildTone(ctx, master, 164.8 * this.seed, 0.032);
      this.buildTone(ctx, master, 220 * this.seed, 0.02);

      // Short fade-in so it does not click.
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 0.35);

      this.started = true;
      return true;
    } catch {
      this.teardown();
      return false;
    }
  }

  /** Filtered noise bed — the "room" of a broadcast feed. */
  private buildNoise(ctx: AudioContext, destination: AudioNode): void {
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Paul Kellet's pink-noise approximation: closer to broadcast hiss than white.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;

    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900 * this.seed;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0.5;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start();

    this.sources.push(source);
  }

  /** One sustained partial with a slow amplitude LFO. */
  private buildTone(ctx: AudioContext, destination: AudioNode, hz: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;

    const gain = ctx.createGain();
    gain.gain.value = level;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07 * this.seed;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = level * 0.8;

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    osc.connect(gain);
    gain.connect(destination);

    osc.start();
    lfo.start();

    this.sources.push(osc, lfo);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(this.volume, this.ctx.currentTime + 0.08);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  stop(): void {
    if (!this.ctx || !this.master) {
      this.teardown();
      return;
    }

    const ctx = this.ctx;
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);

    // Let the fade-out finish before tearing the graph down.
    const sources = this.sources;
    const context = ctx;
    window.setTimeout(() => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // already stopped
        }
      }
      void context.close().catch(() => undefined);
    }, 140);

    this.sources = [];
    this.master = null;
    this.analyser = null;
    this.ctx = null;
    this.started = false;
  }

  private teardown(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    void this.ctx?.close().catch(() => undefined);
    this.sources = [];
    this.master = null;
    this.analyser = null;
    this.ctx = null;
    this.started = false;
  }
}
