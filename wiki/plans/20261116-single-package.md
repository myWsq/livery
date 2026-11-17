# Plan 20261116-single-package: One package at the repository root instead of a monorepo

> Three parts for three readers. The Record says why and stays true after the
> code moves on. The Execution brief is the only part a delegated executor
> receives. Verification is the orchestrator's. At close, `dev:execute-plan`
> appends an Outcome and updates `wiki/plans/README.md`.
>
> Drift check: `git diff --stat 27e6991..HEAD -- apps package.json pnpm-workspace.yaml turbo.json .gitignore AGENTS.md README.md`

## Status

- Priority: P2
- Effort: S
- Risk: LOW
- Depends on: wiki/plans/20261116-design-switching.md
- Category: refactor
- Execution: subagent(sonnet) — from the departure check
- Stop after: implementation — from the departure check (plain autopilot)
- Plan review: none — the orchestrator is already on the top tier, so the audit was not offered
- Workspace: current — the session was already in the linked worktree on `dev/20261116-workshop-main-chain`; the commits join the open pull request #1
- Planned at: `27e6991`, 2026-11-16

## Record

### Requirement

The repository was set up from the owner's monorepo baseline: a pnpm workspace with
turborepo, the app in `apps/workshop`. It holds one app, no `packages/`, publishes
nothing and has no CI. The owner asked why it is a monorepo at all. The shell buys
nothing today and costs a little every day: script commands need
`--filter @livery/workshop`, the designs are reached through `../../../designs`, and
there are two `package.json` files, a `turbo.json` and a workspace package list to
keep. The roadmap ahead (lighting environments, image export, a published preview)
is all the same app.

Once this is done the repository is a single package whose root is the app, and the
workshop behaves exactly as before.

What the owner sees, as confirmed:

- **Layout.** `index.html`, `src/`, `scripts/`, `vite.config.ts` and `tsconfig.json`
  sit at the repository root next to `designs/` and `wiki/`. `apps/`, `turbo.json`,
  the turbo dependency and the workspace package list are gone. One `package.json`,
  named `livery`.
- **Commands.** `pnpm dev`, `build`, `typecheck`, `lint`, `fmt` and `fmt:check` are
  unchanged. `pnpm --filter @livery/workshop render|guides|check:projection` become
  `pnpm render`, `pnpm guides` and `pnpm check:projection`.
- **Behaviour.** The picture, the switching and the live updates do not change.
- **Documents.** `README.md` and `AGENTS.md` carry the new paths and commands, and
  `AGENTS.md` records that this repository is deliberately not a monorepo.
- **Not in this plan.** Editing the paths inside earlier plan files (they are records
  of their time), renaming modules or restructuring code, changing the package
  manager.

### Decisions & tradeoffs

- **D1 The app's files move to the repository root; no intermediate directory is
  kept.** Rejected: keeping `workshop/` as a plain sub-directory — it removes turbo
  but keeps the deep relative paths and a second root to configure. Based on: the
  product confirmation.
- **D2 Files are moved with `git mv`, in a commit that changes as little of their
  content as it must.** Rejected: copying and deleting — the history of every source
  file would end at this commit.
