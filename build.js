import * as esbuild from "esbuild";
import { join } from "path";
import { rm, cp } from "fs/promises";

await rm("./dist", { recursive: true, force: true });

await cp("./src/index.html", "./dist/index.html");
await cp("./src/style.css", "./dist/style.css");
await cp("./wheels/", "./dist/wheels/", { recursive: true });

await build({
  entryPoints: ["./node_modules/monaco-editor/esm/vs/editor/editor.worker.js"],
  bundle: true,
  format: "iife",
  outbase: "./node_modules/monaco-editor/esm/",
  outdir: join(import.meta.dirname, "dist"),
});

await build({
  entryPoints: ["src/worker.js"],
  bundle: true,
  format: "iife",
  outdir: join(import.meta.dirname, "dist"),
});

await build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  outdir: join(import.meta.dirname, "dist"),
  loader: {
    ".ttf": "file",
  },
});

async function build(opts) {
  const result = await esbuild.build(opts);
  if (result.errors.length > 0) {
    console.error(result.errors);
  }
  if (result.warnings.length > 0) {
    console.warn(result.warnings);
  }
}
