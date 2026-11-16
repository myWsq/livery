# Plan 20261116-lighting-environments: See the livery under four real lighting environments

> Three parts for three readers. The Record says why and stays true after the
> code moves on. The Execution brief is the only part a delegated executor
> receives. Verification is the orchestrator's. At close, `dev:execute-plan`
> appends an Outcome and updates `wiki/plans/README.md`.
>
> Drift check: `git diff --stat a7cece1..HEAD -- src scripts index.html vite.config.ts AGENTS.md README.md`

## Status

- Priority: P1
- Effort: L
- Risk: MED
- Depends on: wiki/plans/20261116-single-package.md
- Category: feature
- Execution: subagent(opus) — from the departure check
- Stop after: implementation — from the departure check (plain autopilot)
- Plan review: none — the orchestrator is already on the top tier, so the audit was not offered
- Workspace: current — the session was already in the linked worktree on `dev/20261116-workshop-main-chain`; the commits join the open pull request #1
- Planned at: `a7cece1`, 2026-11-16

## Record

### Requirement

The workshop lights the car with one procedural sunny sky. A wrap is chosen for how
it reads in the places the car will actually be: in hard sun, under an overcast sky,
at night under street lamps, and under workshop tubes. A design that works in one of
these can disappear or glare in another, and one sky cannot show that. This is item 3
of the roadmap the owner confirmed.

Product conclusions, confirmed by the owner:

- **Environments.** Four, in a fixed order: 日光, 阴天, 夜晚街灯, 车库. Each is a real
  panoramic photograph under a CC0 licence, chosen by the planner; replacing one
  means replacing a file in the repository. The procedural sky and its checkerboard
  ground are removed.
- **Backdrop.** The photograph itself is the background, deliberately soft, as if
  out of focus, with the car sharp in front of it. The car stands on the
  photograph's ground, with a contact shadow under it.
- **Exposure.** Each environment has its own, tuned by the planner: night is dark,
  and bright only where lamps reach.
- **Switching.** `↑`/`↓` step through the environments and wrap around; `←`/`→`
  still switch designs. Changing the light leaves the design and the camera alone,
  and the other way round. `[` and `]` turn the whole environment around the car in
  steps of 45°, backdrop included; the angle is kept across switches and returns to
  the default after a reload. Once loaded, a switch is immediate; in the first
  seconds after the page opens, an environment that is not loaded yet appears as
  soon as it is.
- **On screen and in the address.** The label reads like
  `stripes  2 / 3  ·  夜晚街灯  3 / 4`. The address reads `/#stripes@night`, with the
  ids `day`, `overcast`, `night`, `garage`; a reload or the link shows the same
  design under the same light. Without an environment in the address, or with a
  wrong one, daylight is used. If a photograph cannot be loaded, the light stays as
  it was and a notice in the corner names the environment.
- **Command line.** `render` takes `--env <id>` (default `day`) and `--turn <deg>`.
- **Not in this plan.** A time-of-day slider, uploading a photograph in the page,
  hard sun shadows on the ground, switching the car's lights on at night, turning
  by arbitrary angles, and keeping the turn in the address.

### Decisions & tradeoffs

- **D1 The four photographs are 2048×1024 Radiance `.hdr` files from Poly Haven,
  stored in `environments/` at the repository root:** `wide_street_01` (day),
  `beach_parking` (overcast), `hansaplatz` (night), `empty_warehouse_01` (garage);
  24.9 MB in total. Rejected: 1024×512 files (6 MB) — the clear coat's sharp
  reflection would visibly soften; the scene's environment was already 2048 wide.
  Rejected: downloading at run time — the workshop must work from the repository
  alone, and the published preview later must not depend on a third party. Based
  on: `src/scene.ts` (`ENV_SIZE`), and the answer "真实全景照片".
- **D2 Three of the four photographs first shown to the owner were replaced while
  planning.** Projecting a photograph onto the ground (D5) flattens whatever stood
  near the camera when it was taken. A simulation of the backdrop from the
  workshop's camera showed the parked cars 3 m from the camera in `urban_street_03`
  and `cobblestone_street_night`, and the pillars 5 to 6 m away in `parking_garage`
  and `skylit_garage`, as streaks along the ground. The replacements have open
  ground for well over the camera's reach. The garage is therefore an empty
  warehouse lit by fluorescent tubes rather than a parking garage: the same kind of
  light, without pillars. `(decided while planning)`; the product conclusions leave
  the choice of photographs to the planner and make them replaceable.
