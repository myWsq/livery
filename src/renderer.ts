import { frameLoop, surface, type Gpu } from "vgpu";

import { cameraView, clampOrbit, initialOrbit } from "./camera.ts";
import { loadCarModel } from "./car/index.ts";
import { designs, watchDesigns } from "./design-sources.ts";
import { fetchEnvironment } from "./environment-sources.ts";
import { ENVIRONMENTS, environmentById, type EnvironmentId } from "./environments.ts";
import type { View } from "./frames.ts";
import { decodeHdr } from "./hdr.ts";
import { rasterizeArtboard } from "./rasterize.ts";
import {
  aspectOf,
  createEnvironmentTexture,
  createScene,
  render,
  replaceHdr,
  runCleanups,
  setEnvironment,
  setEnvironmentTurn,
  type EnvironmentTexture,
} from "./scene.ts";
import {
  actionOfKey,
  designOf,
  entriesOf,
  fragmentOf,
  resolveFragment,
  stepEntry,
  stepEnvironment,
} from "./selection.ts";
import { sceneShaders } from "./shaders.ts";
import { createWardrobe, type Wardrobe } from "./wardrobe.ts";

/** How far `[` and `]` turn the environment about the car. */
const TURN_STEP = Math.PI / 4;

/** What is on screen: an entry of the design list under a lighting environment. */
export interface Selection {
  /** The design the car wears; undefined for the bare car. */
  readonly design: string | undefined;
  /** Its place in the list, counting from 0. */
  readonly index: number;
  /** How many entries the list has, the bare car included. */
  readonly total: number;
  readonly environment: {
    readonly id: EnvironmentId;
    /** The name shown to the owner. */
    readonly name: string;
    /** Its place in the list of environments, counting from 0. */
    readonly index: number;
    readonly total: number;
  };
}

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** Called whenever the selection, or the design list around it, changes. */
  readonly onSelection?: (selection: Selection) => void;
  /**
   * Called with the worn design's artboards that currently cannot be shown and why,
   * whenever a design is put on and each time that set may have changed. Empty when
   * every artboard is fine, and for the bare car (`design` undefined).
   */
  readonly onArtboardProblems?: (
    design: string | undefined,
    problems: ReadonlyMap<View, string>,
  ) => void;
  /**
   * Called once for each environment that cannot be loaded, with why. A failed
   * environment stays failed until the page is loaded again.
   */
  readonly onEnvironmentFailure?: (environment: EnvironmentId, message: string) => void;
}

