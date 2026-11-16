# Plan 20261116-design-switching: Switch between designs with the view held still

> Three parts for three readers. The Record says why and stays true after the
> code moves on. The Execution brief is the only part a delegated executor
> receives. Verification is the orchestrator's. At close, `dev:execute-plan`
> appends an Outcome and updates `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 8feeee8..HEAD -- apps/workshop designs AGENTS.md README.md`

## Status

- Priority: P1
- Effort: M
- Risk: LOW
- Depends on: wiki/plans/20261116-workshop-main-chain.md
- Category: feature
- Execution: subagent(opus) — from the departure check
- Stop after: implementation — from the departure check (plain autopilot)
- Plan review: none — the orchestrator is already on the top tier, so the audit was not offered
- Workspace: current — the session was already in the linked worktree on `dev/20261116-workshop-main-chain`; the commits join the open pull request #1
- Planned at: `8feeee8`, 2026-11-16

## Record

### Requirement

The workshop shows exactly one design, named by a constant in the source. Choosing
between livery directions means comparing them on the car from the same angle, and
today that takes a code edit per look. This is item 2 of the roadmap the owner
confirmed after the main chain: several designs side by side in the repository, and
a way to flip between them while the camera stays where it is.

Product conclusions, confirmed by the owner:

- **Switching.** `←` and `→` step through the designs and wrap around at either end.
  The camera's direction and zoom do not move. A switch is immediate: no blank frame
  and no loading state in between. Keyboard only; no buttons are added to the screen.
- **The list.** Every directory under `designs/` is one entry (`_guides` is not),
  ordered by directory name. A built-in entry, the bare car with no film at all, is
  always last. One example design made of plain colour bands is added, so the list
  reads `calibration`, the example, bare car. While the dev server runs, creating or
  deleting a design directory changes the list without a page reload. A design may
  have fewer than five artboards: the side without one stays bare paint and nothing
  is reported.
- **On screen.** One small line stays in the top-left corner: the design's name (its
  directory name) and its position, as in `stripes  2 / 3`; the bare car reads
  `裸车`. The notice in the bottom-left corner reports broken artboards of the design
  on screen only.
- **Address.** Switching puts the design's name in the address (`/#stripes`).
  Reloading stays on that design, and the link opens it directly. With no name in
  the address, or a name that does not exist, the first entry of the list is shown.
- **Editing.** Save-to-refresh works as before. Saving an artboard of a design that
  is not on screen changes nothing visible; switching to it shows the saved state.
- **Not in this plan.** The real design directions A/B/C/D (still parked),
  side-by-side comparison, a thumbnail list, touch gestures for switching, and
  keeping the camera in the address.

### Decisions & tradeoffs

- **D1 Every design stays resident on the GPU; a switch only rebinds textures.**
  Rejected: rasterising a design when it is switched to — an artboard takes a
  noticeable fraction of a second, so each switch would show bare paint filling in,
  which defeats comparing two designs at one glance. Cost accepted by the owner:
  about 210 MB of texture memory per design (five artboards are 39.84 megapixels at
  1 texel per millimetre, 4 bytes each, plus a mip chain of one third more). Based
  on: `apps/workshop/src/frames.ts:33-74` (sizes), `apps/workshop/src/artboards.ts:13`
  (`TEXELS_PER_MM = 1`), `apps/workshop/src/artboards.ts:141-160` (mip chain), and
  the departure check.
- **D2 The scene no longer owns a design's textures.** The scene owns only the empty
  film it shows when nothing is worn, and offers a way to bind a texture to a view.
  The textures of all designs belong to one holder, which creates, replaces and
  destroys them. Rejected: keeping ownership in the scene and adding a design
  dimension to it — the scene would then carry design names, loading order and
  problems, none of which is rendering. Based on: `apps/workshop/src/scene.ts:145-150`
  and `:224-234`, where the scene creates, replaces and destroys film itself today.