- **D3 Photographs are decoded in this repository's own code and uploaded as
  half-float textures, then blurred into the same mip chain the procedural sky
  used.** Rejected: an HDR loading library — the format is a header and run-length
  coded scanlines, and the rule is that rendering and asset loading are written
  here. Radiance values above the half-float maximum (the sun's disc) are clamped.
  Based on: `AGENTS.md` ("Rendering is pure vgpu"), `src/scene.ts`
  (`bakeEnvironment`).
- **D4 Every environment stays resident on the GPU once loaded, and a switch only
  rebinds.** About 22 MB of texture memory each. Rejected: decoding on each switch —
  a pause of a tenth of a second and more, where designs already switch instantly.
  The environment named in the address loads first.
- **D5 The backdrop is the photograph projected onto a dome: a sphere around the
  point the photograph was taken from, cut flat by the ground plane.** The lower
  part of the photograph therefore lies on the plane the car stands on and stays
  under it as the camera orbits. Rejected: the photograph at infinity in every
  direction, as the procedural sky was — the ground would slide under the car with
  every camera move, and "the car stands on the photograph's ground" would not
  hold. Cost: near objects are flattened (D2), and each photograph needs two
  numbers, the height it was taken from and the dome's radius. Reflections and
  lighting on the car keep using the photograph at infinity. Based on: the product
  confirmation; `src/present.wgsl` (the background lookup).
- **D6 One angle turns the environment, applied to every lookup: reflections,
  ambient light and backdrop.** It is the sum of a per-environment default heading,
  chosen so that the main light falls on the side the opening view shows, and the
  owner's 45° steps. Rejected: turning the car or the camera instead — the artboard
  frames and the camera's meaning of "front" are fixed to the car.
- **D7 Each environment's numbers live in one shared module:** id, name, file,
  source, exposure, heading, capture height, dome radius. `render` can override the
  last four from the command line, so they can be tuned by looking at renders
  without editing code. The same flags serve whoever replaces a photograph later.
  `(decided while planning)`
- **D8 An environment that fails to load is skipped by `↑`/`↓` and named in a
  notice; the light on screen does not change.** If the environment named in the
  address fails, the first one that loads is shown. If none loads, the workshop
  reports that it cannot start. `(decided while planning)`
- **D9 The address is `#<design>@<environment>`.** Design names are written with
  `encodeURIComponent`, which escapes `@`, so the last literal `@` always separates
  the two. Written with `history.replaceState`, as before.
  Based on: `src/selection.ts`.
- **D10 `[` and `]` are read by key position (`KeyboardEvent.code`), not by the
  character produced.** With a Chinese input method active the same keys produce
  `【` and `】`. `(decided while planning)`
- **D11 The guides and the projection check do not read the photographs.** Neither
  uses lit output; the scene can be created with a neutral environment.
  Based on: `scripts/guides.ts` (`output: "surface"`), `scripts/check-projection.ts`.
- **D12 No test framework.** Verified by renders and in a browser, as before.

### Discussion log

1. _How real should the four environments look?_ Offered: real panoramic
   photographs (recommended); procedural schematic scenes; a mix. Answer: **real
   photographs**.
2. _How to switch?_ Offered: `↑`/`↓` cycling with the label and the address
   extended (recommended); number keys 1–4; both. Answer: **`↑`/`↓`**.
3. _Can the environment be turned around the car?_ Offered: yes, in 45° steps
   (recommended); no. Answer: **yes, 45°**.
4. _Product confirmation_ of the conclusions under Requirement. Answer:
   **confirmed**.
5. The owner then asked why the repository was a monorepo; that became plan
   `20261116-single-package`, executed first.
6. _Departure check._ Direction (photographs in `environments/`, resident
   environments, ground projection, per-environment exposure and heading tuned from
   renders, procedural sky removed) with four named photographs: **go ahead**.
   Execution: **subagent (opus)**, the recommended option. Autopilot: **run to
   completion**.
7. `(decided while planning)` D2 (three photographs replaced, reported to the owner
   before execution), D7, D8, D10, and the initial numbers in the brief.

### Maintenance notes

- Replacing a photograph: put a 2048×1024 `.hdr` in `environments/`, then tune its
  four numbers with `render`'s override flags and write them into the manifest.
  Choose photographs with open ground around the camera (D2).
- The exposure, heading, capture height and radius in the manifest are judgements
  made from renders on one machine, not measurements.
- The photographs are not calibrated against each other: "night is darker than day"
  is carried by the exposure numbers alone.

## Execution brief

> Written for `subagent(opus)` at `a7cece1`. Implement the tasks in order. Decide
> only what Your call leaves to you; on anything else that is unclear, stop and
> report.

### Goal

This repository is a WebGPU previewer (the `vgpu` library, Vite, TypeScript) that
shows a car wearing a livery design. Today the car is lit by one procedural sky that
`src/scene.ts` bakes into an equirectangular environment texture
(`bakeEnvironment`, `src/sky.wgsl`), and `src/present.wgsl` shows that same texture
as the background. After this work the car is lit by one of four real panoramic
photographs; `↑`/`↓` switch between them instantly, `[`/`]` turn the environment
around the car, the photograph's lower half lies on the ground under the car, and
the address and the on-screen label name the environment as well as the design.

Conventions that bind every task:

- `src/scene.ts`, `src/artboards.ts`, `src/wardrobe.ts`, `src/frames.ts`, `src/car/`
  and the new shared modules of this plan are loaded by Node scripts as well as the
  browser. They must not use the DOM, `fetch`, `import.meta.glob`, `import.meta.hot`
  or import `.wgsl` files. What differs between the two (reading a file's bytes) is
  passed in.
- Imports spell the `.ts` extension. Code, comments and commit messages are in
  English; text the owner sees in the browser is in Simplified Chinese.
- Comments say what the code is for, in the style of the files you edit, not what
  changed.
- Look up vgpu's API in its bundled docs (`pnpm exec vgpu docs find "<topic>"`,
  `pnpm exec vgpu docs cat <file>`) rather than guessing.
- Before each commit run the formatter on the files you changed by hand:
  `pnpm exec oxfmt <files>` (not on `.hdr` files). Run no other command that
  checks, builds, renders or serves the project: no typecheck, lint, build, `vite`,
  or anything under `scripts/`. All verification, including looking at the
  pictures, happens after you hand back. Commit as you go, one commit per
  milestone, each message ending with
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Run git as plain,
  single commands from the repository root (no `&&` or `;` around git). Stage files
  by name.

Milestone 2 depends on 1, Milestone 3 on 2, Milestone 4 on all.

### Definitions used by the tasks

- **Car frame.** Metres; +X toward the nose, +Y up, +Z toward the car's right; the
  ground is the plane y = 0.
- **Azimuth** of a direction: `atan2(z, x)`, the angle from +X toward +Z. This is
  what `equirect_uv` in `src/env-common.wgsl` already maps to the texture's u, with
  azimuth 0 at the centre column.
- **Turn** θ of the environment: what the photograph shows at azimuth a is seen at
  azimuth a + θ. Equivalently, every direction is rotated about +Y by −θ in azimuth
  before it is looked up in the texture.
- **Environment settings**, per environment: `exposure` (a multiplier applied
  before tone mapping), `heading` (degrees, the default turn), `captureHeight`
  (metres, the height above the ground the photograph was taken from) and
  `groundRadius` (metres, the dome's radius).

### Milestone 1: The photographs and how to read them

Depends on: none

#### T1 · The four photographs are in the repository

- Where: new directory `environments/` at the repository root.
- Change: Download each file with `curl -sS -L -o <target> <url>` and check it with
  `md5 -q <target>`.

  | Target                      | URL                                                                              | md5                                |
  | --------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
  | `environments/day.hdr`      | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/wide_street_01_2k.hdr`     | `f4896567af57de97394257ef47e4ed07` |
  | `environments/overcast.hdr` | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/beach_parking_2k.hdr`      | `9f6459f33c6f7aaf1b70d66ad724fd32` |
  | `environments/night.hdr`    | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/hansaplatz_2k.hdr`         | `f537267470437188cdc61c604311aad4` |
  | `environments/garage.hdr`   | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/empty_warehouse_01_2k.hdr` | `bc3fa539601289d2a176b5e8d3be1740` |

- After: the four files exist with those checksums and are committed. Each is a
  Radiance file of 2048×1024 pixels (`-Y 1024 +X 2048`).
- Don't: commit a file whose checksum differs; stop and report instead.

#### T2 · A Radiance `.hdr` file's bytes become an image the GPU can take

- Where: new file `src/hdr.ts` (shared: no DOM, no Node imports).
- Change: Write the decoder (D3). Input: the file's bytes (`Uint8Array`). Output: the
  width, the height and the pixels as RGBA half floats, 4 × 16 bits per pixel, rows
  from the top of the image down, alpha 1.
- After:
  - Accepts the header these files have: a first line starting `#?`, header lines up
    to an empty line (it requires `FORMAT=32-bit_rle_rgbe` among them), then the
    resolution line `-Y <height> +X <width>`.
  - Decodes run-length coded scanlines (each starts with the bytes 2, 2, then the
    width as two bytes; the four channels follow one after another, each as runs:
    a count above 128 means repeat the next byte count − 128 times, otherwise copy
    that many bytes) and also flat, uncompressed pixels (4 bytes each) for a
    scanline that does not start with that marker.
  - A pixel (r, g, b, e) with e = 0 is black; otherwise each channel is
    `byte × 2^(e − 136)`.
  - Values are clamped to the largest finite half float (65504) before conversion.
  - Anything else throws an `Error` whose message says what is wrong in a few words
    (not a Radiance file, an unsupported pixel format or orientation, data ending
    early).
- Don't: add a dependency for this (D3).

#### T3 · One list names the environments and their settings

- Where: new file `src/environments.ts` (shared).
- Change: Export the environments in order, each with its id, the name shown to the
  owner, its file name under `environments/`, its source, and its settings (D7).
- After: exactly these four, in this order, with these starting values (they will be
  tuned after you hand back, so keep them as plain data in one place):

  | id         | name       | file           | source (Poly Haven asset, author)            | exposure | heading | captureHeight | groundRadius |
  | ---------- | ---------- | -------------- | -------------------------------------------- | -------- | ------- | ------------- | ------------ |
  | `day`      | `日光`     | `day.hdr`      | `wide_street_01`, Sergej Majboroda           | 0.4      | 46      | 1.5           | 30           |
  | `overcast` | `阴天`     | `overcast.hdr` | `beach_parking`, Greg Zaal and Rico Cilliers | 1.2      | 0       | 1.5           | 30           |
  | `night`    | `夜晚街灯` | `night.hdr`    | `hansaplatz`, Greg Zaal                      | 0.7      | 0       | 1.5           | 30           |
  | `garage`   | `车库`     | `garage.hdr`   | `empty_warehouse_01`, Sergej Majboroda       | 0.8      | 0       | 1.5           | 30           |

  The module also exports the id type, the settings type, and the size every
  photograph must have (2048 × 1024).

### Milestone 2: The scene is lit by a photograph, on its ground

Depends on: Milestone 1

#### T4 · The scene takes its environment from outside and can change it at once

- Where: `src/scene.ts` — `SKY`, `SceneShaders`, `createScene`, `bakeEnvironment`,
  `render` (the `scene.present.set({ camera: … })` block), `destroyScene`;
  `src/sky.wgsl`; `src/shaders.ts`; `scripts/lib/shaders.ts`.
- Change: Remove the procedural sky: `src/sky.wgsl`, the `SKY` constant, and `sky`
  from `SceneShaders` and from both shader loaders. Replace `bakeEnvironment` by a
  way to turn a decoded photograph (the output of T2) into an environment texture
  with the same blurred mip chain as today, and a way to put an environment and its
  settings on the scene. The scene does not own the textures of the environments it
  is given, only what it creates for itself.
- After:
  - A scene can be created with no photograph at all: it then shows the car under a
    neutral, uniform environment (a mid grey, exposure 1). The guides and the
    projection check use this (D11).
  - Making an environment texture from a decoded photograph requires 2048 × 1024
    and throws a clear error otherwise. Its level 0 is the photograph; levels 1 to 7
    are produced exactly as today (the two-pass blur of `src/blur.wgsl`, each level
    from the one above).
  - Putting an environment on the scene rebinds the car's and the present pass's
    environment texture and stores its settings; it is synchronous, cheap, and
    destroys nothing. It can be called any number of times.
  - The turn (in radians) is a separate setting of the scene that survives a change
    of environment.
- Don't: bake or decode anything when an environment is put on the scene (D4).

#### T5 · One turn rotates every look-up into the environment

- Where: `src/env-common.wgsl`; `src/car.wgsl` — `Uniforms`, `glossy`, `ambient`;
  `src/present.wgsl`; `src/scene.ts` where the uniforms of both are set.
- Change: Add the turn as defined above (D6) to the car's and the present pass's
  uniforms, and rotate every direction by it before it is looked up.
- After: with turn θ, a light the photograph shows at azimuth a lights the car from
  azimuth a + θ, is reflected from that direction, and is seen in the backdrop at
  that direction. The turn the shaders receive is the environment's `heading`
  (converted to radians) plus the scene's own turn. Mip selection (`env_lod`) is
  unaffected, since a rotation does not change the size of a footprint.
- Don't: rotate the car, the camera or the artboard projection; only environment
  look-ups change.

#### T6 · The backdrop is the photograph on a dome with a flat floor

- Where: `src/present.wgsl` — `Camera` and `fs_main`; `src/scene.ts` — `render`.
- Change: Replace the background's direct look-up by the dome of D5. Let
  C = (0, captureHeight, 0) and R = groundRadius. For a pixel's view ray from the
  eye E in direction d:
  1. If d.y < 0, intersect the ground: G = E + (−E.y / d.y) · d. If |G − C| ≤ R, the
     point is P = G.
  2. Otherwise P is where the ray leaves the sphere of radius R around C (the far
     root of |E + s·d − C| = R).
  3. The look-up direction is normalize(P − C), then turned as in T5.
     If the eye is outside that sphere, use d itself.
- After:
  - The ground under and around the car shows the photograph's ground, fixed to the
    plane y = 0: it does not slide when the camera orbits or zooms. The contact
    shadow (`src/ground.wgsl`, unchanged) lies on it.
  - The floor meets the upright part of the dome without a seam (both branches give
    the same P on the circle where they meet).
  - The backdrop is soft: it is sampled with a cone of at least a fixed angle
    (start with 0.012 radians, as one named constant in `src/scene.ts`), or the
    pixel's own footprint when that is larger; take the footprint from the screen
    derivatives of the final look-up direction.
  - The present pass's exposure is the environment's `exposure`, in place of the
    constant 0.9.
- Don't: apply the dome to the car's reflections or ambient light; they keep
  looking the photograph up by direction alone (D5).

#### T7 · The Node scripts light the car with a chosen photograph

- Where: `scripts/render.ts`; new `scripts/lib/environment.ts`; `scripts/guides.ts`,
  `scripts/check-projection.ts`, `scripts/lib/aligned.ts` only where `createScene`'s
  new shape requires it.
- Change: `render` reads the chosen environment's file from `environments/`, decodes
  it and puts it on the scene. Add its options.
- After:
  - `render --env <id>` (default `day`) lights the car with that environment. An
    unknown id ends the script with exit code 2 and one line,
    `render: no environment named "<id>"; environments: day, overcast, night, garage`,
    before any GPU work.
  - `render --turn <deg>` adds that many degrees to the environment's heading
    (default 0).
  - `render --exposure <n>`, `--heading <deg>`, `--capture-height <m>` and
    `--ground-radius <m>` override the environment's settings for that run (D7).
    All are numbers and are validated like the existing numeric options (a value
    that is not a number ends the script with a message naming the option).
  - The default output file name includes the environment:
    `livery-<design>-<env>.png` in the system's temporary directory.
  - The header comment of `render.ts` documents the new options.
  - `guides` and `check:projection` create their scene without a photograph and do
    not read `environments/` (D11). Their output and assertions are unchanged.
- Don't: change any assertion or tolerance in `check-projection.ts`.

### Milestone 3: The browser loads the environments and switches between them

Depends on: Milestone 2

#### T8 · The bundle carries the photographs as files to fetch

- Where: new file `src/environment-sources.ts` (browser only).
- Change: Map each environment id to the URL of its file with
  `import.meta.glob("../environments/*.hdr", { query: "?url", import: "default", eager: true })`,
  and export a function that fetches one environment's bytes.
- After: in a production build the four files are emitted as hashed assets and
  fetched on demand; a failed or non-OK response rejects with a short message. An
  environment whose file is missing from the bundle rejects with `文件不存在`.

#### T9 · Environments load in the background and one is on the scene

- Where: `src/renderer.ts` — `createRenderer`.
- Change: Load, decode and keep the environments (D4), and show the selected one.
- After:
  - The environment selected at load (T10) is fetched, decoded and put on the scene
    first, and the first frame is drawn only then: the car never appears under the
    neutral environment in the browser. The designs' artboards may start
    rasterising in the meantime.
  - The remaining environments are then loaded one at a time, in list order, with
    the page staying responsive between them.
  - Each loaded environment keeps its texture until the renderer is disposed, which
    destroys them all.
  - Selecting a loaded environment puts it on the scene in the same call. Selecting
    one that is still loading changes the selection at once (label and address) and
    the picture as soon as it is ready; if the selection has moved on by then, the
    newer selection wins.
  - An environment that fails to load is remembered as failed and reported through
    a new renderer callback with its id and the error's message (D8). If it was the
    selected one, the selection returns to the environment on screen. If the
    environment selected at load fails, the first one in list order that loads is
    shown instead. If every environment fails, `ready` rejects and the existing
    `无法启动渲染` message is shown.
  - A result that arrives after the renderer was disposed touches nothing.

#### T10 · Keys, the address and the label cover the environment and the turn

- Where: `src/selection.ts`; `src/renderer.ts` — the selection code and the
  `keydown` and `hashchange` listeners; `src/main.ts`; `index.html`.
- Change: Extend the selection from "which design" to "which design, under which
  environment, turned how far".
- After:
  - **Address (D9).** The fragment is `#<design>@<environment>`: the design part as
    today (`encodeURIComponent` of the design name, or `_bare`), then a literal `@`,
    then the environment id. To read a fragment, split it at its last literal `@`
    before decoding; a fragment with no `@` has no environment part.
    - No environment part, or an unknown id: `day`. An unknown id also causes the
      address to be rewritten.
    - The design part follows today's rules unchanged (empty: first entry; unknown
      or undecodable: first entry and the address is rewritten).
    - An address with an empty fragment is left alone. Any rewrite, and every
      switch, writes the full form with `history.replaceState`.
  - **Keys.** With no modifier key held: `ArrowDown` selects the next environment
    and `ArrowUp` the previous one, wrapping at both ends and skipping failed
    environments; `]` (`event.code === "BracketRight"`) adds 45° to the scene's
    turn and `[` (`"BracketLeft"`) subtracts 45° (D10). `←`/`→` are unchanged.
    Switching the environment keeps the design, the turn and the camera; switching
    the design keeps the environment and the turn. The turn is not written to the
    address and starts at 0.
  - **Label.** `#design-label` reads like `stripes  2 / 3  ·  夜晚街灯  3 / 4`: the
    design part as today, a separator, then the environment's name and its position
    among the four. It still takes no pointer events.
  - **Notice.** A new element, styled like `#artboard-notice` and stacked with it in
    the bottom-left corner so that neither covers the other, lists each failed
    environment as `光线环境「<name>」无法加载：<message>`. It is hidden while there
    is none.
- Don't: assign `location.hash` or call `history.pushState`. Don't add on-screen
  controls.

### Milestone 4: The documents describe the workshop as it now stands

Depends on: Milestones 1 to 3

#### T11 · `AGENTS.md` and `README.md` cover the environments

- Where: `AGENTS.md` — under `## Decisions` and `## Working with vgpu`; `README.md`
  — the list under `## 现状`, the code block of commands, the list after
  `接下来的方向：`, `## 结构`, and a new short section before `## License`.
- After:
  - `AGENTS.md` gains a decision "Lighting is four real photographs": the files in
    `environments/` (2048×1024 Radiance `.hdr`, CC0, from Poly Haven), the list and
    settings in `src/environments.ts`, decoding in `src/hdr.ts`; that all four stay
    resident (about 22 MB of texture each); that the backdrop is the photograph on
    a dome with a flat floor, which flattens anything that stood near the camera,
    so photographs need open ground around the camera; that reflections and ambient
    light use the photograph at infinity; the definition of the turn; and how to
    replace a photograph (replace the file, tune its four numbers with `render`'s
    `--exposure`, `--heading`, `--capture-height`, `--ground-radius`, write them
    into `src/environments.ts`). The `render` line under "Working with vgpu" lists
    `--env` and `--turn`. Any sentence that still describes a procedural or baked
    sky is corrected.
  - `README.md` under `## 现状` says there are four lighting environments (日光、
    阴天、夜晚街灯、车库), real photographs; `↑`/`↓` switch between them, `[`/`]`
    turn the light around the car in 45° steps; the label and the address carry the
    environment. The `render` comment mentions `--env` and `--turn`. Under
    `接下来的方向` the item `多种光线环境：日光、阴天、夜晚街灯、车库` is removed.
    `## 结构` gains `environments/`. A new section `## 素材` credits the four
    photographs: Poly Haven, CC0, each asset's name and author as in T3's table,
    with the link `https://polyhaven.com/a/<asset>`.

### Your call

- Names and signatures of everything new, and how the code is divided between
  `renderer.ts`, `selection.ts`, `main.ts` and new modules, within the convention
  that shared modules stay free of DOM and Vite APIs.
- How a half float is produced (a `Float16Array`, or bit arithmetic).
- How the neutral environment of T4 is made, and its size, as long as the shaders'
  uniforms describe it truthfully.
- The label's separator markup and the new notice's markup and styling.
- Whether the arrow and bracket keys call `preventDefault`.
- Wording of comments and of the new sentences in the two documents.

### Landmines

- vgpu binds by name through `set({ … })`; a texture destroyed while still bound
  breaks the next frame. Bind the replacement first.
- `rgba16float` can be sampled with linear filtering; `rgba32float` cannot without
  an optional device feature. Keep the environment in `rgba16float`.
- `src/design-sources.ts` self-accepts hot updates so that a saved artboard never
  reloads the page. Do not import the new browser-only modules from it, and do not
  make it depend on the renderer.
- `vite.config.ts` hot-updates only `src/design-sources.ts` for changes under
  `designs/`. Nothing there needs to change: a changed `.hdr` may reload the page.

### Scope

In scope:

- `environments/*.hdr` (new)
- `src/hdr.ts`, `src/environments.ts`, `src/environment-sources.ts` (new)
- `src/scene.ts`, `src/shaders.ts`, `src/env-common.wgsl`, `src/car.wgsl`,
  `src/present.wgsl`, `src/sky.wgsl` (deleted)
- `src/renderer.ts`, `src/selection.ts`, `src/main.ts`, `index.html`
- other new modules under `src/` if your division of the code needs them
- `scripts/render.ts`, `scripts/lib/environment.ts` (new), `scripts/lib/shaders.ts`,
  and `scripts/guides.ts`, `scripts/check-projection.ts`, `scripts/lib/aligned.ts`
  only as T7 allows
- `AGENTS.md`, `README.md`

Out of scope:

- `src/ground.wgsl`, `src/seams.wgsl`, `src/blur.wgsl` — the contact shadow, the
  seams and the blur are unchanged.
- The materials in `src/car.wgsl` (`shade_*`) — only where a direction is looked up
  changes.
- `src/wardrobe.ts`, `src/artboards.ts`, `src/frames.ts`, `src/camera.ts`,
  `src/car/`, `src/design-sources.ts`, `src/rasterize.ts`, `designs/`.
- `vite.config.ts`, `package.json`, the lockfile — no dependency is needed.
- `wiki/` — the plan files are the orchestrator's.

### Stop and report if

- A task's anchor is missing, or the code there differs from what the task describes.
- A download fails or a checksum differs.
- A task needs a file outside the in-scope list.
- Two tasks contradict each other, or a task contradicts the code it changes.
- vgpu cannot write half-float data into a texture level, or cannot rebind a
  texture on an existing draw or effect.

## Verification

### Milestone validations

- Milestone 1: `md5 -q environments/*.hdr` -> the four checksums of T1;
  `pnpm typecheck` -> exit 0.
- Milestone 2: `pnpm typecheck`, `pnpm lint` -> exit 0; `pnpm check:projection` ->
  exit 0, 67 assertions; `pnpm guides` then `git status --porcelain designs/_guides`
  -> empty.
- Milestone 3: `pnpm typecheck`, `pnpm lint`, `pnpm build` -> exit 0.
- Milestone 4: `pnpm fmt:check` -> exit 0.

### Commands

| Purpose                       | Command                                                                                                                          | Expected result                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                     | `pnpm typecheck`                                                                                                                 | exit 0                                                                                                                            |
| Lint                          | `pnpm lint`                                                                                                                      | exit 0                                                                                                                            |
| Format                        | `pnpm fmt:check`                                                                                                                 | exit 0                                                                                                                            |
| Build                         | `pnpm build`                                                                                                                     | exit 0; four `.hdr` assets in `dist/assets`                                                                                       |
| Projection                    | `pnpm check:projection`                                                                                                          | exit 0, 67 pass                                                                                                                   |
| Guides reproducible           | `pnpm guides`, `git status --porcelain designs/_guides`                                                                          | empty                                                                                                                             |
| Unknown environment           | `pnpm render --env nope`                                                                                                         | exit 2, one line naming the four                                                                                                  |
| Each environment, looked at   | `pnpm render --design stripes --env <id>` from the opening view, the left side (yaw 180), above (pitch 50) and far (distance 10) | plausible light for the place; the ground stays under the car; no seam where the floor turns up; no flattened object near the car |
| Turn, looked at               | `pnpm render --env day --turn 90` and `--turn 180`                                                                               | the sun's highlight and the backdrop move together, by that angle, the same way                                                   |
| Decoder, cross-checked        | mean of level 0 against an independent decoder's mean for each file                                                              | equal to 3 significant figures                                                                                                    |
| Browser (acceptance)          | `pnpm dev` + Playwright                                                                                                          | the list under Done criteria                                                                                                      |
| Production build (acceptance) | `pnpm build`, serve `dist/`                                                                                                      | all four environments load and switch                                                                                             |

### Done criteria

- [ ] All listed commands pass.
- [ ] Every task's `After` state holds.
- [ ] The four environments' numbers in `src/environments.ts` have been tuned from
      renders by the orchestrator (through `render`'s override flags, then one
      REVISE with the final values), and the final renders of all four are judged
      acceptable: car readable, night clearly darker than day, main light on the
      side the opening view shows.
- [ ] In the browser: `↓` goes 日光 → 阴天 → 夜晚街灯 → 车库 → 日光 and `↑` the
      reverse; the design and the camera do not change (pixel signature of a round
      trip); a switch between loaded environments is complete two frames after the
      key press; `]` eight times returns to the same picture.
- [ ] The label reads `calibration  1 / 3  ·  日光  1 / 4` at `/`, and follows both
      kinds of switch.
- [ ] `/#stripes@night` survives a reload; `/#stripes` shows daylight and is left
      alone; `/#stripes@nope` shows daylight and becomes `#stripes@day`;
      `/#_bare@garage` shows the bare car in the warehouse; `history.length` does
      not grow.
- [ ] With `environments/garage.hdr` replaced by a truncated copy (restored
      afterwards with `git restore`): the notice names `车库`, `↑`/`↓` skip it,
      and `/#stripes@garage` shows daylight.
- [ ] Saving an artboard still updates the car with no reload.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] The Outcome is appended and `wiki/plans/README.md` status is updated.

