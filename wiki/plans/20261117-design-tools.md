# Plan 20261117-design-tools: Feature lines and a comparison sheet for designing liveries

> Three parts for three readers. The Record says why and stays true after the
> code moves on. The Execution brief is the only part a delegated executor
> receives. Verification is the orchestrator's. At close, `dev:execute-plan`
> appends an Outcome and updates `wiki/plans/README.md`.
>
> Drift check: `git diff --stat ca13855..HEAD -- scripts src/frames.ts src/camera.ts package.json AGENTS.md README.md designs/_guides`

## Status

- Priority: P1
- Effort: M
- Risk: LOW
- Depends on: wiki/plans/20261117-porsche-911.md
- Category: dx
- Execution: subagent(opus) — from the departure check
- Stop after: implementation — from the departure check (plain autopilot)
- Plan review: none — plain autopilot was chosen
- Workspace: current — linked worktree on `dev/20261116-workshop-main-chain`; the commits join pull request #1
- Planned at: `ca13855`, 2026-11-17

## Record

### Requirement

The first livery drawn for the 911 was judged ugly by the owner. Asked whether the
tools held design back, the planner named two gaps among others, and the owner asked
for those two:

1. A design is authored by writing coordinates; lines that follow the body had to be
   measured from the model by hand each time. Designers (the planner, or the owner in
   Illustrator or Inkscape) need the car's features as named vector lines on every
   artboard: above all, where each artboard's reach on the paint ends, because a
   graphic that continues from one artboard to another must meet that line.
2. Judging a design means looking at it from several angles and comparing it with
   others; that took hand-written scripts. One command should render several designs
   from fixed camera positions into one labelled sheet.

Product conclusions, confirmed by the owner:

- **Feature lines.** `pnpm guides` also writes `designs/_guides/<view>-lines.svg` per
  artboard: named vector paths in artboard millimetres, importable into
  Illustrator or Inkscape and readable as data. They hold the artboard's reach on
  the paint, the outlines of glass, lights and wheels, and on the side artboards the
  beltline (bottom of the side windows), the shoulder (top of the side reach), the
  sill line (bottom of the side reach) and a cross at each wheel centre. The guide
  PNGs show the same lines, thin and coloured. No design file changes; the lines are
  computed from the car model and regenerate with it.
- **Comparison sheet.** `pnpm sheet` writes one image: a row per design, a column per
  fixed camera position (by default front-right three-quarter, left side, left-rear
  three-quarter, high front three-quarter), rows and columns labelled. Options:
  `--design` (default all, the bare car allowed), `--env` (default day), `--views`,
  `--out`. It prints the file it wrote. Each design's film is released before the
  next, so many designs do not exhaust memory.
- **Not in this plan.** Exporting from the page and the current-view export
  (roadmap item 4), drawing in the workshop, showing the lines on the car.

### Decisions & tradeoffs

- **D1 Lines are traced from the aligned surface render the guides already make,**
  at 1 pixel per millimetre: per pixel the surface class and the artboard the
  fragment selected. Boundaries are traced with marching squares and simplified
  (Douglas–Peucker, 0.75 mm). Rejected: deriving lines from mesh vertices — sparse
  and noisy along a column, and dependent on the mesh. Based on: `scripts/guides.ts`,
  `scripts/lib/aligned.ts` (`renderAligned`, `decodeSurface`).
- **D2 "Reach" is the set of paint pixels whose fragment selected this artboard.** Its
  boundary is exactly where a graphic stops landing on this artboard and the
  neighbouring one takes over. Rejected: the silhouette of the car — it includes
  paint that belongs to other artboards.
- **D3 The side lines are per-column extremes of masks, as open polylines:** beltline
  = lowest glass pixel; shoulder = highest reach pixel; sill = lowest reach pixel;
  each broken where a column has none. Wheel centres are the centres of the wheel
  mask's connected components' bounding boxes (components smaller than 0.05 m² are
  ignored).
- **D4 The fixed camera positions are named data in one shared module,
  `src/shots.ts`,** so roadmap item 4's export can reuse them. Rejected: defining them
  inside the sheet script.
