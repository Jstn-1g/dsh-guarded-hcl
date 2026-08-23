import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  JCS_SHA256_PROFILE,
  JcsError,
  canonicalizeJcs,
  canonicalizeJsonText,
  digestJcs,
  digestJsonText,
  parseIJson,
} from '../src/jcs.js'

const vectors = JSON.parse(
  await readFile(
    new URL('../conformance/jcs-sha256-v0.1.json', import.meta.url),
    'utf8',
  ),
)

assert.equal(vectors.profile, JCS_SHA256_PROFILE)

for (const vector of vectors.accepted) {
  test(`accepts JCS vector: ${vector.id}`, () => {
    const parsed = parseIJson(vector.input)
    const canonical = canonicalizeJsonText(vector.input)
    assert.equal(canonical, vector.canonical)
    assert.equal(Buffer.from(canonical, 'utf8').toString('hex'), vector.canonicalUtf8Hex)
    assert.equal(digestJsonText(vector.input), vector.sha256)
    assert.equal(canonicalizeJcs(parsed), vector.canonical)
    assert.equal(digestJcs(parsed), vector.sha256)
  })
}

for (const vector of vectors.rejected) {
  test(`rejects JCS vector: ${vector.id}`, () => {
    assert.throws(
      () => parseIJson(vector.input),
      (error) => error instanceof JcsError && error.code === vector.errorCode,
    )
  })
}

test('rejects programmatic non-JSON values before hashing', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(
      () => canonicalizeJcs({ value }),
      (error) => error instanceof JcsError && error.code === 'NON_FINITE_NUMBER',
    )
  }
  assert.throws(() => canonicalizeJcs({ value: undefined }), /UNSUPPORTED_VALUE|undefined/)
  assert.throws(() => canonicalizeJcs({ value: '\ud800' }), /lone Unicode surrogate/i)
})

test('rejects cyclic, sparse, and non-plain programmatic values', () => {
  const cyclic = {}
  cyclic.self = cyclic
  assert.throws(() => canonicalizeJcs(cyclic), /cyclic/i)

  const sparse = []
  sparse.length = 1
  assert.throws(() => canonicalizeJcs(sparse), /sparse arrays/i)

  const arrayWithProperty = [1]
  arrayWithProperty.note = 'not JSON array data'
  assert.throws(() => canonicalizeJcs(arrayWithProperty), /indexed JSON values/i)

  const accessor = {}
  Object.defineProperty(accessor, 'value', {
    enumerable: true,
    get() {
      throw new Error('getter must not run')
    },
  })
  assert.throws(() => canonicalizeJcs(accessor), /accessor properties/i)
  assert.throws(() => canonicalizeJcs(new Date()), /plain JSON objects/i)
})
