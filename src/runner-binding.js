import { ARTIFACT_SHA256_PROFILE } from './artifact.js'
import {
  JCS_SHA256_PROFILE,
  canonicalizeJcs,
  digestJcs,
  parseIJson,
} from './jcs.js'

export const RUNNER_BINDING_SCHEMA_VERSION = '0.1'
export const RUNNER_BINDING_SCHEMA_URI =
  'https://raw.githubusercontent.com/Jstn-1g/dsh-guarded-hcl/main/schemas/runner-binding-v0.1.schema.json'
export const RUNNER_BINDING_DIGEST_PROFILE = JCS_SHA256_PROFILE
export const RUNNER_BINDING_CANDIDATE_ID_PATTERN =
  String.raw`^(?:[\u0000-\uD7FF\uE000-\u{10FFFF}])+$`

const URI_PERCENT_ESCAPE = String.raw`%[0-9A-Fa-f]{2}`
const URI_HOST_LABEL =
  String.raw`[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?`
const URI_HOST = String.raw`${URI_HOST_LABEL}(?:\.${URI_HOST_LABEL})*`
const URI_PORT =
  String.raw`(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])`
const URI_PATH_CHARACTER =
  String.raw`(?:[A-Za-z0-9._~!$&'()*+,;=:@-]|${URI_PERCENT_ESCAPE})`
const URI_QUERY_CHARACTER =
  String.raw`(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|${URI_PERCENT_ESCAPE})`
const URI_PATH = String.raw`(?:/${URI_PATH_CHARACTER}*)*`
const URI_QUERY_AND_FRAGMENT =
  String.raw`(?:\?${URI_QUERY_CHARACTER}*)?(?:#${URI_QUERY_CHARACTER}*)?`
const URI_URN_NAMESPACE =
  String.raw`[a-z0-9][a-z0-9-]{0,30}[a-z0-9]`
const URI_URN_NAME =
  String.raw`(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|${URI_PERCENT_ESCAPE})+`
const HTTPS_SCHEMA_URI =
  String.raw`https://${URI_HOST}(?::${URI_PORT})?${URI_PATH}${URI_QUERY_AND_FRAGMENT}`
const URN_SCHEMA_URI =
  String.raw`urn:${URI_URN_NAMESPACE}:${URI_URN_NAME}${URI_QUERY_AND_FRAGMENT}`

export const RUNNER_BINDING_SCHEMA_URI_PATTERN =
  String.raw`^(?:${HTTPS_SCHEMA_URI}|${URN_SCHEMA_URI})$`

const BINDING_FIELDS = [
  'schemaVersion',
  'candidateId',
  'artifact',
  'selectionReceipt',
]
const ARTIFACT_FIELDS = ['profile', 'kind', 'digest']
const RECEIPT_FIELDS = ['schemaUri', 'digestProfile', 'digest']
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u
const SCHEMA_URI = new RegExp(RUNNER_BINDING_SCHEMA_URI_PATTERN, 'u')

/** Error raised when a value is not a RunnerBinding v0.1 document. */
export class RunnerBindingError extends TypeError {
  constructor(code, message) {
    super(message)
    this.name = 'RunnerBindingError'
    this.code = code
  }
}

/**
 * Validate an in-memory RunnerBinding v0.1 value and return a safe data copy.
 *
 * @param {unknown} value
 * @returns {{
 *   schemaVersion: '0.1',
 *   candidateId: string,
 *   artifact: {profile: string, kind: 'tree' | 'blob', digest: string},
 *   selectionReceipt: {schemaUri: string, digestProfile: string, digest: string}
 * }}
 */
