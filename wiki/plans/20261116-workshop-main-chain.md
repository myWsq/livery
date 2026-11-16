# Plan 20261116-workshop-main-chain: Preview the livery on a placeholder car, live from five SVG artboards

> Three parts for three readers. The Record says why and stays true after the
> code moves on. The Execution brief is the only part a delegated executor
> receives. Verification is the orchestrator's. At close, `dev:execute-plan`
> appends an Outcome and updates `wiki/plans/README.md`.
>
> Drift check: `git diff --stat b7468a8..HEAD -- apps/workshop designs AGENTS.md README.md package.json pnpm-workspace.yaml`

## Status

- Priority: P1
- Effort: L
- Risk: MED
- Depends on: none
- Category: feature
- Execution: subagent(fable) — departure check
- Stop after: implementation — departure check, plain autopilot
- Plan review: none — departure check; the audit was not offered because the orchestrator is already top tier
- Workspace: isolated — planning started in the main worktree, moved to `.claude/worktrees/20261116-workshop-main-chain` on `dev/20261116-workshop-main-chain`
- Planned at: `b7468a8`, 2026-11-16

## Record

### Requirement

The workshop renders a spinning mirror cube. The owner cannot yet see any livery
on any car, so no design work can start. This plan builds the shortest complete
chain: a design drawn as 2D artboards appears on a 3D car, and changing the
drawing changes the car.

Product conclusions, confirmed by the owner:

- **Consumer and trigger**: the owner alone. When an idea comes up they tell an
  agent to change the design, or edit an SVG themselves in a vector tool, and
  look at the browser.
- **Form**: a full-screen 3D previewer with no panel. One silver placeholder
  two-door sports car; drag to rotate, wheel to zoom.
- **Flow**: `pnpm dev` shows the car wearing the livery. Saving any artboard
  updates the car within about a second, with the view unchanged and no page
  reload.
- **Artboards**: five SVG files (left, right, top, front, rear) in the
  repository, drawn at real scale, 1 SVG user unit = 1 mm. Each carries a guide
  layer showing the car's outline, windows, wheels, and panel seams for
  alignment; the guide never appears on the car. Left and right are independent
  drawings, not mirrors. Undrawn areas are transparent and show the silver paint.
- **What receives livery**: body paint only. Windows, wheels, and lights do not.
- **View boundaries**: every point of the body takes the artboard it faces most
  directly. The boundary between two artboards is a sharp line with no blending,
  because real wrap film is applied in separate pieces.
- **Failure**: when an artboard is broken, the car keeps the last good image and
  a corner of the screen names the file and the problem; fixing the file
  clears it.
- **Initial content**: a calibration pattern (grid, dimension ticks, an arrow to
  the nose, the view's name). The real design direction is deliberately parked.
- **Not in this version**: drawing inside the workshop, any panel, switching
  between designs, layer toggles, colour variants, side-by-side comparison,
  lighting environments, image export, publishing, print-shop export, the
  owner's real car model.
- **Observable when done**: a mark drawn at the middle of the door on an
  artboard appears at the middle of the door in 3D, at the size the grid says;
  text on the left artboard reads correctly on the car's left side, and likewise
  on the right; a saved change appears without a manual refresh.

Roadmap confirmed for later plans, in order: switching between designs at a
fixed view; lighting environments (daylight, overcast, street lights at night,
garage); image export; a published online preview. The real car model waits
until the owner has chosen a car.

### Decisions & tradeoffs

- **D1 The car model is a data contract, and the placeholder is one provider of
  it**: rendering, projection, and guide generation consume only the contract —
  triangle parts tagged with a surface class, plus panel-seam polylines, in the
  car frame of D2 — and never a property of one specific mesh. Rejected:
  building the scene directly around the placeholder's construction (profiles,
  parameters) — swapping in a real model would then touch the renderer.
  Based on: `AGENTS.md` "The car model is replaceable … Nothing may depend on
  one specific mesh".
