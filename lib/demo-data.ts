/** Explicit fiction for interaction previews. Never imported by catalogue, capture, royalty or outbox repositories. */
export const DEMO_RECORDINGS = [
  { id: "demo-mulongo", title: "Mulongo", artist: "Mukisa Collective" },
  { id: "demo-kampala-nights", title: "Kampala Nights", artist: "Ray Bwete" },
] as const;
export const DEMO_ORGANISATION = "UPRS";
export const DEMO_SAMPLE_URL = "/demo/east-sound-sample.wav";
export interface DemoSpin {
  id: string;
  source: "demo";
  title: string;
  artist: string;
  station: string;
  location: string;
  at: string;
}
export function demoAlert(spin: DemoSpin) {
  return `🔥 Airplay Alert! '${spin.title}' just played on ${spin.station} (${spin.location})`;
}
