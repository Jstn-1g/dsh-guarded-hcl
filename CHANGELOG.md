# Changelog

All notable changes to this project are documented here.

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
