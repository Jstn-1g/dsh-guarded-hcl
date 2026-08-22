import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { evaluateCandidate } from '../src/gate.js'

const policy = await fixture('policy.json')
const passingEvidence = await fixture('evaluation-pass.json')
const regressingEvidence = await fixture('evaluation-regression.json')

test('accepts a candidate that improves and retains required behavior', () => {
  const decision = evaluateCandidate(policy, passingEvidence)
  assert.equal(decision.accepted, true)
  assert.deepEqual(decision.reasons, [])
  assert.equal(decision.metrics.currentImprovement, 0.09)
})

test('rejects regression even when the current task improves', () => {
  const decision = evaluateCandidate(policy, regressingEvidence)
  assert.equal(decision.accepted, false)
  assert.ok(
    decision.reasons.some(
      (reason) => reason.code === 'REQUIRED_ANCHOR_REGRESSION',
    ),
  )
  assert.ok(
    decision.reasons.some(
      (reason) => reason.code === 'VALIDITY_CHECK_FAILED',
    ),
  )
})

test('rejects a missing required anchor', () => {
  const evidence = structuredClone(passingEvidence)
  evidence.retention = evidence.retention.filter(
    (anchor) => anchor.anchorId !== 'anchor-citation-fidelity',
  )

  const decision = evaluateCandidate(policy, evidence)
  assert.equal(decision.accepted, false)
  assert.ok(
    decision.reasons.some(
      (reason) => reason.code === 'REQUIRED_ANCHOR_MISSING',
    ),
  )
})

test('refuses anchors marked as both required and optional', () => {
  const evidence = structuredClone(passingEvidence)
  const requiredAnchor = evidence.retention.find(
    (anchor) => anchor.anchorId === 'anchor-citation-fidelity',
  )
  requiredAnchor.required = false
  requiredAnchor.candidateScore = 0

  assert.throws(
    () =>
      evaluateCandidate(
        { ...policy, maximumWeightedRetentionLoss: 1 },
        evidence,
      ),
    /cannot be both required and optional/,
  )
})

test('accepts an improvement exactly on a decimal policy boundary', () => {
  const evidence = structuredClone(passingEvidence)
  evidence.currentTask.baselineScore = 0.2
  evidence.currentTask.candidateScore = 0.3

  const decision = evaluateCandidate(
    { ...policy, minimumCurrentImprovement: 0.1 },
    evidence,
  )
  assert.equal(decision.accepted, true)
})

test('matches configured validity severities case-insensitively', () => {
  const evidence = structuredClone(passingEvidence)
  evidence.validity[0] = {
    checkId: 'schema-valid',
    passed: false,
    severity: 'HIGH',
  }

  const decision = evaluateCandidate(
    { ...policy, failOnValiditySeverities: ['High'] },
    evidence,
  )
  assert.equal(decision.accepted, false)
  assert.ok(
    decision.reasons.some((reason) => reason.code === 'VALIDITY_CHECK_FAILED'),
  )
})

test('decision digest is deterministic across object key order', () => {
  const reorderedPolicy = {
    maximumCostIncreaseRatio: policy.maximumCostIncreaseRatio,
    failOnValiditySeverities: policy.failOnValiditySeverities,
    requireEveryRequiredAnchor: policy.requireEveryRequiredAnchor,
    maximumWeightedRetentionLoss: policy.maximumWeightedRetentionLoss,
    minimumCurrentImprovement: policy.minimumCurrentImprovement,
  }

  const first = evaluateCandidate(policy, passingEvidence)
  const second = evaluateCandidate(reorderedPolicy, passingEvidence)
  assert.equal(first.decisionDigest, second.decisionDigest)
})

test('decision digest is bound to the normalized policy', () => {
  const first = evaluateCandidate(policy, passingEvidence)
  const second = evaluateCandidate(
    { ...policy, maximumCostIncreaseRatio: 0.24 },
    passingEvidence,
  )

  assert.equal(first.accepted, true)
  assert.equal(second.accepted, true)
  assert.notEqual(first.policyDigest, second.policyDigest)
  assert.notEqual(first.decisionDigest, second.decisionDigest)
})

test('handles a zero-cost baseline without emitting non-JSON numbers', () => {
  const evidence = structuredClone(passingEvidence)
  evidence.cost = { baseline: 0, candidate: 0.01 }

  const decision = evaluateCandidate(policy, evidence)
  assert.equal(decision.accepted, false)
  assert.equal(decision.metrics.costIncreaseRatio, null)
  assert.ok(
    decision.reasons.some((reason) => reason.code === 'COST_BUDGET_EXCEEDED'),
  )
})

test('throws on malformed evidence instead of silently accepting it', () => {
  assert.throws(
    () => evaluateCandidate(policy, { candidateId: 'bad' }),
    /currentTask must be an object/,
  )
})

test('refuses unsupported schema versions and unknown fields', () => {
  assert.throws(
    () =>
      evaluateCandidate(policy, {
        ...passingEvidence,
        schemaVersion: '999',
      }),
    /schemaVersion must equal "0.1"/,
  )
  assert.throws(
    () =>
      evaluateCandidate(policy, {
        ...passingEvidence,
        unrecognized: true,
      }),
    /evidence\.unrecognized is not allowed/,
  )
  assert.throws(
    () => evaluateCandidate({ ...policy, unrecognized: true }, passingEvidence),
    /policy\.unrecognized is not allowed/,
  )
})

test('refuses duplicate anchor and validity identifiers', () => {
  const duplicateAnchor = structuredClone(passingEvidence)
  duplicateAnchor.retention.push(structuredClone(duplicateAnchor.retention[0]))
  assert.throws(
    () => evaluateCandidate(policy, duplicateAnchor),
    /retention anchorId must not contain duplicate/,
  )

  const duplicateCheck = structuredClone(passingEvidence)
  duplicateCheck.validity.push(structuredClone(duplicateCheck.validity[0]))
  assert.throws(
    () => evaluateCandidate(policy, duplicateCheck),
    /validity checkId must not contain duplicate/,
  )
})

async function fixture(name) {
  const url = new URL(`../examples/${name}`, import.meta.url)
  return JSON.parse(await readFile(url, 'utf8'))
}
