/**
 * The film of every design, held ready on the GPU, and the one design the car wears.
 *
 * Every design the wardrobe is told about keeps a texture for each artboard it has,
 * whether or not it is worn, so putting a design on is a single binding call and
 * never waits for a rasterisation. Artboards are rasterised one at a time, those of
 * the worn design first.
 *
 * Shared by the browser app and the Node scripts. Rasterising SVG text is the one
 * step that differs between them, so it is passed in.
 */
import type { Gpu, Texture } from "vgpu";

import {
  createArtboardTexture,
  type ArtboardRaster,
  type DesignSources,
  type RasterizeArtboard,
} from "./artboards.ts";
import { VIEWS, type View } from "./frames.ts";
import { bindArtboard, bindArtboards, runCleanups, type Scene } from "./scene.ts";

/**
 * The id of the bare car, wherever a design name could stand. It starts with `_`, so
 * no design can take it.
 */
export const BARE_CAR = "_bare";

/** Whether a directory under `designs/` names a design: names starting with `_` are reserved. */
export function isDesignName(name: string): boolean {
  return name !== "" && !name.startsWith("_");
}

/** Every design by name, in the order they are listed, with its artboards as SVG text. */
export type DesignSet = ReadonlyMap<string, DesignSources>;

export interface WardrobeOptions {
  readonly rasterize: RasterizeArtboard;
  /**
   * Called with the worn design and its artboards that cannot be shown, by view:
   * whenever a design is put on, and again whenever its problems change. `design` is
   * undefined, and `problems` empty, for the bare car.
   */
  readonly report?: (design: string | undefined, problems: ReadonlyMap<View, string>) => void;
  /** Called whenever an artboard of any design has new film, with the raster it came from. */
  readonly onFilm?: (design: string, view: View, raster: ArtboardRaster) => void;
}

/** One artboard of one design. */
interface Artboard {
  /** The SVG text it was last given; undefined while the design has no such file. */
  svg: string | undefined;
  /** Counts every change of `svg`, so that a late result can tell it is out of date. */
  ticket: number;
  /** Whether `svg` still has to be rasterised. */
  pending: boolean;
  /** The film made from the last source that rasterised, if any. */
  film: Texture | undefined;
  /** Why the last source did not rasterise; cleared by a good one. */
  problem: string | undefined;
}

interface Design {
  readonly name: string;
  readonly artboards: Record<View, Artboard>;
}

