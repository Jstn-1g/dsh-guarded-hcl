# Changelog

All notable changes to this project are documented here.

## Unreleased

- Added a draft, dependency-free RFC 8785 JCS + SHA-256 digest profile.
- Added implementation-neutral accepted and rejected conformance vectors.
- Added a hash-pinned Python oracle and Linux/Windows conformance CI over the
  same vector file.
- Added a draft artifact JCS + SHA-256 profile over immutable tree or blob
  bytes, canonical relative POSIX paths, and regular/executable modes.
- Added shared artifact vectors and independent Node/Python consumers covering
  raw line endings, exact Unicode paths, UTF-8 path order, path-prefix and
  control-character rejection, representation domain separation, and rejected
  symlink/submodule entries.
- Added a closed, versioned RunnerBinding v0.1 schema binding one opaque
  candidate identifier to an artifact profile, representation kind, digest,
  and a Selection Receipt schema URI, JCS profile, and digest.
- Added dependency-free validation, duplicate-safe parsing, JCS
  canonicalization and digest APIs, fail-closed tests, and a packaged example
  for RunnerBinding v0.1. A test-only Ajv 2020-12 consumer verifies exact
  schema/runtime acceptance parity for Unicode scalar candidate identifiers
  and the versioned lowercase HTTPS-or-URN schema-identifier profile.
- Added a closed EvaluationEvidence v0.2 schema with a required RunnerBinding
  schema URI, digest profile, and digest reference.
- Added deterministic caller-supplied RunnerBinding verification before
  CommitDecision, including digest, candidate identifier, and artifact digest
  matching plus a local CLI binding path.
- Preserved all existing v0.1 policy, evidence, and decision digest behavior.

## 0.1.0 — 2026-08-21

- Added the dependency-free guarded retention and commit gate.
- Added versioned candidate, evidence, policy, and decision schemas.
- Added deterministic policy, evidence, and decision digests.
- Added strict runtime rejection for unsupported schema versions, unknown
  fields, duplicate identifiers, and contradictory required-anchor metadata.
- Added passing, regression, boundary, and malformed-evidence tests.
- Added the pinned `dsh-wm` Sunset evaluator conformance fixture.
- Added GitHub Actions for the core suite and external conformance check.

This is an independent early contract draft and executable reference gate. It
is not an official DeepSeek project, a live Cordis plugin, or a security
sandbox.
