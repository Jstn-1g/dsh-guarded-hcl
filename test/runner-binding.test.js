import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { ARTIFACT_SHA256_PROFILE } from '../src/artifact.js'
import { JCS_SHA256_PROFILE, JcsError } from '../src/jcs.js'
import {
  RUNNER_BINDING_CANDIDATE_ID_PATTERN,
  RUNNER_BINDING_DIGEST_PROFILE,
  RUNNER_BINDING_SCHEMA_URI,
  RUNNER_BINDING_SCHEMA_URI_PATTERN,
  RUNNER_BINDING_SCHEMA_VERSION,
  RunnerBindingError,
  canonicalizeRunnerBinding,
  digestRunnerBinding,
  parseRunnerBinding,
  validateRunnerBinding,
} from '../src/runner-binding.js'

const example = JSON.parse(
  await readFile(
    new URL('../examples/runner-binding-v0.1.json', import.meta.url),
    'utf8',
  ),
)
const schema = JSON.parse(
  await readFile(
    new URL('../schemas/runner-binding-v0.1.schema.json', import.meta.url),
    'utf8',
  ),
)
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  unicodeRegExp: true,
})
const schemaMetaValid = ajv.validateSchema(schema)
const schemaMetaErrors = ajv.errors
const validateSchema = ajv.compile(schema)

const expectedCanonical =
  '{"artifact":{"digest":"sha256:c7302569210063ca77508b25c39f7914ef34283b0750e709eceec7e1d5cbbd66","kind":"tree","profile":"urn:dsh-guarded-hcl:digest-profile:artifact-jcs-sha256:v0.1"},"candidateId":"runner/search-safe@1.0.0","schemaVersion":"0.1","selectionReceipt":{"digest":"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","digestProfile":"urn:dsh-guarded-hcl:digest-profile:jcs-sha256:v0.1","schemaUri":"https://example.org/schemas/selection-receipt-v0.1.schema.json"}}'
const expectedDigest =
  'sha256:7cd3ed8833e736b5a5aa88cf67e2cc8948015762e9caf5b843b825312b8b3c4a'

test('schema freezes the closed RunnerBinding v0.1 shape', () => {
  assert.equal(schemaMetaValid, true, ajv.errorsText(schemaMetaErrors))
  assert.equal(schema.$id, RUNNER_BINDING_SCHEMA_URI)
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, [
    'schemaVersion',
    'candidateId',
    'artifact',
    'selectionReceipt',
  ])
  assert.equal(
    schema.properties.schemaVersion.const,
    RUNNER_BINDING_SCHEMA_VERSION,
  )
  assert.equal(
    schema.properties.candidateId.pattern,
    RUNNER_BINDING_CANDIDATE_ID_PATTERN,
  )
  assert.equal(schema.properties.artifact.additionalProperties, false)
  assert.deepEqual(schema.properties.artifact.required, [
    'profile',
    'kind',
    'digest',
  ])
  assert.equal(
    schema.properties.artifact.properties.profile.const,
    ARTIFACT_SHA256_PROFILE,
  )
  assert.deepEqual(schema.properties.artifact.properties.kind.enum, [
    'tree',
    'blob',
  ])
  assert.equal(schema.properties.selectionReceipt.additionalProperties, false)
  assert.deepEqual(schema.properties.selectionReceipt.required, [
    'schemaUri',
    'digestProfile',
    'digest',
  ])
  assert.equal(
    schema.properties.selectionReceipt.properties.digestProfile.const,
    JCS_SHA256_PROFILE,
  )
  assert.equal(
    schema.properties.selectionReceipt.properties.schemaUri.pattern,
    RUNNER_BINDING_SCHEMA_URI_PATTERN,
  )
  assert.equal(
    Object.hasOwn(
      schema.properties.selectionReceipt.properties.schemaUri,
      'format',
    ),
    false,
  )
  assert.equal(schema.$defs.sha256Digest.pattern, '^sha256:[0-9a-f]{64}$')
})

test('Ajv independently rejects malformed JSON-shaped bindings', () => {
  assert.equal(
    validateSchema(example),
    true,
    ajv.errorsText(validateSchema.errors),
  )

  for (const invalidCase of invalidCases) {
    const binding = structuredClone(example)
    invalidCase.mutate(binding)
    assert.equal(
      validateSchema(binding),
      false,
      `Ajv unexpectedly accepted ${invalidCase.name}`,
    )
  }

  const missingTopLevel = structuredClone(example)
  delete missingTopLevel.candidateId
  const malformed = [missingTopLevel, { ...example, unexpected: true }]

  const missingArtifactField = structuredClone(example)
  delete missingArtifactField.artifact.kind
  malformed.push(missingArtifactField)
  const unknownArtifactField = structuredClone(example)
  unknownArtifactField.artifact.byteSource = 'checkout'
  malformed.push(unknownArtifactField)

  const missingReceiptField = structuredClone(example)
  delete missingReceiptField.selectionReceipt.schemaUri
  malformed.push(missingReceiptField)
  const unknownReceiptField = structuredClone(example)
  unknownReceiptField.selectionReceipt.authorization = true
  malformed.push(unknownReceiptField)

  for (const binding of malformed) {
    assert.equal(validateSchema(binding), false)
  }
})

