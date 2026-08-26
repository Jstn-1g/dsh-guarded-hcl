# TrialManifest v0.1

## Status and scope

TrialManifest v0.1 is the first contract in the proposed reproducible scorecard
layer. It freezes the exact identities, content-addressed references, metric
definitions, and ordered paired-trial set that a later scorecard builder may
consume. The versioned schema is
[`trial-manifest-v0.1.schema.json`](../schemas/trial-manifest-v0.1.schema.json).

This slice does not define TrialResults, aggregate scores, confidence
intervals, scorecard rendering, a CLI, or a GitHub Action. It does not execute
an evaluator or change EvaluationEvidence v0.2, RunnerBinding v0.1,
CommitDecision v0.1, or any existing digest bytes.

The manifest is a declaration, not an attestation. Its digest proves which
declarations were supplied under the JCS + SHA-256 profile; it does not prove
that a model, environment, dataset, grader, Recipe, artifact, or trial run is
authentic or independent.

A correct integration treats the manifest as an independently controlled
evaluation plan. The integrating operator or independent evaluator owns and
pins its bytes or expected digest before evaluating a candidate. An untrusted
optimizer must not choose or relax the metric, retention, validity, cost, or
trial-set declarations used to judge its own candidate.

## Closed shape

Every object is closed. Every field is required, including `cost`, which must
be either an explicit metric definition or `null`. Unknown, missing, hidden,
symbol, accessor, custom-prototype, sparse-array, malformed, and unsupported
inputs fail before a manifest digest is computed.

The top-level fields are:

- `schemaVersion`: exactly `"0.1"`;
- `identities`: exact task, model, environment, dataset, and grader identities;
- `baseline` and `candidate`: one Recipe reference and one artifact identity
  each;
- `runnerBindingRef`: the exact existing RunnerBinding v0.1 reference;
- `currentTask`: the score metric and its direction;
- `retentionAnchors`: the frozen anchor definitions used to produce evidence;
- `validityChecks`: the frozen check definitions used to produce evidence;
- `cost`: an explicit cost metric or `null` when cost is not observed; and
- `trialIds`: the unique ordered identifiers for 2–30 paired trials.

The [example manifest](../examples/trial-manifest-v0.1.json) is a complete
document. It intentionally uses illustrative identities and digests rather
than claiming that those trial inputs have been executed.

## Exact evaluator identities

`identities.task`, `model`, `environment`, `dataset`, and `grader` are
non-empty opaque strings. They are case-sensitive and bound by their exact
Unicode code point sequences. The validator does not trim, case-fold, parse,
or normalize them. Valid astral Unicode characters are accepted; lone
surrogates fail because they are not Unicode scalar values and cannot enter
the repository's I-JSON/JCS profile.

The producer is responsible for choosing identities precise enough to locate
one frozen condition set. A friendly name with no version or immutable digest
can be syntactically valid but is not strong provenance. TrialManifest does not
resolve these values or judge their quality.

## Baseline and candidate references

Both subjects contain:

```json
{
  "recipe": {
    "recipeId": "runner/search-safe@1.0.0",
    "schemaUri": "urn:dsh-wm:recipe:v0.1",
    "digestProfile": "urn:dsh-guarded-hcl:digest-profile:jcs-sha256:v0.1",
    "digest": "sha256:..."
  },
  "artifact": {
    "profile": "urn:dsh-guarded-hcl:digest-profile:artifact-jcs-sha256:v0.1",
    "kind": "tree",
    "digest": "sha256:..."
  }
}
```

`recipeId` is the exact logical identity. The candidate Recipe identity is the
candidate identifier that a later builder must compare to the resolved
RunnerBinding before it can generate evidence. `schemaUri` uses the same
deliberately narrow lowercase HTTPS-or-URN lexical profile as RunnerBinding
v0.1. Recipe JSON is declared under the existing JCS + SHA-256 profile.

Artifact `profile`, `kind`, and `digest` use the existing
[`artifact-jcs-sha256:v0.1`](artifact-sha256-profile.md) contract. Tree and
blob identities remain domain-separated. The candidate artifact declaration
is the digest a later builder must compare to the resolved RunnerBinding and
place in EvaluationEvidence; the baseline artifact digest becomes the
evidence baseline digest.

Validation checks these declarations but does not retrieve Recipe bytes,
resolve a schema URI, walk an artifact, recompute either digest, or compare the
candidate to a RunnerBinding. Those require explicit caller-supplied inputs in
the later builder.

## RunnerBinding reference

`runnerBindingRef` has the same closed reference shape used by
EvaluationEvidence v0.2:

