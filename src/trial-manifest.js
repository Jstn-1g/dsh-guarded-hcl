import { ARTIFACT_SHA256_PROFILE } from './artifact.js'
import {
  JCS_SHA256_PROFILE,
  canonicalizeJcs,
  digestJcs,
  parseIJson,
} from './jcs.js'
import {
  RUNNER_BINDING_SCHEMA_URI,
  RUNNER_BINDING_SCHEMA_URI_PATTERN,
} from './runner-binding.js'

export const TRIAL_MANIFEST_SCHEMA_VERSION = '0.1'
export const TRIAL_MANIFEST_SCHEMA_URI =
  'https://raw.githubusercontent.com/Jstn-1g/dsh-guarded-hcl/main/schemas/trial-manifest-v0.1.schema.json'
export const TRIAL_MANIFEST_DIGEST_PROFILE = JCS_SHA256_PROFILE
export const TRIAL_MANIFEST_IDENTIFIER_PATTERN =
  String.raw`^(?:[\u0000-\uD7FF\uE000-\u{10FFFF}])+$`

const MANIFEST_FIELDS = [
  'schemaVersion',
  'identities',
  'baseline',
  'candidate',
  'runnerBindingRef',
  'currentTask',
  'retentionAnchors',
  'validityChecks',
  'cost',
  'trialIds',
]
const IDENTITY_FIELDS = ['task', 'model', 'environment', 'dataset', 'grader']
const SUBJECT_FIELDS = ['recipe', 'artifact']
const RECIPE_FIELDS = [
  'recipeId',
  'schemaUri',
  'digestProfile',
  'digest',
]
const ARTIFACT_FIELDS = ['profile', 'kind', 'digest']
const RUNNER_BINDING_REFERENCE_FIELDS = [
  'schemaUri',
  'digestProfile',
  'digest',
]
const CURRENT_TASK_FIELDS = ['metric', 'direction']
const RETENTION_ANCHOR_FIELDS = [
  'metric',
  'direction',
  'required',
  'weight',
  'maximumLoss',
]
const VALIDITY_CHECK_FIELDS = ['severity']
const COST_FIELDS = ['metric']
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u
const SCHEMA_URI = new RegExp(RUNNER_BINDING_SCHEMA_URI_PATTERN, 'u')

/** Error raised when a value is not a TrialManifest v0.1 document. */
export class TrialManifestError extends TypeError {
  constructor(code, message) {
    super(message)
    this.name = 'TrialManifestError'
    this.code = code
  }
}

/**
 * Validate an in-memory TrialManifest v0.1 value and return a safe data copy.
 *
 * Validation is structural and deterministic. It does not resolve references,
 * read artifacts, execute trials, or verify that the declared identities are
 * truthful.
 *
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function validateTrialManifest(value) {
  const manifest = readExactRecord(value, MANIFEST_FIELDS, 'trialManifest')
  if (manifest.schemaVersion !== TRIAL_MANIFEST_SCHEMA_VERSION) {
    throw new TrialManifestError(
      'UNSUPPORTED_VERSION',
      `trialManifest.schemaVersion must equal ${JSON.stringify(TRIAL_MANIFEST_SCHEMA_VERSION)}.`,
    )
  }

  const identities = readExactRecord(
    manifest.identities,
    IDENTITY_FIELDS,
    'trialManifest.identities',
  )
  const normalizedIdentities = Object.fromEntries(
    IDENTITY_FIELDS.map((name) => [
      name,
      identifierField(identities[name], `trialManifest.identities.${name}`),
    ]),
  )

  const currentTask = readExactRecord(
    manifest.currentTask,
    CURRENT_TASK_FIELDS,
    'trialManifest.currentTask',
  )
  const direction = maximizeDirection(
    currentTask.direction,
    'trialManifest.currentTask.direction',
  )

  const retentionAnchors = definitionMap(
    manifest.retentionAnchors,
    'trialManifest.retentionAnchors',
    (definition, path) => {
      const anchor = readExactRecord(
        definition,
        RETENTION_ANCHOR_FIELDS,
        path,
      )
      return {
        metric: identifierField(anchor.metric, `${path}.metric`),
        direction: maximizeDirection(anchor.direction, `${path}.direction`),
        required: booleanField(anchor.required, `${path}.required`),
        weight: positiveNumberField(anchor.weight, `${path}.weight`),
        maximumLoss: nonNegativeNumberField(
          anchor.maximumLoss,
          `${path}.maximumLoss`,
        ),
      }
    },
  )

  const validityChecks = definitionMap(
    manifest.validityChecks,
    'trialManifest.validityChecks',
    (definition, path) => {
      const check = readExactRecord(
        definition,
        VALIDITY_CHECK_FIELDS,
        path,
      )
      return {
        severity: identifierField(check.severity, `${path}.severity`),
      }
    },
  )

  let cost = null
  if (manifest.cost !== null) {
    const costDefinition = readExactRecord(
      manifest.cost,
      COST_FIELDS,
      'trialManifest.cost',
    )
    cost = {
      metric: identifierField(costDefinition.metric, 'trialManifest.cost.metric'),
    }
  }

  const trialIds = readDenseArray(manifest.trialIds, 'trialManifest.trialIds')
    .map((trialId, index) =>
      identifierField(trialId, `trialManifest.trialIds[${index}]`),
    )
  if (trialIds.length < 2 || trialIds.length > 30) {
    throw new TrialManifestError(
      'INVALID_TRIAL_SET',
      'trialManifest.trialIds must contain between 2 and 30 entries.',
    )
  }
  const seenTrialIds = new Set()
  for (const trialId of trialIds) {
    if (seenTrialIds.has(trialId)) {
      throw new TrialManifestError(
        'INVALID_TRIAL_SET',
        `trialManifest.trialIds must not contain duplicate value ${JSON.stringify(trialId)}.`,
      )
    }
    seenTrialIds.add(trialId)
  }

  return {
    schemaVersion: TRIAL_MANIFEST_SCHEMA_VERSION,
    identities: normalizedIdentities,
    baseline: subjectReference(manifest.baseline, 'trialManifest.baseline'),
    candidate: subjectReference(manifest.candidate, 'trialManifest.candidate'),
    runnerBindingRef: runnerBindingReference(manifest.runnerBindingRef),
    currentTask: {
      metric: identifierField(
        currentTask.metric,
        'trialManifest.currentTask.metric',
      ),
      direction,
    },
    retentionAnchors,
    validityChecks,
    cost,
    trialIds,
  }
}

/** Parse duplicate-safe I-JSON text and validate it as TrialManifest v0.1. */
export function parseTrialManifest(source) {
  return validateTrialManifest(parseIJson(source))
}

