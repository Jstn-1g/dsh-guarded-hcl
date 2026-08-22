import { digestJson } from '../../src/canonical.js'
import { evaluateCandidate } from '../../src/gate.js'

export const DSH_WM_PIN = Object.freeze({
  repository: 'https://github.com/WayneJin0918/dsh-wm',
  commit: 'cd06866a638b1dcc80defa6d674ff3470ff0ad31',
  fixture: 'fixtures/sunset',
  fixtureTree: '241664e76f3bd46acd7786807753cbe67aa22a76',
  predTree: 'ab29b384bacc857d89392fe43436f18da72a40fe',
  gtTree: '1038068d2c249216f37017f12b90450a518b9cba',
  packageJsonBlob: '2ba80a417271106b15a3a11096d89014188c28ea',
  scorerBlobs: {
    'lib/diff.js': '3570163d4af0f99ee1d7c9490762dddd3febe85c',
    'lib/ssim.js': '469065207f6a3afff17da92530a020ba1d6d813d',
    'lib/frames.js': 'b2e0ea9e18bfedd79c7530e9ab52f4083ec3e690',
    'lib/png.js': 'd5de470133c76211ab4c9eae5ea6d9312ecf2cbc',
  },
})

export const EXPECTED_REJECTION_CODES = Object.freeze([
  'CURRENT_TASK_IMPROVEMENT_TOO_SMALL',
  'REQUIRED_ANCHOR_REGRESSION',
  'RETENTION_BUDGET_EXCEEDED',
])

export const EXPECTED_SUNSET_MEASUREMENT = Object.freeze({
  meanSsim: 0.734452382311,
  minSsim: 0.443963523011,
  firstHalfSsim: 0.993063755288,
  secondHalfSsim: 0.475841009333,
  pairCount: 8,
  worstFrameIndexes: Object.freeze([4, 5, 6]),
  warnings: Object.freeze([]),
})

/**
 * Convert two pinned dsh-wm rolloutDiff measurements into guarded HCL evidence.
 */
export function buildDshWmConformance({
  baseline,
  candidate,
  baselinePredictionTree,
  candidatePredictionTree,
  scenario = 'custom',
}) {
  const baselineMeasurement = normalizeMeasurement(baseline, 'baseline')
  const candidateMeasurement = normalizeMeasurement(candidate, 'candidate')
  const baselineTree = pinnedPredictionTree(
    baselinePredictionTree,
    'baselinePredictionTree',
  )
  const candidateTree = pinnedPredictionTree(
    candidatePredictionTree,
    'candidatePredictionTree',
  )
  const source = { ...DSH_WM_PIN, scenario: nonEmptyString(scenario, 'scenario') }

  const policy = {
    minimumCurrentImprovement: 0.03,
    maximumWeightedRetentionLoss: 0.01,
    requireEveryRequiredAnchor: true,
    failOnValiditySeverities: ['critical', 'high'],
    maximumCostIncreaseRatio: null,
  }

  const evidence = {
    schemaVersion: '0.1',
    candidateId:
      `dsh-wm-sunset-${scenario}-${DSH_WM_PIN.commit.slice(0, 12)}`,
    baselineDigest: predictionArtifactDigest(baselineTree),
    candidateDigest: predictionArtifactDigest(candidateTree),
    currentTask: {
      metric: 'dsh-wm.mean_ssim',
      baselineScore: baselineMeasurement.meanSsim,
      candidateScore: candidateMeasurement.meanSsim,
    },
    requiredAnchorIds: ['dsh-wm.second_half_ssim'],
    retention: [
      {
        anchorId: 'dsh-wm.second_half_ssim',
        baselineScore: baselineMeasurement.secondHalfSsim,
        candidateScore: candidateMeasurement.secondHalfSsim,
        required: true,
        weight: 1,
        maximumLoss: 0.01,
      },
    ],
    validity: [
      {
        checkId: 'paired-frame-count',
        passed:
          baselineMeasurement.pairCount === 8 &&
          candidateMeasurement.pairCount === baselineMeasurement.pairCount,
        severity: 'high',
        details:
          `baseline=${baselineMeasurement.pairCount}; ` +
          `candidate=${candidateMeasurement.pairCount}; expected=8`,
      },
      {
        checkId: 'scorer-warnings-empty',
        passed:
          baselineMeasurement.warnings.length === 0 &&
          candidateMeasurement.warnings.length === 0,
        severity: 'high',
        details:
          `baseline=${baselineMeasurement.warnings.join('; ') || 'none'}; ` +
          `candidate=${candidateMeasurement.warnings.join('; ') || 'none'}`,
      },
    ],
    cost: null,
  }

  return {
    integration: source,
    measurements: {
      baseline: baselineMeasurement,
      candidate: candidateMeasurement,
    },
    policy,
    evidence,
    decision: evaluateCandidate(policy, evidence),
  }
}

function normalizeMeasurement(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} measurement must be an object.`)
  }

  return {
    meanSsim: finiteNumber(value.mean_ssim, `${name}.mean_ssim`),
    minSsim: finiteNumber(value.min_ssim, `${name}.min_ssim`),
    firstHalfSsim: finiteNumber(
      value.first_half_ssim,
      `${name}.first_half_ssim`,
    ),
    secondHalfSsim: finiteNumber(
      value.second_half_ssim,
      `${name}.second_half_ssim`,
    ),
    pairCount: positiveInteger(value.n, `${name}.n`),
    worstFrameIndexes: arrayField(value.worst, `${name}.worst`).map(
      (entry, index) => {
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
          throw new TypeError(`${name}.worst[${index}] must be an object.`)
        }
        return nonNegativeInteger(
          entry.index,
          `${name}.worst[${index}].index`,
        )
      },
    ),
    warnings: arrayField(value.warnings, `${name}.warnings`).map(
      (warning, index) => nonEmptyString(warning, `${name}.warnings[${index}]`),
    ),
  }
}

function predictionArtifactDigest(predictionTree) {
  return digestJson({
    contract: 'dsh-wm-sunset-prediction-v1',
    repository: DSH_WM_PIN.repository,
    commit: DSH_WM_PIN.commit,
    predictionTree,
    groundTruthTree: DSH_WM_PIN.gtTree,
    scorerBlobs: DSH_WM_PIN.scorerBlobs,
  })
}

function pinnedPredictionTree(value, path) {
  if (value !== DSH_WM_PIN.predTree && value !== DSH_WM_PIN.gtTree) {
    throw new TypeError(
      `${path} must identify the pinned Sunset pred or GT tree.`,
    )
  }
  return value
}

function finiteNumber(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number.`)
  }
  return Number(value.toFixed(12))
}

function positiveInteger(value, path) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${path} must be a positive integer.`)
  }
  return value
}

function nonNegativeInteger(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${path} must be a non-negative integer.`)
  }
  return value
}

function arrayField(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`)
  return value
}

function nonEmptyString(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string.`)
  }
  return value
}
