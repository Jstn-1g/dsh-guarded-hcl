# dsh-guarded-hcl

[![CI](https://github.com/Jstn-1g/dsh-guarded-hcl/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Jstn-1g/dsh-guarded-hcl/actions/workflows/ci.yml)
[![dsh-wm conformance](https://github.com/Jstn-1g/dsh-guarded-hcl/actions/workflows/dsh-wm-conformance.yml/badge.svg?branch=main)](https://github.com/Jstn-1g/dsh-guarded-hcl/actions/workflows/dsh-wm-conformance.yml)
[![Release](https://img.shields.io/github/v/release/Jstn-1g/dsh-guarded-hcl?display_name=tag&sort=semver)](https://github.com/Jstn-1g/dsh-guarded-hcl/releases)
[![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-339933)](package.json)
[![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Prevent continual-learning updates from improving one task while silently
breaking old capabilities.** This dependency-free Node.js CLI and JSON contract
turn supplied improvement, retention, validity, and cost evidence into a
deterministic promotion or rejection decision. The candidate is identified by
the digest supplied by the caller; activation remains integration-owned.

> **Status:** independent early contract draft and executable reference gate.
> This is not an official DeepSeek project, not yet a live Cordis plugin, and
> not a security sandbox.

## The 30-second proof

The included regression fixture looks better on its current task and still must
not ship:

| Signal | Baseline | Candidate | Result |
| --- | ---: | ---: | --- |
| Current-task score | 0.72 | **0.86** | +0.14 |
| Permission anchor | 1.00 | **0.70** | regression |
| Citation fidelity | 0.94 | **0.83** | regression |
| Cost | 0.42 | **0.61** | +45.2% |
| Commit decision |  |  | **rejected** |

```bash
git clone https://github.com/Jstn-1g/dsh-guarded-hcl.git
cd dsh-guarded-hcl
npm ci --ignore-scripts
npm test
npm run example:pass
node ./bin/hcl-gate.js ./examples/policy.json ./examples/evaluation-regression.json
```

The last command prints five explicit rejection reasons and exits with status
`2` by design. The CLI never activates the rejected candidate.

```text
REQUIRED_ANCHOR_REGRESSION (two anchors)
RETENTION_BUDGET_EXCEEDED
VALIDITY_CHECK_FAILED
COST_BUDGET_EXCEEDED
```

## Real evaluator fixture: dsh-wm Sunset

The optional [`dsh-wm` conformance fixture](integrations/dsh-wm/README.md)
executes the real Sunset evaluator at pinned upstream commit
[`cd06866`](https://github.com/WayneJin0918/dsh-wm/commit/cd06866a638b1dcc80defa6d674ff3470ff0ad31).
The synthetic regression candidate stays near-perfect in the first half
(`SSIM 0.993`) but collapses in the second (`SSIM 0.476`), so the gate rejects
it before promotion.

```bash
git clone https://github.com/WayneJin0918/dsh-wm.git ../dsh-wm
git -C ../dsh-wm checkout cd06866a638b1dcc80defa6d674ff3470ff0ad31
npm run example:dsh-wm -- ../dsh-wm
```

This fixture proves the evaluator-to-decision seam. It does not claim a live
Cordis adapter or a complete Pack/Recipe/Scorecard implementation.

## Separation of duties

```text
optimizer proposes an exact candidate
  -> independent evaluator produces evidence
  -> code-owned policy checks improvement, retention, validity, and cost
  -> commit controller promotes that exact candidate or keeps the baseline
```

The optimizer never owns its rubric or silently mutates cross-session state.

## Contract overview

| Contract | Purpose |
| --- | --- |
| [`candidate.schema.json`](schemas/candidate.schema.json) | Versioned optimizer proposal against an exact baseline |
| [`evaluation-evidence.schema.json`](schemas/evaluation-evidence.schema.json) | Current-task, retention, validity, and cost evidence |
| [`policy.schema.json`](schemas/policy.schema.json) | Code-owned thresholds the optimizer cannot rewrite implicitly |
| [`decision.schema.json`](schemas/decision.schema.json) | Deterministic promotion or rejection result |

See [`docs/design.md`](docs/design.md) for the proposed Cordis boundaries and
threat model.

## Install from GitHub

The package is not published to the npm registry yet. Install the pinned GitHub
release instead:

```bash
npm install github:Jstn-1g/dsh-guarded-hcl#v0.1.0
```

```js
import { evaluateCandidate } from 'dsh-guarded-hcl'

const decision = evaluateCandidate(policy, evaluationEvidence)
if (!decision.accepted) {
  console.error(decision.reasons)
  process.exitCode = 2
}
```

The installed CLI accepts policy and evidence JSON files:

```bash
npx hcl-gate ./policy.json ./evaluation-evidence.json
```

## What version 0.1 contains

- dependency-free deterministic retention and commit gate;
- JSON Schemas for candidate, evidence, policy, and decision records;
- required per-anchor and weighted retention checks;
- severity-aware validity and optional cost-growth gates;
- canonical SHA-256 policy, evidence, and decision digests;
- passing and deliberately regressing fixtures;
- a pinned external `dsh-wm` evaluator conformance workflow;
- Node's built-in test suite and GitHub Actions.

## Intentional limits

- no autonomous mutation of arbitrary source code;
- no claim of production isolation or sandboxing;
- no live Cordis adapter built against guessed interfaces;
- no universal benchmark or prescribed optimizer;
- no silent global or cross-session changes;
- no claim of reproducing the complete Harness Continual Learning paper.

## Contributing

The most valuable contribution is another independently produced evaluation
fixture. See [`CONTRIBUTING.md`](CONTRIBUTING.md) and the
[integration request form](https://github.com/Jstn-1g/dsh-guarded-hcl/issues/new?template=integration.yml).

## Research and community context

- [Harness Continual Learning: Continual Adaptation Beyond Model Parameters](https://arxiv.org/abs/2608.19013)
- [DeepSeek Harness Discussion #2454](https://github.com/deepseek-ai/deepseek-harness/discussions/2454)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## License

MIT © 2026 Justin Skowyra
