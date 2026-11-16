# livery

The owner's personal car livery (wrap) design repository: the design itself plus a
browser workshop that previews it on a 3D car. It is not a general-purpose livery
tool; do not generalize for other users or other cars unless asked.

## Decisions

- **Rendering is pure vgpu** (WebGPU only, no three.js, no WebGL fallback). The owner
  chose this knowing that vgpu has no material system, glTF loader, or built-in
  environment lighting: shading, model loading, and lighting are written here in WGSL.
  Do not introduce three.js or another engine.
- **Livery is applied by view projection**, not UV textures or decal geometry: the
  design lives on five 2D artboards (left, right, top, front, rear) at real-world
  scale and is projected onto the body from the matching direction. This keeps the
  design independent of any car model's UVs, so the model can be swapped, and keeps
  the artboards usable as print-shop production files. What the code relies on:
  - **Car frame.** Every model and every projection uses one frame: metres; +X toward
    the nose, +Y up, +Z toward the car's right; origin on the ground under the centre of
    the car's length and width; wheels touch y = 0. A model enters the workshop only
    through the contract in `src/car/model.ts`.
  - **Artboard frames are fixed** and defined once, in `src/frames.ts`: each view's size
    in millimetres and its mapping from car-frame metres to artboard millimetres (1 SVG
    user unit = 1 mm). They are a contract with every design file, so they never follow
    a model's size or bounding box. Shader uniforms and guides derive from that module
    rather than restating the numbers. The one deliberate exception is
    `check:projection`, which restates them as literals, as the test's expectation:
    changing a frame means changing those literals too, on purpose.
  - **Selection is a hard switch** on the dominant axis of the car-frame normal
    (+Y top, +X front, -X rear, -Z left, +Z right, -Y nothing). Two artboards are
    never blended.
  - **Only `paint` receives livery.** `glass`, `wheel`, `light` and `trim` never do.
  - **Design files.** A design is `designs/<design>/<view>.svg`, up to five files:
    every directory under `designs/` whose name does not start with `_` and that
    holds at least one artboard is a design. A design may omit artboards; that side
    of the car stays bare. Names starting with `_` are reserved: `_guides`, and
    `_bare`, the id of the bare car. The workshop holds every design and lists them
    by name, followed by a built-in bare car; `←`/`→` switch between them, and the
    URL fragment names the one on screen. All of them stay resident on the GPU, so
    each design costs about 210 MB of texture memory. `calibration` is a millimetre
    grid with direction arrows and markers; `stripes` is an example to switch to,
    not a design direction. `designs/_guides/<view>.png` are generated drawings of
    the car model, shared by all designs; never edit them by hand.
  - **The `id="guide"` rule.** Each artboard starts with a group `id="guide"` holding
    one `<image>` that links `../_guides/<view>.png`, as a drawing aid. The element
    with that id is removed before the artboard is rasterised, so nothing inside it
    reaches the car, and livery must not be put there.
- **The car model is replaceable.** Work starts with a placeholder two-door sports
  car; the owner's real model comes later. Nothing may depend on one specific mesh.
- **One package, not a monorepo.** The owner's baseline for new repositories is a
  pnpm + turborepo monorepo. This repository deliberately is not one: it holds a
  single app and publishes nothing, so the workshop lives at the repository root
  (`index.html`, `src/`, `scripts/`) with no workspace packages, no turbo and no
  changesets. Do not reintroduce them unless a second package actually exists.

## Working with vgpu

- Read `pnpm exec vgpu docs cat getting-started.md` before touching rendering code, and
  use `pnpm exec vgpu docs find "<topic>"` for anything else. The docs bundled with the
  installed version are the authority; the `vgpu` skill in `.agents/skills/` explains
  the lookup workflow.
- Keep `vgpu` and `@vgpu/wgsl` on the same release; a mismatch fails at runtime with
  `VGPU-SHADER-SOURCE-VERSION`.
- Headless rendering works on this machine (`pnpm exec vgpu doctor` reports healthy):
  verify visual changes by rendering to pixels rather than by assumption. Three
  scripts do it without a browser (they need Node 22.18 or newer, which runs their
  TypeScript directly):
  - `pnpm render [--design <name>] [--out <file.png>] [--yaw <deg>] [--pitch <deg>]
    [--distance <m>] [--width <px>] [--height <px>]` writes a PNG of the lit car wearing
    a design and prints its path. Yaw 90 looks at the nose, 0 at the right side, 180 at
    the left, 270 at the tail; pitch 0 is level, 90 straight down. Use it to look at a
    design or a shading change.
  - `pnpm guides` regenerates `designs/_guides/`. Run it and commit the result whenever
    the car model changes; stale guides put a design in the wrong place.
  - `pnpm check:projection` proves the projection from pixels for the `calibration`
    design and exits non-zero when it is wrong. Run it after touching the paint shader,
    the frames, the artboard textures or the model.
- The scene, model, frame and artboard modules under `src` are shared with those
  scripts, so they must not import `.wgsl` files or use DOM or Vite-only APIs: shaders
  are passed in (`src/shaders.ts` in the browser, `scripts/lib/shaders.ts` in Node), and
  so is SVG rasterisation. Imports spell out the `.ts` extension because Node resolves
  them as written.
- `src` started from vgpu's official `environment-map` example
  (`pnpm exec vgpu examples pull environment-map`). Search the examples before writing a
  technique from scratch.

## Conventions

- Narrate to the owner in Simplified Chinese; code, comments, and commit messages in
  English. `README.md` is for humans and written in Chinese.
- Checks: `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, `pnpm build`.
- Project knowledge (research, plans, design rationale) goes under `wiki/`; plans
  under `wiki/plans/`.
- `.agents/skills/` is the real skills directory; `.claude/skills` is a symlink to it.
