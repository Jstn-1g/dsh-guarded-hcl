import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import {
  EVALUATION_EVIDENCE_V02_SCHEMA_URI,
  EVALUATION_EVIDENCE_V02_SCHEMA_VERSION,
  EvaluationEvidenceV02Error,
} from '../src/evaluation-evidence-v0.2.js'
import { evaluateCandidate } from '../src/gate.js'
import {
  RUNNER_BINDING_DIGEST_PROFILE,
  RUNNER_BINDING_SCHEMA_URI,
  digestRunnerBinding,
} from '../src/runner-binding.js'

const policy = await fixture('policy.json')
const evidence = await fixture('evaluation-v0.2-pass.json')
const binding = await fixture('runner-binding-v0.1.json')
const v01Evidence = await fixture('evaluation-pass.json')
const v01Regression = await fixture('evaluation-regression.json')
const schemaSource = await readFile(
  new URL('../schemas/evaluation-evidence-v0.2.schema.json', import.meta.url),
  'utf8',
)
const schema = JSON.parse(schemaSource)
const v01SchemaSource = await readFile(
  new URL('../schemas/evaluation-evidence.schema.json', import.meta.url),
  'utf8',
)
const ajv = new Ajv2020({ allErrors: true, strict: true, unicodeRegExp: true })
const schemaMetaValid = ajv.validateSchema(schema)
const schemaMetaErrors = ajv.errors
const validateSchema = ajv.compile(schema)

test('schema freezes the closed EvaluationEvidence v0.2 reference', () => {
  assert.equal(schemaMetaValid, true, ajv.errorsText(schemaMetaErrors))
  assert.equal(schema.$id, EVALUATION_EVIDENCE_V02_SCHEMA_URI)
  assert.equal(
    schema.properties.schemaVersion.const,
    EVALUATION_EVIDENCE_V02_SCHEMA_VERSION,
  )
  assert.equal(schema.additionalProperties, false)
  assert.ok(schema.required.includes('runnerBindingRef'))
  assert.equal(schema.properties.runnerBindingRef.additionalProperties, false)
  assert.deepEqual(schema.properties.runnerBindingRef.required, [
    'schemaUri',
    'digestProfile',
    'digest',
  ])
  assert.equal(
    schema.properties.runnerBindingRef.properties.schemaUri.const,
    RUNNER_BINDING_SCHEMA_URI,
  )
  assert.equal(
    schema.properties.runnerBindingRef.properties.digestProfile.const,
    RUNNER_BINDING_DIGEST_PROFILE,
  )
  assert.equal(
    validateSchema(evidence),
    true,
    ajv.errorsText(validateSchema.errors),
  )
})

test('accepts v0.2 only after verifying the caller-supplied binding', () => {
  const decision = evaluateCandidate(policy, evidence, {
    runnerBinding: binding,
  })

  assert.equal(decision.schemaVersion, '0.1')
  assert.equal(decision.accepted, true)
  assert.equal(decision.candidateId, binding.candidateId)
  assert.deepEqual(decision.reasons, [])
})

test('fails before CommitDecision when resolution input is absent or malformed', () => {
  assertCode(
    () => evaluateCandidate(policy, evidence),
    'RUNNER_BINDING_RESOLUTION_REQUIRED',
  )
  assertCode(
    () => evaluateCandidate(policy, evidence, {}),
    'INVALID_RUNNER_BINDING_RESOLUTION',
  )
  assertCode(
    () =>
      evaluateCandidate(policy, evidence, {
        runnerBinding: binding,
        fetchedFrom: 'network',
      }),
    'INVALID_RUNNER_BINDING_RESOLUTION',
  )
})

test('rejects independent reference schema URI, profile, and digest mutations', () => {
  const mutations = [
    {
      code: 'UNSUPPORTED_RUNNER_BINDING_SCHEMA',
      schemaAccepted: false,
      apply(changed) {
        changed.runnerBindingRef.schemaUri =
          'https://schemas.example.org/runner-binding-v0.1.schema.json'
      },
    },
    {
      code: 'UNSUPPORTED_RUNNER_BINDING_DIGEST_PROFILE',
      schemaAccepted: false,
      apply(changed) {
        changed.runnerBindingRef.digestProfile = 'urn:example:jcs-sha256:v9'
      },
    },
    {
      code: 'RUNNER_BINDING_DIGEST_MISMATCH',
      schemaAccepted: true,
      apply(changed) {
        changed.runnerBindingRef.digest = `sha256:${'1'.repeat(64)}`
      },
    },
  ]

  for (const mutation of mutations) {
    const changed = structuredClone(evidence)
    mutation.apply(changed)
    assert.equal(validateSchema(changed), mutation.schemaAccepted)
    assertCode(
      () => evaluateCandidate(policy, changed, { runnerBinding: binding }),
      mutation.code,
    )
  }
})