- **D2 One car frame**: metres; +X toward the nose, +Y up, +Z toward the car's
  right; origin on the ground plane under the centre of the car's length and
  width. Rejected: reusing whatever orientation a mesh arrives in — artboard
  mappings would then differ per model. (decided while planning)
- **D3 Surface classes are a closed set — `paint`, `glass`, `wheel`, `light`,
  `trim` — and only `paint` receives livery**: Rejected: the four classes named
  in discussion without `trim` — unpainted parts (intakes, window surrounds)
  would have to be mislabelled as paint and would then wear the livery.
  Based on: product conclusion "body paint only". (`trim` decided while planning)
- **D4 Livery is applied by view projection in the shader**: each body fragment
  picks one artboard by its surface normal and samples it at an orthographic
  projection of its car-frame position. Rejected: UV textures — a design would
  die with the model's UVs; decal geometry — stretches on curves and has no
  correspondence to print files; baking the projection into per-model textures —
  adds a step between saving and seeing.
  Based on: `AGENTS.md` "Livery is applied by view projection"; Discussion log,
  application method.
- **D5 Artboard selection is the dominant axis of the normal, with a hard
  switch**: +Y → top, +X → front, −X → rear, −Z → left, +Z → right; a normal
  whose dominant axis is −Y takes no artboard. Rejected: blending weights near
  the boundary — the owner confirmed a sharp line.
  Based on: product conclusion on view boundaries.
- **D6 Artboard frames are fixed constants, independent of the model**:

  | View | Size (mm) | u (right) | v (down) | Reads as |
  | --- | --- | --- | --- | --- |
  | left | 5200 × 1800 | 2600 − 1000·x | 1600 − 1000·y | nose on the left |
  | right | 5200 × 1800 | 2600 + 1000·x | 1600 − 1000·y | nose on the right |
  | top | 5200 × 2400 | 2600 − 1000·x | 1200 − 1000·z | nose on the left, car's right side at the top |
  | front | 2400 × 1800 | 1200 − 1000·z | 1600 − 1000·y | car's left on the viewer's right |
  | rear | 2400 × 1800 | 1200 + 1000·z | 1600 − 1000·y | car's right on the viewer's right |

  Each mapping is the view a person standing on that side sees, so nothing is
  mirrored. Rejected: deriving each frame from the model's bounding box — a
  model swap would shift every existing drawing; a non-zero `viewBox` origin
  anchored at the car origin — vector editors rewrite it to `0 0` on save.
  (decided while planning)
- **D7 The design's only source is `designs/<design>/<view>.svg` at the
  repository root**: one directory per design from the start. Rejected: keeping
  artboards inside `apps/workshop` — they are the product of the repository and
  a print file, not an asset of one app; a flat `designs/<view>.svg` — the next
  version (design switching) would have to move the files.
  Based on: `AGENTS.md` first paragraph; confirmed roadmap.
- **D8 The guide is generated from the car model and linked, not embedded or
  hand-drawn**: generated images live in `designs/_guides/<view>.png`, one set
  shared by every design; each artboard references its image from a group with
  `id="guide"`, and the workshop removes that group before rasterising.
  Rejected: hand-drawn outlines — wrong the moment the model changes; a
  data-URI image inside each SVG — a multi-hundred-kilobyte line that makes the
  file unreadable to an agent editing it and noisy in diffs; vector outlines —
  needs hidden-line removal for little gain at this stage.
  (format decided while planning)
- **D9 Film sits over paint**: where the artboard has colour the surface is
  shaded as wrap film, weighted by the artboard's alpha; elsewhere as silver
  metallic paint reflecting the existing sky environment. Rejected: replacing
  the paint colour inside one metallic material — film and paint differ in
  finish, and that difference is what later versions evaluate.
  Based on: `apps/workshop/src/metal.wgsl`, `apps/workshop/src/env-common.wgsl`.
- **D10 A saved artboard reaches the car without a page reload, and only the
  artboards whose content changed are rasterised again**: Rejected: full page
  reload — loses the view the owner was inspecting.
  Based on: product conclusion on flow.
