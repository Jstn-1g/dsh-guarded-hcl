# Design: Guarded Harness Continual Learning for DSH

## Status

This repository is a small, portable reference implementation and contract draft. It is not an official DeepSeek project, not a complete self-evolving agent, and not yet a live Cordis plugin.

## Problem boundary

DeepSeek Harness already exposes the mechanisms required to compose and replace runtime capabilities. Continual improvement needs a separate decision boundary: an optimizer may propose a change, but it must not be the authority that approves and commits its own change.

The proposed loop is:

```text
frozen baseline snapshot
  -> optimizer proposes a candidate
  -> isolated evaluator runs current-task trials
  -> evaluator runs historical retention anchors
  -> code-owned validity and budget checks
  -> deterministic commit decision
  -> atomic activation or unchanged baseline
  -> append-only audit record
```

## Separation of duties

### Continual Optimizer

The optimizer consumes post-execution feedback and produces a versioned candidate. It may propose changes to:

- task interface;
- experience memory;
- capability or skill map;
- adaptive routing rules.

It does not write the active harness directly.

### Continual Evaluator

The evaluator runs outside the optimizer's authority. It owns hidden or protected retention anchors, validity checks, environment controls, and reproducible score aggregation.

### Commit Controller

The controller accepts only a complete evidence record. It checks the active baseline revision and digest, computes a deterministic decision, and either activates the exact candidate or leaves the baseline untouched. Production implementations should use atomic persistence and append an audit event before reporting success.

## Minimal contracts

- `candidate.schema.json`: proposed component-level changes and provenance.
- `evaluation-evidence.schema.json`: current-task, retention, validity, and cost evidence.
- `policy.schema.json`: code-owned acceptance thresholds.
- `decision.schema.json`: deterministic accept/reject output with evidence and decision digests.

## Cordis mapping

A future DSH integration can expose narrow services instead of one all-powerful self-editing plugin:

```text
hcl.optimizer.propose(snapshot, feedback) -> Candidate
hcl.evaluator.evaluate(snapshot, candidate, suite) -> EvaluationEvidence
hcl.commit.decide(policy, evidence) -> CommitDecision
hcl.commit.activate(expectedRevision, candidate, decision) -> ActivationResult
```

The evaluator and commit controller should be separately replaceable Cordis plugins. This allows community optimizers to compete while sharing one retention and commitment protocol.

## Non-goals for version 0.1

- autonomous mutation of arbitrary source code;
- model-weight training;
- claiming a security sandbox;
- choosing one universal benchmark or search algorithm;
- silently applying global or cross-session changes;
- replacing existing continual-memory plugins.

## Threats and failure modes

1. **Self-grading:** the optimizer writes the rubric or its own aggregate score.
2. **Benchmark leakage:** retention anchors become visible in the optimizer context.
3. **Stale baseline:** a candidate is evaluated against one revision and committed over another.
4. **Partial activation:** only part of a multi-component candidate becomes active.
5. **Metric gaming:** quality improves by violating cost, permissions, or task validity.
6. **Unbounded forgetting:** average score hides a severe regression on a critical anchor.
7. **Irreproducible evidence:** model, environment, dataset, or grader versions are missing.

The contract addresses these by separating evidence from proposals, retaining per-anchor results, recording exact digests, and refusing malformed evidence.

## First DSH milestone

The smallest useful live integration is not full autonomous evolution. It is one optimizer adapter plus one fixed evaluation suite and a commit controller that can demonstrate:

1. a candidate improves a selected task;
2. a required historical anchor remains intact;
3. a deliberately regressing candidate is rejected;
4. the baseline remains active after rejection;
5. every decision is reproducible from stored evidence.
