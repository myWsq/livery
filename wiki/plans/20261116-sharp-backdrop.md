# Plan 20261116-sharp-backdrop: A sharp backdrop behind the car

> Three parts for three readers. The Record says why and stays true after the
> code moves on. The Execution brief is the only part a delegated executor
> receives. Verification is the orchestrator's. At close, `dev:execute-plan`
> appends an Outcome and updates `wiki/plans/README.md`.
>
> Drift check: `git diff --stat de2a2e3..HEAD -- src scripts environments AGENTS.md README.md`

## Status

- Priority: P1
- Effort: M
- Risk: MED
- Depends on: wiki/plans/20261116-lighting-environments.md
- Category: bug
- Execution: subagent(opus) — the mode the owner chose for the lighting plan this corrects; the owner approved this direction and the same process in chat ("ok, 按 A 做")
- Stop after: implementation — as above
- Plan review: none — the orchestrator is already on the top tier
- Workspace: current — linked worktree on `dev/20261116-workshop-main-chain`; the commits join pull request #1
- Planned at: `de2a2e3`, 2026-11-16

## Record

### Requirement

The owner opened the workshop after the lighting environments landed and asked why
the picture was so blurry. The car is sharp; the backdrop and the ground under the
car are not. Measured cause: the photograph is 2048×1024 over the whole sphere,
about 5.7 pixels per degree, while a 1000-pixel-high view of 36° needs about 28
(twice that on a Retina display). The backdrop is magnified five to ten times. The
deliberate blur added to it is a small part: switching it off sharpened the paving
joints only slightly. The planner had chosen the size by what reflections on the
paint need and verified only at 800 pixels wide.

Once this is done, the backdrop and the ground read as a photograph of a place at
the size the owner actually views it, and the lighting of the car is unchanged.

Confirmed by the owner (option A of three):

- The backdrop gets its detail from a second, 8192×4096 image of each place. The
  2048×1024 HDR photograph keeps lighting the car and setting the backdrop's
  brightness. The repository grows by about 18 MB.
- The ground near the car is no longer blurred; only what is far away may be.
- How soft the far backdrop is will be judged once it is sharp.
- Rejected by the owner's choice: replacing the HDR files by 4096-wide ones (about
  97 MB for twice the detail) or 8192-wide ones (about 377 MB).

### Decisions & tradeoffs

- **D1 The detail image is Poly Haven's tone-mapped JPG of the same asset, stored as
  `environments/<id>.jpg`.** It is the same panorama as the HDR, pixel-aligned, at
  four times the resolution each way; 18.1 MB for the four. Based on: the files'
  metadata (8192×4096, baseline JPEG) and a prototype (D2).
- **D2 The backdrop is the HDR's radiance multiplied by the detail image's local
  contrast: the detail image at the resolution the pixel needs, divided by the same
  image reduced to the HDR's resolution.** Brightness, colour and exposure keep
  coming from the HDR, so the backdrop still agrees with the light on the car, and a
  lamp or the sun, where the JPG is clipped, gives a ratio of 1. Where the view needs
  no more than the HDR's resolution, the ratio is 1 by construction. Rejected:
  showing the JPG itself as the backdrop — it is tone-mapped, so its brightness
  would not follow the exposure or match the car. Based on: a CPU prototype of this
  formula through the workshop's opening camera for all four environments; text on
  signs became readable and nothing odd appeared around lamps or the sun.
- **D3 Only the environment on screen keeps its detail texture.** One is about
  176 MB (8192×4096 RGBA with two further levels); four would be about 700 MB next
  to 210 MB per design. Consequence, accepted while planning: after a change of
  light the backdrop is soft for the moment it takes to fetch and decode the JPG,
  then sharpens. The light on the car still changes at once. Rejected: all four
  resident. `(decided while planning)`
- **D4 In the browser the JPG goes from the decoder to the GPU without passing
  through a canvas or JavaScript memory** (`createImageBitmap`, then
  `copyExternalImageToTexture`). A canvas of 8192×4096 exceeds the canvas area limit
  of some browsers, and reading 134 MB of pixels back would stall the page. In Node
  the JPG is decoded by the rasteriser the scripts already depend on, verified to
  decode these files in about a second, within one level of the system decoder. No
  dependency is added. `(decided while planning)`
- **D5 The deliberate blur now grows with distance from the car: none on the ground
  near it, a small constant amount far away.** The amount is tuned from renders.
  Rejected: one blur for the whole backdrop, as before — it blurred the ground the
  car stands on.