export function createRenderer({
  canvas,
  onSelection,
  onArtboardProblems,
  onEnvironmentFailure,
}: RendererOptions) {
  let disposed = false;
  let failed = false;
  let gpu: Gpu | undefined;
  let input: ReturnType<typeof installOrbitInput> | undefined;
  let loop: { stop(): void } | undefined;
  let unsubscribeResize: (() => void) | undefined;
  let stopWatchingDesigns: (() => void) | undefined;
  let wardrobe: Wardrobe | undefined;
  let windowEvents: AbortController | undefined;
  /** Every environment loaded so far, kept until the renderer is disposed. */
  const environmentTextures = new Map<EnvironmentId, EnvironmentTexture>();

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    runCleanups([
      () => loop?.stop(),
      () => windowEvents?.abort(),
      () => stopWatchingDesigns?.(),
      () => wardrobe?.dispose(),
      () => unsubscribeResize?.(),
      () => input?.dispose(),
      ...[...environmentTextures.values()].map((loaded) => () => loaded.texture.destroy()),
      () => gpu?.dispose(),
    ]);
  }

  function fail(error: unknown): never {
    failed = true;
    try {
      dispose();
    } catch {}
    throw error;
  }

  function guard(action: () => void): void {
    try {
      action();
    } catch (error) {
      fail(error);
    }
  }

  const initialize = async () => {
    const { init } = await import("vgpu");
    if (disposed) return;
    const nextGpu = await init();
    if (disposed) {
      nextGpu.dispose();
      return;
    }

    gpu = nextGpu;
    const output = surface(nextGpu, canvas, { dpr: [1, 2] });
    const scene = await createScene(nextGpu, output, sceneShaders, loadCarModel());
    if (disposed) return;

    // The designs' artboards arrive one by one behind the car, those of the design on
    // screen first; they start while the first environment loads. An artboard that
    // fails keeps its previous image and is reported, never thrown: a broken design
    // file must not stop the renderer.
    const held = createWardrobe(nextGpu, scene, {
      rasterize: rasterizeArtboard,
      report: (design, problems) => {
        if (!disposed) onArtboardProblems?.(design, problems);
      },
    });
    wardrobe = held;

    // What is on screen. Switching only changes what the car wears or what lights it:
    // the orbit state is never touched, so the view holds still.
    let entries = entriesOf(designs);
    let current = entries[0];
    const fromAddress = resolveFragment(location.hash, entries);
    // The environment asked for, which the label and the address name; the picture
    // follows it as soon as it is loaded.
    let selected = fromAddress.environment;
    // The environment on the scene; undefined until the first one is loaded.
    let shown: EnvironmentId | undefined;
    const failures = new Set<EnvironmentId>();

    const announce = () => {
      const environment = environmentById(selected)!;
      onSelection?.({
        design: designOf(current),
        index: entries.indexOf(current),
        total: entries.length,
        environment: {
          id: selected,
          name: environment.name,
          index: ENVIRONMENTS.indexOf(environment),
          total: ENVIRONMENTS.length,
        },
      });
    };
    // Replaced, never pushed: switching does not fill the back button.
    const writeAddress = () => history.replaceState(null, "", fragmentOf(current, selected));
    const show = (id: string, renameAddress: boolean) => {
      current = id;
      held.wear(designOf(id));
      if (renameAddress) writeAddress();
      announce();
    };
    const putOn = (id: EnvironmentId) => {
      shown = id;
      setEnvironment(scene, environmentTextures.get(id)!, environmentById(id)!.settings);
    };
    const select = (id: EnvironmentId) => {
      selected = id;
      if (environmentTextures.has(id)) putOn(id);
      writeAddress();
      announce();
    };

    // Fetches, decodes and keeps one environment. Resolves with whether it loaded;
    // a failure is remembered and reported, never thrown. Once the renderer is
    // disposed, a result touches nothing.
    const load = async (id: EnvironmentId): Promise<boolean> => {
      const environment = environmentById(id)!;
      const reportFailure = (message: string) => {
        if (disposed) return false;
        failures.add(id);
        onEnvironmentFailure?.(id, message);
        return false;
      };
      let bytes: Uint8Array;
      try {
        bytes = await fetchEnvironment(environment);
      } catch (error) {
        // `fetchEnvironment` already says what went wrong, shortly.
        return reportFailure(messageOf(error));
      }
      if (disposed) return false;
      try {
        environmentTextures.set(id, createEnvironmentTexture(nextGpu, scene, decodeHdr(bytes)));
        return true;
      } catch (error) {
        return reportFailure(`照片文件无法解码（${messageOf(error)}）`);
      }
    };

    // Worn before the set arrives, so its artboards are the first to be rasterised.
    show(fromAddress.id, fromAddress.rewrite);
    held.setDesigns(designs);

    // The first frame waits for an environment: the one asked for, or else the first
    // in list order that loads.
    let first: EnvironmentId | undefined = (await load(selected)) ? selected : undefined;
    for (const { id } of ENVIRONMENTS) {
      if (first !== undefined || disposed) break;
      if (!failures.has(id) && (await load(id))) first = id;
    }
    if (disposed) return;
    if (first === undefined) throw new Error("所有光线环境都无法加载");
    if (first === selected) {
      putOn(first);
    } else {
      select(first);
    }

    const orbit = installOrbitInput(canvas, guard);
    input = orbit;
    unsubscribeResize = output.onResize(() => {
      if (disposed) return;
      guard(() => {
        if (scene.hdr.size[0] !== output.size[0] || scene.hdr.size[1] !== output.size[1]) {
          replaceHdr(nextGpu, scene, output.size);
        }
      });
    });
    loop = frameLoop(nextGpu, (currentFrame) => {
      guard(() => {
        if (disposed) return;
        render(
          currentFrame,
          scene,
          output,
          cameraView(orbit.state, aspectOf(output), scene.bounds),
        );
      });
    });

    const events = new AbortController();
    windowEvents = events;
    window.addEventListener(
      "keydown",
      (event) =>
        guard(() => {
          const action = actionOfKey(event);
          if (action === undefined) return;
          if (action.kind === "design") {
            if (entries.length < 2) return;
            event.preventDefault();
            show(stepEntry(entries, current, action.step), true);
          } else if (action.kind === "environment") {
            event.preventDefault();
            const next = stepEnvironment(selected, action.step, (id) => failures.has(id));
            if (next !== selected) select(next);
          } else {
            event.preventDefault();
            // The turn belongs to the scene: it stays as the environment changes.
            setEnvironmentTurn(scene, scene.turn + action.step * TURN_STEP);
          }
        }),
      { signal: events.signal },
    );
    // The owner edited the address: resolved by the same rules as at load. A failed
    // environment cannot be selected, so the address returns to the one on screen.
    window.addEventListener(
      "hashchange",
      () =>
        guard(() => {
          const asked = resolveFragment(location.hash, entries);
          current = asked.id;
          held.wear(designOf(asked.id));
          if (failures.has(asked.environment)) {
            selected = shown ?? selected;
            writeAddress();
            announce();
          } else if (asked.environment !== selected) {
            select(asked.environment);
          } else {
            if (asked.rewrite) writeAddress();
            announce();
          }
        }),
      { signal: events.signal },
    );

    // While the dev server runs, a saved, created or deleted artboard arrives here
    // without a page reload; the wardrobe rasterises only the artboards whose text
    // changed.
    stopWatchingDesigns = watchDesigns((next) => {
      if (disposed) return;
      guard(() => {
        entries = entriesOf(next);
        if (entries.includes(current)) {
          held.setDesigns(next);
          announce();
        } else {
          // The design on screen is gone: the first of the new list takes its place.
          show(entries[0], true);
          held.setDesigns(next);
        }
      });
    });

    // The rest of the environments load behind the car, one at a time in list order,
    // with a turn of the event loop between them so the page stays responsive. `load`
    // never throws; only `guard` can, after failing the renderer, as in a listener.
    void (async () => {
      for (const { id } of ENVIRONMENTS) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (disposed) return;
        if (environmentTextures.has(id) || failures.has(id)) continue;
        const loaded = await load(id);
        if (disposed) return;
        guard(() => {
          if (loaded && id === selected) {
            putOn(id);
          } else if (!loaded && id === selected) {
            // The environment asked for cannot be shown: back to the one on screen.
            selected = shown ?? selected;
            writeAddress();
            announce();
          }
        });
      }
    })();
  };

  const ready = initialize().catch((error: unknown) => {
    if (disposed && !failed) return;
    fail(error);
  });

  return { ready, dispose };
}