export function validateRunnerBinding(value) {
  const binding = readExactRecord(value, BINDING_FIELDS, 'runnerBinding')
  if (binding.schemaVersion !== RUNNER_BINDING_SCHEMA_VERSION) {
    throw new RunnerBindingError(
      'UNSUPPORTED_VERSION',
      `runnerBinding.schemaVersion must equal ${JSON.stringify(RUNNER_BINDING_SCHEMA_VERSION)}.`,
    )
  }

  const candidateId = identifierField(
    binding.candidateId,
    'runnerBinding.candidateId',
  )
  const artifact = readExactRecord(
    binding.artifact,
    ARTIFACT_FIELDS,
    'runnerBinding.artifact',
  )
  if (artifact.profile !== ARTIFACT_SHA256_PROFILE) {
    throw new RunnerBindingError(
      'UNSUPPORTED_ARTIFACT_PROFILE',
      `runnerBinding.artifact.profile must equal ${JSON.stringify(ARTIFACT_SHA256_PROFILE)}.`,
    )
  }
  if (artifact.kind !== 'tree' && artifact.kind !== 'blob') {
    throw new RunnerBindingError(
      'INVALID_ARTIFACT_KIND',
      'runnerBinding.artifact.kind must equal "tree" or "blob".',
    )
  }

  const selectionReceipt = readExactRecord(
    binding.selectionReceipt,
    RECEIPT_FIELDS,
    'runnerBinding.selectionReceipt',
  )
  const schemaUri = schemaUriField(
    selectionReceipt.schemaUri,
    'runnerBinding.selectionReceipt.schemaUri',
  )
  if (selectionReceipt.digestProfile !== JCS_SHA256_PROFILE) {
    throw new RunnerBindingError(
      'UNSUPPORTED_RECEIPT_DIGEST_PROFILE',
      `runnerBinding.selectionReceipt.digestProfile must equal ${JSON.stringify(JCS_SHA256_PROFILE)}.`,
    )
  }

  return {
    schemaVersion: RUNNER_BINDING_SCHEMA_VERSION,
    candidateId,
    artifact: {
      profile: ARTIFACT_SHA256_PROFILE,
      kind: artifact.kind,
      digest: digestField(
        artifact.digest,
        'runnerBinding.artifact.digest',
      ),
    },
    selectionReceipt: {
      schemaUri,
      digestProfile: JCS_SHA256_PROFILE,
      digest: digestField(
        selectionReceipt.digest,
        'runnerBinding.selectionReceipt.digest',
      ),
    },
  }
}

/** Parse duplicate-safe I-JSON text and validate it as RunnerBinding v0.1. */
export function parseRunnerBinding(source) {
  return validateRunnerBinding(parseIJson(source))
}

/** Validate and serialize RunnerBinding v0.1 with RFC 8785 JCS. */
export function canonicalizeRunnerBinding(value) {
  return canonicalizeJcs(validateRunnerBinding(value))
}

/** Validate and return the JCS + SHA-256 digest of RunnerBinding v0.1. */
export function digestRunnerBinding(value) {
  return digestJcs(validateRunnerBinding(value))
}

/** @param {unknown} value @param {string[]} expectedFields @param {string} path */
function readExactRecord(value, expectedFields, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidBinding(`${path} must be a plain data object.`)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalidBinding(`${path} must be a plain data object.`)
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw invalidBinding(`${path} must not contain symbol properties.`)
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  const names = Object.getOwnPropertyNames(value)
  for (const name of names) {
    if (!expectedFields.includes(name)) {
      throw invalidBinding(`${path}.${name} is not allowed.`)
    }
    const descriptor = descriptors[name]
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalidBinding(`${path}.${name} must be an enumerable data property.`)
    }
  }
  for (const name of expectedFields) {
    if (!Object.hasOwn(descriptors, name)) {
      throw invalidBinding(`${path}.${name} is required.`)
    }
  }

  return Object.fromEntries(
    expectedFields.map((name) => [name, descriptors[name].value]),
  )
}

/** @param {unknown} value @param {string} path */
function identifierField(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RunnerBindingError(
      'INVALID_CANDIDATE_ID',
      `${path} must be a non-empty string.`,
    )
  }
  assertUnicodeScalarSequence(value, path, 'INVALID_CANDIDATE_ID')
  return value
}

/** @param {unknown} value @param {string} path */
function digestField(value, path) {
  if (typeof value !== 'string' || !SHA256_DIGEST.test(value)) {
    throw new RunnerBindingError(
      'INVALID_DIGEST',
      `${path} must be "sha256:" followed by 64 lowercase hexadecimal digits.`,
    )
  }
  return value
}

/** @param {unknown} value @param {string} path */
function schemaUriField(value, path) {
  if (typeof value !== 'string' || !SCHEMA_URI.test(value)) {
    throw invalidSchemaUri(path)
  }
  return value
}

/** @param {string} path */
function invalidSchemaUri(path) {
  return new RunnerBindingError(
    'INVALID_SCHEMA_URI',
    `${path} must match the RunnerBinding v0.1 lowercase https/URN ASCII schema-URI profile.`,
  )
}

/** @param {string} message */
function invalidBinding(message) {
  return new RunnerBindingError('INVALID_BINDING', message)
}

/** @param {string} value @param {string} path @param {string} code */
function assertUnicodeScalarSequence(value, path, code) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new RunnerBindingError(
          code,
          `${path} must not contain lone Unicode surrogates.`,
        )
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new RunnerBindingError(
        code,
        `${path} must not contain lone Unicode surrogates.`,
      )
    }
  }
}