test('validates, canonicalizes, and digests the example deterministically', () => {
  assert.deepEqual(validateRunnerBinding(example), example)
  assert.deepEqual(parseRunnerBinding(JSON.stringify(example)), example)
  assert.equal(canonicalizeRunnerBinding(example), expectedCanonical)
  assert.equal(digestRunnerBinding(example), expectedDigest)
  assert.equal(RUNNER_BINDING_DIGEST_PROFILE, JCS_SHA256_PROFILE)

  const reordered = {
    selectionReceipt: {
      digest: example.selectionReceipt.digest,
      schemaUri: example.selectionReceipt.schemaUri,
      digestProfile: example.selectionReceipt.digestProfile,
    },
    artifact: {
      digest: example.artifact.digest,
      kind: example.artifact.kind,
      profile: example.artifact.profile,
    },
    candidateId: example.candidateId,
    schemaVersion: example.schemaVersion,
  }
  assert.equal(canonicalizeRunnerBinding(reordered), expectedCanonical)
  assert.equal(digestRunnerBinding(reordered), expectedDigest)
})

test('binding digest changes across every independently mutable identity field', () => {
  const mutations = [
    (binding) => {
      binding.candidateId = 'runner/search-safe@1.0.1'
    },
    (binding) => {
      binding.artifact.kind = 'blob'
    },
    (binding) => {
      binding.artifact.digest = `sha256:${'1'.repeat(64)}`
    },
    (binding) => {
      binding.selectionReceipt.schemaUri =
        'https://example.org/schemas/selection-receipt-v0.2.schema.json'
    },
    (binding) => {
      binding.selectionReceipt.digest = `sha256:${'2'.repeat(64)}`
    },
  ]

  for (const mutate of mutations) {
    const changed = structuredClone(example)
    mutate(changed)
    assert.notEqual(digestRunnerBinding(changed), expectedDigest)
  }
})

test('preserves candidate Unicode code points without normalization', () => {
  const nfc = structuredClone(example)
  nfc.candidateId = 'candidate-café'
  const nfd = structuredClone(example)
  nfd.candidateId = 'candidate-cafe\u0301'

  assert.equal(validateSchema(nfc), true, ajv.errorsText(validateSchema.errors))
  assert.equal(validateSchema(nfd), true, ajv.errorsText(validateSchema.errors))
  assert.equal(validateRunnerBinding(nfc).candidateId, nfc.candidateId)
  assert.equal(validateRunnerBinding(nfd).candidateId, nfd.candidateId)
  assert.notEqual(digestRunnerBinding(nfc), digestRunnerBinding(nfd))
})

const invalidCases = [
  {
    name: 'unsupported schema version',
    code: 'UNSUPPORTED_VERSION',
    mutate(binding) {
      binding.schemaVersion = '0.2'
    },
  },
  {
    name: 'empty candidate identifier',
    code: 'INVALID_CANDIDATE_ID',
    mutate(binding) {
      binding.candidateId = ''
    },
  },
  {
    name: 'lone surrogate candidate identifier',
    code: 'INVALID_CANDIDATE_ID',
    mutate(binding) {
      binding.candidateId = '\ud800'
    },
  },
  {
    name: 'unrecognized artifact profile',
    code: 'UNSUPPORTED_ARTIFACT_PROFILE',
    mutate(binding) {
      binding.artifact.profile = 'urn:example:artifact-profile:v9'
    },
  },
  {
    name: 'unrecognized artifact kind',
    code: 'INVALID_ARTIFACT_KIND',
    mutate(binding) {
      binding.artifact.kind = 'directory'
    },
  },
  {
    name: 'short artifact digest',
    code: 'INVALID_DIGEST',
    mutate(binding) {
      binding.artifact.digest = 'sha256:00'
    },
  },
  {
    name: 'uppercase artifact digest',
    code: 'INVALID_DIGEST',
    mutate(binding) {
      binding.artifact.digest = `sha256:${'A'.repeat(64)}`
    },
  },
  {
    name: 'relative receipt schema URI',
    code: 'INVALID_SCHEMA_URI',
    mutate(binding) {
      binding.selectionReceipt.schemaUri = './selection-receipt.schema.json'
    },
  },
  {
    name: 'receipt schema URI with whitespace',
    code: 'INVALID_SCHEMA_URI',
    mutate(binding) {
      binding.selectionReceipt.schemaUri =
        'https://example.org/selection receipt.schema.json'
    },
  },
  {
    name: 'receipt schema URI with invalid percent escape',
    code: 'INVALID_SCHEMA_URI',
    mutate(binding) {
      binding.selectionReceipt.schemaUri = 'urn:example:receipt%zz'
    },
  },
  {
    name: 'receipt schema URI with multiple fragment delimiters',
    code: 'INVALID_SCHEMA_URI',
    mutate(binding) {
      binding.selectionReceipt.schemaUri = 'urn:example:receipt#schema#other'
    },
  },
  {
    name: 'unrecognized receipt digest profile',
    code: 'UNSUPPORTED_RECEIPT_DIGEST_PROFILE',
    mutate(binding) {
      binding.selectionReceipt.digestProfile =
        'urn:example:digest-profile:v9'
    },
  },
  {
    name: 'malformed receipt digest',
    code: 'INVALID_DIGEST',
    mutate(binding) {
      binding.selectionReceipt.digest = 'sha512:00'
    },
  },
]

