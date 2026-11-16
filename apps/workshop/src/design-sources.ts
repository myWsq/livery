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

interface Watcher {
  readonly design: string;
  readonly listener: (sources: DesignSources) => void;
}

/**
 * Calls `listener` with a design's fresh sources whenever one of its files is saved
 * while the dev server runs. Returns a function that stops it. Does nothing in a
 * production build, where the design cannot change.
 */
export function watchDesign(
  design: string,
  listener: (sources: DesignSources) => void,
): () => void {
  const hot = import.meta.hot;
  if (!hot) return () => {};
  // `hot.data` outlives this module instance, so watchers survive each update.
  const watchers: Set<Watcher> = (hot.data.watchers ??= new Set<Watcher>());
  const watcher: Watcher = { design, listener };
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

if (import.meta.hot) {
  // Saving a design file re-evaluates this module only. Accepting the update here
  // keeps it from spreading to the renderer, so the page never reloads: the device,
  // the baked sky and the camera stay as they are, and only the watchers hear of it.
  import.meta.hot.accept((next) => {
    const watchers: Set<Watcher> | undefined = import.meta.hot?.data.watchers;
    if (!next || !watchers) return;
    const fresh = next.designSources as typeof designSources;
    for (const watcher of watchers) watcher.listener(fresh(watcher.design));
  });
}