/** Validate and serialize TrialManifest v0.1 with RFC 8785 JCS. */
export function canonicalizeTrialManifest(value) {
  return canonicalizeJcs(validateTrialManifest(value))
}

/** Validate and return the JCS + SHA-256 digest of TrialManifest v0.1. */
export function digestTrialManifest(value) {
  return digestJcs(validateTrialManifest(value))
}

/** @param {unknown} value @param {string} path */
function subjectReference(value, path) {
  const subject = readExactRecord(value, SUBJECT_FIELDS, path)
  return {
    recipe: recipeReference(subject.recipe, `${path}.recipe`),
    artifact: artifactIdentity(subject.artifact, `${path}.artifact`),
  }
}

/** @param {unknown} value @param {string} path */
function recipeReference(value, path) {
  const reference = readExactRecord(value, RECIPE_FIELDS, path)
  if (reference.digestProfile !== JCS_SHA256_PROFILE) {
    throw new TrialManifestError(
      'UNSUPPORTED_DIGEST_PROFILE',
      `${path}.digestProfile must equal ${JSON.stringify(JCS_SHA256_PROFILE)}.`,
    )
  }
  return {
    recipeId: identifierField(reference.recipeId, `${path}.recipeId`),
    schemaUri: schemaUriField(reference.schemaUri, `${path}.schemaUri`),
    digestProfile: JCS_SHA256_PROFILE,
    digest: digestField(reference.digest, `${path}.digest`),
  }
}

/** @param {unknown} value @param {string} path */
function artifactIdentity(value, path) {
  const artifact = readExactRecord(value, ARTIFACT_FIELDS, path)
  if (artifact.profile !== ARTIFACT_SHA256_PROFILE) {
    throw new TrialManifestError(
      'UNSUPPORTED_ARTIFACT_PROFILE',
      `${path}.profile must equal ${JSON.stringify(ARTIFACT_SHA256_PROFILE)}.`,
    )
  }
  if (artifact.kind !== 'tree' && artifact.kind !== 'blob') {
    throw new TrialManifestError(
      'INVALID_ARTIFACT_KIND',
      `${path}.kind must equal "tree" or "blob".`,
    )
  }
  return {
    profile: ARTIFACT_SHA256_PROFILE,
    kind: artifact.kind,
    digest: digestField(artifact.digest, `${path}.digest`),
  }
}

