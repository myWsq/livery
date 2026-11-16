import { frameLoop, surface, type Gpu } from "vgpu";

import { createArtboardLoader } from "./artboards.ts";
import { cameraView, clampOrbit, initialOrbit } from "./camera.ts";
import { loadCarModel } from "./car/index.ts";
import { DESIGN, designSources, watchDesign } from "./design-sources.ts";
import type { View } from "./frames.ts";
import { rasterizeArtboard } from "./rasterize.ts";
import { aspectOf, createScene, render, replaceHdr, runCleanups, setArtboard } from "./scene.ts";
import { sceneShaders } from "./shaders.ts";

interface RendererOptions {
  readonly canvas: HTMLCanvasElement;
  /**
   * Called with the artboards that currently cannot be shown and why, each time that
   * set may have changed. Empty when every artboard is fine.
   */
  readonly onArtboardProblems?: (problems: ReadonlyMap<View, string>) => void;
}

export function createRenderer({ canvas, onArtboardProblems }: RendererOptions) {
  let disposed = false;
  let failed = false;
  let gpu: Gpu | undefined;
  let input: ReturnType<typeof installOrbitInput> | undefined;
  let loop: { stop(): void } | undefined;
  let unsubscribeResize: (() => void) | undefined;
  let stopWatchingDesign: (() => void) | undefined;

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    runCleanups([
      () => loop?.stop(),
      () => stopWatchingDesign?.(),
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

    // The car is already on screen; its artboards arrive one by one behind it. An
    // artboard that fails keeps its previous image and is reported, never thrown: a
    // broken design file must not stop the renderer.
    const artboards = createArtboardLoader({
      rasterize: rasterizeArtboard,
      apply: (view, raster) => {
        if (!disposed) setArtboard(nextGpu, scene, view, raster);
      },
      report: (problems) => {
        if (!disposed) onArtboardProblems?.(problems);
      },
      missing: "文件不存在",
    });
    void artboards.update(designSources(DESIGN));
    // While the dev server runs, a saved artboard arrives here without a page reload;
    // the loader rasterises only the artboards whose text changed.
    stopWatchingDesign = watchDesign(DESIGN, (sources) => {
      if (!disposed) void artboards.update(sources);
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