/** What a caught error says, for the owner to read. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Drag to orbit, wheel to zoom. The view only moves in response to input: there is
 * no idle rotation.
 */
export function installOrbitInput(
  canvas: HTMLCanvasElement,
  guard: (action: () => void) => void = (action) => action(),
) {
  const state = initialOrbit();
  let activePointer: number | undefined;
  let lastX = 0;
  let lastY = 0;
  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";

  const down = (event: PointerEvent) =>
    guard(() => {
      if (!event.isPrimary || activePointer !== undefined) return;
      activePointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    });
  const move = (event: PointerEvent) =>
    guard(() => {
      if (event.pointerId !== activePointer) return;
      state.yaw -= (event.clientX - lastX) * 0.006;
      state.pitch += (event.clientY - lastY) * 0.006;
      clampOrbit(state);
      lastX = event.clientX;
      lastY = event.clientY;
    });
  const end = (event: PointerEvent) =>
    guard(() => {
      if (event.pointerId !== activePointer) return;
      releaseCapture(event.pointerId);
      activePointer = undefined;
    });
  const wheel = (event: WheelEvent) =>
    guard(() => {
      event.preventDefault();
      // Lines and pages scroll in coarser units than pixels.
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 1 : 32;
      state.distance *= Math.exp(event.deltaY * unit * 0.0012);
      clampOrbit(state);
    });
  const releaseCapture = (pointer: number) => {
    if (canvas.hasPointerCapture?.(pointer)) canvas.releasePointerCapture(pointer);
  };

  const controller = new AbortController();
  try {
    const options = { signal: controller.signal };
    canvas.addEventListener("pointerdown", down, options);
    canvas.addEventListener("pointermove", move, options);
    canvas.addEventListener("pointerup", end, options);
    canvas.addEventListener("pointercancel", end, options);
    canvas.addEventListener("wheel", wheel, { ...options, passive: false });
  } catch (error) {
    runCleanups(
      [() => controller.abort(), () => (canvas.style.touchAction = previousTouchAction)],
      { error },
    );
  }

  return {
    /** The live orbit state: the same object for as long as the input is installed. */
    state,
    dispose() {
      runCleanups([
        () => controller.abort(),
        () => activePointer !== undefined && releaseCapture(activePointer),
        () => (canvas.style.touchAction = previousTouchAction),
      ]);
    },
  };
}
