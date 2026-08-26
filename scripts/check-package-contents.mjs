#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// npm exposes its JS entrypoint while running lifecycle scripts. Invoking that
// entrypoint with the current Node binary avoids the platform-specific .cmd
// spawning behavior that makes spawnSync("npm.cmd", ...) fail on Windows.
const npmCli = process.env.npm_execpath;
const command = npmCli ? process.execPath : "npm";
const args = npmCli
  ? [npmCli, "pack", "--dry-run", "--json"]
  : ["pack", "--dry-run", "--json"];
const packed = spawnSync(command, args, {
  encoding: "utf8",
});

if (packed.status !== 0) {
  const detail = packed.error?.message || packed.stderr || packed.stdout || "npm pack failed";
  process.stderr.write(`${detail}\n`);
  process.exit(packed.status || 1);
}

const paths = JSON.parse(packed.stdout)[0].files.map((file) => file.path);
const requiredConformance = [
  "conformance/artifact-sha256-v0.1.json",
  "conformance/jcs-sha256-v0.1.json",
  "conformance/python/requirements.lock",
  "conformance/python/test_artifact_sha256.py",
  "conformance/python/test_jcs_sha256.py",
];
const actualConformance = paths.filter((path) => path.startsWith("conformance/"));
const requiredRunnerBinding = [
  "docs/runner-binding-v0.1.md",
  "examples/runner-binding-v0.1.json",
  "schemas/runner-binding-v0.1.schema.json",
  "src/runner-binding.js",
];
const requiredEvaluationEvidenceV02 = [
  "docs/evaluation-evidence-v0.2.md",
  "examples/evaluation-v0.2-pass.json",
  "schemas/evaluation-evidence-v0.2.schema.json",
  "src/evaluation-evidence-v0.2.js",
];
const requiredTrialManifest = [
  "docs/trial-manifest-v0.1.md",
  "examples/trial-manifest-v0.1.json",
  "schemas/trial-manifest-v0.1.schema.json",
  "src/trial-manifest.js",
];

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
const missingRunnerBinding = requiredRunnerBinding.filter(
  (path) => !paths.includes(path),
);
if (missingRunnerBinding.length) {
  console.error("RunnerBinding files missing from npm package:", missingRunnerBinding);
  process.exit(1);
}
const missingEvaluationEvidenceV02 = requiredEvaluationEvidenceV02.filter(
  (path) => !paths.includes(path),
);
if (missingEvaluationEvidenceV02.length) {
  console.error(
    "EvaluationEvidence v0.2 files missing from npm package:",
    missingEvaluationEvidenceV02,
  );
  process.exit(1);
}
const missingTrialManifest = requiredTrialManifest.filter(
  (path) => !paths.includes(path),
);
if (missingTrialManifest.length) {
  console.error(
    "TrialManifest files missing from npm package:",
    missingTrialManifest,
  );
  process.exit(1);
}
if (leaked.length) {
  console.error("generated or local files leaked into npm package:", leaked);
  process.exit(1);
}

console.log(
  `npm package contents ok: ${paths.length} files; ` +
    `${actualConformance.length} allowlisted conformance files; ` +
    `${requiredRunnerBinding.length} required RunnerBinding files; ` +
    `${requiredEvaluationEvidenceV02.length} required EvaluationEvidence v0.2 files; ` +
    `${requiredTrialManifest.length} required TrialManifest files; ` +
    "0 generated-file leaks",
);
