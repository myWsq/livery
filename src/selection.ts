/**
 * What is on screen: which entry of the design list, under which lighting
 * environment. Holds the design list itself, stepping through both lists, the keys
 * that ask for it, and the address fragment that names it. Browser only, but free of
 * the DOM: the renderer reads the keys and the address and hands them in.
 */
import { ENVIRONMENTS, environmentById, type EnvironmentId } from "./environments.ts";
import { BARE_CAR, type DesignSet } from "./wardrobe.ts";

/** The environment an address asks for when it names none, or none that exists. */
export const DEFAULT_ENVIRONMENT: EnvironmentId = "day";

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

/** What an address fragment asks for. */
export interface ResolvedFragment {
  /** The entry of the design list. */
  readonly id: string;
  readonly environment: EnvironmentId;
  /** The address names something that does not exist and should be rewritten. */
  readonly rewrite: boolean;
}

/**
 * What an address fragment (`location.hash`, with or without its `#`) asks for. The
 * fragment is `<design>@<environment>`, split at its last `@`; without an `@` it has
 * no environment part.
 *
 * The design part names an entry, encoded. An empty one gives the first entry; one
 * that names nothing, or cannot be decoded, gives the first entry and asks for a
 * rewrite. A missing environment part gives the default environment; one that names
 * no environment gives the default and asks for a rewrite. An empty fragment gives
 * the first entry under the default environment and the address can stay as it is.
 */
export function resolveFragment(hash: string, entries: readonly string[]): ResolvedFragment {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const at = fragment.lastIndexOf("@");
  const design = resolveDesign(at < 0 ? fragment : fragment.slice(0, at), entries);
  if (at < 0) return { ...design, environment: DEFAULT_ENVIRONMENT };
  const named = decoded(fragment.slice(at + 1));
  const environment = named === undefined ? undefined : environmentById(named);
  return {
    id: design.id,
    environment: environment?.id ?? DEFAULT_ENVIRONMENT,
    rewrite: design.rewrite || environment === undefined,
  };
}

function resolveDesign(part: string, entries: readonly string[]) {
  if (part === "") return { id: entries[0], rewrite: false };
  const id = decoded(part);
  if (id !== undefined && entries.includes(id)) return { id, rewrite: false };
  return { id: entries[0], rewrite: true };
}

/** A fragment part decoded, or undefined for a malformed escape: it names nothing. */
function decoded(part: string): string | undefined {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
}

/** The address fragment that names an entry under an environment. */
export function fragmentOf(id: string, environment: EnvironmentId): string {
  return `#${encodeURIComponent(id)}@${environment}`;
}

/** The entry `step` places after `id`, wrapping at both ends. */
export function stepEntry(entries: readonly string[], id: string, step: number): string {
  const at = Math.max(0, entries.indexOf(id));
  const count = entries.length;
  return entries[(((at + step) % count) + count) % count];
}

/**
 * The environment `step` (1 or -1) places after `id` in list order, wrapping at both
 * ends and passing over those `skip` names; `id` itself when every other is skipped.
 */
export function stepEnvironment(
  id: EnvironmentId,
  step: number,
  skip: (id: EnvironmentId) => boolean,
): EnvironmentId {
  const count = ENVIRONMENTS.length;
  let at = Math.max(
    0,
    ENVIRONMENTS.findIndex((environment) => environment.id === id),
  );
  for (let tried = 1; tried < count; tried++) {
    at = (((at + step) % count) + count) % count;
    if (!skip(ENVIRONMENTS[at].id)) return ENVIRONMENTS[at].id;
  }
  return id;
}

/** What a key press asks for: a step through the designs or the environments, or a turn. */
export interface KeyAction {
  readonly kind: "design" | "environment" | "turn";
  readonly step: 1 | -1;
}

/**
 * The action a key press asks for: `→`/`←` the next or previous design, `↓`/`↑` the
 * next or previous environment, `]`/`[` a turn of the environment one way or the
 * other. Undefined for any other key, and for any key with a modifier held.
 */
export function actionOfKey(event: {
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): KeyAction | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  if (event.key === "ArrowRight") return { kind: "design", step: 1 };
  if (event.key === "ArrowLeft") return { kind: "design", step: -1 };
  if (event.key === "ArrowDown") return { kind: "environment", step: 1 };
  if (event.key === "ArrowUp") return { kind: "environment", step: -1 };
  if (event.code === "BracketRight") return { kind: "turn", step: 1 };
  if (event.code === "BracketLeft") return { kind: "turn", step: -1 };
  return undefined;
}
