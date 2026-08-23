import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  ARTIFACT_SHA256_PROFILE,
  ArtifactProfileError,
  createArtifactManifest,
  digestArtifact,
  validateArtifactPath,
} from '../src/artifact.js'

const vectors = JSON.parse(
  await readFile(
    new URL('../conformance/artifact-sha256-v0.1.json', import.meta.url),
    'utf8',
  ),
)

assert.equal(vectors.profile, ARTIFACT_SHA256_PROFILE)

const acceptedDigests = new Map(
  vectors.accepted.map((vector) => [vector.id, vector.sha256]),
)
for (const vector of vectors.accepted) {
  test(`accepts artifact vector: ${vector.id}`, () => {
    const artifact = materializeVectorInput(vector.input)
    assert.deepEqual(createArtifactManifest(artifact), vector.manifest)
    assert.equal(digestArtifact(artifact), vector.sha256)
  })
}

for (const vector of vectors.rejected) {
  test(`rejects artifact vector: ${vector.id}`, () => {
    assert.throws(
      () => digestArtifact(materializeVectorInput(vector.input)),
      (error) =>
        error instanceof ArtifactProfileError &&
        error.code === vector.errorCode,
    )
  })
}

test('domain-separates line endings, modes, and artifact representations', () => {
  for (const vector of vectors.accepted) {
    for (const otherId of vector.distinctFrom ?? []) {
      assert.ok(acceptedDigests.has(otherId), `unknown vector ${otherId}`)
      assert.notEqual(vector.sha256, acceptedDigests.get(otherId))
    }
  }
})

test('preserves exact scalar paths and requires canonical POSIX syntax', () => {
  assert.equal(validateArtifactPath('cafe\u0301.txt'), 'cafe\u0301.txt')
  assert.equal(validateArtifactPath('\u0897\u0334.txt'), '\u0897\u0334.txt')
  for (const path of [
    '',
    '/a',
    'a/',
    './a',
    'a//b',
    'a\\b',
    'a/../b',
    'a/./b',
  ]) {
    assert.throws(() => validateArtifactPath(path), /path/i)
  }
  for (let codePoint = 0; codePoint <= 0x9f; codePoint += 1) {
    if (codePoint > 0x1f && codePoint < 0x7f) continue
    assert.throws(
      () => validateArtifactPath(`bad${String.fromCodePoint(codePoint)}name`),
      /control characters/i,
    )
  }
})

test('refuses accessor, hidden, sparse, and non-byte inputs', () => {
  const accessor = { kind: 'blob' }
  Object.defineProperty(accessor, 'bytes', {
    enumerable: true,
    get() {
      throw new Error('getter must not run')
    },
  })
  assert.throws(() => digestArtifact(accessor), /data properties/i)

  const hidden = { kind: 'blob', bytes: new Uint8Array() }
  Object.defineProperty(hidden, 'note', { value: 'hidden' })
  assert.throws(() => digestArtifact(hidden), /unknown field/i)

  const entries = []
  entries.length = 1
  assert.throws(() => digestArtifact({ kind: 'tree', entries }), /dense array/i)
  assert.throws(
    () => digestArtifact({ kind: 'blob', bytes: 'not raw bytes' }),
    (error) =>
      error instanceof ArtifactProfileError && error.code === 'INVALID_BYTES',
  )
})

function materializeVectorInput(input) {
  const artifact = { kind: input.kind }
  if (Object.hasOwn(input, 'bytesHex')) {
    artifact.bytes = decodeVectorHex(input.bytesHex)
  }
  if (Object.hasOwn(input, 'entries')) {
    artifact.entries = input.entries.map((entry) => ({
      path: entry.path,
      mode: entry.mode,
      bytes: decodeVectorHex(entry.bytesHex),
    }))
  }
  return artifact
}

function decodeVectorHex(source) {
  if (typeof source !== 'string' || !/^(?:[0-9a-f]{2})*$/u.test(source)) {
    throw new TypeError('Vector bytesHex must be lowercase, even-length hex.')
  }
  return Buffer.from(source, 'hex')
}
