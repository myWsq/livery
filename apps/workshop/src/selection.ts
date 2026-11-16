/**
 * Which entry of the design list is on screen: the list itself, stepping through it,
 * and the address fragment that names an entry. Browser only, but free of the DOM:
 * the renderer reads the keys and the address and hands them in.
 */
import { BARE_CAR, type DesignSet } from "./wardrobe.ts";

/**
 * The ids of everything that can be shown, in order: each design by name, then the
 * bare car.
 */
export function entriesOf(designs: DesignSet): string[] {
  return [...designs.keys(), BARE_CAR];
}

/** The design an entry puts on the car; undefined for the bare car. */
export function designOf(id: string): string | undefined {
  return id === BARE_CAR ? undefined : id;
}

/**
 * The entry an address fragment (`location.hash`, with or without its `#`) asks for.
 * A fragment that names an entry gives it. An empty one gives the first entry and the
 * address can stay as it is; one that names nothing, or cannot be decoded, gives the
 * first entry and the address should be rewritten to name it.
 */
export function resolveFragment(
  hash: string,
  entries: readonly string[],
): { id: string; rewrite: boolean } {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (fragment === "") return { id: entries[0], rewrite: false };
  let id: string | undefined;
  try {
    id = decodeURIComponent(fragment);
  } catch {
    // A malformed escape: it names nothing.
  }
  if (id !== undefined && entries.includes(id)) return { id, rewrite: false };
  return { id: entries[0], rewrite: true };
}

/** The address fragment that names an entry. */
export function fragmentOf(id: string): string {
  return `#${encodeURIComponent(id)}`;
}

/** The entry `step` places after `id`, wrapping at both ends. */
export function stepEntry(entries: readonly string[], id: string, step: number): string {
  const at = Math.max(0, entries.indexOf(id));
  const count = entries.length;
  return entries[(((at + step) % count) + count) % count];
}

/** The step a key press asks for: 1 for `→`, -1 for `←`, 0 for anything else or with a modifier. */
export function stepOfKey(event: {
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): number {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return 0;
  if (event.key === "ArrowRight") return 1;
  if (event.key === "ArrowLeft") return -1;
  return 0;
}
