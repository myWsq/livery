# livery

我给自己的车设计涂装（拉花）的地方：设计稿，加上一个在浏览器里实时预览它的 3D 工坊。

这是个人项目，不是通用的涂装工具。代码按 MIT 开源，欢迎参考。

## 现状

工坊已经能把涂装“穿”到车上：

- 画面里是一辆银色的占位双门跑车（程序生成，等我自己的车模到了再换），可以拖动旋转、滚轮缩放。
- 涂装画在左、右、顶、前、后五张 SVG 画板上，按对应方向投影到车身。只有车漆会贴上膜，玻璃、车轮、车灯和饰件不会。
- 画板按真实尺寸绘制：1 个 SVG 单位 = 1 毫米。每张画板底下垫着一张由车模生成的参考图（`designs/_guides/`），照着画就能知道图案落在车的哪里；参考图不会出现在车上。
- 现在只有一套校准图 `designs/calibration/`：毫米网格、方向箭头和几个彩色标记，用来确认投影位置和方向是对的。
- `pnpm dev` 开着的时候，用任何编辑器改一张画板并保存，车上大约一秒内跟着变，页面不会刷新，视角也不会动。画板写坏了，车上保留上一次的画面，屏幕左下角会提示是哪个文件、出了什么问题。

不开浏览器也能看效果和做检查（需要 Node 22.18 以上）：

```sh
pnpm --filter @livery/workshop render             # 渲染一张穿着涂装的车并打印图片路径，可加 --out --yaw --pitch --distance
pnpm --filter @livery/workshop guides             # 车模变了以后，重新生成画板参考图
pnpm --filter @livery/workshop check:projection   # 用像素验证投影没有错位
```

接下来的方向：

- 把占位车换成我自己的车模
- 在画板上画真正的涂装设计
- 把画板整理成贴膜店可以直接用的施工稿

## 运行

需要 Node 22 以上、pnpm，以及支持 WebGPU 的浏览器（新版 Chrome、Edge、Safari、Firefox 都可以）。

```sh
pnpm install
pnpm dev
```

然后打开终端里显示的本地地址。

## 结构

- `apps/workshop`：3D 预览工坊，用 [vgpu](https://github.com/vercel-labs/vgpu) 直接基于 WebGPU 渲染
- `designs/`：涂装设计稿，每套设计一个目录、五张 SVG 画板（`left`、`right`、`top`、`front`、`rear`）；`designs/_guides/` 是自动生成的画板参考图
- `wiki/`：设计思路、调研和计划

## License

[MIT](./LICENSE)
