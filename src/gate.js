import { digestJson } from './canonical.js'

const DEFAULT_POLICY = Object.freeze({
  minimumCurrentImprovement: 0,
  maximumWeightedRetentionLoss: 0,
  requireEveryRequiredAnchor: true,
  failOnValiditySeverities: ['critical', 'high'],
  maximumCostIncreaseRatio: null,
})

/**
 * Evaluate a candidate harness using evidence produced outside the optimizer.
 * The function is deterministic: the decision digest excludes wall-clock time.
 *
 * @param {Record<string, unknown>} rawPolicy
 * @param {Record<string, unknown>} rawEvidence
 * @returns {{
 *   schemaVersion: string,
 *   accepted: boolean,
 *   candidateId: string,
 *   reasons: Array<{code: string, message: string}>,
 *   metrics: Record<string, number | null>,
 *   evidenceDigest: string,
 *   decisionDigest: string
 * }}
 */
export function evaluateCandidate(rawPolicy, rawEvidence) {
  const policy = normalizePolicy(rawPolicy)
  const evidence = normalizeEvidence(rawEvidence)
  const reasons = []

  const rawCurrentImprovement =
    evidence.currentTask.candidateScore - evidence.currentTask.baselineScore
  const currentImprovement = roundMetric(rawCurrentImprovement)

  if (metricLessThan(rawCurrentImprovement, policy.minimumCurrentImprovement)) {
    reasons.push({
      code: 'CURRENT_TASK_IMPROVEMENT_TOO_SMALL',
      message:
        `Current-task improvement ${formatNumber(currentImprovement)} is below ` +
        `the required ${formatNumber(policy.minimumCurrentImprovement)}.`,
    })
  }

  let totalWeight = 0
  let weightedRetentionLoss = 0
  const requiredAnchorIds = new Set(evidence.requiredAnchorIds)

  for (const anchor of evidence.retention) {
    const loss = Math.max(0, anchor.baselineScore - anchor.candidateScore)
    const allowedLoss = anchor.maximumLoss ?? 0

    totalWeight += anchor.weight
    weightedRetentionLoss += loss * anchor.weight

    if (
      (anchor.required || requiredAnchorIds.has(anchor.anchorId)) &&
      metricGreaterThan(loss, allowedLoss)
    ) {
      reasons.push({
        code: 'REQUIRED_ANCHOR_REGRESSION',
        message:
          `Required anchor ${anchor.anchorId} lost ${formatNumber(loss)}, ` +
          `exceeding its allowance of ${formatNumber(allowedLoss)}.`,
      })
    }
  }

  const rawAverageWeightedRetentionLoss =
    totalWeight === 0 ? 0 : weightedRetentionLoss / totalWeight
  const averageWeightedRetentionLoss = roundMetric(
    rawAverageWeightedRetentionLoss,
  )

  if (
    metricGreaterThan(
      rawAverageWeightedRetentionLoss,
      policy.maximumWeightedRetentionLoss,
    )
  ) {
    reasons.push({
      code: 'RETENTION_BUDGET_EXCEEDED',
      message:
        `Weighted retention loss ${formatNumber(averageWeightedRetentionLoss)} ` +
        `exceeds the policy maximum ${formatNumber(policy.maximumWeightedRetentionLoss)}.`,
    })
  }

  if (policy.requireEveryRequiredAnchor) {
    const presentAnchors = new Set(evidence.retention.map((anchor) => anchor.anchorId))
    for (const requiredAnchorId of evidence.requiredAnchorIds) {
      if (!presentAnchors.has(requiredAnchorId)) {
        reasons.push({
          code: 'REQUIRED_ANCHOR_MISSING',
          message: `Required retention anchor ${requiredAnchorId} was not evaluated.`,
        })
      }
    }
  }

  const blockedSeverities = new Set(policy.failOnValiditySeverities)
  for (const check of evidence.validity) {
    if (!check.passed && blockedSeverities.has(check.severity)) {
      reasons.push({
        code: 'VALIDITY_CHECK_FAILED',
        message: `Validity check ${check.checkId} failed at ${check.severity} severity.`,
      })
    }
  }

  let costIncreaseRatio = null
  if (evidence.cost !== null) {
    if (evidence.cost.baseline === 0) {
      costIncreaseRatio = evidence.cost.candidate === 0 ? 0 : null
      if (
        evidence.cost.candidate > 0 &&
        policy.maximumCostIncreaseRatio !== null
      ) {
        reasons.push({
          code: 'COST_BUDGET_EXCEEDED',
          message:
            'Candidate cost is greater than zero while the baseline cost is zero; ' +
            'a finite increase ratio cannot satisfy the configured cost limit.',
        })
      }
    } else {
      const rawCostIncreaseRatio =
        (evidence.cost.candidate - evidence.cost.baseline) /
        evidence.cost.baseline
      costIncreaseRatio = roundMetric(rawCostIncreaseRatio)

      if (
        policy.maximumCostIncreaseRatio !== null &&
        metricGreaterThan(
          rawCostIncreaseRatio,
          policy.maximumCostIncreaseRatio,
        )
      ) {
        reasons.push({
          code: 'COST_BUDGET_EXCEEDED',
          message:
            `Cost increase ratio ${formatNumber(rawCostIncreaseRatio)} exceeds ` +
            `the policy maximum ${formatNumber(policy.maximumCostIncreaseRatio)}.`,
        })
      }
    }
  }

  const evidenceDigest = digestJson(evidence)
  const decisionCore = {
    schemaVersion: '0.1',
    accepted: reasons.length === 0,
    candidateId: evidence.candidateId,
    reasons,
    metrics: {
      currentImprovement,
      weightedRetentionLoss: averageWeightedRetentionLoss,
      costIncreaseRatio,
    },
    evidenceDigest,
  }

  return {
    ...decisionCore,
    decisionDigest: digestJson(decisionCore),
  }
}

