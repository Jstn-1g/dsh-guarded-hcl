# GitHub Discussion Comment

Suggested destination: DeepSeek Harness Discussion #2454.

---

The newly released **Harness Continual Learning** paper (arXiv:2608.19013) appears to formalize an important part of the evolution loop described here: separating candidate generation from state commitment.

A paper-faithful mapping to DSH could use three independently replaceable Cordis boundaries:

1. `ContinualOptimizer`: receives a frozen harness snapshot plus post-execution feedback and emits a versioned candidate affecting the task interface, experience memory, capability map, or adaptive router.
2. `ContinualEvaluator`: evaluates the candidate against the current task, protected historical-retention anchors, and code-owned validity checks under a controlled runtime.
3. `CommitController`: activates the exact candidate only when the evidence passes configured improvement, retention, validity, and budget thresholds; otherwise the active harness remains unchanged.

The important distinction is that rollback after a failure is not identical to guarded commitment. The candidate should ideally remain isolated until the evaluator authorizes promotion, and the optimizer should not own its own rubric or aggregate decision.

Would it be useful to define a small shared contract for `Candidate`, `EvaluationEvidence`, `RetentionAnchor`, and `CommitDecision` so existing community optimizers and continual-memory plugins can interoperate instead of each inventing a different scorecard and promotion rule?

I have drafted a small, dependency-free reference gate and JSON Schemas that demonstrate deterministic accept/reject decisions, per-anchor non-regression checks, validity gates, evidence digests, and a deliberately regressing fixture. I would be glad to align the names and fields with the Pack / Recipe / Scorecard terminology being developed in this discussion.

This is an independent, early contract draft and executable reference gate—not an official DeepSeek project, not yet a live Cordis plugin, and not a security sandbox. It does not silently mutate cross-session state: the optimizer only proposes; an independent evaluator and code-owned commit controller decide whether to promote the exact candidate.

Reference implementation: https://github.com/Jstn-1g/dsh-guarded-hcl