### Merge and deploy

- The repository grows by 24.9 MB of photographs (CC0, Poly Haven; credited in
  `README.md`).
- No new dependency, environment variable or migration. Nothing is deployed.
- CI does not exist; every check above was run by hand.

## Outcome

- Status: APPROVE — 2026-11-16
- Mode: subagent(opus), one work package.
- Commits: `be98982..870f537`
- Deviations:
  - D1 and D2 changed once more after the first renders: the overcast photograph is
    `round_platform`, not `beach_parking`. A bin about 5 m from that camera became a
    green streak along the ground, which the planning simulation had not been run
    from above. The final four are `wide_street_01`, `round_platform`, `hansaplatz`
    and `empty_warehouse_01` (25.6 MB).
  - D3's clamp was wrong and was reversed. `day.hdr` reaches 185344; clamping at the
    half-float maximum removed 28% of the photograph's energy, nearly all of it the
    sun. A photograph brighter than a half float is now divided as a whole, and the
    scale is given back at the exposure, which is exact because the shading and the
    backdrop are linear in the environment's radiance.
  - The backdrop's blur went from the brief's 0.012 rad to 0.004 rad: at 0.012 the
    place behind the car could not be recognised.
  - One revision round, carrying those three, the tuned exposures (overcast 0.9,
    night 0.45, garage 0.7; day stayed 0.4), two messages and two stale comments.
  - The orchestrator tuned by editing `BACKDROP_CONE` and swapping
    `environments/overcast.hdr` in the working tree for throwaway renders, restored
    with `git restore` each time. `render` has no flag for the blur.
