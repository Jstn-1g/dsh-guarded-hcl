# Draft portable artifact digest profile

## Status and scope

This is the second independently reviewable digest prerequisite for the
proposed RunnerBinding contract in issue #5. It defines portable identity for
an exact artifact byte snapshot. It does not define RunnerBinding,
EvaluationEvidence v0.2, artifact resolution, or activation, and it does not
change any v0.1 gate digest.

The profile identifier is:

```text
urn:dsh-guarded-hcl:digest-profile:artifact-jcs-sha256:v0.1
```

The profile accepts either a source-tree snapshot or one opaque blob. The two
representations are domain-separated, so an archive's bytes do not have the
same artifact identity as a tree containing those bytes in one file.

## Exact byte source

The byte source is the caller-supplied immutable snapshot, not a filesystem
path:

- a `tree` is a complete set of `(path, mode, raw bytes)` regular-file entries
  from one snapshot;
- a `blob` is the exact raw byte sequence of one already-built artifact, such
  as a package archive.

Producers must freeze or read that source before applying this profile. For a
Git-backed source revision, read the blobs and modes from the referenced Git
tree rather than from a checkout that may apply `autocrlf`, clean/smudge
filters, or platform-specific permission inference. For a packaged artifact,
hash the final immutable archive bytes; this profile does not unpack or
normalize archive metadata.

The Node reference deliberately accepts bytes and metadata in memory. It does
not walk a directory, follow a link, invoke Git, or infer a mode. This keeps
snapshot acquisition outside the digest algorithm and avoids a hidden
time-of-check/time-of-use boundary.

## Tree path and mode rules

Each tree path must already be a canonical relative POSIX path. The profile
validates rather than rewrites it before sorting or hashing:

1. require a non-empty Unicode scalar string;
2. reject absolute and drive-qualified paths and every backslash;
3. split only on `/` and reject empty, `.`, or `..` segments;
4. reject C0 (`U+0000`–`U+001F`), DEL (`U+007F`), and C1
   (`U+0080`–`U+009F`) control characters;
5. preserve every remaining Unicode code point exactly;
6. reject duplicate paths and file/directory prefix collisions such as a file
   `a` alongside a file `a/b`; and
7. sort entries by the unsigned lexicographic order of each exact path's UTF-8
   bytes.

The implementation performs no separator, dot-segment, case, or Unicode
normalization. In particular, NFC `café.txt` and NFD `café.txt` are distinct
paths and produce distinct artifact identities. The shared portability vector
containing `U+0897` followed by `U+0334` is also preserved code point for code
point; neither runtime's Unicode normalization tables participate in the
result. Percent escapes are not decoded. A literal backslash filename, invalid
UTF-8, or non-scalar Unicode is outside this portable profile and must be
rejected by a producer rather than replaced.

Only the Git-compatible regular-file modes `100644` and `100755` are accepted.
The mode is supplied by the immutable source metadata and participates in the
digest; it must not be guessed from a Windows checkout. Directories are
implicit, empty directories have no identity, and special files are outside
scope. Directory mode `040000`, symlink mode `120000`, and submodule/gitlink
mode `160000` are rejected. A producer must not follow a rejected entry and
substitute its target bytes.

## Raw bytes and manifest construction

For every byte sequence, compute:

```text
contentDigest = "sha256:" + lowercase_hex(SHA-256(raw_bytes))
byteLength    = number of raw bytes
```

`byteLength` is a non-negative I-JSON integer no greater than
`9007199254740991` (`2^53 - 1`). A byte sequence larger than that is outside
v0.1 rather than being represented by an imprecise JSON number.

No text decoding, Unicode conversion, newline conversion, decompression, or
other content transformation occurs. LF and CRLF content therefore have
different identities by design. Cross-platform identity comes from supplying
the same immutable bytes, not from normalizing different checkouts after the
fact.

The validated tree manifest is the following JSON data model, with `entries`
already sorted by the rule above:

```json
{
  "profile": "urn:dsh-guarded-hcl:digest-profile:artifact-jcs-sha256:v0.1",
  "kind": "tree",
  "entries": [
    {
      "path": "bin/run.sh",
      "mode": "100755",
      "byteLength": 10,
      "contentDigest": "sha256:..."
    }
  ]
}
```

The blob manifest is:

```json
{
  "profile": "urn:dsh-guarded-hcl:digest-profile:artifact-jcs-sha256:v0.1",
  "kind": "blob",
  "byteLength": 123,
  "contentDigest": "sha256:..."
}
```

Finally, serialize the manifest with the repository's
[`jcs-sha256:v0.1`](jcs-sha256-profile.md) rules and compute SHA-256 over its
canonical UTF-8 bytes. The artifact digest is lowercase hexadecimal prefixed
with `sha256:`. Including the profile and kind in the hashed manifest provides
version and representation domain separation.

## Reference API and conformance

The dependency-free Node API accepts `Uint8Array` content:

```js
import { digestArtifact } from 'dsh-guarded-hcl/artifact'

const digest = digestArtifact({
  kind: 'tree',
  entries: [
    {
      path: 'bin/run.sh',
      mode: '100755',
      bytes: new TextEncoder().encode('#!/bin/sh\n'),
    },
  ],
})
```

The exported `validateArtifactPath` helper applies the same path checks and
returns an accepted string unchanged. The profile intentionally has no
path-canonicalization API.

The implementation-neutral vectors in
`conformance/artifact-sha256-v0.1.json` encode source bytes as hexadecimal and
publish the expected validated manifest and final digest. They cover strict
canonical POSIX syntax, exact NFC/NFD and `U+0897 U+0334` preservation, UTF-8
byte path ordering where JavaScript's default UTF-16 order differs,
file/directory prefix collisions, C0/DEL/C1 controls, LF versus CRLF bytes,
regular versus executable mode, tree versus packaged-blob representation, and
fail-closed symlink, submodule, directory, and mode cases.

The Node tests and an independent Python implementation consume the same
vectors. The Python oracle reimplements the artifact rules with the standard
library and uses the already pinned test-only `rfc8785==0.1.4` package only for
the final manifest canonicalization.

```bash
python -m pip install --require-hashes -r conformance/python/requirements.lock
python -m unittest discover -s conformance/python -p "test_*.py" -v
```

## Security boundary

The digest proves deterministic identity under SHA-256 assumptions. It does
not prove authenticity, authorization, provenance, safe extraction, or that a
caller supplied every intended file. Snapshot acquisition and completeness
remain integration responsibilities. Callers should compare the artifact kind,
profile identifier, and digest, not a digest string alone.