const parityCases = [
  {
    name: 'ordinary candidate and HTTPS schema identifier',
    expected: true,
    schemaUri: 'https://schemas.example.org/selection-receipt-v0.1.json',
  },
  {
    name: 'astral Unicode candidate identifier',
    expected: true,
    candidateId: 'candidate-😀-𐐷',
  },
  {
    name: 'lone high surrogate candidate identifier',
    expected: false,
    candidateId: '\ud800',
    errorCode: 'INVALID_CANDIDATE_ID',
  },
  {
    name: 'lone low surrogate candidate identifier',
    expected: false,
    candidateId: '\udc00',
    errorCode: 'INVALID_CANDIDATE_ID',
  },
  {
    name: 'HTTPS query, fragment, and percent escapes',
    expected: true,
    schemaUri:
      'https://schemas.example.org/a%20b/receipt.json?profile=v0.1&mark=%E2%9C%93#receipt%2Fschema',
  },
  {
    name: 'HTTPS minimum port',
    expected: true,
    schemaUri: 'https://schemas.example.org:1/receipt.json',
  },
  {
    name: 'HTTPS maximum port',
    expected: true,
    schemaUri: 'https://schemas.example.org:65535/receipt.json',
  },
  {
    name: 'basic URN schema identifier',
    expected: true,
    schemaUri: 'urn:example:selection-receipt:v0.1',
  },
  {
    name: 'URN query, fragment, and percent escapes',
    expected: true,
    schemaUri:
      'urn:example:selection%2Dreceipt:v0.1?profile=v0.1#receipt%2Fschema',
  },
  {
    name: 'malformed HTTP bracket input',
    expected: false,
    schemaUri: 'http://[',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'unsupported generic scheme and empty path query',
    expected: false,
    schemaUri: 'foo:?q',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS userinfo',
    expected: false,
    schemaUri: 'https://user@schemas.example.org/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS IP-literal brackets',
    expected: false,
    schemaUri: 'https://[::1]/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS empty port',
    expected: false,
    schemaUri: 'https://schemas.example.org:/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS zero port',
    expected: false,
    schemaUri: 'https://schemas.example.org:0/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS leading-zero port',
    expected: false,
    schemaUri: 'https://schemas.example.org:0443/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS oversize port',
    expected: false,
    schemaUri: 'https://schemas.example.org:65536/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS six-digit port',
    expected: false,
    schemaUri: 'https://schemas.example.org:999999/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS letter port',
    expected: false,
    schemaUri: 'https://schemas.example.org:https/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS uppercase host',
    expected: false,
    schemaUri: 'https://Schemas.example.org/receipt.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS malformed percent escape',
    expected: false,
    schemaUri: 'https://schemas.example.org/receipt%zz.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'HTTPS raw non-ASCII path',
    expected: false,
    schemaUri: 'https://schemas.example.org/✓.json',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'URN bracket in namespace position',
    expected: false,
    schemaUri: 'urn:foo[bar]',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'URN bracket in namespace-specific name',
    expected: false,
    schemaUri: 'urn:foo:bar[zip]',
    errorCode: 'INVALID_SCHEMA_URI',
  },
  {
    name: 'URN malformed percent escape',
    expected: false,
    schemaUri: 'urn:example:selection%z0receipt',
    errorCode: 'INVALID_SCHEMA_URI',
  },
]