- **D3 `pnpm-workspace.yaml` stays, holding only settings.** pnpm 11 reads its
  settings (here `allowBuilds`, which lets the WebGPU native modules build) from
  that file; without a `packages` field only the root package is in the workspace.
  Rejected: deleting the file — the headless renderer's native dependencies would be
  blocked from building. Based on: pnpm documentation, `settings.md` ("If the
  `packages` field is omitted, only the root package is included in the workspace");
  `pnpm-workspace.yaml` at `27e6991`.
- **D4 The dev server is limited to this checkout.** With the repository root as the
  Vite root, other checkouts of the repository under `.claude/` (agent worktrees)
  fall inside it. Dependency scanning is given the one entry `index.html`, and the
  watcher ignores this checkout's own `.claude/` directory by absolute path.
  Rejected: the glob `**/.claude/**` — a worktree's own path contains `.claude/`, so
  that pattern would ignore every file of a checkout that is itself a worktree and
  silently switch off live updates there. `(decided while planning)`
- **D5 Earlier plan files keep their `apps/workshop/…` paths.** They record what was
  true when they were written; `git log --follow` connects the old paths to the new.
  Based on: the product confirmation.
- **D6 `AGENTS.md` replaces the "No changesets" decision with a broader one: one
  package, not a monorepo.** It names the baseline being departed from and the
  condition for revisiting, so a later agent applying the baseline does not put the
  monorepo back. `(decided while planning)`

### Discussion log

1. The owner, unprompted, during the exploration of the next roadmap item: "这项目
   感觉没必要搞一个 monorepo 呀". The planner agreed and laid out the cost, the
   benefit (none today) and what flattening takes.
2. _Flatten, and when?_ Offered: flatten first, then do lighting (recommended);
   lighting first, flatten after pull request #1 merges; keep the monorepo. Answer:
   **flatten first**. The lighting exploration is paused with its product
   conclusions confirmed.
3. _Product confirmation_ of the layout, the commands, unchanged behaviour, the
   documents and the non-goals. Answer: **confirmed**.
4. _Departure check._ Direction (move with `git mv`, merge the two `package.json`
   files, drop turbo, limit the dev server to this checkout): **go ahead**.
   Execution: **subagent (sonnet)**, the recommended option. Autopilot: **run to
   completion**; the commits join pull request #1.
5. `(decided while planning)` D4's absolute path, and D6.

### Maintenance notes

- If a second package ever appears, restore `packages:` in `pnpm-workspace.yaml`
  and move the app back under `apps/`; nothing else here blocks that.
- After this merges, the main checkout keeps an untracked `apps/workshop/` holding
  only ignored leftovers (`node_modules`, `dist`, `.turbo`). It can be deleted by
  hand.

## Execution brief

> Written for `subagent(sonnet)` at `27e6991`. Implement the tasks in order. Decide
> only what Your call leaves to you; on anything else that is unclear, stop and
> report.

### Goal

This repository is a pnpm workspace with one app in `apps/workshop` (a Vite +
TypeScript WebGPU previewer). Turn it into a single package: the app's files move to
the repository root, the two `package.json` files become one, and turborepo goes.
Nothing about how the app behaves changes; only locations, a few relative paths, and
the commands in the documents.

Rules for the whole job:

- Run every command from the repository root. Run git as plain, single commands (no
  `&&` or `;` chains that contain git). Stage files by name.
- Two commits: one after Milestone 2, one after Milestone 3. End each commit message
  with the line `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Before each commit run the formatter on the files you edited by hand:
  `pnpm exec oxfmt <files>` (not on files you only moved, and not on
  `pnpm-lock.yaml`).
- Run nothing that checks, builds, renders or serves the project (no typecheck, no
  lint, no `fmt:check`, no `vite`, no scripts under `scripts/`). `pnpm install` in
  T9 is the one project command you run.
- Do not delete anything except through the `git rm` commands named below. In
  particular leave whatever untracked files remain under `apps/workshop/` alone.
- Do not edit anything under `wiki/`, `designs/`, `.agents/` or `.claude/`.

### Milestone 1: The app lives at the repository root

Depends on: none

#### T1 · The app's tracked files are at the root, moved with history

- Where: `apps/workshop/`
- Change: Run these five commands, one at a time:
  `git mv apps/workshop/index.html index.html`,
  `git mv apps/workshop/tsconfig.json tsconfig.json`,
  `git mv apps/workshop/vite.config.ts vite.config.ts`,
  `git mv apps/workshop/src src`,
  `git mv apps/workshop/scripts scripts`.
- After: `git ls-files apps` lists only `apps/workshop/package.json`. `index.html`,
  `tsconfig.json`, `vite.config.ts`, `src/` and `scripts/` exist at the root with
  their content unchanged.
- Don't: copy files, or move anything untracked (`node_modules`, `dist`, `.turbo`).

#### T2 · One `package.json` describes the whole repository

- Where: `package.json` (root) and `apps/workshop/package.json`
- Change: Replace the root `package.json` with exactly the content below, then run
  `git rm apps/workshop/package.json`.
- After: the root file is:

  ```json
  {
    "name": "livery",
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "vite build",
      "typecheck": "tsc --noEmit",
      "fmt": "oxfmt",
      "fmt:check": "oxfmt --check",
      "lint": "oxlint",
      "render": "node scripts/render.ts",
      "guides": "node scripts/guides.ts",
      "check:projection": "node scripts/check-projection.ts"
    },
    "dependencies": {
      "vgpu": "^0.6.0"
    },
    "devDependencies": {
      "@resvg/resvg-js": "^2.6.2",
      "@types/node": "^26.6.6",
      "@vgpu/wgsl": "^0.6.0",
      "@webgpu/types": "^0.1.74",
      "oxfmt": "^0.78.0",
      "oxlint": "^1.93.0",
      "typescript": "^7.0.2",
      "vite": "^8.3.8"
    },
    "packageManager": "pnpm@11.6.0"
  }
  ```

  `git ls-files apps` lists nothing.

- Don't: change any version number, or keep `turbo`.

#### T3 · turborepo's configuration is gone

- Where: `turbo.json`; `.gitignore`
- Change: Run `git rm turbo.json`. In `.gitignore` delete the line `.turbo/`.
- After: `turbo.json` does not exist. `.gitignore` reads, in this order:
  `node_modules/`, `dist/`, `*.tsbuildinfo`, `.DS_Store`.

#### T4 · The workspace file holds settings only

- Where: `pnpm-workspace.yaml`
- Change: Delete the `packages:` key and its two entries. Keep the rest (D3).
- After: the whole file is:

  ```yaml
  allowBuilds:
    "@vgpu/adapter-node": true
    webgpu: true
  ```

- Don't: delete the file — the settings in it are what let the WebGPU native modules
  build.

### Milestone 2: Everything resolves from the new locations

Depends on: Milestone 1

#### T5 · The bundle finds the designs one level up

- Where: `src/design-sources.ts` — the line
  `const files = import.meta.glob<string>("../../../designs/*/*.svg", {`
- Change: Replace `"../../../designs/*/*.svg"` with `"../designs/*/*.svg"`.
- After: that is the only change in the file.

#### T6 · The Node scripts find the repository root two levels up

- Where: `scripts/lib/design.ts` — the line
  `export const REPOSITORY = fileURLToPath(new URL("../../../../", import.meta.url));`
- Change: Replace `"../../../../"` with `"../../"`.
- After: `REPOSITORY` is the directory that holds `designs/` (from
  `scripts/lib/design.ts`, two levels up). That is the only change in the file.

#### T7 · The dev server's root is the repository, limited to this checkout

- Where: `vite.config.ts` — the whole file.
- Change: `designs/` is now inside the dev server's root, so it is watched without
  help; and the root can now contain other checkouts of this repository under
  `.claude/`, which the server must stay out of (D4). Rewrite the file to the state
  under After.
- After:
  - Imports: `resolve` from `node:path`; `fileURLToPath` from `node:url`;
    `defineConfig`, `normalizePath`, `type EnvironmentModuleNode`, `type Plugin`
    from `vite`; `wgslVitePlugin` as today. `searchForWorkspaceRoot` is no longer
    imported.
  - The `watchDesigns()` plugin keeps its name `livery:watch-designs`,
    `enforce: "post"` and its `hotUpdate` hook. Its `configureServer` hook is
    removed. Inside `hotUpdate` the one line that computes `designs` becomes
    ``const designs = `${normalizePath(resolve(root, "designs"))}/`;`` — every other
    line of the hook stays exactly as it is.
  - The plugin's doc comment: replace its first paragraph (the five lines from
    `The designs live at the repository root, outside this app's root` to
    `allows, and the artboards are imported as text.`) with the paragraph in the
    block below, wrapped as doc-comment lines. Keep the second paragraph (the one
    that starts "Every change under") word for word.

    ```text
    The designs live in `designs/`, inside the dev server's root, so a saved artboard
    is watched with no setup and reaches the running page through
    `src/design-sources.ts`.
    ```

  - The exported config is:

    ```ts
    export default defineConfig({
      plugins: [wgslVitePlugin(), watchDesigns()],
      // The repository root is the dev server's root, and it can hold other checkouts
      // of this repository under `.claude/` (agent worktrees), each with its own
      // index.html and sources. The server keeps to this checkout: it scans only its
      // own entry for dependencies and does not watch its `.claude/` directory. That
      // directory is named by absolute path, not as `**/.claude/**`: this checkout may
      // itself live under some `.claude/`, and such a glob would then ignore every
      // file in it.
      optimizeDeps: { entries: ["index.html"] },
      server: { watch: { ignored: [`${OTHER_CHECKOUTS}/**`] } },
    });
    ```

    with, above it, the constant
    `const OTHER_CHECKOUTS = normalizePath(fileURLToPath(new URL("./.claude", import.meta.url)));`.

- Don't: write the ignore pattern as `**/.claude/**` (D4). Don't change the logic of
  `hotUpdate` beyond the one line.

#### T8 · The scripts' header comments show the commands as they are now typed

- Where: the header comment of each of `scripts/render.ts`, `scripts/guides.ts`,
  `scripts/check-projection.ts`
- Change: In each, replace `pnpm --filter @livery/workshop ` with `pnpm ` (one
  occurrence per file).
- After: the three lines read `pnpm render [--design name] [--out file.png]`,
  `pnpm guides` and `pnpm check:projection`, with their indentation unchanged.

#### T9 · The lockfile matches the single package

- Where: `pnpm-lock.yaml`
- Change: Run `pnpm install` once.
- After: the command exits 0. `pnpm-lock.yaml` has one importer, `.`, and no line
  containing `turbo`. Stage `pnpm-lock.yaml` with the other files of this milestone
  and commit (first commit: T1 to T9).
- Don't: edit the lockfile by hand. If `pnpm install` fails, stop and report its
  output.

### Milestone 3: The documents describe the repository as it now stands

Depends on: Milestone 2

#### T10 · `AGENTS.md` uses the new paths and commands and records the decision

- Where: `AGENTS.md`
- Change: Make exactly these replacements.
  1. `` `apps/workshop/src/car/model.ts` `` → `` `src/car/model.ts` ``
  2. `` `apps/workshop/src/frames.ts` `` → `` `src/frames.ts` ``
  3. The bullet that starts `- **No changesets.**` (three lines, ending
     `Add it only if a package gets published.`) → replace the whole bullet with:

     ```markdown
     - **One package, not a monorepo.** The owner's baseline for new repositories is a
       pnpm + turborepo monorepo. This repository deliberately is not one: it holds a
       single app and publishes nothing, so the workshop lives at the repository root
       (`index.html`, `src/`, `scripts/`) with no workspace packages, no turbo and no
       changesets. Do not reintroduce them unless a second package actually exists.
     ```

  4. ``(run inside `apps/workshop`)`` → delete it together with the space before
     it, so the sentence reads
     ``Read `pnpm exec vgpu docs cat getting-started.md` before touching rendering``
     `code, …` (re-wrap the paragraph's lines as needed).
  5. `pnpm --filter @livery/workshop render` → `pnpm render`
  6. `pnpm --filter @livery/workshop guides` → `pnpm guides`
  7. `pnpm --filter @livery/workshop check:projection` → `pnpm check:projection`
  8. ``under `apps/workshop/src` are shared`` → ``under `src` are shared``
  9. `` `apps/workshop/src` started from vgpu's `` → `` `src` started from vgpu's ``

- After: `AGENTS.md` contains neither `apps/workshop` nor `@livery/workshop`. No
  other sentence changes.

#### T11 · `README.md` uses the new commands and layout

- Where: `README.md`
- Change:
  1. In the code block under `不开浏览器也能看效果和做检查`, replace
     `pnpm --filter @livery/workshop ` with `pnpm ` on its three lines, and realign
     the `#` comments so they still start in one column.
  2. Under `## 结构`, replace the line that starts ``- `apps/workshop`：`` with
     these two lines:

     ```markdown
     - `index.html`、`src/`：3D 预览工坊，用 [vgpu](https://github.com/vercel-labs/vgpu) 直接基于 WebGPU 渲染
     - `scripts/`：不开浏览器的渲染和检查脚本
     ```

- After: `README.md` contains neither `apps/workshop` nor `@livery/workshop`. Commit
  (second commit: T10 and T11).

### Your call

- The wording of the two commit messages.
- How the lines of an edited paragraph are re-wrapped.

### Landmines

- This checkout's own path contains `/.claude/worktrees/`. Anything that matches
  `.claude` as a glob over absolute paths matches every file here (see T7).

### Scope

In scope:

- `apps/workshop/**` (moved or removed with git, as T1 and T2 say)
- `index.html`, `tsconfig.json`, `vite.config.ts`, `src/**`, `scripts/**` (new
  locations; content changes only where a task names them)
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `.gitignore`
- `AGENTS.md`, `README.md`

Out of scope:

- `wiki/**` — the earlier plans keep their old paths on purpose (D5).
- `designs/**`, `.agents/**`, `.claude/**`, `.oxfmtrc.json`, `skills-lock.json`.
- Untracked leftovers under `apps/workshop/` (`node_modules`, `dist`, `.turbo`).
- Any source file not named by a task: no content change at all.

### Stop and report if

- A task's anchor is missing, or the text there differs from what the task quotes.
- A `git mv` or `git rm` command fails.
- `pnpm install` fails or asks a question.
- A task needs a file outside the in-scope list.

## Verification

### Milestone validations

- Milestone 1 and 2: `pnpm typecheck`, `pnpm lint`, `pnpm build` -> exit 0;
  `pnpm check:projection` -> exit 0, 67 assertions.
- Milestone 3: `pnpm fmt:check` -> exit 0;
  `grep -rn "apps/workshop\|@livery/workshop\|turbo" AGENTS.md README.md package.json src scripts vite.config.ts` -> no match.

### Commands

| Purpose                       | Command                                                     | Expected result                       |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| Typecheck                     | `pnpm typecheck`                                            | exit 0                                |
| Lint                          | `pnpm lint`                                                 | exit 0                                |
| Format                        | `pnpm fmt:check`                                            | exit 0                                |
| Build                         | `pnpm build`                                                | exit 0, output in `dist/` at the root |
| Projection                    | `pnpm check:projection`                                     | exit 0, 67 pass                       |
| Guides reproducible           | `pnpm guides` then `git status --porcelain designs/_guides` | empty                                 |
| Render                        | `pnpm render --design stripes --out <tmp>.png`              | exit 0, the striped car               |
| Lockfile                      | `pnpm install --frozen-lockfile`                            | exit 0                                |
| History kept                  | `git log --follow --oneline -- src/scene.ts`                | reaches commits from before the move  |
| Browser (acceptance)          | `pnpm dev` + Playwright                                     | the list under Done criteria          |
| Production build (acceptance) | `pnpm build`, serve `dist/`                                 | car shown, `←`/`→` switch             |

### Done criteria

- [ ] All listed commands pass.
- [ ] Every task's `After` state holds.
- [ ] `git diff -M --stat <baseline>..HEAD` shows the files under `src/` and
      `scripts/` as renames; only `src/design-sources.ts`, `scripts/lib/design.ts`,
      the three script headers and `vite.config.ts` have content changes.
- [ ] In the browser, from the dev server started at the root: the car wears
      calibration; `←`/`→` switch; saving an artboard updates the car with no reload
      (this checkout is itself under `.claude/`, so this proves D4's pattern does
      not swallow it); creating and deleting a design directory changes the list
      with no reload.
- [ ] No tracked file remains under `apps/`.
- [ ] Implementation follows every entry in Decisions & tradeoffs.
- [ ] No out-of-scope files changed.
- [ ] The Outcome is appended and `wiki/plans/README.md` status is updated.

### Merge and deploy

- After merging, run `pnpm install` once in the main checkout: `node_modules` moves
  to the root. The untracked `apps/workshop/` left behind there holds only ignored
  files and can be deleted by hand.
- A dev server started before the merge must be restarted from the repository root.
- Nothing is deployed.

## Outcome

- Status: APPROVE — 2026-11-16
- Mode: subagent(sonnet), one work package.
- Commits: `2536d68..7ba8570`
- Deviations:
  - One revision round. T8's replacement dropped the space after `pnpm` in the
    three script header comments (`pnpmrender`), and the paragraphs shortened in
    `AGENTS.md` had been left unwrapped. Both were comment or prose only.
  - The constant naming this checkout's `.claude/` directory sits above the
    plugin in `vite.config.ts` instead of directly above the exported config.
- Verified by the orchestrator: typecheck, lint, format, build, the projection
  check (67 assertions), reproducible guides, `render`, a frozen-lockfile install
  and `git log --follow` on a moved file. In a browser the three designs' pictures
  are pixel-identical to those before the move, from the dev server at the root
  and from the production build; saving an artboard and creating and deleting a
  design directory hot-update without a reload. The checkout this ran in lives
  under `.claude/worktrees/`, so the last point also shows D4's ignore pattern
  does not swallow a worktree's own files.
- Follow-ups:
  - D4's other half was not observed: that a dev server started in the main
    checkout stays out of worktrees under its `.claude/`. No such nested checkout
    exists inside the worktree where this was verified.
  - `oxfmt` and `oxlint` run from the main checkout still walk into
    `.claude/worktrees/`, as they did before this plan.
