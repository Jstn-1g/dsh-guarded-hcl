#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packed = spawnSync(npm, ["pack", "--dry-run", "--json"], {
  encoding: "utf8",
});

if (packed.status !== 0) {
  process.stderr.write(packed.stderr || packed.stdout);
  process.exit(packed.status || 1);
}

const paths = JSON.parse(packed.stdout)[0].files.map((file) => file.path);
const requiredConformance = [
  "conformance/jcs-sha256-v0.1.json",
  "conformance/python/requirements.lock",
  "conformance/python/test_jcs_sha256.py",
];
const actualConformance = paths.filter((path) => path.startsWith("conformance/"));

const forbidden = [
  /(^|\/)__pycache__(\/|$)/,
  /(^|\/)\.(venv|pytest_cache|mypy_cache|ruff_cache|tox|nox)(\/|$)/,
  /(^|\/)venv(\/|$)/,
  /\.py[cod](\.|$)/,
  /\.egg-info(\/|$)/,
  /(^|\/)(node_modules|coverage)(\/|$)/,
  /(^|\/)\.DS_Store$/,
  /\.(log|tmp)$/,
];
const leaked = paths.filter((path) => forbidden.some((pattern) => pattern.test(path)));

if (JSON.stringify(actualConformance) !== JSON.stringify(requiredConformance)) {
  console.error("unexpected conformance files in npm package:", actualConformance);
  process.exit(1);
}
if (leaked.length) {
  console.error("generated or local files leaked into npm package:", leaked);
  process.exit(1);
}

console.log(
  `npm package contents ok: ${paths.length} files; ` +
    `${actualConformance.length} allowlisted conformance files; 0 generated-file leaks`,
);
