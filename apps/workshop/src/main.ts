import { createRenderer } from "./renderer";

const canvas = document.querySelector("canvas")!;
const errorBox = document.querySelector<HTMLDivElement>("#error")!;

createRenderer({ canvas }).ready.catch((error: unknown) => {
  console.error(error);
  errorBox.textContent = `无法启动渲染：${error instanceof Error ? error.message : String(error)}。工坊需要支持 WebGPU 的浏览器。`;
  errorBox.hidden = false;
});
