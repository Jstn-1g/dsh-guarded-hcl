# RunnerBinding v0.1

## Status and scope

RunnerBinding v0.1 is a small, implementation-neutral audit document. It binds
one candidate or service identifier to one exact artifact identity and one
exact Selection Receipt identity. The versioned JSON Schema is
[`runner-binding-v0.1.schema.json`](../schemas/runner-binding-v0.1.schema.json).

This slice deliberately does not add EvaluationEvidence v0.2 or change the
v0.1 policy, evidence, decision, CLI, or gate digest behavior. It also does not
resolve external documents, activate a candidate, authorize execution, verify
a signature, or add fields from any particular selection protocol.

## Document shape

```json
{
  "schemaVersion": "0.1",
  "candidateId": "runner/search-safe@1.0.0",
  "artifact": {
    "profile": "urn:dsh-guarded-hcl:digest-profile:artifact-jcs-sha256:v0.1",
    "kind": "tree",
    "digest": "sha256:c7302569210063ca77508b25c39f7914ef34283b0750e709eceec7e1d5cbbd66"
  },
  "selectionReceipt": {
    "schemaUri": "https://example.org/schemas/selection-receipt-v0.1.schema.json",
    "digestProfile": "urn:dsh-guarded-hcl:digest-profile:jcs-sha256:v0.1",
    "digest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

The `example.org` schema URI and receipt digest are illustrative placeholders,
not a resolvable ASM binding or a claim that a receipt with those bytes exists.
The artifact digest is the published empty-tree artifact-profile vector.

All four top-level fields and every nested field are required. All objects are
closed: unknown fields fail validation rather than being ignored or copied
into the canonical document.

### Candidate identifier

`candidateId` follows the existing Candidate, EvaluationEvidence v0.1, and
CommitDecision convention: it is one non-empty opaque string. An integration
may place its service identifier in this field, but RunnerBinding does not add
a second `serviceId` with ambiguous precedence.

The identifier is case-sensitive and is bound by its exact Unicode code point
sequence. The implementation does not trim, case-fold, parse, or normalize it.
Valid astral Unicode characters are preserved and accepted. Lone Unicode
surrogates are rejected because they are not Unicode scalar values and cannot
enter the repository's I-JSON/JCS profile. The schema expresses the same rule
with a Unicode-aware pattern; the test suite compiles it with Ajv's draft
2020-12 validator and checks its acceptance against the runtime validator. The
host remains responsible for checking that this value exactly matches the
candidate, receipt selection, and later evidence values it intends to join.

### Artifact identity

`artifact.profile` is fixed to the repository's
[`artifact-jcs-sha256:v0.1`](artifact-sha256-profile.md) identifier. `kind` is
required because `tree` and `blob` are deliberately domain-separated
representations and the artifact profile requires consumers to compare kind,
profile, and digest together. `digest` is exactly `sha256:` followed by 64
lowercase hexadecimal digits.

Validation confirms the declaration, not its truth. A producer must acquire
one immutable byte snapshot and compute the digest with `digestArtifact()`.
RunnerBinding does not walk a checkout, infer modes, verify snapshot
completeness, or recompute the artifact digest from bytes.

### Selection Receipt identity

`selectionReceipt.schemaUri` uses one deliberately narrow lexical profile that
is identical in the JSON Schema and Node runtime. It is not delegated to the
optional JSON Schema `format` vocabulary or the WHATWG URL parser.

An HTTPS identifier must use literal lowercase `https://`, followed by one or
more dot-separated lowercase ASCII host labels. A label is 1–63 characters,
uses lowercase letters, digits, and interior hyphens, and starts and ends with
a letter or digit. User information, bracketed IP literals, uppercase or
Unicode hosts, and trailing dots are outside v0.1. An optional port is decimal
1–65535 with no leading zero.

