# EvaluationEvidence v0.2

## Status and scope

EvaluationEvidence v0.2 adds one required, machine-checkable reference to an
exact [RunnerBinding v0.1](runner-binding-v0.1.md). Before the existing policy
logic can produce a CommitDecision, the caller must supply the referenced
RunnerBinding bytes as parsed data. The gate validates the binding, recomputes
its digest, and verifies that its candidate and artifact identities match the
evidence.

The versioned schema is
[`evaluation-evidence-v0.2.schema.json`](../schemas/evaluation-evidence-v0.2.schema.json).
The existing [`evaluation-evidence.schema.json`](../schemas/evaluation-evidence.schema.json)
and all EvaluationEvidence v0.1 normalization, digest, decision, and CLI
two-argument behavior remain unchanged. Supplying a RunnerBinding resolution
with v0.1 evidence now fails closed instead of silently ignoring the binding.

This contract is deterministic audit/provenance binding. It does not fetch a
URI, resolve a mutable registry, authorize execution, verify a signature,
activate a candidate, or add fields from ASM or any other selection protocol.

## Required reference

In addition to the v0.1 evidence fields, a v0.2 document requires:

```json
{
  "schemaVersion": "0.2",
  "runnerBindingRef": {
    "schemaUri": "https://raw.githubusercontent.com/Jstn-1g/dsh-guarded-hcl/main/schemas/runner-binding-v0.1.schema.json",
    "digestProfile": "urn:dsh-guarded-hcl:digest-profile:jcs-sha256:v0.1",
    "digest": "sha256:..."
  }
}
```

All three reference fields are closed and exact. `schemaUri` identifies the
only RunnerBinding schema supported by this evidence version. `digestProfile`
names the RunnerBinding JCS + SHA-256 profile. `digest` is recomputed over the
validated binding and compared byte-for-byte.

## Caller-supplied resolution

The Node API accepts one additional argument for v0.2:

```js
const decision = evaluateCandidate(policy, evidence, {
  runnerBinding,
})
```

The input is already-resolved data. The library never uses
`runnerBindingRef.schemaUri` as a network location. A host may read a pinned
local file, immutable object, content-addressed store, or another trusted
source, but it owns that acquisition and must pass exactly one binding.

Validation fails before CommitDecision when:

- `runnerBindingRef` is missing, malformed, or contains an unsupported schema
  URI or digest profile;
- the caller omits `resolutionInput.runnerBinding`;
- the supplied RunnerBinding is invalid;
- the recomputed binding digest differs from the reference;
- `binding.candidateId` differs from `evidence.candidateId`; or
- `binding.artifact.digest` differs from `evidence.candidateDigest`.

The optional third CLI path supplies the same deterministic input:

```bash
hcl-gate policy.json evaluation-v0.2.json runner-binding-v0.1.json
```

The CLI parses evidence as duplicate-safe I-JSON. Literal and
escaped-equivalent duplicate property names are rejected before normalization.

## v0.1 compatibility boundary

Evidence without `schemaVersion`, or with `schemaVersion: "0.1"`, still uses
the original closed field set and does not accept `runnerBindingRef`. Its
normalized evidence, evidence digest, decision body, decision digest, and
two-argument API/CLI behavior are byte-for-byte unchanged. The v0.2 binding
check is entered only for an explicit `schemaVersion: "0.2"` document. If a
caller supplies resolution input with explicit or implicit v0.1 evidence, the
gate rejects the call before CommitDecision so an ignored binding cannot be
mistaken for a verified binding.

The resulting CommitDecision remains the existing v0.1 decision shape. This
slice changes the precondition for producing that decision; it does not define
activation, a Decision v0.2 contract, or a live resolver.
