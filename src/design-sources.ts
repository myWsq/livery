/**
 * The design files, as the Vite bundle carries them. Browser only: every artboard of
 * every design under `designs/` is imported as text, so a production build shows the
 * designs with no server behind it.
 */
import type { DesignSources } from "./artboards.ts";
import { VIEWS, type View } from "./frames.ts";
import { isDesignName, type DesignSet } from "./wardrobe.ts";

const files = import.meta.glob<string>("../designs/*/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

function isView(name: string): name is View {
  return (VIEWS as readonly string[]).includes(name);
}

/**
 * Groups the artboard files by design. Only the five artboard names count; reserved
 * directories, and directories left with no artboard, are not designs.
 */
function collectDesigns(): DesignSet {
  const found = new Map<string, DesignSources>();
  for (const [path, svg] of Object.entries(files)) {
    const match = /\/designs\/([^/]+)\/([^/]+)\.svg$/.exec(path);
    if (!match) continue;
    const [, design, view] = match;
    if (!isDesignName(design) || !isView(view)) continue;
    let sources = found.get(design);
    if (!sources) found.set(design, (sources = {}));
    sources[view] = svg;
  }
  // Plain code-unit order, not the locale's: the same order on every machine.
  const names = [...found.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return new Map(names.map((name) => [name, found.get(name)!]));
}

/** Every design in the repository, sorted by name, with its artboards as SVG text. */
export const designs: DesignSet = collectDesigns();

type Listener = (designs: DesignSet) => void;

/**
 * Calls `listener` with the fresh set of all designs whenever an artboard file is
 * saved, created or deleted while the dev server runs. Returns a function that stops
 * it. Does nothing in a production build, where the designs cannot change.
 */
export function watchDesigns(listener: Listener): () => void {
  const hot = import.meta.hot;
  if (!hot) return () => {};
  // `hot.data` outlives this module instance, so listeners survive each update.
  const listeners: Set<Listener> = (hot.data.listeners ??= new Set<Listener>());
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (import.meta.hot) {
  // Saving, creating or deleting a design file re-evaluates this module only, because
  // the `livery:watch-designs` plugin in `vite.config.ts` hands every such change to
  // this module alone. Accepting the update here keeps it from spreading to the
  // renderer, so the page never reloads: the device, the baked sky and the camera stay
  // as they are, and only the listeners hear of it.
  import.meta.hot.accept((next) => {
    const listeners: Set<Listener> | undefined = import.meta.hot?.data.listeners;
    if (!next || !listeners) return;
    const fresh = next.designs as DesignSet;
    for (const listener of listeners) listener(fresh);
  });
}