- **D11 Artboards are rasterised by the browser at run time and bundled into the
  production build**: Rejected: a build step that pre-rasterises to PNG — adds a
  stage between saving and seeing, and a second source of truth.
  (decided while planning; the build requirement anticipates the published
  preview on the roadmap)
- **D12 Projection correctness is proven by pixels from a headless render**: a
  check renders the car through `vgpu/node` and compares the film the car wears
  with the artboards. Rejected: judging by eye in the browser only — a mirrored
  or offset mapping looks plausible on a grid.
  Based on: `AGENTS.md` "verify visual changes by rendering to pixels through
  `vgpu/node`".
- **D13 The idle auto-rotation is removed**: the car stands still unless
  dragged. Rejected: keeping it — "the view stays unchanged after a save" has no
  meaning on a turning car. Based on: `apps/workshop/src/renderer.ts`
  `advance()`. (decided while planning)

### Discussion log

- Earlier session (2026-11-16, before the repository existed): preview form —
  2D multi-view (recommended) / 3D model / 2D edit + 3D preview → "3D 模型预览".
  Model source → "先用占位车模". Rendering stack — three.js (recommended) /
  three.js + vgpu / pure vgpu → "纯 vgpu". Car: silver two-door sports car,
  half-car coverage, minimal geometric plus functional graphics.
- Application method — view projection (recommended) / stickers placed directly
  in 3D / UV texture → "视图投影". Settled D4.
- How artboards are edited — SVG files in the repository (recommended) / simple
  placement inside the workshop / full drawing inside the workshop → "仓库里的
  SVG 文件". The workshop is a previewer; settled D7.
- First-version scope — main chain only (recommended) / plus design switching /
  full panel → "跑通主链路".
- Product confirmation — confirm / blend at boundaries / start with design
  direction A / change something → "确认". Settled D5 and the calibration
  pattern.
- Owner, mid-discussion: focus on product design; technical approach and detail
  not to be discussed. The technical decisions were therefore made by the
  orchestrator from the code and the vgpu documentation.
- After version one — multi-select of four → design comparison, realistic look,
  export and delivery; "quick variants" not chosen.
- Comparison style — switch at a fixed view (recommended) / synced side by side
  / both → switch at a fixed view.
- Realism focus — my real car (recommended) / materials and light / both → both.
- Car model — "车还没定". Real model parked; frames in D6 are sized for a
  generic sports car.
- Deliverables — multi-select → still images and a shareable online preview;
  comparison sheet and print-shop export not chosen.
- Roadmap order → confirmed.
- Departure check — direction: proceed as stated; execution: Subagent (fable);
  autopilot: run to completion.
- D2, D3 `trim`, D6, D8 format, D11, D13 `(decided while planning)`.

### Maintenance notes

- The frames in D6 are a contract with every drawing in `designs/`. Changing a
  size or an origin moves existing designs on the car.
- When the real car model arrives it must be brought into the D2 frame at real
  scale, guides regenerated, and existing designs re-aligned by hand: positions
  that meant "middle of the door" on the placeholder will not on the real car.
- Linked guide images display in Illustrator and Inkscape. Figma does not import
  externally linked images; the guide will be missing there until a workaround
  is added.
- Browsers render SVG used as an image with system fonts only and without
  external resources. Text in a design depends on the fonts of the machine that
  views it until it is converted to outlines.
- Projection passes through the car: a paint surface hidden behind another but
  facing the same way receives the same artboard. Harmless on a closed body;
  worth knowing for models with open vents.

## Execution brief

> Written for `subagent(fable)` at `b7468a8`. Implement the tasks in
> order. Decide only what Your call leaves to you; on anything else that is
> unclear, stop and report.

### Goal

`apps/workshop` is a Vite app that renders with vgpu (WebGPU, shaders in WGSL).
Today it shows a mirror cube under a procedural sky. Turn it into a livery
previewer: a silver placeholder two-door sports car wearing a design that is
drawn on five SVG artboards and projected onto the body in the shader, updating
live when an artboard is saved.

Constraints that apply everywhere:

- Rendering is pure vgpu. Do not add three.js, another engine, or a WebGL
  fallback. Shading, model generation, and lighting are written in this
  repository.
- Before touching rendering code, read `pnpm exec vgpu docs cat
  getting-started.md` (run inside `apps/workshop`). Look things up with
  `pnpm exec vgpu docs find "<topic>"` and `pnpm exec vgpu examples search
  "<topic>"`; the bundled docs are the authority, and `.agents/skills/vgpu/`
  explains the lookup workflow. Relevant pages: `two-pass-rendering.md`,
  `no-bundler.md`, `/vgpu/geometry.docs.md`, `/vgpu/texture.docs.md`,
  `/guides/scene-composition.docs.md`, `shader-debugging.md`.
- Keep `vgpu` and `@vgpu/wgsl` on the same release.
- Code, comments, and commit messages in English. User-facing text in the
  browser in Simplified Chinese, as the existing error message in `src/main.ts`.
- Run `pnpm fmt` at the repository root on the files you change.
- Commit each milestone when it is complete.

The existing files are a starting point, not a structure to preserve: reorganise
`apps/workshop/src` as the work needs.

### Milestone 1: A silver placeholder sports car stands in the scene

Depends on: none

#### T1 · The car model contract exists and the placeholder implements it

- Where: new modules under `apps/workshop/src`
- Change: define the car model contract as TypeScript types and write a
  procedural placeholder that returns it.
- After:
  - The contract describes a car as (a) parts, each with a surface class from
    the closed set `paint | glass | wheel | light | trim`, positions, normals,
    and triangle indices, and (b) panel seams as polylines lying on the body
    (door outlines, bonnet, boot lid, fuel flap). (D1, D3)
  - All coordinates are in the car frame: metres; +X toward the nose, +Y up,
    +Z toward the car's right; origin on the ground plane under the centre of
    the car's length and width; wheels touch y = 0. (D2)
  - The placeholder is a generic two-door sports coupé at real scale — roughly
    4.4 m long, 1.85 m wide, 1.27 m tall, 2.5 m wheelbase — that a person
    recognises as such from any angle: a body with wheel arches, a greenhouse
    with windscreen, side and rear glass, four wheels with tyres and rims,
    headlights and tail lights, and trim where a body would be unpainted.
    Normals are smooth across curved panels and split at real creases.
  - The door region around x = 0, y = 0.6, |z| at the body side is `paint` and
    faces sideways (|normal.z| dominant); the roof and bonnet have areas whose
    normal is dominantly +Y; the nose and tail have areas dominantly ±X.
- Don't: let any other module read how the placeholder is built (its
  parameters, profiles, or helper shapes). Everything downstream consumes the
  contract only. (D1)

#### T2 · The scene renders the car instead of the cube

- Where: `apps/workshop/src/scene.ts` — `createScene`, `render`,
  `destroyScene`; `apps/workshop/src/metal.wgsl`; `apps/workshop/src/camera.ts`
  — `spinMatrix`
- Change: replace the box geometry and the spinning model matrix with the car
  from T1, shaded per surface class.
- After:
  - `paint` is silver metallic paint lit by the existing baked sky environment
    (`bakeEnvironment`, `env-common.wgsl`); it is visibly a metallic car paint,
    not a perfect mirror.
  - `glass`, `wheel`, `light`, and `trim` each have a plausible, distinct look
    (dark reflective glass, dark tyres with lighter rims, light lenses, dark
    matte trim).
  - The car is stationary in the world; `spinMatrix` and the box are gone.
  - The two-pass structure stays: scene into the HDR target with depth, then
    `present.wgsl` composites over the sky and tone-maps.

#### T3 · The camera orbits and zooms around the car

- Where: `apps/workshop/src/renderer.ts` — `installOrbitInput`;
  `apps/workshop/src/camera.ts` — `cameraView`, `ORBIT_RADIUS`