- **D5 The sheet composes rendered PNGs with an SVG and `@resvg/resvg-js`,** already a
  dependency; labels use a sans-serif system font. No new dependency.

### Discussion log

1. The owner: "这也太丑了, 这就是你的设计能力吗?" The planner named the design
   failures and produced three drafts; asked about tools, it listed five gaps.
2. The owner: "先做工具第 1、2 项".
3. _Product confirmation_ of the conclusions above. Answer: **confirmed**.
4. _Departure check._ Direction as D1–D5, drafts committed first so the tree is clean
   and the sheet has material: **go ahead**. Execution: **subagent (opus)**.
   Autopilot: **run to completion**.

### Maintenance notes

- `pnpm guides` now also rewrites `designs/_guides/*-lines.svg`; commit them with the
  PNGs whenever the car changes.

## Execution brief

> Written for `subagent(opus)` at `ca13855`. Implement the tasks in order. Decide only
> what Your call leaves to you; on anything else that is unclear, stop and report.

### Goal

This repository is a WebGPU previewer for car liveries (vgpu, Vite, TypeScript; the
app at the repository root). A design is five SVG artboards in millimetres,
`designs/<design>/<view>.svg` for `left`, `right`, `top`, `front`, `rear`; their
frames (size, and the mapping from car-frame metres to artboard millimetres) are in
`src/frames.ts`. `pnpm guides` (`scripts/guides.ts`) renders an orthographic drawing
of the car aligned to each artboard into `designs/_guides/<view>.png` (0.5 px/mm),
from `renderAligned(..., { output: "surface" })` in `scripts/lib/aligned.ts`, which
gives, per pixel, the surface class (`paint`, `glass`, `wheel`, `light`, `trim`) and
the artboard the fragment selected (`decodeSurface`). `pnpm render`
(`scripts/render.ts`) renders the lit car wearing a design. This work adds named
vector feature lines to the guides, and a command that renders a comparison sheet.

Conventions:

- Imports spell `.ts`. Code, comments, commit messages in English; `README.md` in
  Chinese. Comments say what the code is for.
- Scripts run TypeScript directly with Node (≥ 22.18); `src/` modules used by
  scripts must stay free of DOM and Vite APIs.
- Before each commit run `pnpm exec oxfmt <files>` on hand-edited files (never on
  `.png`). One commit per milestone, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Plain, single git
  commands; stage by name; never push.
- Run nothing that checks, builds or serves the project, except exactly the
  generation command of T3. A dev server may run on port 5173; leave it alone.

Milestone 2 is independent of Milestone 1; Milestone 3 depends on both.

### Milestone 1: Feature lines

#### T1 · Masks become simplified vector paths

- Where: new `scripts/lib/trace.ts`.
- After:
  - `traceContours(mask: Uint8Array, width: number, height: number): number[][][]`
    returns the boundaries of the set pixels as closed polylines in pixel
    coordinates (marching squares on pixel corners; a pixel spans [x, x+1] × [y, y+1]),
    holes included.
  - `simplify(points: number[][], tolerance: number, closed: boolean): number[][]` —
    Douglas–Peucker.
  - `columnExtremes(mask, width, height, which: "top" | "bottom"): number[][][]` —
    for each column with set pixels, the top edge (y of the first set pixel) or bottom
    edge (y + 1 of the last), at x + 0.5; returned as open polylines broken where a
    column has none.
  - `components(mask, width, height): { area: number; minX; minY; maxX; maxY }[]` —
    4-connected components with their pixel count and bounding box.
  - Pure functions, no I/O.

#### T2 · `pnpm guides` writes the lines and draws them on the guides

- Where: `scripts/guides.ts`.
- Change: For each view, render once more with `renderAligned(..., scale 1, { output: "surface" })`
  (no seams), build masks from the decoded pixels, trace, simplify with tolerance
  0.75, and write `designs/_guides/<view>-lines.svg`. Then draw the lines over the
  guide PNG: compose an SVG holding the guide image (as a data URL) and the lines,
  rasterise it with `@resvg/resvg-js` at the guide's size, and write that as the PNG.