A URN identifier must use literal lowercase `urn:`, a 2–32 character lowercase
ASCII namespace identifier, a colon, and a non-empty namespace-specific name.
The namespace starts and ends with a lowercase letter or digit and may contain
interior hyphens. The namespace-specific name may additionally preserve ASCII
uppercase letters because it is opaque and case-sensitive.

Both alternatives allow RFC 3986 unreserved characters, sub-delimiters,
appropriate path/query delimiters, and valid `%` followed by two hexadecimal
digits. They may include a query and one fragment. Raw non-ASCII characters,
malformed percent escapes, other schemes, and otherwise valid URI forms outside
this subset fail closed in v0.1; producers may percent-encode supported UTF-8
bytes where appropriate.

The exact accepted string is bound. No percent-decoding, case conversion,
host normalization, redirect following, or schema retrieval occurs. Resolution
and allowlist policy belong to a future deterministic resolver, not this data
contract.

`digestProfile` is fixed to
`urn:dsh-guarded-hcl:digest-profile:jcs-sha256:v0.1`. The receipt producer must
parse the receipt as duplicate-safe I-JSON, canonicalize it with RFC 8785 JCS,
and compute SHA-256 over the canonical UTF-8 bytes. The digest uses the same
strict lowercase representation as the artifact digest.

The binding validator does not fetch the schema, validate receipt contents
against it, retrieve receipt bytes, or prove that the supplied digest matches
those bytes. Those checks require explicit caller-supplied resolution input
and belong with the future EvaluationEvidence seam.

## Binding canonicalization and digest

The RunnerBinding digest profile is the same
[`jcs-sha256:v0.1`](jcs-sha256-profile.md) profile. A consumer validates the
closed v0.1 shape first, serializes the returned data model with RFC 8785 JCS,
encodes it as UTF-8, and computes SHA-256. The result is lowercase hexadecimal
prefixed with `sha256:`.

The example above has this canonical digest:

```text
sha256:7cd3ed8833e736b5a5aa88cf67e2cc8948015762e9caf5b843b825312b8b3c4a
```

Every exact identifier, kind, profile, schema URI, and referenced digest is
inside the hashed document. Changing a valid value therefore changes the
binding digest; changing a fixed profile to an unsupported value fails
validation.

## Dependency-free Node API

```js
import {
  canonicalizeRunnerBinding,
  digestRunnerBinding,
  parseRunnerBinding,
  validateRunnerBinding,
} from 'dsh-guarded-hcl/runner-binding'

const binding = parseRunnerBinding(sourceText)
const canonical = canonicalizeRunnerBinding(binding)
const digest = digestRunnerBinding(binding)
```

`parseRunnerBinding()` checks duplicate property names before the platform JSON
parser can overwrite them. `validateRunnerBinding()` is for an in-memory value
and returns a new plain data object after rejecting missing, unknown, hidden,
symbol, accessor, custom-prototype, malformed schema identifier, malformed
digest, and unsupported-version inputs. Ajv is a development-only dependency
used to exercise the published draft 2020-12 schema against the same parity
corpus; the runtime API imports no third-party package. As with the underlying
JCS API, a hostile JavaScript `Proxy` is outside the trusted in-memory data
boundary.

The schema `$id` uses the canonical repository's versioned `main` filename
instead of pretending this post-v0.1.0 file exists at the old release tag or
guessing a future tag. The v0.1 filename and `schemaVersion` are immutable
contract names: incompatible changes require a new v0.2 schema. Before a
release tag exists, consumers that require a repository-immutable locator
should pin an exact commit and verify the schema bytes separately.

## Security boundary

RunnerBinding supplies deterministic identity under SHA-256 assumptions. It
does not supply authenticity, authorization, provenance attestation, safe
execution, or a signature. Acceptance by this validator means only that the
binding is unambiguous and uses the frozen v0.1 profiles and syntax. A later
resolver must fail closed if the actual artifact, receipt, schema, candidate
identifier, or expected binding digest does not match these declarations.
