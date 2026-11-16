import { frameLoop, surface, type Gpu } from "vgpu";

import { cameraView, clampOrbit, initialOrbit } from "./camera.ts";
import { loadCarModel } from "./car/index.ts";
import { designs, watchDesigns } from "./design-sources.ts";
import type { View } from "./frames.ts";
import { rasterizeArtboard } from "./rasterize.ts";
import { aspectOf, createScene, render, replaceHdr, runCleanups } from "./scene.ts";
import {
  designOf,
  entriesOf,
  fragmentOf,
  resolveFragment,
  stepEntry,
  stepOfKey,
} from "./selection.ts";
import { sceneShaders } from "./shaders.ts";
import { createWardrobe, type Wardrobe } from "./wardrobe.ts";

/** The entry of the design list that is on screen. */
export interface DesignSelection {
  /** The design the car wears; undefined for the bare car. */
  readonly design: string | undefined;
  /** Its place in the list, counting from 0. */
  readonly index: number;
  /** How many entries the list has, the bare car included. */
  readonly total: number;
}

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** Called whenever the entry on screen, or the list around it, changes. */
  readonly onSelection?: (selection: DesignSelection) => void;
  /**
   * Called with the worn design's artboards that currently cannot be shown and why,
   * whenever a design is put on and each time that set may have changed. Empty when
   * every artboard is fine, and for the bare car (`design` undefined).
   */
  readonly onArtboardProblems?: (
    design: string | undefined,
    problems: ReadonlyMap<View, string>,
  ) => void;
}

export function createRenderer({ canvas, onSelection, onArtboardProblems }: RendererOptions) {
  let disposed = false;
  let failed = false;
  let gpu: Gpu | undefined;
  let input: ReturnType<typeof installOrbitInput> | undefined;
  let loop: { stop(): void } | undefined;
  let unsubscribeResize: (() => void) | undefined;
  let stopWatchingDesigns: (() => void) | undefined;
  let wardrobe: Wardrobe | undefined;
  let windowEvents: AbortController | undefined;

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

    // The car is already on screen; the designs' artboards arrive one by one behind
    // it, those of the design on screen first. An artboard that fails keeps its
    // previous image and is reported, never thrown: a broken design file must not stop
    // the renderer.
    const held = createWardrobe(nextGpu, scene, {
      rasterize: rasterizeArtboard,
      report: (design, problems) => {
        if (!disposed) onArtboardProblems?.(design, problems);
      },
    });
    wardrobe = held;

    // The entry on screen. Switching only changes what the car wears: the orbit state
    // is never touched, so the view holds still.
    let entries = entriesOf(designs);
    let current = entries[0];
    const announce = () =>
      onSelection?.({
        design: designOf(current),
        index: entries.indexOf(current),
        total: entries.length,
      });
    const show = (id: string, renameAddress: boolean) => {
      current = id;
      held.wear(designOf(id));
      // Replaced, never pushed: switching designs does not fill the back button.
      if (renameAddress) history.replaceState(null, "", fragmentOf(id));
      announce();
    };
    const showFromAddress = () => {
      const { id, rewrite } = resolveFragment(location.hash, entries);
      show(id, rewrite);
    };

    // Worn before the set arrives, so its artboards are the first to be rasterised.
    showFromAddress();
    held.setDesigns(designs);

    const events = new AbortController();
    windowEvents = events;
    window.addEventListener(
      "keydown",
      (event) =>
        guard(() => {
          const step = stepOfKey(event);
          if (step === 0 || entries.length < 2) return;
          event.preventDefault();
          show(stepEntry(entries, current, step), true);
        }),
      { signal: events.signal },
    );
    // The owner edited the address: resolved by the same rule as at load.
    window.addEventListener("hashchange", () => guard(showFromAddress), {
      signal: events.signal,
    });

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
  };

  const ready = initialize().catch((error: unknown) => {
    if (disposed && !failed) return;
    fail(error);
  });

  return { ready, dispose };
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