- After:
  - `<view>-lines.svg`: root `<svg>` with the artboard's `viewBox="0 0 W H"` and
    `width`/`height` in mm like the design files; a comment saying it is generated by
    `pnpm guides` and must not be edited; groups, each with an `id` and a `<title>`:
    - `reach` — paint pixels whose selected artboard is this view: closed paths,
      `fill="none"`, stroke `#d6336c`, width 2.
    - `glass`, `lights`, `wheels` — outlines of those classes: stroke `#1c7ed6`,
      `#f08c00`, `#495057`, width 1.5.
    - Side views only (`left`, `right`): `beltline` (bottom edge of the glass mask),
      `shoulder` (top edge of the reach mask), `sill` (bottom edge of the reach mask),
      open polylines, stroke `#2f9e44` width 2.5, each a `<path id="…">` (if broken
      into several pieces, one path with several subpaths); and `wheel-centres`: for
      each wheel component of at least 50 000 px (0.05 m²) a cross of two 120 mm lines
      through its bounding-box centre, plus a `<text>` with its coordinates
      (`u 1327 v 1261`), font-size 24.
    - Coordinates rounded to 0.1 mm. Paths as `M … L … Z` (closed) or `M … L …`.
  - The guide PNGs keep their size (0.5 px/mm) and now show the lines; the lines'
    stroke widths are in millimetres, so they read thin.
  - The design files and the `id="guide"` rule are unchanged.
  - The header comment of `guides.ts` says it writes both files.
- Don't: change `renderAligned`, the shader or the frames.

#### T3 · Regenerate

- Change: run `pnpm guides` once; commit the five PNGs and five `-lines.svg` with
  Milestone 1.

### Milestone 2: Comparison sheet

#### T4 · Named camera positions

- Where: new `src/shots.ts` (shared, no DOM).
- After: exports `SHOTS`, an ordered list of `{ id, name, yaw, pitch, distance }`
  (degrees, degrees, metres; yaw 90 looks at the nose, 0 at the right side, 180 at
  the left, 270 at the tail):

  | id      | name | yaw | pitch | distance |
  | ------- | ---- | --- | ----- | -------- |
  | `front` | 右前 | 54  | 9     | 5.2      |
  | `left`  | 左侧 | 180 | 3     | 6.0      |
  | `rear`  | 左后 | 225 | 12    | 5.4      |
  | `above` | 俯视 | 54  | 38    | 6.2      |
  | `right` | 右侧 | 0   | 3     | 6.0      |
  | `nose`  | 车头 | 90  | 6     | 5.6      |
  | `tail`  | 车尾 | 270 | 6     | 5.6      |

  `DEFAULT_SHOTS = ["front", "left", "rear", "above"]`, and a helper that turns a
  shot into an `OrbitState` (radians). Distances are clamped by the camera as usual.

#### T5 · `pnpm sheet`

- Where: new `scripts/sheet.ts`; `package.json` script `"sheet": "node scripts/sheet.ts"`;
  `scripts/lib/design.ts` if `applyDesign` needs a way to release its film.
