import { resolve } from "node:path";

import {
  defineConfig,
  normalizePath,
  searchForWorkspaceRoot,
  type EnvironmentModuleNode,
  type Plugin,
} from "vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

/**
 * The designs live at the repository root, outside this app's root, which is all the
 * dev server watches by default. Watching `designs/` as well is what carries a saved
 * artboard into the running page (see `src/design-sources.ts`). Serving and bundling
 * need nothing extra: the repository root is the workspace root, which Vite already
 * allows, and the artboards are imported as text.
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
    configureServer(server) {
      server.watcher.add(`${searchForWorkspaceRoot(server.config.root)}/designs`);
    },
    hotUpdate({ file, timestamp, server }) {
      const root = server.config.root;
      // The trailing slash keeps a sibling such as `designs-old/` from matching.
      const designs = `${normalizePath(`${searchForWorkspaceRoot(root)}/designs`)}/`;
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
});
