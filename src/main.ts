import { artboardPath } from "./artboards.ts";
import type { View } from "./frames.ts";
import { createRenderer, type DesignSelection } from "./renderer.ts";

const canvas = document.querySelector("canvas")!;
const errorBox = document.querySelector<HTMLDivElement>("#error")!;
const designLabel = document.querySelector<HTMLElement>("#design-label")!;
const artboardNotice = document.querySelector<HTMLElement>("#artboard-notice")!;
let failed = false;

/** Names the entry on screen and its place in the list, like "stripes  2 / 3". */
function showSelection({ design, index, total }: DesignSelection): void {
  designLabel.querySelector(".name")!.textContent = design ?? "裸车";
  designLabel.querySelector(".position")!.textContent = `${index + 1} / ${total}`;
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

createRenderer({
  canvas,
  onSelection: showSelection,
  onArtboardProblems: showArtboardProblems,
}).ready.catch((error: unknown) => {
  console.error(error);
  failed = true;
  designLabel.hidden = true;
  errorBox.textContent = `无法启动渲染：${error instanceof Error ? error.message : String(error)}。工坊需要支持 WebGPU 的浏览器。`;
  errorBox.hidden = false;
});