- After:
  - Options (parsed like `render.ts`, with the same one-line errors and exit code 2):
    `--design a,b,…` (default: every design from `listDesigns()`; `_bare` allowed for
    the bare car), `--env <id>` (default `day`), `--views id,id,…` (default
    `DEFAULT_SHOTS`), `--width` and `--height` per cell (default 640 × 370), `--out`
    (default `livery-sheet-<env>.png` in the system's temporary directory, resolved
    like `render --out`). An unknown design, environment or view ends with a message
    listing the valid ones.
  - One GPU, one scene, one environment. For each design in order: put it on, render
    each shot into a cell, then release that design's film before the next (the scene
    returns to bare paint). The bare car renders with no design.
  - The cells are laid out with a label column on the left (design name, the bare car
    as `裸车`) and a header row (each shot's `name`), on a dark background, composed as
    an SVG with the cells as PNG data URLs and rasterised with `@resvg/resvg-js`.
    Text: sans-serif, light grey, ~18 px.
  - Prints the file it wrote. Broken artboards are reported on stderr like `render`
    does, and the sheet is still written.
  - Header comment documents the options.

### Milestone 3: Documents

#### T6 · `AGENTS.md` and `README.md`

- `AGENTS.md`: under the scripts list, `pnpm guides` also writes
  `designs/_guides/<view>-lines.svg` (what is in it, and that the `reach` line is
  where a graphic must meet the next artboard); add `pnpm sheet` with its options,
  and say: when designing, measure from the lines file rather than the mesh, and judge
  every design with `pnpm sheet` from several environments before showing it.
- `README.md`: the command block gains
  `pnpm sheet --design a,b --env day   # 把几套设计按固定机位渲成一张对比图`, and
  the bullet about guides mentions the `-lines.svg` files (可以导入 Illustrator /
  Inkscape 吸附对齐).

### Your call

- Internal structure of the trace functions; colours' exact hex within the stated
  roles; the sheet's margins and label layout.

### Scope

In scope: `scripts/lib/trace.ts`, `scripts/guides.ts`, `designs/_guides/*`,
`src/shots.ts`, `scripts/sheet.ts`, `scripts/lib/design.ts`, `package.json` (one
script), `AGENTS.md`, `README.md`.

Out of scope: `src/` except `src/shots.ts`; designs; shaders; `wiki/`.

### Stop and report if

- A task needs a file outside the scope.
- `renderAligned` at 1 px/mm fails for lack of memory or size limits.

## Verification

| Purpose             | Command                                                                                                                                                                               | Expected                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Checks              | `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, `pnpm build`                                                                                                                         | exit 0                   |
| Projection          | `pnpm check:projection`                                                                                                                                                               | exit 0                   |
| Guides reproducible | `pnpm guides` + `git status --porcelain designs/_guides`                                                                                                                              | empty                    |
| Lines right         | open the lines SVGs over the PNGs; the side `beltline` matches the measured window bottom (v ≈ 713 at u 1900, 682 at u 3500 on `left`), wheel centres ≈ (1327, 1261) and (3884, 1261) | within 3 mm              |
| Sheet               | `pnpm sheet` and `pnpm sheet --design draft-2-le-mans,_bare --env night --views nose,tail`                                                                                            | readable labelled sheets |
| Errors              | `pnpm sheet --design nope`                                                                                                                                                            | exit 2, lists designs    |

Done when all hold, no out-of-scope change, Outcome appended, README status updated.

## Outcome

- Status: APPROVE — 2026-11-17
- Mode: subagent(opus), one work package, one revision round.
- Commits: `e577849..99fabb4`
- Deviations:
  - The three side lines are `<path id>` elements in a `feature-lines` group, since a
    group and its one path cannot share an id.
  - The revision round: per-column lines spiked where small specks of a mask sat
    above or below the surface, so masks lose pieces under 0.02 m² before column
    extremes (0.002 m² before outlines); a wheel's centre u is the midpoint of its
    widest row, not of its bounding box (the box put the left front 17 mm off);
    labels enlarged; shot distances shortened from 5.2–6.2 m to 4.0–4.8 m because the
    car filled only a third of a cell.
- Verified by the orchestrator: typecheck, lint, format, build, projection check;
  guides regenerate byte for byte; the left beltline is within 2 mm of the values
  measured on the mesh; three wheel centres within 3 mm. The right front comes out
  at u 3800: the model's right front tyre sits 76 mm further back than the left
  (x 1.197 against 1.273), checked on the mesh, so the line is right. `pnpm sheet`
  produced labelled sheets for four designs × four shots and for a night variant with
  three other shots; unknown designs and views exit 2 listing the valid ones.
- Follow-ups:
  - The model's asymmetric front wheels: a right-side design mirrored from the left
    misses the right front arch by 76 mm; use `right-lines.svg`.
