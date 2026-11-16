import { defineConfig, searchForWorkspaceRoot, type Plugin } from "vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

/**
 * The designs live at the repository root, outside this app's root, which is all the
 * dev server watches by default. Watching `designs/` as well is what carries a saved
 * artboard into the running page (see `src/design-sources.ts`). Serving and bundling
 * need nothing extra: the repository root is the workspace root, which Vite already
 * allows, and the artboards are imported as text.
 */
function watchDesigns(): Plugin {
  return {
    name: "livery:watch-designs",
    configureServer(server) {
      server.watcher.add(`${searchForWorkspaceRoot(server.config.root)}/designs`);
    },
  };
}

export default defineConfig({
  plugins: [wgslVitePlugin(), watchDesigns()],
});