/** @param {unknown} value */
function runnerBindingReference(value) {
  const path = 'trialManifest.runnerBindingRef'
  const reference = readExactRecord(
    value,
    RUNNER_BINDING_REFERENCE_FIELDS,
    path,
  )
  if (reference.schemaUri !== RUNNER_BINDING_SCHEMA_URI) {
    throw new TrialManifestError(
      'UNSUPPORTED_RUNNER_BINDING_SCHEMA',
      `${path}.schemaUri must equal ${JSON.stringify(RUNNER_BINDING_SCHEMA_URI)}.`,
    )
  }
  if (reference.digestProfile !== JCS_SHA256_PROFILE) {
    throw new TrialManifestError(
      'UNSUPPORTED_DIGEST_PROFILE',
      `${path}.digestProfile must equal ${JSON.stringify(JCS_SHA256_PROFILE)}.`,
    )
  }
  return {
    schemaUri: RUNNER_BINDING_SCHEMA_URI,
    digestProfile: JCS_SHA256_PROFILE,
    digest: digestField(reference.digest, `${path}.digest`),
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {(value: unknown, path: string) => unknown} validateDefinition
 */
function definitionMap(value, path, validateDefinition) {
  const definitions = readDataRecord(value, path)
  if (Object.keys(definitions).length === 0) {
    throw invalidManifest(`${path} must contain at least one definition.`)
  }
  return Object.fromEntries(
    Object.entries(definitions).map(([identifier, definition]) => {
      identifierField(identifier, `${path} property name`)
      return [
        identifier,
        validateDefinition(definition, `${path}[${JSON.stringify(identifier)}]`),
      ]
    }),
  )
}

/** @param {unknown} value @param {string[]} expectedFields @param {string} path */
function readExactRecord(value, expectedFields, path) {
  const record = readDataRecord(value, path)
  const actualFields = Object.keys(record)
  for (const name of actualFields) {
    if (!expectedFields.includes(name)) {
      throw invalidManifest(`${path}.${name} is not allowed.`)
    }
  }
  for (const name of expectedFields) {
    if (!Object.hasOwn(record, name)) {
      throw invalidManifest(`${path}.${name} is required.`)
    }
  }
  return Object.fromEntries(expectedFields.map((name) => [name, record[name]]))
}

/** @param {unknown} value @param {string} path */
function readDataRecord(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidManifest(`${path} must be a plain data object.`)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalidManifest(`${path} must be a plain data object.`)
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw invalidManifest(`${path} must not contain symbol properties.`)
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidManifest(`${path}.${name} must be an enumerable data property.`)
    }
  }
  return Object.fromEntries(
    Object.entries(descriptors).map(([name, descriptor]) => [
      name,
      descriptor.value,
    ]),
  )
}

/** @param {unknown} value @param {string} path */
function readDenseArray(value, path) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw invalidManifest(`${path} must be a dense array.`)
  }
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw invalidManifest(`${path} must be a plain data array.`)
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const propertyNames = Object.getOwnPropertyNames(value)
  const expectedNames = [
    ...Array.from({ length: value.length }, (_, index) => String(index)),
    'length',
  ]
  if (
    propertyNames.length !== expectedNames.length ||
    expectedNames.some((name) => !Object.hasOwn(descriptors, name))
  ) {
    throw invalidManifest(`${path} must be a dense array with no extra properties.`)
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[index]
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidManifest(`${path} must use enumerable data properties.`)
    }
    return descriptor.value
  })
}

/** @param {unknown} value @param {string} path */
function identifierField(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TrialManifestError(
      'INVALID_IDENTIFIER',
      `${path} must be a non-empty string.`,
    )
  }
  assertUnicodeScalarSequence(value, path)
  return value
}

/** @param {unknown} value @param {string} path */
function schemaUriField(value, path) {
  if (typeof value !== 'string' || !SCHEMA_URI.test(value)) {
    throw new TrialManifestError(
      'INVALID_SCHEMA_URI',
      `${path} must match the RunnerBinding v0.1 lowercase https/URN ASCII schema-URI profile.`,
    )
  }
  return value
}

/** @param {unknown} value @param {string} path */
function digestField(value, path) {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) {
    throw new TrialManifestError(
      'INVALID_DIGEST',
      `${path} must be "sha256:" followed by 64 lowercase hexadecimal digits.`,
    )
  }
  return value
}

/** @param {unknown} value @param {string} path */
function maximizeDirection(value, path) {
  if (value !== 'maximize') {
    throw new TrialManifestError(
      'UNSUPPORTED_DIRECTION',
      `${path} must equal "maximize".`,
    )
  }
  return value
}

/** @param {unknown} value @param {string} path */
function booleanField(value, path) {
  if (typeof value !== 'boolean') {
    throw invalidManifest(`${path} must be a boolean.`)
  }
  return value
}

/** @param {unknown} value @param {string} path */
function nonNegativeNumberField(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw invalidManifest(`${path} must be a finite non-negative number.`)
  }
  return Object.is(value, -0) ? 0 : value
}

/** @param {unknown} value @param {string} path */
function positiveNumberField(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw invalidManifest(`${path} must be a finite number greater than zero.`)
  }
  return value
}

/** @param {string} message */
function invalidManifest(message) {
  return new TrialManifestError('INVALID_MANIFEST', message)
}

/** @param {string} value @param {string} path */
function assertUnicodeScalarSequence(value, path) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TrialManifestError(
          'INVALID_IDENTIFIER',
          `${path} must not contain lone Unicode surrogates.`,
        )
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TrialManifestError(
        'INVALID_IDENTIFIER',
        `${path} must not contain lone Unicode surrogates.`,
      )
    }
  }
}
