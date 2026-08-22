# Draft JCS + SHA-256 digest profile

## Status and scope

This is a reviewable prerequisite for the proposed RunnerBinding contract in
issue #5. It does not yet define RunnerBinding or EvaluationEvidence v0.2 and
does not change the v0.1 gate digests.

The profile identifier is:

```text
urn:dsh-guarded-hcl:digest-profile:jcs-sha256:v0.1
```

For a JSON document, a producer:

1. parses the input as I-JSON, rejecting duplicate property names, invalid
   Unicode scalar sequences, and numbers that cannot be represented as finite
   IEEE 754 doubles;
2. serializes the value with RFC 8785 JSON Canonicalization Scheme (JCS);
3. encodes the canonical text as UTF-8;
4. computes SHA-256 over those exact bytes; and
5. represents the result as lowercase hexadecimal prefixed with `sha256:`.

The implementation-neutral vectors in
`conformance/jcs-sha256-v0.1.json` contain raw input, canonical text, canonical
UTF-8 bytes in hexadecimal, and the expected digest. Rejection vectors include
escaped-equivalent duplicate keys, non-JSON numeric tokens, and lone
surrogates.

## Important boundary

This profile canonicalizes JSON documents only. It does not define the digest
of a source checkout, Git tree, symlink, executable mode, npm tarball, or other
artifact. RunnerBinding must name a separate artifact digest profile and byte
source for those objects.

The in-memory JavaScript API accepts only the JSON data model: primitives,
dense arrays with indexed data properties, and plain objects with enumerable
data properties. It rejects accessors, hidden or symbol properties, and custom
object prototypes rather than silently invoking `toJSON` or getters. As with
other JavaScript libraries, a hostile `Proxy` is outside this data-validation
boundary and must not be treated as trusted input.

The existing `canonicalStringify()` and `digestJson()` functions remain the
v0.1 gate behavior. They are not silently reinterpreted as JCS; changing them
would invalidate existing policy, evidence, and decision digests.

This digest provides deterministic identity, not authenticity, authorization,
or a signature.
