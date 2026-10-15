import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  app = existsSync(path.join(root, "dist", "index.html"))
    ? path.join(root, "dist")
    : root;
let count = 0,
  errors = [];
async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (
      e.name === "vendor" ||
      e.name === "node_modules" ||
      e.name === ".git" ||
      e.name === ".openai"
    )
      continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
for (const file of await walk(app)) {
  const s = await fs.readFile(file, "utf8");
  if (file.endsWith(".js")) {
    const r = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    if (r.status !== 0) errors.push(r.stderr);
    for (const m of s.matchAll(/(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/g)) {
      const p = path.resolve(path.dirname(file), m[2]);
      if (!existsSync(p)) errors.push("Missing import: " + p);
    }
    count++;
  }
  if (file.endsWith(".html")) {
    const key = path.basename(file, ".html");
    for (const ext of ["css", "js"]) {
      const target = path.join(app, ext, "pages", key + "." + ext);
      if (!existsSync(target)) errors.push("Missing page file " + target);
    }
    for (const m of s.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const url = m[1].split(/[?#]/)[0];
      if (!url || /^(?:https?:|data:|mailto:)/.test(url)) continue;
      const target = path.resolve(path.dirname(file), url);
      if (!existsSync(target)) errors.push("Missing local link: " + target);
    }
    const ids = [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    if (new Set(ids).size !== ids.length)
      errors.push("Duplicate IDs in " + file);
    count++;
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${count} HTML and JavaScript files: valid syntax, linked assets and page modules.`,
  );
