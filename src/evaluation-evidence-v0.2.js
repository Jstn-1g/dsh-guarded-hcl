import {
  RUNNER_BINDING_DIGEST_PROFILE,
  RUNNER_BINDING_SCHEMA_URI,
  RunnerBindingError,
  digestRunnerBinding,
  validateRunnerBinding,
} from './runner-binding.js'

export const EVALUATION_EVIDENCE_V02_SCHEMA_VERSION = '0.2'
export const EVALUATION_EVIDENCE_V02_SCHEMA_URI =
  'https://raw.githubusercontent.com/Jstn-1g/dsh-guarded-hcl/main/schemas/evaluation-evidence-v0.2.schema.json'

const REFERENCE_FIELDS = ['schemaUri', 'digestProfile', 'digest']
const RESOLUTION_FIELDS = ['runnerBinding']
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u

/** Error raised before CommitDecision when a v0.2 binding cannot be verified. */
export class EvaluationEvidenceV02Error extends TypeError {
  constructor(code, message, options) {
    super(message, options)
    this.name = 'EvaluationEvidenceV02Error'
    this.code = code
  }
}

/**
 * Validate and copy the required RunnerBinding reference carried by evidence.
 *
 * @param {unknown} value
 * @returns {{schemaUri: string, digestProfile: string, digest: string}}
 */
export function validateRunnerBindingRef(value) {
  const reference = readExactRecord(
    value,
    REFERENCE_FIELDS,
    'evidence.runnerBindingRef',
    'INVALID_RUNNER_BINDING_REFERENCE',
  )

  if (reference.schemaUri !== RUNNER_BINDING_SCHEMA_URI) {
    throw new EvaluationEvidenceV02Error(
      'UNSUPPORTED_RUNNER_BINDING_SCHEMA',
      `evidence.runnerBindingRef.schemaUri must equal ${JSON.stringify(RUNNER_BINDING_SCHEMA_URI)}.`,
    )
  }
  if (reference.digestProfile !== RUNNER_BINDING_DIGEST_PROFILE) {
    throw new EvaluationEvidenceV02Error(
      'UNSUPPORTED_RUNNER_BINDING_DIGEST_PROFILE',
      `evidence.runnerBindingRef.digestProfile must equal ${JSON.stringify(RUNNER_BINDING_DIGEST_PROFILE)}.`,
    )
  }
  if (
    typeof reference.digest !== 'string' ||
    !SHA256_DIGEST.test(reference.digest)
  ) {
    throw new EvaluationEvidenceV02Error(
      'INVALID_RUNNER_BINDING_DIGEST',
      'evidence.runnerBindingRef.digest must be "sha256:" followed by 64 lowercase hexadecimal digits.',
    )
  }

  return {
    schemaUri: RUNNER_BINDING_SCHEMA_URI,
    digestProfile: RUNNER_BINDING_DIGEST_PROFILE,
    digest: reference.digest,
  }
}

/**
 * Verify one caller-supplied RunnerBinding against a normalized v0.2 evidence
 * record. This function never resolves a URI or reads external state.
 *
 * @param {{
 *   candidateId: string,
 *   candidateDigest: string,
 *   runnerBindingRef: {schemaUri: string, digestProfile: string, digest: string}
 * }} evidence
 * @param {unknown} resolutionInput
 * @returns {ReturnType<typeof validateRunnerBinding>}
 */
export function verifyResolvedRunnerBinding(evidence, resolutionInput) {
  if (resolutionInput === undefined || resolutionInput === null) {
    throw new EvaluationEvidenceV02Error(
      'RUNNER_BINDING_RESOLUTION_REQUIRED',
      'EvaluationEvidence v0.2 requires caller-supplied resolutionInput.runnerBinding.',
    )
  }
  const resolution = readExactRecord(
    resolutionInput,
    RESOLUTION_FIELDS,
    'resolutionInput',
    'INVALID_RUNNER_BINDING_RESOLUTION',
  )

  let binding
  try {
    binding = validateRunnerBinding(resolution.runnerBinding)
  } catch (error) {
    if (error instanceof RunnerBindingError) {
      throw new EvaluationEvidenceV02Error(
        'INVALID_RESOLVED_RUNNER_BINDING',
        `resolutionInput.runnerBinding is invalid: ${error.message}`,
        { cause: error },
      )
    }
    throw error
  }

  const actualDigest = digestRunnerBinding(binding)
  if (actualDigest !== evidence.runnerBindingRef.digest) {
    throw new EvaluationEvidenceV02Error(
      'RUNNER_BINDING_DIGEST_MISMATCH',
      `Resolved RunnerBinding digest ${actualDigest} does not match evidence.runnerBindingRef.digest ${evidence.runnerBindingRef.digest}.`,
    )
  }
  if (binding.candidateId !== evidence.candidateId) {
    throw new EvaluationEvidenceV02Error(
      'RUNNER_BINDING_CANDIDATE_MISMATCH',
      'Resolved RunnerBinding candidateId does not match evidence.candidateId.',
    )
  }
  if (binding.artifact.digest !== evidence.candidateDigest) {
    throw new EvaluationEvidenceV02Error(
      'RUNNER_BINDING_ARTIFACT_MISMATCH',
      'Resolved RunnerBinding artifact.digest does not match evidence.candidateDigest.',
    )
  }

  return binding
}

/**
 * @param {unknown} value
 * @param {string[]} expectedFields
 * @param {string} path
 * @param {string} code
 */
function readExactRecord(value, expectedFields, path, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new EvaluationEvidenceV02Error(
      code,
      `${path} must be a plain data object.`,
    )
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new EvaluationEvidenceV02Error(
      code,
      `${path} must be a plain data object.`,
    )
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new EvaluationEvidenceV02Error(
      code,
      `${path} must not contain symbol properties.`,
    )
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  const names = Object.getOwnPropertyNames(value)
  for (const name of names) {
    if (!expectedFields.includes(name)) {
      throw new EvaluationEvidenceV02Error(
        code,
        `${path}.${name} is not allowed.`,
      )
    }
    const descriptor = descriptors[name]
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new EvaluationEvidenceV02Error(
        code,
        `${path}.${name} must be an enumerable data property.`,
      )
    }
  }
  for (const name of expectedFields) {
    if (!Object.hasOwn(descriptors, name)) {
      throw new EvaluationEvidenceV02Error(
        code,
        `${path}.${name} is required.`,
      )
    }
  }

  return Object.fromEntries(
    expectedFields.map((name) => [name, descriptors[name].value]),
  )
}