- Change: orbit around the car's centre, add wheel zoom, remove idle rotation.
- After:
  - The initial view shows the whole car from a front three-quarter angle.
  - Dragging rotates; the wheel zooms between a distance where a door fills the
    screen and one where the whole car fits with margin; pitch ranges from near
    the horizon to nearly straight down.
  - With no input the view does not move: the `yaw += deltaTime * 0.09` in
    `advance()` is gone. (D13)
  - Near and far planes suit the new distances.

### Milestone 2: The car wears the calibration design

Depends on: Milestone 1

#### T4 · Artboard frames are one shared definition

- Where: a new module under `apps/workshop/src`, importable from both the
  browser app and Node scripts (no DOM or Vite-only imports)
- Change: define the five views and their frames exactly as below, and derive
  from it everything that needs the mapping (shader uniforms, guide rendering,
  the projection check).
- After: one definition holds, for each view, its size in millimetres and the
  mapping from car-frame metres to artboard millimetres (u to the right, v
  down): (D6)

  | View | Size (mm) | u | v |
  | --- | --- | --- | --- |
  | left | 5200 × 1800 | 2600 − 1000·x | 1600 − 1000·y |
  | right | 5200 × 1800 | 2600 + 1000·x | 1600 − 1000·y |
  | top | 5200 × 2400 | 2600 − 1000·x | 1200 − 1000·z |
  | front | 2400 × 1800 | 1200 − 1000·z | 1600 − 1000·y |
  | rear | 2400 × 1800 | 1200 + 1000·z | 1600 − 1000·y |

- Don't: derive a frame from the model's bounding box, or restate these numbers
  in a second place. (D6)

#### T5 · The calibration design exists as five artboards

- Where: new files `designs/calibration/{left,right,top,front,rear}.svg` at the
  repository root
- Change: hand-write the five SVG files.
- After:
  - Each root element has `viewBox="0 0 <W> <H>"` and `width`/`height` in `mm`
    matching its frame in T4, so 1 user unit = 1 mm. (D6, D7)
  - Each contains, in this order: a group with `id="guide"` holding one
    `<image>` that covers the whole artboard and links
    `../_guides/<view>.png` (D8); then the livery content.
  - The livery content of each: a fine grid every 100 mm and a heavier line
    every 500 mm with its millimetre value labelled, the view's name in large
    text, an arrow labelled FRONT pointing to the nose (on front and rear, an
    arrow labelled UP instead), and a small number of solid markers of distinct
    saturated colours at stated millimetre positions, placed asymmetrically so
    that a mirrored or swapped artboard cannot match. Lines and text are opaque;
    the area between them is transparent.
  - Text uses a generic `sans-serif` family, since an SVG rendered as an image
    gets system fonts only.
  - The files are small and readable: plain elements and `<pattern>` or
    repeated lines, no generated path soup, so an agent can edit them by hand.

#### T6 · The body takes its film colour from the artboards by projection

- Where: the paint shader and scene setup from T2; a new module that turns SVG
  text into textures
- Change: rasterise the five artboards in the browser, bind them to the paint
  shader, and select and sample them per fragment.
- After:
  - Before rasterising, the element with `id="guide"` is removed from the SVG,
    so the guide never reaches the car. (D8)
  - A fragment on a `paint` surface picks its artboard by the dominant axis of
    its car-frame normal with a hard switch — +Y top, +X front, −X rear, −Z
    left, +Z right, dominant −Y none — and samples it at the T4 mapping of its
    car-frame position. Fragments outside the artboard's frame take no film.
    (D4, D5)
  - Where the sampled alpha is above zero the surface is shaded as wrap film in
    the sampled colour, mixed with the paint by that alpha; film looks like a
    satin non-metallic layer, distinct from the metallic paint around it. (D9)
  - Artboard colours are treated as sRGB and reach the HDR pass as linear
    values; the edges of opaque shapes show no dark or light fringe (mind
    premultiplied alpha on upload and when filtering).
  - Resolution is at least 1 texel per millimetre, so a 5 mm line stays a clean
    line when the camera is close.
  - `glass`, `wheel`, `light`, and `trim` never show film. (D3)
  - The app loads the design named by a single constant, `calibration`.
  - `pnpm build` output shows the same design with no dev server: the artboards
    are part of the bundle. (D11)