- **D3 A view without a file is bare paint, not a problem.** This reverses the main
  chain's behaviour, where a missing file was reported as `文件不存在` and the side
  kept its last image. Deleting an artboard file now clears that side. A file that
  exists but cannot be rasterised still keeps the last good image and is reported.
  Rejected: keeping "missing" as a problem — a design that only dresses the sides
  would carry a permanent notice. Based on: the product confirmation;
  `apps/workshop/src/artboards.ts:201` (today's throw on a missing source).
- **D4 A design is a directory directly under `designs/` whose name does not start
  with `_` and that holds at least one of the five artboard files.** Its name is the
  directory name, and designs are ordered by plain code-unit comparison of names, so
  the browser and Node agree whatever the locale. Names starting with `_` are
  reserved for things that are not designs. Rejected: a manifest file listing the
  designs and their order — one more thing to edit for every new design; renaming a
  directory (`01-…`) already orders them. Based on: the product confirmation ("按
  目录名排", "新建一个目录就多一项").
- **D5 The bare car is a built-in entry with the id `_bare`, always last.** The
  reserved prefix of D4 guarantees no directory can take that id. Rejected: an empty
  directory in `designs/` — git does not keep empty directories, and the entry would
  be deletable.
- **D6 The design on screen is named by the URL fragment, written with
  `history.replaceState`.** Rejected: `localStorage` — a link could not open a
  design (the owner chose the address over it). Rejected: assigning
  `location.hash` — every key press would add a history entry and the back button
  would replay the switching. The fragment is rewritten only when a switch happens
  or when it named something that does not exist; a URL with no fragment is left
  alone and shows the first entry. Based on: the grilling answer "地址栏带方案名".
- **D7 Artboards are rasterised one at a time, the design on screen first.**
  Everything else follows in list order behind it. Until a design's first
  rasterisation has finished, switching to it shows its artboards arriving, exactly
  as the first design does at page load; "no blank frame" holds once it is loaded.
  Rejected: rasterising all designs in parallel — rasterising a large artboard
  blocks the main thread, and frames must keep flowing between artboards. Based on:
  `apps/workshop/src/artboards.ts:225-227`. `(decided while planning)`
- **D8 The list follows `designs/` live through the hot-update channel the artboards
  already use.** A file created or deleted under a glob import reaches the importing
  module as a hot update, the same as a saved file. When the design on screen
  disappears, the first entry of the new list is shown and the address is rewritten.
  Based on: `node_modules/.pnpm/vite@8.3.8_*/node_modules/vite/dist/node/chunks/node.js`
  (`hotUpdate` of the import-glob plugin adds the importers of a matching created or
  deleted file); `apps/workshop/src/design-sources.ts:51-61`. `(decided while planning)`
- **D9 `←`/`→` act only with no modifier key held.** With a modifier they belong to
  the browser (back and forward on macOS). `(decided while planning)`
- **D10 The example design is `designs/stripes`.** Two bands run nose to tail over
  the top and continue down the front and rear artboards at the same offsets from
  the centre line, and one band with a pinstripe runs along each side. It exists to
  make a switch visible on every side and to show that bands line up across the
  boundary between two artboards; it is not one of the design directions.
  `(decided while planning)`
- **D11 The Node `render` script refuses a design that does not exist.** With D3 a
  misspelt `--design` would otherwise render a bare car and report nothing. It ends
  with exit code 2 and one line naming the designs that exist. The bare car is not
  added to the script. `(decided while planning)`
- **D12 No test framework is added.** The repository has none, and its checks are
  typecheck, lint, format, build and the pixel check of the projection. Switching is
  verified by the orchestrator in a real browser and through `render`.
  Based on: `AGENTS.md` (Conventions). `(decided while planning)`

### Discussion log

1. _Where do the designs to switch between come from?_ Offered: the switching plus
   one example design (recommended); drafting A/B/C/D now; switching only. Answer:
   **switching plus one example**. Settles D10 and keeps A/B/C/D parked.
2. _How does the screen say which design is shown?_ Offered: a permanent small label
   in a corner (recommended); a label that flashes on a switch and fades; nothing.
   Answer: **permanent label**, top-left, name and position.
3. _Who is in the list?_ Offered: every design under `designs/` (recommended); those
   plus a built-in bare car; every design except the calibration pattern. Answer:
   **all designs plus the built-in bare car**. Settles D5.
4. _What is shown after a reload?_ Offered: the name in the address (recommended);
   the browser remembers; always the first entry. Answer: **the address**. Settles D6.
5. _Product confirmation_ of the conclusions under Requirement, including the
   details added by the planner (wrap-around, keyboard only, live list, designs with
   fewer than five artboards, notice for the shown design only, unknown name falls
   back to the first entry). Answer: **confirmed**.
6. _Departure check._ Direction as in D1, D5, D6, D10: **go ahead**. Execution:
   **subagent (opus)**, the recommended option. Autopilot: **run to completion**; the
   commits join pull request #1, which will then carry roadmap items 1 and 2.
7. `(decided while planning)` D7, D8, D9, D11, D12, and the exact rule of D4.

### Maintenance notes

- Memory grows by about 210 MB per design (D1). With the four real directions added
  the workshop will hold well over a gigabyte of film. If that becomes a problem,
  the lever is the resident resolution of designs that are not on screen, not the
  switching mechanism.
- D3 changed what the bottom-left notice means: it now only ever names a file that
  exists and is broken.
- `check:projection` still names `calibration` itself and needs all five of its
  artboards; D3 must not let it pass with one missing.

## Execution brief

> Written for `subagent(opus)` at `8feeee8`. Implement the tasks in order. Decide
> only what Your call leaves to you; on anything else that is unclear, stop and
> report.

### Goal

`apps/workshop` is a WebGPU previewer (the `vgpu` library, Vite, TypeScript) that
shows a car wearing a livery design. A design is five SVG artboards,
`designs/<design>/<view>.svg` for the views `left`, `right`, `top`, `front`, `rear`;
each is rasterised to a texture and projected onto the car's paint. Today the
workshop shows the single design named by the constant `DESIGN`. After this work it
holds every design under `designs/` ready on the GPU, `←`/`→` switch between them
instantly with the camera untouched, the address names the design on screen, and a
small label says which one it is.

Conventions that bind every task:

- `apps/workshop/src/scene.ts`, `artboards.ts`, `frames.ts`, `car/` and the new
  `wardrobe.ts` are loaded by Node scripts as well as the browser. They must not use
  the DOM, `import.meta.glob`, `import.meta.hot` or import `.wgsl` files. Whatever
  differs between the two environments (rasterising SVG) is passed in.
- Imports spell the `.ts` extension. Code, comments and commit messages are in
  English; text the owner sees in the browser is in Simplified Chinese.
- Comments say what the code is for, in the style of the files you edit. Do not
  leave comments that describe the change itself.
- Before each commit run the formatter on the files you changed:
  `pnpm exec oxfmt <files>` from the repository root. Run no other command that
  checks, builds, renders or serves the project: all verification is done after you
  hand back. Commit as you go, one commit per milestone, each message ending with
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Run git as plain,
  single commands from the repository root (no `&&` chains around git).

Milestone 2 depends on Milestone 1. Milestone 3 is independent of both. Milestone 4
describes the result of 1 to 3 and comes last.

### Milestone 1: Designs are held ready and worn on demand

Depends on: none

#### T1 · A view without a file means "no film"; only a broken file is a problem

- Where: `apps/workshop/src/artboards.ts` — `createArtboardLoader` and
  `ArtboardLoaderOptions` (the `missing` option, and the line
  `if (svg === undefined) throw new Error(missing);`).
- Change: Remove the notion of a missing artboard being a failure. Where a view has
  no source, the result for that view is "no film" (D3). You may reshape this loader
  or fold it into the holder of T3; what it guarantees today must survive, as listed
  under After.
- After, for one design:
  - Only artboards whose SVG text changed are rasterised again.
  - A result that arrives after a newer source for the same artboard is dropped.
  - A source that fails to rasterise leaves the previous image of that artboard in
    place (or no film, if there was none) and is recorded as that view's problem
    with the error's message; a later good source clears the problem.
  - A view whose source goes away (present before, absent now) loses its film and
    its problem. A view that never had a source has neither.
- Don't: report anything for an absent source (D3).

#### T2 · The scene binds film it does not own

- Where: `apps/workshop/src/scene.ts` — the block starting
  `// Every artboard starts empty: the car wears no film until a design is applied.`,
  `setArtboard`, and `destroyScene`.
- Change: The scene keeps empty film for "nothing worn" and exposes a way to bind a
  given texture to a view, or to go back to empty. Remove `setArtboard`: the scene
  no longer creates or destroys a design's textures (D2).
- After: binding a texture to a view never destroys any texture; binding "nothing"
  shows bare paint on that view; `destroyScene` releases only what the scene itself
  created. A freshly created scene still shows a bare car.

#### T3 · A holder keeps every design's film resident and puts one on the car

- Where: new file `apps/workshop/src/wardrobe.ts`.
- Change: Write the module that owns the film of all designs (D1, D2). It is given
  the `Gpu`, the scene and a `rasterize(svg, view)` function (the same signature as
  today's `ArtboardLoaderOptions.rasterize`), and is told two things over time: the
  current set of designs with their sources (design name → `DesignSources`), and
  which design is worn — a design name, or none for the bare car.
- After:
  - Each design it was told about keeps up to five textures alive (made with
    `createArtboardTexture`), one per view that has film, for as long as the design
    is in the set — whether or not it is worn.
  - Wearing a design binds all five views in one synchronous call, with no `await`
    between the first and the last binding, so no frame can mix two designs. Views
    the design has no film for are bound empty. Wearing none binds all five empty.
    Wearing is cheap and never rasterises.
  - When an artboard of the worn design gets a new texture, the new one is bound
    before the old one is destroyed. For a design that is not worn, the texture is
    replaced without touching the scene.
  - Per design and view, the guarantees of T1 hold.
  - At most one artboard is being rasterised at any time. Whenever one finishes, the
    next one taken is a pending artboard of the worn design if there is one,
    otherwise the next pending one in the order the designs were given (D7).
  - A design that leaves the set has its textures destroyed and its pending work
    dropped; a result still in flight for it is discarded without creating a
    texture. If it was the worn design, all five views are bound empty first.
  - It reports, through a callback, the worn design's name and that design's
    problems (view → message): once when a design is put on, and again whenever
    that design's problems change. Problems of designs that are not worn are kept
    but not reported until they are put on. Wearing none reports no problems.
  - A caller can wait until nothing is pending (the Node scripts need this), and can
    dispose the holder, which destroys every texture it holds.
  - It also exports the one definition of what a design name is, for the browser
    and Node to share: a name that does not start with `_` (D4), and the reserved id
    of the bare car, `_bare` (D5).
- Don't: create textures for a design only when it is first worn (D1).

#### T4 · The Node scripts use the holder; `render` refuses an unknown design

- Where: `apps/workshop/scripts/lib/design.ts` — `readDesign`, `applyDesign`;
  `apps/workshop/scripts/render.ts` — the line
  `const { problems } = await applyDesign(gpu, scene, values.design);`;
  `apps/workshop/scripts/check-projection.ts` — the `expect` whose message starts
  `all five artboards of`.
- Change: `applyDesign` puts one design on the scene through the holder of T3 and
  still resolves to `{ rasters, problems }` once everything has settled (`rasters`:
  the raster of each view that has film). Add a function that lists the designs in
  the repository by D4, sorted by name. `render` checks `--design` against that list
  before any GPU work.
- After:
  - `render --design <a name that is not a design>` prints one line to stderr,
    `render: no design named "<name>"; designs: <names separated by ", ">`, and
    exits with code 2 (D11). Its header comment mentions it.
  - `render` with an existing design behaves as before, and still prints a line per
    broken artboard.
  - `check-projection.ts` still fails when `calibration` has fewer than five
    artboards or a broken one. Its existing condition
    `problems.size === 0 && rasters.size === VIEWS.length` keeps doing that as long
    as `rasters` holds only views that have film; change the file only if your
    `applyDesign` needs it to.
- Don't: change `DESIGN` in `check-projection.ts`, or any assertion there.

### Milestone 2: The browser lists the designs and switches between them

Depends on: Milestone 1

#### T5 · The bundle carries every design and reports the whole set when it changes

- Where: `apps/workshop/src/design-sources.ts` — `DESIGN`, `designSources`,
  `watchDesign`, and the `import.meta.hot.accept` callback.
- Change: Remove `DESIGN`. Export the set of all designs with their sources, by D4:
  from the existing eager glob `../../../designs/*/*.svg`, group by directory, keep
  only the five artboard file names, drop directories whose name starts with `_`
  and directories left with no artboard, and order by plain code-unit comparison of
  names (not `localeCompare`). Replace the per-design watcher with one that hands
  every listener the fresh full set after each hot update of this module.
- After: saving, creating or deleting any artboard file while the dev server runs
  delivers the new full set to the listeners without a page reload — a created or
  deleted file reaches this module as a hot update exactly like a saved one (D8).
  This stays the only module that uses `import.meta.glob` or `import.meta.hot`.
- Don't: keep the listeners anywhere but `import.meta.hot.data`; the module instance
  is replaced on every update.

#### T6 · Keys, the address and the label follow one selection

- Where: `apps/workshop/src/renderer.ts` — `createRenderer` (the block from
  `// The car is already on screen; its artboards arrive one by one behind it.` to
  the end of `initialize`); `apps/workshop/src/main.ts`; `apps/workshop/index.html`
  — next to `<aside id="artboard-notice" …>`; optionally a new
  `apps/workshop/src/selection.ts` for the list, key and address logic.
- Change: Wire the holder of T3 to the set of T5, and add the selection: which
  entry of the list is on screen. The list is the design names in the order of T5,
  followed by the bare car (D5).
- After:
  - **At load.** If the URL fragment, decoded with `decodeURIComponent`, names an
    entry (a design name, or `_bare`), that entry is shown. An empty fragment shows
    the first entry and leaves the URL as it is. A fragment that names nothing, or
    cannot be decoded, shows the first entry and the URL is rewritten to name it
    (D6). The design shown at load is told to the holder before the set, or together
    with it, so that its artboards are rasterised first (D7).
  - **Keys.** `ArrowRight` shows the next entry and `ArrowLeft` the previous one,
    wrapping at both ends, when no modifier key (`alt`, `ctrl`, `meta`, `shift`) is
    held (D9). The listener is on `window`, is removed when the renderer is
    disposed, and does nothing while the list has one entry. The camera state
    (`installOrbitInput`'s `state`) is not read or written by a switch.
  - **Address.** After every change of the entry on screen that the user did not
    type into the address themselves, the fragment names the entry:
    `history.replaceState(null, "", "#" + encodeURIComponent(id))`, where the id is
    the design name or `_bare` (D6). A `hashchange` event (the owner edits the
    address) is resolved by the same rule as at load.
  - **Live list.** When the set changes: if the entry on screen still exists it
    stays, and the label's position and total follow the new list; if it is gone,
    the first entry of the new list is shown and the URL is rewritten (D8).
  - **Label.** A new element with the id `design-label`, fixed in the top-left
    corner, shows the entry's name and its position in the list, reading like
    `stripes  2 / 3`; the bare car's name is shown as `裸车`. It takes no pointer
    events (dragging across it still turns the car), is hidden until the car is on
    screen, and is hidden when `#error` is shown.
  - **Notice.** `#artboard-notice` lists the broken artboards of the entry on screen
    only, each as `designs/<that design>/<view>.svg：<message>` (use `artboardPath`),
    and updates at the moment of a switch. It is hidden for the bare car and for a
    design with no problems. Its existing introductory sentence stays.
  - Nothing reports an artboard as missing; the `missing: "文件不存在"` option is gone
    with T1.
- Don't: assign `location.hash` or call `history.pushState` (D6). Don't add buttons
  or any other on-screen control.

### Milestone 3: An example design to switch to

Depends on: none

#### T7 · `designs/stripes` dresses all five sides with plain bands

- Where: new files `designs/stripes/left.svg`, `right.svg`, `top.svg`, `front.svg`,
  `rear.svg`. Use `designs/calibration/<view>.svg` as the model for everything but
  the drawing.
- Change: Write five artboards (D10). Each keeps the calibration file's root element
  attributes for its view (`viewBox`, and `width`/`height` in mm: 5200×1800 for
  `left` and `right`, 5200×2400 for `top`, 2400×1800 for `front` and `rear`), a
  header comment naming the view and its mapping, and as its first child the group
  `<g id="guide">` holding the one `<image>` that links `../_guides/<view>.png`
  across the whole artboard. Livery goes after that group, never inside it. One user
  unit is one millimetre.
- After, as opaque rectangles and nothing else:
  - `top`: two bands the full width of the artboard (`x` 0 to 5200), each 180 high,
    at `y` 860 to 1040 and `y` 1360 to 1540.
  - `front` and `rear`: two bands the full height (`y` 0 to 1800), each 180 wide, at
    `x` 860 to 1040 and `x` 1360 to 1540. These are the same distances from the
    car's centre line as the bands on `top`, so the bands run on unbroken where the
    bonnet and the boot turn down.
  - `left` and `right`: one band the full width (`x` 0 to 5200) at `y` 1180 to 1300,
    and a pinstripe above it at `y` 1130 to 1150.
  - Two colours in total: one for all the bands, one for the pinstripes.
- Don't: use near-black (the calibration pattern's colour), gradients, patterns,
  text or transparency. Don't edit anything under `designs/_guides/`.

### Milestone 4: The documents describe the workshop as it now stands

Depends on: Milestones 1 to 3

#### T8 · `AGENTS.md` and `README.md` say how designs are listed and switched

- Where: `AGENTS.md` — the bullet starting `**Design files.**`; `README.md` — the
  list under `## 现状` and the list after `接下来的方向：`.
- Change: Bring both up to date, in each file's own language and tone (`AGENTS.md`
  English for agents, `README.md` Chinese for people).
- After:
  - `AGENTS.md` no longer mentions `DESIGN` or `design-sources.ts` as the place that
    picks a design. It states: every directory under `designs/` whose name does not
    start with `_` and that holds at least one artboard is a design; the workshop
    holds them all and lists them by name, followed by a built-in bare car; `←`/`→`
    switch and the URL fragment names the one on screen; a design may omit
    artboards, and that side stays bare; names starting with `_` are reserved
    (`_guides`, and the bare car's id `_bare`); `designs/stripes` is an example for
    switching, not a design direction; each design costs about 210 MB of texture
    memory because all stay resident.
  - `README.md` under `## 现状` says there are two designs (the calibration pattern
    and a band example), that `←`/`→` switch between them and the bare car without
    moving the view, that the top-left corner names the one on screen, and that the
    address carries the name so a link opens it. The sentence beginning
    `现在只有一套校准图` is replaced accordingly, and the sentence about a broken
    artboard no longer suggests a missing file is reported. Under `接下来的方向` the
    first item (`多套设计并存，在同一视角下切换对比`) is removed; the others stay.

### Your call

- Names and signatures of everything new (the holder's functions, the scene's
  binding function, the selection module's exports), and whether the selection lives
  in `main.ts`, `renderer.ts` or a new `selection.ts` — within the convention that
  shared modules stay free of DOM and Vite APIs.
- Whether `createArtboardLoader` survives as a per-design helper or is absorbed by
  the holder.
- The label's markup and styling (it should sit quietly: about the size and
  typeface of the existing notice), and whether key presses call `preventDefault`.
- The two colours of the example design, as long as both read clearly on silver.
- Wording of comments and of the new sentences in the two documents.

### Landmines

- vgpu binds by name through `draw.set({ film_0: texture })`; a texture destroyed
  while still bound breaks the next frame. Always bind the replacement first
  (`apps/workshop/src/scene.ts`, `setArtboard` shows the order used today).
- The renderer can be disposed while a rasterisation is in flight
  (`apps/workshop/src/renderer.ts`, the `disposed` checks). A result that lands
  after disposal must not touch the GPU.
- `import.meta.hot.accept`'s callback receives the new module instance; it must read
  the exports by the names the new version of `design-sources.ts` has.

### Scope

In scope:

- `apps/workshop/src/artboards.ts`
- `apps/workshop/src/scene.ts`
- `apps/workshop/src/wardrobe.ts` (new)
- `apps/workshop/src/design-sources.ts`
- `apps/workshop/src/renderer.ts`
- `apps/workshop/src/main.ts`
- `apps/workshop/src/selection.ts` (new, optional)
- `apps/workshop/index.html`
- `apps/workshop/scripts/lib/design.ts`
- `apps/workshop/scripts/render.ts`
- `apps/workshop/scripts/check-projection.ts` (only if `applyDesign`'s result forces it)
- `designs/stripes/*.svg` (new)
- `AGENTS.md`, `README.md`

Out of scope:

- `designs/calibration/`, `designs/_guides/` — the projection check depends on them.
- `apps/workshop/src/frames.ts`, `car.wgsl` and the other shaders, `camera.ts`,
  `car/` — nothing about projection, shading or the camera changes.
- `apps/workshop/vite.config.ts` — it already watches `designs/`.
- `apps/workshop/scripts/guides.ts`, `scripts/lib/aligned.ts`, `rasterize.ts`,
  `png.ts`, `shaders.ts`.
- `wiki/` — the plan files are the orchestrator's.
- `package.json` files and the lockfile — no dependency is needed.

### Stop and report if

- A task's anchor is missing, or the code there differs from what the task describes.
- A task needs a file outside the in-scope list.
- Two tasks contradict each other, or a task contradicts the code it changes.
- vgpu offers no way to rebind a texture on an existing draw without recreating it.
- Holding the designs resident needs a change to the shader or its bindings.

## Verification

### Milestone validations

- Milestone 1: `pnpm typecheck` -> exit 0;
  `pnpm --filter @livery/workshop check:projection` -> exit 0, 67 assertions pass.
- Milestone 2: `pnpm typecheck`, `pnpm lint` -> exit 0.
- Milestone 3: `pnpm --filter @livery/workshop render --design stripes --out <tmp>.png`
  -> exit 0, no line on stderr.
- Milestone 4: `pnpm fmt:check` -> exit 0.

### Commands

| Purpose                       | Command                                                                              | Expected result                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Typecheck                     | `pnpm typecheck`                                                                     | exit 0                                                                     |
| Lint                          | `pnpm lint`                                                                          | exit 0                                                                     |
| Format                        | `pnpm fmt:check`                                                                     | exit 0                                                                     |
| Build                         | `pnpm build`                                                                         | exit 0                                                                     |
| Projection                    | `pnpm --filter @livery/workshop check:projection`                                    | exit 0, 67 pass                                                            |
| Unknown design                | `pnpm --filter @livery/workshop render --design nope`                                | exit 2, one line naming `calibration, stripes`                             |
| Example design, looked at     | `render --design stripes` from yaw 90 / pitch 35, yaw 0, yaw 180, yaw 270 / pitch 35 | bands on every side; top bands continue onto front and rear without a step |
| Browser (acceptance)          | dev server + Playwright                                                              | the list under Done criteria                                               |
| Production build (acceptance) | `pnpm build`, serve `apps/workshop/dist`                                             | switching works with no dev server                                         |

### Done criteria

- [ ] All listed commands pass.
- [ ] Every task's `After` state holds.
- [ ] In the browser: `→` goes calibration → stripes → 裸车 → calibration and `←`
      the reverse; the camera matrix is identical before and after each switch
      (orbit the car first); the label reads `calibration  1 / 3`, `stripes  2 / 3`,
      `裸车  3 / 3`.
- [ ] A switch between two loaded designs changes the picture in the next frame: a
      screenshot right after the key press shows the new design complete on every
      visible side, never a mix and never bare paint.
- [ ] The address reads `#stripes` after switching to it; reloading shows stripes;
      opening `/#_bare` shows the bare car; `/#nope` shows calibration and the
      address becomes `#calibration`; `/` shows calibration and stays `/`.
- [ ] `history.length` does not grow while switching.
- [ ] With the dev server running: saving an artboard of the design not on screen
      changes nothing visible, and switching to it shows the saved state; creating
      `designs/zz-test/left.svg` makes the label's total 4 with no reload and the
      new entry shows film on the left side only, with no notice; deleting it while
      it is on screen shows calibration and rewrites the address.
- [ ] Breaking an artboard of stripes while calibration is on screen shows no
      notice; switching to stripes shows the notice naming `designs/stripes/…`;
      switching away hides it.
- [ ] `check:projection` fails when run with one calibration artboard moved away
      (checked once, then restored with `git restore`).
- [ ] No test framework or dependency was added (D12).
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] The Outcome is appended and `wiki/plans/README.md` status is updated.

### Merge and deploy

- The commits land on `dev/20261116-workshop-main-chain` and extend pull request
  #1, which then carries roadmap items 1 and 2; its title and body are updated to
  say so. Nothing is deployed.
- CI does not run `check:projection` or any browser check; both were run by hand
  for this plan.

## Outcome

- Status: APPROVE — 2026-11-16
- Mode: subagent(opus), one work package (Milestone 2 depends on 1; the example
  design and the documents were too small to dispatch separately).
- Commits: `e1a03eb..d0504ff`
- Deviations:
  - D8 rested on half a check. Vite hot-updates the importer of a glob when a file
    is _created_, but for a _deleted_ file, and for one re-created under a name it
    had before, it also lists the file's own modules, one of which has no importer,
    and falls back to a full page reload. The brief had put `vite.config.ts` out of
    scope on that premise. One revision round added a `hotUpdate` hook to the
    existing `livery:watch-designs` plugin: any change under `designs/` invalidates
    the file's modules with the update's timestamp and hot-updates
    `src/design-sources.ts` alone. The hook was first proven with a throwaway
    config that was never committed.
  - T1: `createArtboardLoader` was removed and its guarantees moved into the new
    `wardrobe.ts`, as the brief allowed.
  - The Milestone 1 commit also touched `renderer.ts` (a Milestone 2 file) with a
    bridge that kept that commit buildable; the Milestone 2 commit replaced it.
- Verified by the orchestrator, in a real browser against the dev server and
  against the production build: the order and wrap-around of `←`/`→`; identical
  pixels for a design before and after a round trip with the camera moved first;
  a complete picture two frames after a key press; the five address cases; no
  growth of `history.length`; saving, creating, deleting and re-creating artboards
  with no reload and fresh content; a notice only for the design on screen.
- Follow-ups:
  - The hook reaches into Vite's module graph (`getModulesByFile`,
    `invalidateModule` with the HMR flag). A Vite upgrade should repeat the delete
    and re-create cases by hand; nothing automated covers them.
  - `Cmd`+arrow was not pressed in the test (it would navigate the browser);
    `Shift` and `Ctrl` were, and are ignored.
  - Not measured: how long a design takes to load at page open, and the texture
    memory actually used. Switching to a design within the first seconds after a
    page load shows its artboards arriving.
  - The main chain's follow-up about the artboard notice's wording is closed: the
    notice was seen in a browser (`XML 格式错误：第 14 行第 1 列，…`).