- **D6 A detail image that cannot be loaded leaves that environment usable with a
  soft backdrop, and a notice says so.** It is not treated like a missing HDR.
  `(decided while planning)`

### Discussion log

1. The owner: "为什么我看这个图这么糊啊？" The planner reproduced the view at
   1728×1000, measured the pixel densities, rendered once with the deliberate blur
   off, and reported the cause as its own choice of resolution.
2. _How to fix?_ Offered: A, an 8192-wide JPG for the backdrop with the HDR kept for
   light (recommended, about 18 MB); B, 4096-wide HDR files; C, 8192-wide HDR files.
   Together with: no blur on the ground near the car, and the far blur judged
   afterwards. Answer: **"ok, 按 A 做"**.
3. `(decided while planning)` D2's formula after the prototype, D3, D4, D6.

### Maintenance notes

- A replacement photograph now needs two files from the same panorama: the
  2048×1024 `.hdr` and the 8192×4096 `.jpg`. They must be aligned to the pixel.
- On a Retina display the backdrop is still magnified about twice.

## Execution brief

> Written for `subagent(opus)` at `de2a2e3`. Implement the tasks in order. Decide
> only what Your call leaves to you; on anything else that is unclear, stop and
> report.

### Goal

This repository is a WebGPU previewer (the `vgpu` library, Vite, TypeScript; the app
is at the repository root: `index.html`, `src/`, `scripts/`). The car is lit by one
of four panoramic photographs (`environments/<id>.hdr`, 2048×1024, listed in
`src/environments.ts`), and `src/present.wgsl` shows the same photograph as the
backdrop, projected on a dome with a flat floor (`backdrop_direction`). At that
resolution the backdrop is badly magnified and looks blurred. This work adds a
second, 8192×4096 image per environment that supplies the backdrop's fine detail,
while the HDR keeps supplying its brightness, and makes the deliberate blur depend
on distance.

Conventions that bind every task:

- `src/scene.ts`, `src/environments.ts`, `src/hdr.ts` and the other shared modules
  are loaded by Node scripts as well as the browser: no DOM, no `fetch`, no
  `createImageBitmap`, no `import.meta.glob` there. What differs between the two is
  passed in.
- Imports spell the `.ts` extension. Code, comments and commit messages in English;
  text the owner sees in the browser in Simplified Chinese. Comments say what the
  code is for, not what changed.
- Look up vgpu's API in its bundled docs (`pnpm exec vgpu docs find "<topic>"`,
  `pnpm exec vgpu docs cat <file>`).
- Before each commit run `pnpm exec oxfmt <files>` on the files you edited by hand
  (never on `.jpg` or `.hdr` files). Run nothing else that checks, builds, renders
  or serves the project. Commit per milestone, each message ending with
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Plain, single git
  commands from the repository root; stage files by name; never push.

Milestone 2 depends on 1, Milestone 3 on 2, Milestone 4 on all.

### Milestone 1: The detail images

#### T1 · The four detail images are in the repository

- Where: `environments/`
- Change: Copy each file and check it with `md5 -q`. The sources are already on this
  machine; if one is missing, download it from the URL instead
  (`curl -sS -L -o <target> <url>`).

  | Target                      | Copy from                                                       | md5                                |
  | --------------------------- | --------------------------------------------------------------- | ---------------------------------- |
  | `environments/day.jpg`      | `/tmp/claude-501/livery-backdrop-MSm9eA/wide_street_01.jpg`     | `edf218167bc9c9a970044657e055b5d1` |
  | `environments/overcast.jpg` | `/tmp/claude-501/livery-backdrop-MSm9eA/round_platform.jpg`     | `779f15d3840aa619ff500fa0113ff297` |
  | `environments/night.jpg`    | `/tmp/claude-501/livery-backdrop-MSm9eA/hansaplatz.jpg`         | `04248ba16fb3e34a9ef07f86683e36df` |
  | `environments/garage.jpg`   | `/tmp/claude-501/livery-backdrop-MSm9eA/empty_warehouse_01.jpg` | `c8bade16362fe4ffcc2f8c176b84daba` |

  URL for a missing one:
  `https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/<asset>.jpg`
  with `<asset>` the source file's name.

- After: the four files are committed with those checksums. Do not modify or delete
  anything under `/tmp/claude-501/livery-backdrop-MSm9eA/`.

#### T2 · The list of environments names each detail image

