# livery

我给自己的车设计涂装（拉花）的地方：设计稿，加上一个在浏览器里实时预览它的 3D 工坊。

这是个人项目，不是通用的涂装工具。代码按 MIT 开源，欢迎参考。

## 现状

工坊已经能把涂装“穿”到车上：

- 画面里是一辆银色的保时捷 911 Carrera 4S（开源高精模型，在我自己的车定下来之前先用它），可以拖动旋转、滚轮缩放。
- 涂装画在左、右、顶、前、后五张 SVG 画板上，按对应方向投影到车身。只有车漆会贴上膜，玻璃、车轮、车灯和饰件不会。
- 画板按真实尺寸绘制：1 个 SVG 单位 = 1 毫米。每张画板底下垫着一张由车模生成的参考图（`designs/_guides/`），照着画就能知道图案落在车的哪里；参考图不会出现在车上。同一目录下的 `<view>-lines.svg` 是车身特征线的矢量文件（贴膜覆盖范围、玻璃、车灯、车轮的轮廓，侧面还有腰线、肩线、门槛线和轮心坐标），可以导入 Illustrator / Inkscape 吸附对齐。
- 现在有三套设计：
  - 校准图 `designs/calibration/`：毫米网格、方向箭头和几个彩色标记，用来确认投影位置和方向是对的。
  - 「断层线」`designs/fault-line/`：第一套按 911 画的正式方案。一条哑光石墨色斜带从前轮后方升向后肩，在车门后被一道信号橙切口截断、后半截错位抬高；引擎盖到车尾一条偏置细线呼应；轮拱上方标胎规，车门下方一枚小铭牌。
  - 条纹示例 `designs/stripes/`：只是用来演示切换，按旧的占位车画的，不是设计方向。
- 按 `←`/`→` 在这几套设计和裸车之间切换，视角保持不动；屏幕左上角写着现在是哪一套。地址栏里带着设计名，刷新页面或者把这个地址存下来，打开还是同一套。
- 有四种光线环境：日光、阴天、夜晚街灯、车库，都是真实拍摄的全景照片。车站在照片里的地面上，车身反射的也是这张照片。按 `↑`/`↓` 切换光线环境，按 `[`/`]` 让光线绕着车每次转 45°。屏幕左上角和地址栏里同时写着光线环境，刷新后还是同一个。
- `pnpm dev` 开着的时候，用任何编辑器改一张画板并保存，车上大约一秒内跟着变，页面不会刷新，视角也不会动。画板写坏了，车上保留上一次的画面，屏幕左下角会提示是哪张画板、出了什么问题。一套设计不必五张画板都画，没有画板的那一面保持原车漆，不算问题。

不开浏览器也能看效果和做检查（需要 Node 22.18 以上）：

```sh
pnpm render             # 渲染一张穿着涂装的车并打印图片路径，可加 --env（光线环境）--turn（转动光线）--out --yaw --pitch --distance
pnpm guides             # 车模变了以后，重新生成画板参考图
pnpm sheet --design a,b --env day   # 把几套设计按固定机位渲成一张对比图
pnpm check:projection   # 用像素验证投影没有错位
pnpm import-car <车模.glb>   # 把解压后的 GLB 车模转换成工坊的车模文件
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
- `models/`：车模（工坊自己的紧凑格式，由 `pnpm import-car` 从 GLB 转换）
- `environments/`：四张光线环境的全景照片，每张两个文件（Radiance `.hdr`，2048×1024；JPG，8192×4096）
- `wiki/`：设计思路、调研和计划

## 素材

四张光线环境照片来自 [Poly Haven](https://polyhaven.com)，以 CC0 发布。每张照片用的是同一个素材的两个版本：HDR 版照亮车身、决定背景的明暗，色调映射过的 JPG 版分辨率更高，给背景补上清晰的细节。四个素材是：

- 日光：[wide_street_01](https://polyhaven.com/a/wide_street_01)，Sergej Majboroda
- 阴天：[round_platform](https://polyhaven.com/a/round_platform)，Sergej Majboroda
- 夜晚街灯：[hansaplatz](https://polyhaven.com/a/hansaplatz)，Greg Zaal
- 车库：[old_bus_depot](https://polyhaven.com/a/old_bus_depot)，Sergej Majboroda

车模是 Karol Miklas 的 [(FREE) Porsche 911 Carrera 4S](https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf)，以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 发布。转换后的 `models/porsche-911.car` 按同一许可证（CC BY-SA 4.0）分发。

## License

[MIT](./LICENSE)
