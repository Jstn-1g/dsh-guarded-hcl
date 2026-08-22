import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../bin/hcl-gate.js', import.meta.url))
const policy = fileURLToPath(new URL('../examples/policy.json', import.meta.url))
const passingEvidence = fileURLToPath(
  new URL('../examples/evaluation-pass.json', import.meta.url),
)
const regressingEvidence = fileURLToPath(
  new URL('../examples/evaluation-regression.json', import.meta.url),
)

test('CLI accepts the passing fixture with exit status 0', () => {
  const result = runCli(passingEvidence)
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  assert.equal(JSON.parse(result.stdout).accepted, true)
})

test('CLI rejects the regression fixture with exit status 2', () => {
  const result = runCli(regressingEvidence)
  assert.equal(result.status, 2)
  assert.equal(result.stderr, '')
  const decision = JSON.parse(result.stdout)
  assert.equal(decision.accepted, false)
  assert.ok(
    decision.reasons.some(
      (reason) => reason.code === 'REQUIRED_ANCHOR_REGRESSION',
    ),
  )
})

function runCli(evidence) {
  return spawnSync(process.execPath, [cli, policy, evidence], {
    encoding: 'utf8',
  })
}