- Where: `src/environments.ts` — `Environment`, `ENVIRONMENTS`, next to
  `ENVIRONMENT_SIZE`.
- After: every environment has a `backdrop` field with its file name under
  `environments/` (`day.jpg`, `overcast.jpg`, `night.jpg`, `garage.jpg`), and the
  module exports the size every detail image must have, 8192 × 4096: four times
  `ENVIRONMENT_SIZE` each way.

### Milestone 2: The scene draws the backdrop with detail

#### T3 · The scene can be given a detail texture, and takes it off again

- Where: `src/scene.ts` — near `createEnvironmentTexture` and `setEnvironment`,
  `createScene` (the `present.set({ … })` block), `destroyScene`.
- Change: Add a detail texture to the present pass (D2), a way to make one, and a
  way to put one on the scene or take it off.
- After:
  - A detail texture is `rgba8unorm-srgb`, 8192 × 4096, with exactly three levels.
    Level 0 is the image. Levels 1 (4096 × 2048) and 2 (2048 × 1024) are each the
    level above reduced by an exact 2 × 2 average, computed on the GPU (render the
    level above with linear filtering into a target of the lower size, then copy
    into the level, the way `createEnvironmentTexture` fills its levels). The
    averaging happens in linear light, which the sRGB format gives for free.
  - How level 0 is filled is passed in by the caller, because it differs: the
    browser copies an `ImageBitmap` into the texture with the device queue's
    `copyExternalImageToTexture` (the texture therefore needs the usages
    `texture_binding`, `copy_dst` and `render_attachment`), Node writes RGBA bytes
    with `writeTexture`. The scene module contains neither `ImageBitmap` nor a
    decoder.
  - Making one with a different size throws a clear error.
  - With no detail texture on the scene, the present pass is bound to a small
    all-white texture the scene owns, so the detail factor of T4 is exactly 1. A new
    scene starts that way, and putting an environment on the scene with
    `setEnvironment` takes any detail texture off, back to the white one: detail
    belongs to one photograph and must never be shown over another.
  - Putting a detail texture on or taking it off only rebinds; it destroys nothing.
    The textures belong to the caller.

#### T4 · The backdrop is the HDR times the detail image's local contrast

- Where: `src/present.wgsl` — `Camera`, `backdrop_direction`, `fs_main`;
  `src/scene.ts` — `BACKDROP_CONE` and `render`.
- Change: Replace the single backdrop look-up by the following (D2, D5). Let
  `lookup` be the turned look-up direction as today, `pixel` its screen footprint
  (the larger length of its two screen derivatives), and `far` a number from 0 to 1
  that says how far the backdrop point is from the car: `smoothstep(5, 20, d)` with
  `d` the horizontal distance in metres from the origin to the point P that
  `backdrop_direction` finds on the dome (so that function has to give P as well),
  and 1 when the eye is outside the dome.
  1. `cone = backdrop_blur × far`, with `backdrop_blur` a uniform that starts at
     0.0015 radians.
  2. The HDR is sampled as today with `env_lod(cone, …)`.
  3. `footprint = max(cone, pixel)`;
     `detail_lod = clamp(log2(footprint / detail_texel_angle), 0, 2)` with
     `detail_texel_angle = 2π / (width of the detail texture)`.
  4. `fine = sample_env(detail, …, lookup, detail_lod, detail_size)` and
     `coarse = sample_env(detail, …, lookup, 2.0, detail_size)`: the same sampling
     function the HDR uses, so level 2 of the detail texture is filtered exactly
     like level 0 of the HDR.
  5. `background = hdr × (fine + ε) / (coarse + ε)` per channel, with `ε = 0.02` as
     a named constant in the shader.
- After:
  - With the white texture bound, the picture is what it is today except for the
    blur now depending on distance.
  - Where the view needs no more than the HDR's resolution (`detail_lod` = 2), the
    factor is exactly 1.
  - The ground under and around the car is sampled with no added blur.
  - The sampler used for the detail texture filters linearly between texels and
    between levels and repeats in u; the existing environment sampler does.
  - `BACKDROP_CONE` is replaced by a constant for `backdrop_blur`, and the scene has
    a way to override it for one run (T6 uses it).
- Don't: apply the detail to the car's reflections or ambient light, or change
  `backdrop_direction`'s geometry.

### Milestone 3: Loading the detail image

#### T5 · The browser shows the detail of the environment on screen, and only that one