- Don't: blend two artboards near a boundary (D5); add UVs to the car model or
  bake the projection into a per-model texture (D4); introduce a build step
  that rasterises SVG ahead of time (D11).

### Milestone 3: Saving an artboard updates the car

Depends on: Milestone 2

#### T7 · A saved artboard appears on the car without a reload

- Where: the artboard loading module from T6; `apps/workshop/vite.config.ts` if
  the dev server needs configuring; `apps/workshop/src/main.ts`
- Change: while `pnpm dev` runs, propagate a change to any
  `designs/calibration/*.svg` into the running page.
- After:
  - Saving an artboard updates the car within about a second. The page does not
    reload: the WebGPU device, the baked environment, and the camera's yaw,
    pitch, and distance are the same objects and values as before. (D10)
  - Only artboards whose text actually changed are rasterised and uploaded
    again. (D10)
  - Rapid successive saves leave the car showing the last saved content, never
    an older one that finished rasterising late.

#### T8 · A broken artboard is reported and the last good image stays

- Where: the artboard loading module; `apps/workshop/index.html`;
  `apps/workshop/src/main.ts`
- Change: handle artboards that fail to parse or rasterise, at start-up and on
  reload.
- After:
  - On failure the car keeps the previous image for that artboard (at start-up:
    no film for that artboard), the other artboards are unaffected, and a small
    notice in a corner of the screen names the file (`designs/calibration/
    left.svg`) and the problem, in Simplified Chinese apart from the path and
    the underlying message.
  - Malformed XML is detected as a failure, not rasterised as an empty image.
  - When the file is saved in a working state the notice for it disappears and
    the car updates. Several broken files are listed together.
  - The existing full-screen `#error` box stays reserved for "rendering cannot
    start".

### Milestone 4: Guides and pixel proof

Depends on: Milestone 2

#### T9 · The scene can be rendered headless from Node

- Where: new `apps/workshop/scripts/`; `apps/workshop/package.json`;
  `apps/workshop/tsconfig.json`
- Change: make the car-plus-design scene renderable through `vgpu/node`, and
  add a script `render` to `apps/workshop/package.json` that writes a PNG of
  the lit car wearing a design.
- After:
  - `pnpm --filter @livery/workshop render` with its arguments writes a PNG of
    the car from a chosen angle and distance at a chosen size, for the design
    `calibration` by default. An agent uses this to look at a design without a
    browser.
  - The Node path and the browser path share the scene, model, frame, and
    shader code; only shader loading and SVG rasterisation differ.
  - `apps/workshop/tsconfig.json` covers the scripts, so `pnpm typecheck`
    checks them.
  - New dev dependencies are limited to what this needs (a PNG encoder, an SVG
    rasteriser for Node) and require no install scripts.

#### T10 · Guide images are generated from the model

- Where: `apps/workshop/scripts/`; `apps/workshop/package.json`; new files
  `designs/_guides/{left,right,top,front,rear}.png`
- Change: add a script `guides` that renders the five guide images from the car
  model, run it, and commit its output.
- After:
  - `pnpm --filter @livery/workshop guides` writes the five PNGs. Each is an
    orthographic view of the model aligned exactly to its T4 frame, so that
    placed over the whole artboard it lines up with the projection: a mark
    drawn over the guide's door lands on the door.
  - A guide shows the body outline, the surface classes as flat distinguishable
    tones (glass, wheels, lights, trim readable against paint), and the panel
    seams as lines. It is light enough that drawing over it stays legible.
  - It reads only the car model contract. (D1, D8)
  - Opening `designs/calibration/left.svg` in a browser shows the guide under
    the calibration grid.

#### T11 · A check proves the projection from pixels

- Where: `apps/workshop/scripts/`; `apps/workshop/package.json`; the paint
  shader (a debug output mode)
- Change: add a script `check:projection` that renders headless and exits
  non-zero when the projection is wrong.
