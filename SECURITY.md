# Security Policy

## Supported Versions

Security fixes are considered for the latest release and the current `main`
branch. Older revisions may be asked to reproduce against one of those targets.

## System and Scope

`dsh-guarded-hcl` is a dependency-free Node.js reference gate. It consumes
locally supplied policy and evaluation-evidence JSON and produces a
deterministic accept-or-reject decision before an integration activates a
candidate. The CLI, library code, schemas, and pinned evaluator integration are
in scope.

The project is not a sandbox, evaluator, artifact store, signature service, or
activation controller. Deploying it does not by itself isolate an optimizer or
prove that supplied measurements came from an independent evaluator.

## Threat Model and Trust Boundaries

The integrating operator controls the policy and the host that invokes the
gate. Candidate-producing optimizers and candidate artifacts may be untrusted.
Evaluation evidence crosses the decision boundary and can be malformed or
attacker-influenced, even though a correct deployment should obtain it from an
independent evaluator.

The gate trusts the caller to bind the supplied digests to real artifacts and
to activate only the exact candidate named by an accepted decision. External
evaluator fixtures are trusted only at their documented pinned revisions.

## Security Invariants

- Malformed, unsupported, ambiguous, or unknown policy and evidence fields
  must fail closed rather than produce an accepted decision.
- Required retention anchors must be present, unique, and unable to opt out of
  their required status through a conflicting representation.
- Improvement, retention, validity, and cost limits must be enforced exactly as
  normalized from the code-owned policy.
- Policy, evidence, and decision digests must be deterministic and bind the
  normalized values used for the decision.
- The gate must not activate, mutate, or replace a candidate as a side effect
  of evaluation.
- Pinned integrations must reject measurements or artifact identities outside
  the documented fixture boundary.
- Artifact-profile producers must bind one immutable snapshot, preserve raw
  bytes, exact Unicode path code points, and declared executable modes; they
  must reject non-canonical paths, control characters, file/directory prefix
  collisions, and unsupported entry types.

## Reportable Findings and Severity Context

Please report issues that can cause a crafted input to be accepted contrary to
the effective policy, omit or bypass a required check, misbind a decision to
different normalized inputs, execute code or write files while parsing data,
or escape a documented integration pin. Findings are more severe when they can
plausibly cause an unsafe candidate to be promoted in a normal integration.

## Out of Scope, Exclusions, and Accepted Risk

The following are not security findings in this repository unless they also
break an invariant above:

- the quality, completeness, or truthfulness of syntactically valid evaluator
  measurements;
- a trusted operator deliberately supplying both a permissive policy and
  matching evidence;
- production sandboxing, remote execution, authentication, authorization, or
  multi-tenant isolation that this project does not claim to provide;
- candidate activation or rollback behavior implemented by a downstream host;
- vulnerabilities in an upstream evaluator that do not cross this project's
  pinned integration boundary.

## Known Limitations and Compensating Controls

Digests provide deterministic identity, not authenticity: the project does not
sign policies, evidence, decisions, or candidate artifacts. JSON Schemas are
published as interoperability contracts, while runtime normalization is the
gate's enforcement boundary. The artifact profile validates but never
normalizes caller-supplied paths, and does not acquire a snapshot or prove that
the caller supplied every intended entry. Resource limits, snapshot
completeness, canonical path production, and provenance verification remain
the responsibility of the invoking host. Integrations should keep policy
ownership, evaluation, and activation under separate control and pin every
external input.

## Reporting a Vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/Jstn-1g/dsh-guarded-hcl/security/advisories/new)
instead of opening a public issue. Include the affected revision, a minimal
reproduction, the policy invariant that fails, realistic impact, and any known
workaround. Avoid including secrets, third-party data, or unnecessary exploit
detail.
