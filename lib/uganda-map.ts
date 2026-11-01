import type { Region } from "@/lib/regions";

/**
 * Generalised Uganda outline: Natural Earth 1:110m (public domain), via
 * https://github.com/johan/world.geo.json/blob/master/countries/UGA.geo.json
 * Internal divisions below are an original SCHEMATIC, not administrative boundaries.
 */
export const UGANDA_OUTLINE =
  "M201.6,396.9 L124.9,396.0 L100.3,404.4 L58.5,426.0 L41.6,418.9 L42.1,366.1 L58.4,339.4 L62.3,283.2 L77.0,250.6 L103.8,214.1 L130.7,195.5 L153.2,170.7 L125.1,161.2 L129.4,79.4 L158.2,60.3 L202.7,75.9 L259.0,59.5 L308.3,59.7 L351.4,27.5 L384.5,76.1 L392.7,111.2 L423.5,191.6 L398.0,242.6 L363.6,288.9 L343.5,317.3 L344.3,391.5 L201.6,396.9 Z";
export const REGION_PATHS: Record<Region, string> = {
  Northern:
    "M0 0 H460 V170 L310 185 L260 180 L235 190 L180 190 L145 165 L90 175 L0 175 Z",
  Eastern:
    "M460 170 L310 185 L260 180 L235 190 L240 230 L275 260 L270 295 L315 340 L460 340 Z",
  Central:
    "M235 190 L240 230 L275 260 L270 295 L315 340 L460 340 V460 H170 L170 380 L190 325 L185 285 L175 250 L200 220 Z",
  Western:
    "M0 175 L90 175 L145 165 L180 190 L235 190 L200 220 L175 250 L185 285 L190 325 L170 380 L170 460 H0 Z",
};
export const REGION_LABELS: Record<
  Region,
  { x: number; y: number; hub: string }
> = {
  Northern: { x: 257, y: 117, hub: "Gulu · Lira" },
  Eastern: { x: 321, y: 251, hub: "Jinja · Mbale" },
  Central: { x: 238, y: 354, hub: "Kampala" },
  Western: { x: 123, y: 291, hub: "Mbarara" },
};