- After: `pnpm --filter @livery/workshop check:projection` exits 0 only when
  all of these hold for the `calibration` design, and prints which assertion
  failed otherwise: (D12)
  - For each of the five views, an orthographic render aligned to that view's
    frame, showing the unlit film colour and which artboard each fragment
    selected, matches that view's rasterised artboard at every sampled pixel
    where the fragment selected that view — within a small tolerance, over a
    sample large enough to include grid lines, text, and every coloured marker
    that falls on such a fragment.
  - Each view has a substantial number of such pixels, and at least one
    coloured marker per view is among them (move a marker in T5 if none lands
    on a suitable surface).
  - The door-centre point on each side (x = 0, y = 0.6, on the body side)
    selects `left` at −Z and `right` at +Z; a roof point selects `top`; a nose
    point selects `front`; a tail point selects `rear`.
  - No fragment of class `glass`, `wheel`, `light`, or `trim` carries film.
  - A fragment whose normal is dominantly −Y carries no film.
- Don't: compute the expected colours with the same shader code path that is
  under test; the expectation comes from the artboard raster and the T4
  mapping evaluated in TypeScript.

### Milestone 5: The repository describes what now exists

Depends on: Milestones 1–4

#### T12 · AGENTS.md and README.md match the workshop

- Where: `AGENTS.md` — the bullet beginning "**Livery is applied by view
  projection**" and the section "## Working with vgpu"; `README.md` — the
  sections "## 现状" and "## 结构"
- Change: update both files.
- After:
  - `AGENTS.md` (English) no longer says "not implemented yet", and records
    what an agent cannot recover from the code: the car frame, the fixed
    artboard frames and that they are a contract with every design, that only
    `paint` receives livery, the `designs/<design>/<view>.svg` layout with the
    shared generated `designs/_guides/`, the `id="guide"` rule, and how to use
    `render`, `guides`, and `check:projection` — including that guides must be
    regenerated after the car model changes.
  - `README.md` (Chinese, for the owner) describes the present state — the
    placeholder car, the calibration design, editing an SVG and seeing it
    update — and lists `designs/` under the structure. The "接下来的方向" list
    keeps only what is still ahead.

Milestones are sequential: 2 builds on the car from 1, 3 and 4 on the projection
from 2, 5 on all of them. They are not independent.

### Your call

- Module and file names, internal structure, and how `apps/workshop/src` is
  reorganised.
- How the placeholder car is constructed and its exact styling, within T1.
- Whether materials are one draw with a per-vertex class or one draw per class.
- Texture layout (one array, or one texture per view), resolution above the
  stated minimum, filtering, and whether to build mipmaps — provided the grid
  does not shimmer badly at the default distance.
- The mechanism that carries a saved file into the page (Vite HMR on imported
  raw SVG, a small Vite plugin with a custom event, or another Vite-native
  way), within T7 and D11.
- The Node SVG rasteriser and PNG encoder; the arguments of `render`.
- Zoom limits and feel; the wording and styling of the artboard error notice.
- Whether to draw panel seams on the 3D car, and whether to add a minimal
  ground or contact shadow so the car reads as standing on the ground. No other
  environment or lighting work.

### Landmines

- `apps/workshop/src/scene.ts` imports `.wgsl` through the Vite loader
  (`apps/workshop/vite.config.ts`). Node has no loader: shaders there go
  through `resolveShader()` then `prepareShader()` (`vgpu docs cat
  no-bundler.md`), and passing a raw WGSL string throws
  `VGPU-SHADER-SOURCE-UNPREPARED`.
