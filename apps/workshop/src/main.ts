import { artboardPath } from "./artboards.ts";
import { DESIGN } from "./design-sources.ts";
import type { View } from "./frames.ts";
import { createRenderer } from "./renderer.ts";

const canvas = document.querySelector("canvas")!;
const errorBox = document.querySelector<HTMLDivElement>("#error")!;
const artboardNotice = document.querySelector<HTMLElement>("#artboard-notice")!;

/** Lists the artboards that cannot be shown; hidden again once every one is fine. */
function showArtboardProblems(problems: ReadonlyMap<View, string>): void {
  const items = [...problems].map(([view, problem]) => {
    const item = document.createElement("li");
    const path = document.createElement("code");
    path.textContent = artboardPath(DESIGN, view);
    item.append(path, `：${problem}`);
    return item;
  });
  artboardNotice.querySelector("ul")!.replaceChildren(...items);
  artboardNotice.hidden = items.length === 0;
}

createRenderer({ canvas, onArtboardProblems: showArtboardProblems }).ready.catch(
  (error: unknown) => {
    console.error(error);
    errorBox.textContent = `无法启动渲染：${error instanceof Error ? error.message : String(error)}。工坊需要支持 WebGPU 的浏览器。`;
    errorBox.hidden = false;
  },
);
