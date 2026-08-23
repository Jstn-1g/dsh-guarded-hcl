# Draft JCS + SHA-256 digest profile

## Status and scope

This profile is selected by the versioned
[RunnerBinding v0.1 contract](runner-binding-v0.1.md) from issue #5. It remains
independently usable and does not define EvaluationEvidence v0.2 or change the
v0.1 gate digests.

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

The Node implementation and an independent Python oracle consume that same
file. The Python consumer parses every JSON number as an IEEE-754 binary64
value, rejects duplicate property names before `json.loads()` can overwrite
them, and uses the test-only `rfc8785==0.1.4` package for canonicalization.

Reproduce the Python check in an isolated environment:

```bash
python -m pip install --require-hashes -r conformance/python/requirements.lock
python -m unittest discover -s conformance/python -p "test_*.py" -v
```

The npm package includes this profile's shared vector and Python conformance
test alongside the pinned Python lock file, so external consumers can
reproduce the cross-runtime check. Virtual environments, test caches,
bytecode, and other generated Python files are excluded from the package.

## Important boundary

This profile canonicalizes JSON documents only. It does not by itself define
the digest of a source checkout, Git tree, symlink, executable mode, npm
tarball, or other artifact. The separate
[artifact digest profile](artifact-sha256-profile.md) layers an exact byte and
metadata manifest over JCS. RunnerBinding must explicitly name that artifact
profile—or another reviewable profile—and its byte-source representation.

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