- vgpu does not generate mip levels (`/vgpu/texture.docs.md`: "Extra levels are
  not generated"). `bakeEnvironment` in `scene.ts` shows how this repository
  fills them by hand.
- `designs/` is outside the Vite root `apps/workshop`. The dev server must be
  able to read and watch it, and the production build must include it.
- pnpm 11 blocks dependency install scripts by default; the two exceptions
  already allowed are in the root workspace configuration. Prefer dependencies
  that ship prebuilt binaries as optional packages.
- A browser renders an SVG used as an image without external resources and with
  system fonts only; the Node rasteriser may lay text out differently. The
  check in T11 must compare the Node render against the Node raster, never
  against a browser raster.
- Every binding declared in WGSL must be set; a missing one fails with
  `VGPU-R1-BINDING-NEVER-SET`. Unused bindings may be stripped by reflection —
  consult `shader-debugging.md` when a debug mode changes which bindings are
  live.

### Scope

In scope:
- `apps/workshop/**`
- `designs/**`
- `AGENTS.md`
- `README.md`
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `turbo.json` — only
  as far as new dev dependencies and scripts require
- `.gitignore` — only for new generated paths, if any

Out of scope:
- `.agents/skills/**` — third-party skill files
- `wiki/**` — the orchestrator maintains plans
- Switching between designs, any panel or control beyond the error notice,
  layer or colour variants, lighting environments, image export for the owner,
  publishing — later plans
- A real design: `designs/` contains only `calibration` and `_guides`
- three.js or any other rendering engine; a glTF or other model-file loader

### Stop and report if

- A task's anchor is missing, or the code there differs from what the task describes.
- A task needs a file outside the in-scope list.
- Two tasks contradict each other, or a task contradicts the code it changes.
- vgpu 0.6 cannot do something a task requires (for example uploading an image
  to a texture, or rendering the scene through `vgpu/node`) without bypassing
  it for another library.
- A needed dependency cannot be installed without allowing a new install script.
- The check in T11 cannot be made to pass without loosening one of its
  assertions.

## Verification

### Milestone validations

- Milestone 1: `pnpm typecheck && pnpm lint` -> exit 0
- Milestone 2: `pnpm typecheck && pnpm build` -> exit 0
- Milestone 3: `pnpm typecheck && pnpm lint` -> exit 0
- Milestone 4: `pnpm --filter @livery/workshop check:projection` -> exit 0
- Milestone 5: `pnpm fmt:check` -> exit 0

### Commands

| Purpose | Command | Expected result |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Format | `pnpm fmt:check` | exit 0 |
| Build | `pnpm build` | exit 0 |
| Projection check | `pnpm --filter @livery/workshop check:projection` | exit 0 |
| Guides reproducible | `pnpm --filter @livery/workshop guides && git status --porcelain designs/_guides` | no changes, or byte-level noise only with identical pixels |
| Headless render (acceptance) | `pnpm --filter @livery/workshop render` with the arguments documented in `AGENTS.md`, three-quarter front and each side | PNGs show a recognisable silver coupé wearing the calibration grid; text on each side reads correctly |
| Live reload (acceptance) | `pnpm dev`, open the page, rotate and zoom, edit `designs/calibration/left.svg` | car updates without reload, view unchanged |
| Broken artboard (acceptance) | with `pnpm dev` running, make `left.svg` malformed, then repair it | notice names the file, car keeps the old image, notice clears on repair |
| Built app (acceptance) | `pnpm build`, serve `apps/workshop/dist` | same car and design with no dev server |

### Done criteria

- [ ] All listed commands pass.
- [ ] Every task's `After` state holds.
- [ ] A marker drawn at the door centre of `left.svg` appears at the door
      centre on the car's left side and nowhere on the right side.
- [ ] The boundary between the side and top artboards on the shoulder is a
      sharp line.
- [ ] `check:projection` fails when a mapping sign in the frame definition is
      flipped (verified by a temporary local edit, reverted).
- [ ] No module outside the placeholder reads the placeholder's construction;
      the scene, guides, and check consume the car model contract only.
- [ ] No three.js or other engine in `pnpm-lock.yaml`.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] The Outcome is appended and `wiki/plans/README.md` status is updated.

### Merge and deploy

- The dev server of the main worktree may still be running on port 5173 from
  before this work; it serves the old cube until the branch is merged and the
  server restarted.
- No deployment, environment variables, or migrations. New dev dependencies
  only; if a new entry was added to the allowed install scripts, name it in the
  pull request.
