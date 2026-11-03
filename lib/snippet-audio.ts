/**
 * Client-side synthesis of a 10-second "evidence snippet" for chart rows and
 * monitor pings. No audio assets ship with the site: a short melody + bass
 * pulse is rendered from the row's seed so each track audibly differs.
 *
 * Browser only — imported exclusively from client components.
 */

const PENTA = [0, 3, 5, 7, 10];

function hashOf(seed: string, salt: number): number {
  let hash = salt;
  for (const char of seed) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 97;
  return hash;
}

/** Map a seed string to a deterministic root note + pentatonic scale. */
export function snippetScale(seed: string): { root: number; offsets: number[] } {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
  const root = 220 * Math.pow(2, (hash % 12) / 12);
  return { root, offsets: PENTA };
}

export interface SnippetHandle {
  stop: () => void;
}

let activeContext: AudioContext | null = null;
let activeHandle: SnippetHandle | null = null;

/**
 * Play a ~10s snippet for `seed`. Playing a new snippet stops the current
 * one. Returns null in non-browser environments.
 */
export function playSnippet(seed: string): SnippetHandle | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  const context = activeContext ?? (activeContext = new AudioCtx());
  if (context.state === "suspended") void context.resume();
  const now = context.currentTime;
  const { root, offsets } = snippetScale(seed);

  activeHandle?.stop();

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.5, now + 0.02);
  master.gain.setValueAtTime(0.5, now + 8.5);
  master.gain.linearRampToValueAtTime(0.0001, now + 10);
  master.connect(context.destination);

  const sources: OscillatorNode[] = [];
  const beats = 20; // 10s at 2 beats/sec
  for (let i = 0; i < beats; i += 1) {
    const t = now + (i / beats) * 10;
    // Melody pluck on odd beats, deterministic step from the seed
    if (i % 2 === 1) {
      const step = PENTA[(i * 2 + hashOf(seed, 7)) % offsets.length] ?? 0;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(root * Math.pow(2, step / 12), t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.32, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.45);
      sources.push(osc);
    }
    // Bass pulse every beat
    const bass = context.createOscillator();
    const bassGain = context.createGain();
    bass.type = "sine";
    bass.frequency.setValueAtTime(root / 4, t);
    bassGain.gain.setValueAtTime(0.0001, t);
    bassGain.gain.linearRampToValueAtTime(0.25, t + 0.01);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    bass.connect(bassGain).connect(master);
    bass.start(t);
    bass.stop(t + 0.45);
    sources.push(bass);
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const osc of sources) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    try {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0.0001, context.currentTime);
    } catch {
      /* noop */
    }
    if (activeHandle === handle) activeHandle = null;
  };
  const handle: SnippetHandle = { stop };
  activeHandle = handle;
  return handle;
}

export function isSnippetPlaying(): boolean {
  return activeHandle !== null;
}
