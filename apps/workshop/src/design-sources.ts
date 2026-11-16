/**
 * The design files, as the Vite bundle carries them. Browser only: every artboard of
 * every design under `designs/` is imported as text, so a production build shows the
 * design with no server behind it.
 */
import type { DesignSources } from "./artboards.ts";
import { VIEWS } from "./frames.ts";

/** The design the workshop shows. */
export const DESIGN = "calibration";

const files = import.meta.glob<string>("../../../designs/*/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The artboards of a design as SVG text; a view without a file is left out. */
export function designSources(design: string): DesignSources {
  const sources: DesignSources = {};
  for (const view of VIEWS) {
    const svg = files[`../../../designs/${design}/${view}.svg`];
    if (svg !== undefined) sources[view] = svg;
  }
  return sources;
}
