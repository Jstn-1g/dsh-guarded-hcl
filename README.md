# dsh-guarded-hcl

A small, dependency-free reference implementation of the **evaluation and commitment boundary** for guarded Harness Continual Learning (HCL) in the DeepSeek Harness ecosystem.

> **Status:** early contract draft and executable reference gate. This is not an official DeepSeek project and is not yet a live Cordis plugin.

## Why this exists

An optimizer that proposes memory, skill, prompt, or routing updates should not also be the authority that approves and commits those updates. A credible continual-learning loop needs an independent evaluator and a code-owned retention gate:

```text
propose candidate
  -> evaluate current-task improvement
  -> evaluate historical retention anchors
  -> run validity and budget checks
  -> commit exact candidate or keep baseline unchanged
```

DeepSeek Harness already provides a strong composition substrate through Cordis. This project focuses on the smaller missing contract between **proposal**, **evidence**, and **commitment**.

## What version 0.1 contains

- JSON Schemas for candidates, evaluation evidence, gate policy, and commit decisions;
- deterministic SHA-256 evidence and decision digests;
- current-task improvement thresholds;
- required per-anchor retention checks;
- weighted retention-loss limits;
- severity-aware validity gates;
- optional cost-growth limits;
- passing and deliberately regressing examples;
- Node's built-in test suite with no runtime dependencies.

## Quick start

Requires Node.js 22 or newer.

```bash
npm test
npm run example:pass
npm run example:reject
```

The reject example exits with status `2`, making the gate usable in CI:

```bash
node ./bin/hcl-gate.js ./examples/policy.json ./examples/evaluation-regression.json
```

## Library usage

```js
import { evaluateCandidate } from 'dsh-guarded-hcl'

const decision = evaluateCandidate(policy, evaluationEvidence)
if (!decision.accepted) {
  console.error(decision.reasons)
  process.exitCode = 2
}
```

## Contract overview

| Contract | Purpose |
| --- | --- |
| `candidate.schema.json` | Versioned optimizer proposal against an exact baseline |
| `evaluation-evidence.schema.json` | Current-task, retention, validity, and cost evidence |
| `policy.schema.json` | Code-owned thresholds that the optimizer cannot rewrite implicitly |
| `decision.schema.json` | Deterministic promotion or rejection result |

See [`docs/design.md`](docs/design.md) for the proposed Cordis service boundaries and threat model.

## What is intentionally not here yet

- automatic arbitrary source-code mutation;
- a claim that this is a security sandbox;
- a live DSH plugin built against guessed interfaces;
- a universal benchmark or one prescribed search algorithm;
- silent cross-session changes.

A proper Cordis adapter should be written only after inspecting the exact services, events, and lifecycle contracts in the target DSH runtime.

## Research and community context

This draft is motivated by:

- *Harness Continual Learning: Continual Adaptation Beyond Model Parameters*, arXiv:2608.19013;
- DeepSeek Harness Discussion #2454, *Proposal: task-conditioned Harness evolution with evaluable Plugin Packs*;
- existing community continual-evolution plugins that demonstrate persistent state, evaluation, rollback, and code-owned non-regression gates.

The intended contribution is interoperability: shared evidence and commitment contracts that existing optimizers, evaluators, and memory plugins can implement.

## Repository publishing notes

After creating the GitHub repository:

1. Add the topics `deepseek-harness`, `continual-learning`, `agent-evaluation`, and `harness`. Add `dsh-plugin` only after a live Cordis adapter exists.
2. Keep the description precise: “Portable retention and commit gate for guarded Harness Continual Learning in DeepSeek Harness ecosystems.”
3. Post the text in [`docs/github-discussion-comment.md`](docs/github-discussion-comment.md) to Discussion #2454 and add the repository link.
4. Do not open a pull request against the official DSH repository while its contribution policy says external PRs are not being accepted.

## License

MIT © 2026 Justin Skowyra