- Where: `src/environment-sources.ts`; `src/renderer.ts` — `putOn`, `select`, the
  first-environment code and `dispose`; `src/main.ts` and `index.html` for the
  notice.
- Change: Fetch and decode the detail image of the environment that is on the scene
  and put it on; drop the previous one (D3, D4).
- After:
  - `environment-sources.ts` also maps each environment to the URL of its `.jpg`
    (`import.meta.glob("../environments/*.jpg", { query: "?url", import: "default", eager: true })`)
    and can produce an `ImageBitmap` of it:
    `createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" })`.
    No canvas is involved anywhere.
  - Whenever an environment is put on the scene, its detail image starts loading
    (unless it failed before). When it arrives, and that environment is still the
    one on the scene, its texture is made, put on, and the texture of the previous
    environment is destroyed after the new one is bound. A result for an
    environment that is no longer on the scene is discarded and its bitmap closed.
    The bitmap is always closed once its pixels are in the texture.
  - At most one detail texture exists at a time, apart from the instant of a swap.
  - The first frame still waits only for the HDR, as today; the detail arrives
    after it.
  - A detail image that fails to load or to become a texture (D6): the environment
    stays on screen and selectable with a soft backdrop; it is not retried until
    the page is loaded again; and the environment notice gains a line
    `光线环境「<name>」的清晰背景无法加载，背景保持模糊：<message>`. This line is
    separate from, and can coexist with, the existing `无法加载` lines.
  - Disposing the renderer destroys the detail texture and makes a late result
    touch nothing.

#### T6 · `render` shows the detail too

- Where: `scripts/lib/environment.ts` — `applyEnvironment`; `scripts/lib/rasterize.ts`
  or a new file under `scripts/lib/`; `scripts/render.ts`.
- After:
  - `applyEnvironment` also reads the environment's `.jpg`, decodes it to RGBA
    bytes and puts the detail texture on the scene. The decoder is the `Resvg`
    class the scripts already use: wrap the file as a data URL in an SVG of the
    image's size holding one `<image>`, render at original size, and take
    `pixels` (this was verified on these files).
  - `render --backdrop-blur <radians>` overrides the blur constant of T4 for that
    run; it is a number, validated like the other numeric options, and documented
    in the header comment.
  - `guides` and `check:projection` are untouched and read no photograph.

### Milestone 4: Documents

#### T7 · `AGENTS.md` and `README.md`

- After: `AGENTS.md`'s lighting decision says that each environment is two files of
  one panorama, the 2048×1024 `.hdr` that lights the car and sets the backdrop's
  brightness and the 8192×4096 `.jpg` that gives the backdrop its detail, how the
  two are combined (T4, in a sentence), that only the environment on screen keeps
  its detail texture (about 176 MB) so the backdrop sharpens a moment after a
  change of light, that the blur grows with distance from the car, and that a
  replacement needs both files aligned to the pixel. The `render` line lists
  `--backdrop-blur`. `README.md`: the `## 素材` section says each photograph is used
  in two versions (HDR and tone-mapped JPG) of the same Poly Haven asset; `## 结构`
  is unchanged unless it lists file types.

### Your call

- Names and signatures; where in `renderer.ts` the detail loading lives.
- Which shader draws the two reductions of T3 (the existing `blur.wgsl` with a zero
  direction samples its source once per texel, or a new minimal shader), and how
  its pipeline for the sRGB format is compiled.
- The white texture's size.
- Whether `far` is computed in `backdrop_direction` or beside it.
- Wording of comments and documents.

### Landmines

- The default WebGPU limit for a 2D texture is 8192 on a side: the detail image is
  exactly at it. Do not request a larger limit; do not create anything larger.
- A texture destroyed while bound breaks the next frame: bind the replacement, or
  the white texture, first.
- `copyExternalImageToTexture` does not exist in Node's WebGPU; `createImageBitmap`
  does not exist there either. Keep both out of shared modules.
- `src/design-sources.ts` self-accepts hot updates; do not import the new
  browser-only code from it.

### Scope

In scope: `environments/*.jpg` (new); `src/environments.ts`, `src/scene.ts`,
`src/present.wgsl`, `src/environment-sources.ts`, `src/renderer.ts`, `src/main.ts`,
`index.html`; a new shader under `src/` with `src/shaders.ts` and
`scripts/lib/shaders.ts` if T3 needs one; `scripts/lib/environment.ts`,
`scripts/lib/rasterize.ts` or one new file under `scripts/lib/`, `scripts/render.ts`;
`AGENTS.md`, `README.md`.