export function createWardrobe(gpu: Gpu, scene: Scene, options: WardrobeOptions) {
  const { rasterize, report, onFilm } = options;
  let designs = new Map<string, Design>();
  let worn: string | undefined;
  let busy = false;
  let disposed = false;
  let waiters: (() => void)[] = [];

  function createDesign(name: string): Design {
    const artboards = {} as Record<View, Artboard>;
    for (const view of VIEWS) {
      artboards[view] = {
        svg: undefined,
        ticket: 0,
        pending: false,
        film: undefined,
        problem: undefined,
      };
    }
    return { name, artboards };
  }

  function isWorn(design: Design): boolean {
    return worn === design.name && designs.get(design.name) === design;
  }

  function filmOf(design: Design | undefined): Partial<Record<View, Texture>> {
    const film: Partial<Record<View, Texture>> = {};
    if (!design) return film;
    for (const view of VIEWS) {
      const texture = design.artboards[view].film;
      if (texture) film[view] = texture;
    }
    return film;
  }

  function problemsOf(design: Design | undefined): Map<View, string> {
    const problems = new Map<View, string>();
    if (!design) return problems;
    for (const view of VIEWS) {
      const problem = design.artboards[view].problem;
      if (problem !== undefined) problems.set(view, problem);
    }
    return problems;
  }

  function reportWorn(): void {
    report?.(worn, problemsOf(worn === undefined ? undefined : designs.get(worn)));
  }

  /** Puts `film` on a view, binding it before the texture it replaces is destroyed. */
  function replaceFilm(design: Design, view: View, film: Texture | undefined): void {
    const artboard = design.artboards[view];
    const previous = artboard.film;
    if (previous === film) return;
    if (isWorn(design)) bindArtboard(scene, view, film);
    artboard.film = film;
    previous?.destroy();
  }

  /** Brings a design's artboards in step with its sources; true if its problems changed. */
  function updateDesign(design: Design, sources: DesignSources): boolean {
    let problemsChanged = false;
    for (const view of VIEWS) {
      const artboard = design.artboards[view];
      const svg = sources[view];
      if (svg === artboard.svg) continue;
      artboard.svg = svg;
      artboard.ticket++;
      artboard.pending = svg !== undefined;
      if (svg === undefined) {
        // The file is gone: so are its film and whatever was wrong with it.
        replaceFilm(design, view, undefined);
        if (artboard.problem !== undefined) problemsChanged = true;
        artboard.problem = undefined;
      }
    }
    return problemsChanged;
  }

  /** Destroys a design's film and drops its work; a result in flight for it is discarded. */
  function removeDesign(design: Design): void {
    const cleanups: (() => void)[] = [];
    for (const view of VIEWS) {
      const artboard = design.artboards[view];
      artboard.ticket++;
      artboard.pending = false;
      const film = artboard.film;
      artboard.film = undefined;
      if (film) cleanups.push(() => film.destroy());
    }
    runCleanups(cleanups);
  }

  /** The next artboard to rasterise: the worn design's first, then in the order given. */
  function nextPending(): { design: Design; view: View } | undefined {
    const wornDesign = worn === undefined ? undefined : designs.get(worn);
    for (const design of wornDesign ? [wornDesign, ...designs.values()] : designs.values()) {
      for (const view of VIEWS) {
        if (design.artboards[view].pending) return { design, view };
      }
    }
    return undefined;
  }

  function settle(): void {
    const settled = waiters;
    waiters = [];
    for (const resolve of settled) resolve();
  }

  /** Rasterises pending artboards, one at a time, until none is left. */
  function pump(): void {
    if (busy) return;
    const next = disposed ? undefined : nextPending();
    if (!next) {
      settle();
      return;
    }
    const { design, view } = next;
    const artboard = design.artboards[view];
    const svg = artboard.svg!;
    const ticket = artboard.ticket;
    artboard.pending = false;
    busy = true;
    // One at a time: rasterising a large artboard is heavy, and frames should keep
    // flowing between them.
    void Promise.resolve()
      .then(() => rasterize(svg, view))
      .then(
        (raster) => finish(design, view, ticket, raster, undefined),
        (error: unknown) => finish(design, view, ticket, undefined, error),
      )
      .finally(() => {
        busy = false;
        pump();
      });
  }

  /** Makes film from a raster and puts it in place; returns why it could not, if so. */
  function applyFilm(design: Design, view: View, raster: ArtboardRaster): string | undefined {
    let film: Texture | undefined;
    try {
      film = createArtboardTexture(gpu, raster);
      replaceFilm(design, view, film);
    } catch (error) {
      // The artboard keeps its previous film.
      if (film && design.artboards[view].film !== film) film.destroy();
      return messageOf(error);
    }
    onFilm?.(design.name, view, raster);
    return undefined;
  }

  /** Takes a rasterisation's result, unless the design or the source has moved on. */
  function finish(
    design: Design,
    view: View,
    ticket: number,
    raster: ArtboardRaster | undefined,
    error: unknown,
  ): void {
    const artboard = design.artboards[view];
    // Disposed, the design left the set, or a newer source has taken over.
    if (disposed || designs.get(design.name) !== design || artboard.ticket !== ticket) return;
    const problem = raster ? applyFilm(design, view, raster) : messageOf(error);
    if (problem === artboard.problem) return;
    artboard.problem = problem;
    if (isWorn(design)) reportWorn();
  }

  return {
    /**
     * Tells the wardrobe every design there now is, in the order to list them. A new
     * design or a changed artboard is rasterised in the background; a design that is
     * gone loses its film, after the car has been dressed bare if it was worn.
     */
    setDesigns(next: DesignSet): void {
      if (disposed) return;
      const previous = designs;
      const gone = [...previous.values()].filter((design) => !next.has(design.name));
      const wornGone = gone.find((design) => design.name === worn);
      if (wornGone) bindArtboards(scene, {});
      designs = new Map();
      for (const name of next.keys()) designs.set(name, previous.get(name) ?? createDesign(name));
      runCleanups(gone.map((design) => () => removeDesign(design)));
      let wornProblemsChanged = wornGone !== undefined && problemsOf(wornGone).size > 0;
      for (const [name, sources] of next) {
        const design = designs.get(name)!;
        if (updateDesign(design, sources) && name === worn) wornProblemsChanged = true;
      }
      if (wornProblemsChanged) reportWorn();
      pump();
    },

    /**
     * Puts a design on the car, or none for the bare car: all five views in one call,
     * with whatever film the design has so far. A design not in the set yet is worn
     * as soon as it arrives.
     */
    wear(design: string | undefined): void {
      if (disposed) return;
      worn = design;
      bindArtboards(scene, filmOf(design === undefined ? undefined : designs.get(design)));
      reportWorn();
    },

    /** Resolves once no artboard is waiting to be rasterised or being rasterised. */
    settled(): Promise<void> {
      if (disposed || (!busy && !nextPending())) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },

    /** Dresses the car bare and destroys every texture the wardrobe holds. */
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const held = [...designs.values()];
      designs = new Map();
      runCleanups([
        () => bindArtboards(scene, {}),
        ...held.map((design) => () => removeDesign(design)),
        settle,
      ]);
    },
  };
}

export type Wardrobe = ReturnType<typeof createWardrobe>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