- Verified by the orchestrator: typecheck, lint, format, build (four `.hdr` assets),
  the projection check (67), reproducible guides, `render --env nope`. The decoder
  against an independently written one: identical mean radiance and maximum for
  three files, and for `day.hdr` the same mean once multiplied by its scale.
  Renders of all four environments from the opening view, the left, above and far
  away, and of the turn at 90° and 180°. In a browser, from the dev server and from
  the production build with identical pictures: the order and wrap-around of
  `↑`/`↓`; pixel-identical round trips with the camera moved; design and
  environment independent of each other; eight `]` back to the same picture; the
  address cases; a truncated `garage.hdr` named in the notice, skipped by the keys
  and falling back to daylight from the address; an artboard saved with no reload.
- Follow-ups:
  - `captureHeight` (1.5 m) and `groundRadius` (30 m) were not tuned per
    photograph; the ground's scale looked plausible in every render and was left.
  - Objects that stood within the dome's radius are still flattened where a
    photograph has them (planters at the edge of the round platform, boxes along
    the warehouse wall). They are visible from high, far views.
  - The garage is a warehouse, not a parking garage (D2).
  - A decoding failure's detail is in English inside a Chinese notice
    (`照片文件无法解码（data ends early）`).
  - Not measured: load time of the four photographs, and frames dropped while one is
    decoded on the main thread.
  - The console showed two errors while the executor's revision was half written
    and the dev server hot-reloaded it; none at the committed state.
