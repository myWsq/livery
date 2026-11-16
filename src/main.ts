import { artboardPath } from "./artboards.ts";
import { environmentById, type EnvironmentId } from "./environments.ts";
import type { View } from "./frames.ts";
import { createRenderer, type Selection } from "./renderer.ts";

const canvas = document.querySelector("canvas")!;
const errorBox = document.querySelector<HTMLDivElement>("#error")!;
const designLabel = document.querySelector<HTMLElement>("#design-label")!;
const artboardNotice = document.querySelector<HTMLElement>("#artboard-notice")!;
const environmentNotice = document.querySelector<HTMLElement>("#environment-notice")!;
/** Every environment that could not be loaded, with why, in the order they failed. */
const environmentFailures = new Map<EnvironmentId, string>();
let failed = false;

/**
 * Names what is on screen and its place in each list, like
 * "stripes  2 / 3  ·  夜晚街灯  3 / 4".
 */
function showSelection({ design, index, total, environment }: Selection): void {
  designLabel.querySelector(".name")!.textContent = design ?? "裸车";
  designLabel.querySelector(".position")!.textContent = `${index + 1} / ${total}`;
  designLabel.querySelector(".environment-name")!.textContent = environment.name;
  designLabel.querySelector(".environment-position")!.textContent =
    `${environment.index + 1} / ${environment.total}`;
  designLabel.hidden = failed;
}

/**
 * Lists the worn design's artboards that cannot be shown; hidden for the bare car and
 * once every one is fine.
 */
function showArtboardProblems(
  design: string | undefined,
  problems: ReadonlyMap<View, string>,
): void {
  const items =
    design === undefined
      ? []
      : [...problems].map(([view, problem]) => {
          const item = document.createElement("li");
          const path = document.createElement("code");
          path.textContent = artboardPath(design, view);
          item.append(path, `：${problem}`);
          return item;
        });
  artboardNotice.querySelector("ul")!.replaceChildren(...items);
  artboardNotice.hidden = items.length === 0;
}

/** Lists every environment that could not be loaded; hidden while there is none. */
function showEnvironmentFailure(environment: EnvironmentId, message: string): void {
  environmentFailures.set(environment, message);
  const items = [...environmentFailures].map(([id, why]) => {
    const item = document.createElement("li");
    item.textContent = `光线环境「${environmentById(id)?.name ?? id}」无法加载：${why}`;
    return item;
  });
  environmentNotice.querySelector("ul")!.replaceChildren(...items);
  environmentNotice.hidden = items.length === 0;
}

createRenderer({
  canvas,
  onSelection: showSelection,
  onArtboardProblems: showArtboardProblems,
  onEnvironmentFailure: showEnvironmentFailure,
}).ready.catch((error: unknown) => {
  console.error(error);
  failed = true;
  designLabel.hidden = true;
  errorBox.textContent = `无法启动渲染：${error instanceof Error ? error.message : String(error)}。工坊需要支持 WebGPU 的浏览器。`;
  errorBox.hidden = false;
});