/** @param {Record<string, unknown>} raw */
function normalizePolicy(raw) {
  assertRecord(raw, 'policy')

  const policy = {
    ...DEFAULT_POLICY,
    ...raw,
  }

  return {
    minimumCurrentImprovement: numberField(
      policy.minimumCurrentImprovement,
      'policy.minimumCurrentImprovement',
    ),
    maximumWeightedRetentionLoss: nonNegativeNumberField(
      policy.maximumWeightedRetentionLoss,
      'policy.maximumWeightedRetentionLoss',
    ),
    requireEveryRequiredAnchor: booleanField(
      policy.requireEveryRequiredAnchor,
      'policy.requireEveryRequiredAnchor',
    ),
    failOnValiditySeverities: stringArrayField(
      policy.failOnValiditySeverities,
      'policy.failOnValiditySeverities',
    ).map((severity) => severity.toLowerCase()),
    maximumCostIncreaseRatio:
      policy.maximumCostIncreaseRatio === null
        ? null
        : nonNegativeNumberField(
            policy.maximumCostIncreaseRatio,
            'policy.maximumCostIncreaseRatio',
          ),
  }
}

/** @param {Record<string, unknown>} raw */
function normalizeEvidence(raw) {
  assertRecord(raw, 'evidence')

  const currentTask = recordField(raw.currentTask, 'evidence.currentTask')
  const retention = arrayField(raw.retention, 'evidence.retention').map(
    (entry, index) => {
      const anchor = recordField(entry, `evidence.retention[${index}]`)
      return {
        anchorId: stringField(
          anchor.anchorId,
          `evidence.retention[${index}].anchorId`,
        ),
        baselineScore: numberField(
          anchor.baselineScore,
          `evidence.retention[${index}].baselineScore`,
        ),
        candidateScore: numberField(
          anchor.candidateScore,
          `evidence.retention[${index}].candidateScore`,
        ),
        required:
          anchor.required === undefined
            ? true
            : booleanField(
                anchor.required,
                `evidence.retention[${index}].required`,
              ),
        weight:
          anchor.weight === undefined
            ? 1
            : positiveNumberField(
                anchor.weight,
                `evidence.retention[${index}].weight`,
              ),
        maximumLoss:
          anchor.maximumLoss === undefined
            ? null
            : nonNegativeNumberField(
                anchor.maximumLoss,
                `evidence.retention[${index}].maximumLoss`,
              ),
      }
    },
  )

  const validity = arrayField(raw.validity, 'evidence.validity').map(
    (entry, index) => {
      const check = recordField(entry, `evidence.validity[${index}]`)
      return {
        checkId: stringField(
          check.checkId,
          `evidence.validity[${index}].checkId`,
        ),
        passed: booleanField(
          check.passed,
          `evidence.validity[${index}].passed`,
        ),
        severity: stringField(
          check.severity,
          `evidence.validity[${index}].severity`,
        ).toLowerCase(),
        details:
          check.details === undefined
            ? null
            : stringField(
                check.details,
                `evidence.validity[${index}].details`,
              ),
      }
    },
  )

  let cost = null
  if (raw.cost !== undefined && raw.cost !== null) {
    const costRecord = recordField(raw.cost, 'evidence.cost')
    cost = {
      baseline: nonNegativeNumberField(
        costRecord.baseline,
        'evidence.cost.baseline',
      ),
      candidate: nonNegativeNumberField(
        costRecord.candidate,
        'evidence.cost.candidate',
      ),
    }
  }

  return {
    schemaVersion:
      raw.schemaVersion === undefined
        ? '0.1'
        : stringField(raw.schemaVersion, 'evidence.schemaVersion'),
    candidateId: stringField(raw.candidateId, 'evidence.candidateId'),
    baselineDigest: stringField(
      raw.baselineDigest,
      'evidence.baselineDigest',
    ),
    candidateDigest: stringField(
      raw.candidateDigest,
      'evidence.candidateDigest',
    ),
    currentTask: {
      metric: stringField(
        currentTask.metric,
        'evidence.currentTask.metric',
      ),
      baselineScore: numberField(
        currentTask.baselineScore,
        'evidence.currentTask.baselineScore',
      ),
      candidateScore: numberField(
        currentTask.candidateScore,
        'evidence.currentTask.candidateScore',
      ),
    },
    requiredAnchorIds:
      raw.requiredAnchorIds === undefined
        ? retention.filter((anchor) => anchor.required).map((anchor) => anchor.anchorId)
        : stringArrayField(
            raw.requiredAnchorIds,
            'evidence.requiredAnchorIds',
          ),
    retention,
    validity,
    cost,
  }
}

function roundMetric(value) {
  return Number(value.toFixed(12))
}

function metricLessThan(value, threshold) {
  return roundMetric(value) < roundMetric(threshold)
}

function metricGreaterThan(value, threshold) {
  return roundMetric(value) > roundMetric(threshold)
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value)
  return Number(value.toFixed(6)).toString()
}

function assertRecord(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`)
  }
}

function recordField(value, path) {
  assertRecord(value, path)
  return /** @type {Record<string, unknown>} */ (value)
}

function arrayField(value, path) {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`)
  return value
}

function stringArrayField(value, path) {
  return arrayField(value, path).map((entry, index) =>
    stringField(entry, `${path}[${index}]`),
  )
}

function stringField(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string.`)
  }
  return value
}

function booleanField(value, path) {
  if (typeof value !== 'boolean') throw new TypeError(`${path} must be a boolean.`)
  return value
}

function numberField(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number.`)
  }
  return value
}

function nonNegativeNumberField(value, path) {
  const number = numberField(value, path)
  if (number < 0) throw new TypeError(`${path} must be non-negative.`)
  return number
}

function positiveNumberField(value, path) {
  const number = numberField(value, path)
  if (number <= 0) throw new TypeError(`${path} must be greater than zero.`)
  return number
}