Out of scope: the `.hdr` files and `src/hdr.ts`; `src/car.wgsl` and everything about
the car's shading; `src/env-common.wgsl` unless a helper there needs one more
parameter; `src/wardrobe.ts`, `src/selection.ts`, designs; `vite.config.ts`,
`package.json`, the lockfile; `wiki/`.

### Stop and report if

- A task's anchor is missing or the code differs from what the task describes.
- A file is missing and its download fails, or a checksum differs.
- vgpu cannot create an 8192 × 4096 `rgba8unorm-srgb` texture with three levels and
  those usages, or cannot expose the native texture and queue needed for
  `copyExternalImageToTexture`.
- A task needs a file outside the in-scope list.

## Verification

### Commands

| Purpose                        | Command                                                                                                                                                       | Expected result                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Typecheck, lint, format, build | `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, `pnpm build`                                                                                                 | exit 0; four `.jpg` assets in `dist/assets`                                                          |
| Projection, guides             | `pnpm check:projection`; `pnpm guides` + `git status --porcelain`                                                                                             | 67 pass; tree clean                                                                                  |
| Sharpness, looked at           | `pnpm render --design stripes --env <id> --width 1728 --height 1000` for each, with crops of the backdrop and of the ground beside the car at full resolution | detail clearly beyond the HDR's; ground sharp; no halo around lamps or the sun; brightness as before |
| No detail = as before          | a render with the `.jpg` moved away (restored afterwards)                                                                                                     | soft backdrop, no error beyond the reported one                                                      |
| Browser (acceptance)           | `pnpm dev` + Playwright at 1728×1000                                                                                                                          | below                                                                                                |
| Production build (acceptance)  | `pnpm build`, serve `dist/`                                                                                                                                   | detail loads for each environment                                                                    |

### Done criteria

- [ ] All commands pass; every task's `After` holds.
- [ ] In the browser at 1728×1000 the backdrop of each environment is sharp a
      moment after it is selected; a screenshot crop shows it.
- [ ] `↑`/`↓` still switch at once and round trips are pixel-identical once the
      detail has arrived; `[`/`]` turn detail and brightness together.
- [ ] Rapid switching (twenty key presses) ends with the right detail on the right
      environment and no console error.
- [ ] A truncated `night.jpg` (restored afterwards): night is usable and soft, the
      notice has the new line, the other three are sharp.
- [ ] The blur amount has been tuned from renders by the orchestrator and written
      into the code.
- [ ] No out-of-scope files changed; the Outcome is appended and the README status
      updated.

### Merge and deploy

- The repository grows by 18.1 MB of JPGs (CC0, Poly Haven, the same four assets).
- No new dependency. Nothing is deployed.

## Outcome

- Status: APPROVE — 2026-11-16
- Mode: subagent(opus), one work package, no revision round.
- Commits: `6589e4a..9c49277`
- Deviations:
  - If an environment is put back on while its detail texture still exists, the
    texture is rebound instead of fetched again; a load already in flight is not
    started twice. Neither is in the brief; both keep "at most one detail texture"
    and never show one photograph's detail over another.
  - `backdrop_direction` became `backdrop_hit`, returning the direction and how far
    the point is; its geometry is unchanged.
  - The blur was left at the brief's starting value, 0.0015 rad at 20 m and beyond,
    after looking at all four environments at 1728×1000.
- Verified by the orchestrator: typecheck, lint, format, build (four `.jpg`
  assets), the projection check (67), reproducible guides. Renders of all four
  environments at 1728×1000, the size the owner reported: lettering on signs is
  readable, paving joints beside the car are sharp, brightness is as before, and
  nothing odd surrounds lamps or the sun. In a browser at that size, from the dev
  server and the production build with identical numbers: the backdrop is soft
  right after a change of light and sharp within 2.5 s; round trips and eight `]`
  are pixel-identical; twenty-one fast key presses end on the right environment
  with its own detail; a truncated `night.jpg` leaves night usable and soft with
  the new notice, is not retried, and the other three stay sharp; no console error
  at the committed state.
- Follow-ups:
  - Not measured: how long the backdrop stays soft after a switch (under 2.5 s
    here), and the texture memory actually used.
  - Verified at a device pixel ratio of 1 only. On a Retina display the backdrop is
    still magnified about twice.
  - A wrong-sized detail image fails in Node with a message that lacks the file's
    path.
