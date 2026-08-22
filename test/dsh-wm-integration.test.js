import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDshWmConformance,
  DSH_WM_PIN,
  EXPECTED_REJECTION_CODES,
} from '../integrations/dsh-wm/contract.js'

const perfectBaseline = {
  mean_ssim: 1,
  min_ssim: 1,
  first_half_ssim: 1,
  second_half_ssim: 1,
  diagnosis: 'pred stays close to GT',
  n: 8,
  worst: [{ index: 0 }, { index: 1 }, { index: 2 }],
  warnings: [],
}

const degradedCandidate = {
  mean_ssim: 0.7344523823107038,
  min_ssim: 0.44396352301058406,
  first_half_ssim: 0.9930637552881459,
  second_half_ssim: 0.4758410093332617,
  diagnosis: 'late-horizon collapse (second half SSIM drop)',
  n: 8,
  worst: [{ index: 4 }, { index: 5 }, { index: 6 }],
  warnings: [],
}

test('rejects a dsh-wm candidate with late-horizon collapse', () => {
  const result = buildDshWmConformance({
    baseline: perfectBaseline,
    candidate: degradedCandidate,
    baselinePredictionTree: DSH_WM_PIN.gtTree,
    candidatePredictionTree: DSH_WM_PIN.predTree,
    scenario: 'oracle-regression',
  })

  assert.equal(result.decision.accepted, false)
  const codes = new Set(result.decision.reasons.map((reason) => reason.code))
  for (const code of EXPECTED_REJECTION_CODES) assert.ok(codes.has(code))
  assert.equal(result.evidence.currentTask.metric, 'dsh-wm.mean_ssim')
  assert.match(result.evidence.baselineDigest, /^sha256:[a-f0-9]{64}$/)
  assert.match(result.evidence.candidateDigest, /^sha256:[a-f0-9]{64}$/)
})

test('accepts the dsh-wm oracle-recovery conformance scenario', () => {
  const result = buildDshWmConformance({
    baseline: degradedCandidate,
    candidate: perfectBaseline,
    baselinePredictionTree: DSH_WM_PIN.predTree,
    candidatePredictionTree: DSH_WM_PIN.gtTree,
    scenario: 'oracle-recovery',
  })

  assert.equal(result.decision.accepted, true)
  assert.deepEqual(result.decision.reasons, [])
})

test('keeps prediction artifact identities stable across demo roles', () => {
  const regression = buildDshWmConformance({
    baseline: perfectBaseline,
    candidate: degradedCandidate,
    baselinePredictionTree: DSH_WM_PIN.gtTree,
    candidatePredictionTree: DSH_WM_PIN.predTree,
    scenario: 'oracle-regression',
  })
  const recovery = buildDshWmConformance({
    baseline: degradedCandidate,
    candidate: perfectBaseline,
    baselinePredictionTree: DSH_WM_PIN.predTree,
    candidatePredictionTree: DSH_WM_PIN.gtTree,
    scenario: 'oracle-recovery',
  })

  assert.equal(
    regression.evidence.candidateDigest,
    recovery.evidence.baselineDigest,
  )
  assert.equal(
    regression.evidence.baselineDigest,
    recovery.evidence.candidateDigest,
  )
})

test('refuses malformed dsh-wm measurements', () => {
  assert.throws(
    () =>
      buildDshWmConformance({
        baseline: perfectBaseline,
        candidate: { ...degradedCandidate, second_half_ssim: Number.NaN },
        baselinePredictionTree: DSH_WM_PIN.gtTree,
        candidatePredictionTree: DSH_WM_PIN.predTree,
      }),
    /candidate\.second_half_ssim must be a finite number/,
  )
})

test('refuses prediction artifacts outside the pinned Sunset fixture', () => {
  assert.throws(
    () =>
      buildDshWmConformance({
        baseline: perfectBaseline,
        candidate: degradedCandidate,
        baselinePredictionTree: DSH_WM_PIN.gtTree,
        candidatePredictionTree: 'unverified-tree',
      }),
    /must identify the pinned Sunset pred or GT tree/,
  )
})
