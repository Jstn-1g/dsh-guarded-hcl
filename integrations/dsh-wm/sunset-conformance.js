#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  buildDshWmConformance,
  DSH_WM_PIN,
  EXPECTED_REJECTION_CODES,
  EXPECTED_SUNSET_MEASUREMENT,
} from './contract.js'

const [, , checkoutArgument] = process.argv

if (!checkoutArgument) {
  console.error(
    'Usage: node integrations/dsh-wm/sunset-conformance.js <dsh-wm-checkout>',
  )
  process.exitCode = 64
} else {
  try {
    const checkout = resolve(checkoutArgument)
    verifyPinnedCheckout(checkout)
    const packageJson = JSON.parse(
      await readFile(resolve(checkout, 'package.json'), 'utf8'),
    )
    if (packageJson.name !== 'dsh-wm') {
      throw new Error(`Expected dsh-wm checkout, found ${packageJson.name ?? 'unknown'}.`)
    }

    const moduleUrl = pathToFileURL(resolve(checkout, 'lib', 'diff.js')).href
    const { rolloutDiff } = await import(moduleUrl)
    if (typeof rolloutDiff !== 'function') {
      throw new Error('Pinned dsh-wm checkout does not export rolloutDiff().')
    }

    const fixture = resolve(checkout, DSH_WM_PIN.fixture)
    const gt = resolve(fixture, 'gt')
    const pred = resolve(fixture, 'pred')
    const oracle = rolloutDiff(gt, gt)
    const degraded = rolloutDiff(pred, gt)
    const knownRegression = buildDshWmConformance({
      baseline: oracle,
      candidate: degraded,
      baselinePredictionTree: DSH_WM_PIN.gtTree,
      candidatePredictionTree: DSH_WM_PIN.predTree,
      scenario: 'oracle-regression',
    })
    const oracleRecovery = buildDshWmConformance({
      baseline: degraded,
      candidate: oracle,
      baselinePredictionTree: DSH_WM_PIN.predTree,
      candidatePredictionTree: DSH_WM_PIN.gtTree,
      scenario: 'oracle-recovery',
    })

    assertExpectedMeasurement(knownRegression.measurements.candidate)
    assertStableArtifactIdentities(knownRegression, oracleRecovery)
    assertExpectedRejection(knownRegression.decision)
    assertExpectedPromotion(oracleRecovery.decision)
    process.stdout.write(
      `${JSON.stringify({ knownRegression, oracleRecovery }, null, 2)}\n`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`dsh-wm conformance: ${message}`)
    process.exitCode = 1
  }
}

function verifyPinnedCheckout(checkout) {
  const expectedObjects = new Map([
    ['HEAD', DSH_WM_PIN.commit],
    ['HEAD:package.json', DSH_WM_PIN.packageJsonBlob],
    ['HEAD:fixtures/sunset', DSH_WM_PIN.fixtureTree],
    ['HEAD:fixtures/sunset/pred', DSH_WM_PIN.predTree],
    ['HEAD:fixtures/sunset/gt', DSH_WM_PIN.gtTree],
    ...Object.entries(DSH_WM_PIN.scorerBlobs).map(([path, objectId]) => [
      `HEAD:${path}`,
      objectId,
    ]),
  ])

  for (const [revision, expected] of expectedObjects) {
    const actual = git(checkout, ['rev-parse', revision])
    if (actual !== expected) {
      throw new Error(
        `Pinned checkout verification failed for ${revision}: ` +
          `expected ${expected}, found ${actual}.`,
      )
    }
  }

  const relevantPaths = [
    'package.json',
    ...Object.keys(DSH_WM_PIN.scorerBlobs),
    DSH_WM_PIN.fixture,
  ]
  const changes = git(checkout, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    ...relevantPaths,
  ])
  if (changes !== '') {
    throw new Error(
      `Pinned checkout has modified or untracked evaluator inputs:\n${changes}`,
    )
  }
}

function git(checkout, arguments_) {
  return execFileSync('git', ['-C', checkout, ...arguments_], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim()
}

function assertExpectedMeasurement(actual) {
  for (const [key, expected] of Object.entries(EXPECTED_SUNSET_MEASUREMENT)) {
    if (Array.isArray(expected)) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected)) {
        throw new Error(`Unexpected pinned Sunset ${key}.`)
      }
    } else if (actual[key] !== expected) {
      throw new Error(
        `Unexpected pinned Sunset ${key}: expected ${expected}, found ${actual[key]}.`,
      )
    }
  }
}

function assertStableArtifactIdentities(knownRegression, oracleRecovery) {
  if (
    knownRegression.evidence.candidateDigest !==
      oracleRecovery.evidence.baselineDigest ||
    knownRegression.evidence.baselineDigest !==
      oracleRecovery.evidence.candidateDigest
  ) {
    throw new Error('Prediction artifact digests changed across demo roles.')
  }
}

function assertExpectedPromotion(decision) {
  if (!decision.accepted || decision.reasons.length !== 0) {
    throw new Error('Sunset oracle-recovery fixture was unexpectedly rejected.')
  }
}

function assertExpectedRejection(decision) {
  if (decision.accepted) {
    throw new Error('Sunset regression was unexpectedly accepted.')
  }

  const actualCodes = new Set(decision.reasons.map((reason) => reason.code))
  for (const code of EXPECTED_REJECTION_CODES) {
    if (!actualCodes.has(code)) {
      throw new Error(`Expected rejection reason ${code} was not produced.`)
    }
  }
}
