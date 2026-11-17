import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, normalizePath, type EnvironmentModuleNode, type Plugin } from "vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

const OTHER_CHECKOUTS = normalizePath(fileURLToPath(new URL("./.claude", import.meta.url)));

/**
 * The designs live in `designs/`, inside the dev server's root, so a saved artboard
 * is watched with no setup and reaches the running page through
 * `src/design-sources.ts`.
 *
 * Every change under `designs/` (a file created, saved or deleted) is handed on as a
 * hot update of `src/design-sources.ts` and nothing else. Left to itself, Vite would
 * also list the file's own modules, and one of them (the plain `.svg` module, or a
 * `?raw` module left over from a deleted file) has no importer to accept the update,
 * so the page would reload and the camera with it. The file's modules are therefore
 * invalidated here as an HMR invalidation, with the update's timestamp: that is what
 * makes the browser fetch the artboard again when `design-sources.ts` re-imports it,
 * instead of reusing the module it already has with the old text.
 */
function watchDesigns(): Plugin {
  return {
    name: "livery:watch-designs",
    enforce: "post",
    hotUpdate({ file, timestamp, server }) {
      const root = server.config.root;
      // The trailing slash keeps a sibling such as `designs-old/` from matching.
      const designs = `${normalizePath(resolve(root, "designs"))}/`;
      if (!normalizePath(file).startsWith(designs)) return;
      const graph = this.environment.moduleGraph;
      const seen = new Set<EnvironmentModuleNode>();
      for (const mod of graph.getModulesByFile(file) ?? []) {
        graph.invalidateModule(mod, seen, timestamp, true);
      }
      return [
        ...(graph.getModulesByFile(normalizePath(resolve(root, "src/design-sources.ts"))) ?? []),
      ];
    },
  };
}

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
