// Only needed when changing export-src; the ready-to-use browser bundles are included.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modules =
  process.env.EXPENSE_QA_MODULES || path.join(root, "node_modules");
const { build } = await import(
  pathToFileURL(path.join(modules, "esbuild/lib/main.js"))
);
const app = existsSync(path.join(root, "dist"))
  ? path.join(root, "dist")
  : root;
for (const format of ["pdf", "docx", "pptx"]) {
  await build({
    entryPoints: [path.join(root, "export-src", format + ".js")],
    outfile: path.join(app, "assets/vendor/export-" + format + ".js"),
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    legalComments: "linked",
    nodePaths: [modules],
  });
}
const versions = [];
for (const name of ["jspdf", "jspdf-autotable", "docx", "pptxgenjs"]) {
  const pkg = JSON.parse(
    await fs.readFile(path.join(modules, name, "package.json"), "utf8"),
  );
  versions.push(`${name} ${pkg.version} (${pkg.license})`);
  for (const file of await fs.readdir(path.join(modules, name))) {
    if (/^licen[sc]e/i.test(file))
      await fs.copyFile(
        path.join(modules, name, file),
        path.join(app, "assets/vendor", name + "-" + file),
      );
  }
}
await fs.writeFile(
  path.join(app, "assets/vendor/EXPORT-VERSIONS.md"),
  versions.join("\n") +
    "\n\nRebuild with npm run build:exports. Browser bundles load only when a report is downloaded.\n",
);
console.log("Built three local browser export bundles.");
