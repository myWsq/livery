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
  the artboards usable as print-shop production files. (Direction agreed in
  discussion; not implemented yet.)
- **The car model is replaceable.** Work starts with a placeholder two-door sports
  car; the owner's real model comes later. Nothing may depend on one specific mesh.
- **No changesets.** The repository publishes no packages, so the monorepo baseline's
  versioning step is deliberately skipped. Add it only if a package gets published.

## Working with vgpu

- Read `pnpm exec vgpu docs cat getting-started.md` (run inside `apps/workshop`)
  before touching rendering code, and use `pnpm exec vgpu docs find "<topic>"` for
  anything else. The docs bundled with the installed version are the authority; the
  `vgpu` skill in `.agents/skills/` explains the lookup workflow.
- Keep `vgpu` and `@vgpu/wgsl` on the same release; a mismatch fails at runtime with
  `VGPU-SHADER-SOURCE-VERSION`.
- Headless rendering works on this machine (`pnpm exec vgpu doctor` reports healthy):
  verify visual changes by rendering to pixels through `vgpu/node` rather than by
  assumption.
- `apps/workshop/src` started from vgpu's official `environment-map` example
  (`pnpm exec vgpu examples pull environment-map`). Search the examples before
  writing a technique from scratch.

## Conventions

- Narrate to the owner in Simplified Chinese; code, comments, and commit messages in
  English. `README.md` is for humans and written in Chinese.
- Checks: `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, `pnpm build`.
- Project knowledge (research, plans, design rationale) goes under `wiki/`; plans
  under `wiki/plans/`.
- `.agents/skills/` is the real skills directory; `.claude/skills` is a symlink to it.
