# livery

我给自己的车设计涂装（拉花）的地方：设计稿，加上一个在浏览器里实时预览它的 3D 工坊。

这是个人项目，不是通用的涂装工具。代码按 MIT 开源，欢迎参考。

## 现状

工坊已经能把涂装“穿”到车上：

- 画面里是一辆银色的占位双门跑车（程序生成，等我自己的车模到了再换），可以拖动旋转、滚轮缩放。
- 涂装画在左、右、顶、前、后五张 SVG 画板上，按对应方向投影到车身。只有车漆会贴上膜，玻璃、车轮、车灯和饰件不会。
- 画板按真实尺寸绘制：1 个 SVG 单位 = 1 毫米。每张画板底下垫着一张由车模生成的参考图（`designs/_guides/`），照着画就能知道图案落在车的哪里；参考图不会出现在车上。
- 现在有两套设计：校准图 `designs/calibration/`（毫米网格、方向箭头和几个彩色标记，用来确认投影位置和方向是对的），和一套条纹示例 `designs/stripes/`（只是用来演示切换，不是设计方向）。
- 按 `←`/`→` 在这两套设计和裸车之间切换，视角保持不动；屏幕左上角写着现在是哪一套。地址栏里带着设计名，刷新页面或者把这个地址存下来，打开还是同一套。
- 有四种光线环境：日光、阴天、夜晚街灯、车库，都是真实拍摄的全景照片。车站在照片里的地面上，车身反射的也是这张照片。按 `↑`/`↓` 切换光线环境，按 `[`/`]` 让光线绕着车每次转 45°。屏幕左上角和地址栏里同时写着光线环境，刷新后还是同一个。
- `pnpm dev` 开着的时候，用任何编辑器改一张画板并保存，车上大约一秒内跟着变，页面不会刷新，视角也不会动。画板写坏了，车上保留上一次的画面，屏幕左下角会提示是哪张画板、出了什么问题。一套设计不必五张画板都画，没有画板的那一面保持原车漆，不算问题。

不开浏览器也能看效果和做检查（需要 Node 22.18 以上）：

```sh
pnpm render             # 渲染一张穿着涂装的车并打印图片路径，可加 --env（光线环境）--turn（转动光线）--out --yaw --pitch --distance
pnpm guides             # 车模变了以后，重新生成画板参考图
pnpm check:projection   # 用像素验证投影没有错位
```

接下来的方向：

- 导出效果图
- 发布成可分享的在线预览
- 换成我自己的车模（等车定下来）

## 运行

需要 Node 22 以上、pnpm，以及支持 WebGPU 的浏览器（新版 Chrome、Edge、Safari、Firefox 都可以）。

```sh
pnpm install
pnpm dev
```

然后打开终端里显示的本地地址。

## 结构

- `index.html`、`src/`：3D 预览工坊，用 [vgpu](https://github.com/vercel-labs/vgpu) 直接基于 WebGPU 渲染
- `scripts/`：不开浏览器的渲染和检查脚本
- `designs/`：涂装设计稿，每套设计一个目录、五张 SVG 画板（`left`、`right`、`top`、`front`、`rear`）；`designs/_guides/` 是自动生成的画板参考图
- `environments/`：四张光线环境的全景照片，每张两个文件（Radiance `.hdr`，2048×1024；JPG，8192×4096）
- `wiki/`：设计思路、调研和计划

## 素材

四张光线环境照片来自 [Poly Haven](https://polyhaven.com)，以 CC0 发布。每张照片用的是同一个素材的两个版本：HDR 版照亮车身、决定背景的明暗，色调映射过的 JPG 版分辨率更高，给背景补上清晰的细节。四个素材是：

- 日光：[wide_street_01](https://polyhaven.com/a/wide_street_01)，Sergej Majboroda
- 阴天：[round_platform](https://polyhaven.com/a/round_platform)，Sergej Majboroda
- 夜晚街灯：[hansaplatz](https://polyhaven.com/a/hansaplatz)，Greg Zaal
- 车库：[empty_warehouse_01](https://polyhaven.com/a/empty_warehouse_01)，Sergej Majboroda

## License

[MIT](./LICENSE)