for (const parityCase of parityCases) {
  test(`Ajv/runtime acceptance parity: ${parityCase.name}`, () => {
    const binding = structuredClone(example)
    if (parityCase.candidateId !== undefined) {
      binding.candidateId = parityCase.candidateId
    }
    if (parityCase.schemaUri !== undefined) {
      binding.selectionReceipt.schemaUri = parityCase.schemaUri
    }

    const schemaAccepted = validateSchema(binding)
    const schemaErrors = validateSchema.errors
    let normalized
    let runtimeError
    try {
      normalized = validateRunnerBinding(binding)
    } catch (error) {
      runtimeError = error
    }
    const runtimeAccepted = runtimeError === undefined

    assert.equal(
      schemaAccepted,
      parityCase.expected,
      ajv.errorsText(schemaErrors),
    )
    assert.equal(runtimeAccepted, schemaAccepted)
    if (parityCase.expected) {
      assert.equal(normalized.candidateId, binding.candidateId)
      assert.equal(
        normalized.selectionReceipt.schemaUri,
        binding.selectionReceipt.schemaUri,
      )
    } else {
      assert.ok(runtimeError instanceof RunnerBindingError)
      assert.equal(runtimeError.code, parityCase.errorCode)
    }
  })
}

for (const invalidCase of invalidCases) {
  test(`fails closed on ${invalidCase.name}`, () => {
    const binding = structuredClone(example)
    invalidCase.mutate(binding)
    assert.throws(
      () => digestRunnerBinding(binding),
      (error) =>
        error instanceof RunnerBindingError &&
        error.code === invalidCase.code,
    )
  })
}

test('fails closed on missing and unknown fields at every object level', () => {
  const cases = []
  const missing = structuredClone(example)
  delete missing.candidateId
  cases.push(missing)
  cases.push({ ...example, unexpected: true })

  const artifactMissing = structuredClone(example)
  delete artifactMissing.artifact.kind
  cases.push(artifactMissing)
  const artifactUnknown = structuredClone(example)
  artifactUnknown.artifact.byteSource = 'checkout'
  cases.push(artifactUnknown)

  const receiptMissing = structuredClone(example)
  delete receiptMissing.selectionReceipt.schemaUri
  cases.push(receiptMissing)
  const receiptUnknown = structuredClone(example)
  receiptUnknown.selectionReceipt.authorization = true
  cases.push(receiptUnknown)

  for (const binding of cases) {
    assert.throws(
      () => validateRunnerBinding(binding),
      (error) =>
        error instanceof RunnerBindingError &&
        error.code === 'INVALID_BINDING',
    )
  }
})

test('does not invoke accessors and rejects hidden, symbol, and custom objects', () => {
  let getterInvoked = false
  const accessor = structuredClone(example)
  Object.defineProperty(accessor, 'candidateId', {
    enumerable: true,
    get() {
      getterInvoked = true
      throw new Error('getter must not run')
    },
  })
  assert.throws(() => validateRunnerBinding(accessor), /data property/i)
  assert.equal(getterInvoked, false)

  const hidden = structuredClone(example)
  Object.defineProperty(hidden.artifact, 'hidden', { value: true })
  assert.throws(() => validateRunnerBinding(hidden), /not allowed/i)

  const symbol = structuredClone(example)
  symbol.selectionReceipt[Symbol('extension')] = true
  assert.throws(() => validateRunnerBinding(symbol), /symbol properties/i)

  const custom = structuredClone(example)
  Object.setPrototypeOf(custom.artifact, { inherited: true })
  assert.throws(() => validateRunnerBinding(custom), /plain data object/i)
})

test('duplicate-safe text parsing rejects ambiguous property names', () => {
  const source = JSON.stringify(example).replace(
    '"candidateId":"runner/search-safe@1.0.0"',
    '"candidateId":"first","candidateId":"runner/search-safe@1.0.0"',
  )
  assert.throws(
    () => parseRunnerBinding(source),
    (error) => error instanceof JcsError && error.code === 'DUPLICATE_PROPERTY',
  )
})

test('accepts a lexical URN schema identifier without resolving it', () => {
  const binding = structuredClone(example)
  binding.selectionReceipt.schemaUri = 'urn:example:selection-receipt:v0.1'
  assert.equal(
    validateRunnerBinding(binding).selectionReceipt.schemaUri,
    'urn:example:selection-receipt:v0.1',
  )
})

test('runner-binding package subpath exposes the public API', async () => {
  const publicApi = await import('dsh-guarded-hcl/runner-binding')
  const rootApi = await import('dsh-guarded-hcl')
  assert.equal(publicApi.RUNNER_BINDING_SCHEMA_URI, RUNNER_BINDING_SCHEMA_URI)
  assert.equal(publicApi.digestRunnerBinding(example), expectedDigest)
  assert.equal(rootApi.RUNNER_BINDING_SCHEMA_URI, RUNNER_BINDING_SCHEMA_URI)
  assert.equal(rootApi.digestRunnerBinding(example), expectedDigest)
  assert.match(
    import.meta.resolve(
      'dsh-guarded-hcl/schemas/runner-binding-v0.1.schema.json',
    ),
    /schemas\/runner-binding-v0\.1\.schema\.json$/u,
  )
})