```json
{
  "schemaUri": "https://raw.githubusercontent.com/Jstn-1g/dsh-guarded-hcl/main/schemas/runner-binding-v0.1.schema.json",
  "digestProfile": "urn:dsh-guarded-hcl:digest-profile:jcs-sha256:v0.1",
  "digest": "sha256:..."
}
```

The schema URI and digest profile are exact constants. The library never uses
the URI as a network location. This slice does not accept resolved binding
data, so it cannot verify the digest or the candidate and artifact joins.

## Measurement plan and policy boundary

The current-task and retention score directions are explicitly fixed to
`"maximize"` because the current gate interprets improvement as candidate
score minus baseline score and retention loss as baseline score minus
candidate score. A lower-is-better metric must be transformed by the grader
into a declared higher-is-better score before it enters this contract. The
manifest does not silently invert values.

At least one retention anchor and one validity check are required. Empty maps
would produce a reproducible-looking run with no retention or validity guard,
which is not an honest HCL scorecard. Map property names are the exact
`anchorId` and `checkId` values that a later builder must carry into evidence.

Each retention definition binds its metric, required status, positive weight,
and non-negative maximum loss. Each validity definition binds its severity.
These are evaluator-plan inputs: they tell a later builder how to generate the
per-anchor and per-check entries already present in EvaluationEvidence. They
are distinct from the separately supplied, code-owned Policy, which remains
the independent acceptance authority for minimum current improvement,
aggregate weighted retention loss, required-anchor enforcement, blocked
validity severities, and maximum cost increase. A manifest digest cannot
replace, relax, or authenticate that Policy.

Because these fields influence the evidence presented to the gate, a later
builder must receive the manifest from the independently controlled operator
or evaluator boundary and verify it against the expected pinned bytes or
digest. Accepting a candidate-supplied manifest would let the candidate choose
the plan used to judge itself, even though every resulting digest remained
deterministic.

`cost` is required so TrialResults cannot choose after observation whether a
cost comparison exists. A non-null value binds the exact metric name; `null`
declares in advance that cost is absent. Currency, units, and collection
method are part of the opaque metric identity and external evaluator
documentation in v0.1.

## Paired trial set

`trialIds` contains 2–30 unique opaque identifiers. Array order is
identity-bearing and will be the only permitted aggregation order in the
future scorecard builder. Object-key ordering is not identity-bearing because
JCS sorts object properties, but changing trial order changes the manifest
digest.

Pairing means a future TrialResults record must provide both baseline and
candidate observations for every declared trial identifier under the same
frozen task, model, environment, dataset, and grader condition set. This
contract declares the pairing; it does not yet validate observations.

## Canonicalization and Node API

After closed-shape validation, the normalized data model is serialized with
RFC 8785 JCS, encoded as UTF-8, and hashed with SHA-256. The digest is lowercase
hexadecimal prefixed with `sha256:`. Object-key permutations therefore produce
identical bytes, while array order and every exact identity or reference remain
bound.

```js
import {
  canonicalizeTrialManifest,
  digestTrialManifest,
  parseTrialManifest,
  validateTrialManifest,
} from 'dsh-guarded-hcl/trial-manifest'

const manifest = parseTrialManifest(sourceText)
const canonical = canonicalizeTrialManifest(manifest)
const digest = digestTrialManifest(manifest)
```

`parseTrialManifest()` rejects escaped-equivalent duplicate properties before
the platform JSON parser can overwrite them. `validateTrialManifest()` accepts
an in-memory value and returns a detached plain-data copy. The runtime has no
third-party dependencies. Ajv remains a development-only oracle that checks
the published draft 2020-12 schema against the same JSON-shaped acceptance
corpus.

The example manifest has this canonical digest:

```text
sha256:c34d6f6739564008a9c0e7fbc85b75faf2d102e180bcae0ec57169fa5c52f7c7
```

## Security boundary and non-goals

TrialManifest is content-addressed identity, not authenticity, authorization,
safe execution, or a signature. It does not acquire immutable snapshots,
authenticate an evaluator, prevent a producer from lying, hide retention
anchors, impose resource limits, run a model, write a result, call the gate,
or activate a candidate. A host must independently own and pin the manifest,
pin and verify every referenced input, keep the Policy under independent
control, and reject any later results whose identities or trial set do not
exactly match this manifest.

A hostile JavaScript `Proxy` remains outside the trusted in-memory data
boundary, consistent with the repository's existing JCS and RunnerBinding
APIs. Untrusted serialized input should enter through `parseTrialManifest()`.