test('rejects invalid or digest-mismatched resolved binding content', () => {
  const invalid = structuredClone(binding)
  invalid.artifact.kind = 'directory'
  assertCode(
    () => evaluateCandidate(policy, evidence, { runnerBinding: invalid }),
    'INVALID_RESOLVED_RUNNER_BINDING',
  )

  const contentMutation = structuredClone(binding)
  contentMutation.selectionReceipt.digest = `sha256:${'2'.repeat(64)}`
  assertCode(
    () =>
      evaluateCandidate(policy, evidence, {
        runnerBinding: contentMutation,
      }),
    'RUNNER_BINDING_DIGEST_MISMATCH',
  )
})

test('rejects candidate and artifact substitutions even with recomputed refs', () => {
  const candidateMutation = structuredClone(binding)
  candidateMutation.candidateId = 'runner/other@1.0.0'
  const candidateEvidence = structuredClone(evidence)
  candidateEvidence.runnerBindingRef.digest = digestRunnerBinding(
    candidateMutation,
  )
  assertCode(
    () =>
      evaluateCandidate(policy, candidateEvidence, {
        runnerBinding: candidateMutation,
      }),
    'RUNNER_BINDING_CANDIDATE_MISMATCH',
  )

  const artifactMutation = structuredClone(binding)
  artifactMutation.artifact.digest = `sha256:${'3'.repeat(64)}`
  const artifactEvidence = structuredClone(evidence)
  artifactEvidence.runnerBindingRef.digest = digestRunnerBinding(
    artifactMutation,
  )
  assertCode(
    () =>
      evaluateCandidate(policy, artifactEvidence, {
        runnerBinding: artifactMutation,
      }),
    'RUNNER_BINDING_ARTIFACT_MISMATCH',
  )
})

test('keeps v0.1 schema bytes and decision digests unchanged', () => {
  assert.equal(
    createHash('sha256').update(v01SchemaSource).digest('hex'),
    'e810dff24adf45fb51240ba2aeff350c1f9d8af8f4e27c895d291d5c69f8723a',
  )

  const passing = evaluateCandidate(policy, v01Evidence)
  const withIgnoredResolution = evaluateCandidate(policy, v01Evidence, {
    runnerBinding: { invalid: true },
  })
  assert.deepEqual(withIgnoredResolution, passing)
  assert.equal(
    passing.evidenceDigest,
    'sha256:d36eba5a70dbbfee52e39b0d62b54028680b2182fd52781d3ed2ccb27a8e6bd4',
  )
  assert.equal(
    passing.decisionDigest,
    'sha256:2ba9b7d2c0871867b525aec585ecd2b18cb5c925125c5f3460d327255cb449f6',
  )

  const regression = evaluateCandidate(policy, v01Regression)
  assert.equal(
    regression.evidenceDigest,
    'sha256:974b48854087bbcd9f18e939d4c0bd546c869dd1569bf72c67a4662b3b874166',
  )
  assert.equal(
    regression.decisionDigest,
    'sha256:f50d36140a1c857a737b7a1252ccee84662e43352ba27db83a159ebe5208b61c',
  )

  assert.throws(
    () =>
      evaluateCandidate(policy, {
        ...v01Evidence,
        runnerBindingRef: evidence.runnerBindingRef,
      }),
    /evidence\.runnerBindingRef is not allowed/u,
  )
})

test('rejects hidden, accessor, symbol, and custom reference records', () => {
  let getterInvoked = false
  const accessor = structuredClone(evidence)
  Object.defineProperty(accessor.runnerBindingRef, 'digest', {
    enumerable: true,
    get() {
      getterInvoked = true
      throw new Error('getter must not run')
    },
  })
  assertCode(
    () => evaluateCandidate(policy, accessor, { runnerBinding: binding }),
    'INVALID_RUNNER_BINDING_REFERENCE',
  )
  assert.equal(getterInvoked, false)

  const hidden = structuredClone(evidence)
  Object.defineProperty(hidden.runnerBindingRef, 'hidden', { value: true })
  assertCode(
    () => evaluateCandidate(policy, hidden, { runnerBinding: binding }),
    'INVALID_RUNNER_BINDING_REFERENCE',
  )

  const symbol = structuredClone(evidence)
  symbol.runnerBindingRef[Symbol('extension')] = true
  assertCode(
    () => evaluateCandidate(policy, symbol, { runnerBinding: binding }),
    'INVALID_RUNNER_BINDING_REFERENCE',
  )

  const custom = structuredClone(evidence)
  Object.setPrototypeOf(custom.runnerBindingRef, { inherited: true })
  assertCode(
    () => evaluateCandidate(policy, custom, { runnerBinding: binding }),
    'INVALID_RUNNER_BINDING_REFERENCE',
  )
})

function assertCode(action, code) {
  assert.throws(
    action,
    (error) =>
      error instanceof EvaluationEvidenceV02Error && error.code === code,
  )
}

async function fixture(name) {
  const url = new URL(`../examples/${name}`, import.meta.url)
  return JSON.parse(await readFile(url, 'utf8'))
}
