import { createHash } from 'node:crypto'
import { digestJcs } from './jcs.js'

export const ARTIFACT_SHA256_PROFILE =
  'urn:dsh-guarded-hcl:digest-profile:artifact-jcs-sha256:v0.1'

const REGULAR_MODES = new Set(['100644', '100755'])
const UNSUPPORTED_ENTRY_MODES = new Set(['040000', '120000', '160000'])

/** Error raised when an artifact cannot be represented by this profile. */
export class ArtifactProfileError extends TypeError {
  constructor(code, message) {
    super(message)
    this.name = 'ArtifactProfileError'
    this.code = code
  }
}

/**
 * Validate a caller-supplied canonical relative POSIX path and return it
 * unchanged for use in the artifact manifest.
 *
 * @param {string} source
 * @returns {string}
 */
export function validateArtifactPath(source) {
  if (typeof source !== 'string') {
    throw new ArtifactProfileError(
      'INVALID_PATH',
      'Artifact paths must be strings.',
    )
  }
  assertUnicodeScalarSequence(source, 'Artifact paths')
  if (source.startsWith('/') || /^[A-Za-z]:/u.test(source)) {
    throw new ArtifactProfileError(
      'INVALID_PATH',
      'Artifact paths must be relative, not absolute or drive-qualified.',
    )
  }
  if (source.includes('\\')) {
    throw new ArtifactProfileError(
      'INVALID_PATH',
      'Artifact paths must use POSIX forward-slash separators.',
    )
  }

  const segments = source.split('/')
  for (const segment of segments) {
    if (segment === '') {
      throw new ArtifactProfileError(
        'INVALID_PATH',
        'Artifact paths must not contain empty segments.',
      )
    }
    if (segment === '.' || segment === '..') {
      throw new ArtifactProfileError(
        'INVALID_PATH',
        'Artifact paths must not contain dot segments.',
      )
    }
    if (
      Array.from(segment).some((character) => {
        const codePoint = character.codePointAt(0)
        return (
          codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
        )
      })
    ) {
      throw new ArtifactProfileError(
        'INVALID_PATH',
        'Artifact path segments must not contain control characters.',
      )
    }
  }
  return source
}

/**
 * Build the JCS data model hashed by the artifact profile.
 *
 * The caller supplies raw bytes from one immutable snapshot. This function
 * deliberately does not traverse a checkout or infer executable modes from
 * the host filesystem.
 *
 * @param {unknown} artifact
 * @returns {Record<string, unknown>}
 */
export function createArtifactManifest(artifact) {
  const input = readRecord(artifact, ['kind', 'entries', 'bytes'], 'artifact')
  if (input.kind === 'blob') {
    assertExactFields(input, ['kind', 'bytes'], 'blob artifact')
    const bytes = copyBytes(input.bytes)
    return {
      profile: ARTIFACT_SHA256_PROFILE,
      kind: 'blob',
      byteLength: bytes.byteLength,
      contentDigest: digestBytes(bytes),
    }
  }
  if (input.kind !== 'tree') {
    throw new ArtifactProfileError(
      'INVALID_ARTIFACT',
      'Artifact kind must be "tree" or "blob".',
    )
  }

  assertExactFields(input, ['kind', 'entries'], 'tree artifact')
  const entries = readDenseArray(input.entries, 'tree entries').map(
    (entry, index) => {
      const fields = readRecord(
        entry,
        ['path', 'mode', 'bytes'],
        `tree entry ${index}`,
      )
      assertExactFields(fields, ['path', 'mode', 'bytes'], `tree entry ${index}`)
      if (!REGULAR_MODES.has(fields.mode)) {
        const code = UNSUPPORTED_ENTRY_MODES.has(fields.mode)
          ? 'UNSUPPORTED_ENTRY_TYPE'
          : 'INVALID_MODE'
        throw new ArtifactProfileError(
          code,
          'Tree entry mode must be regular file mode "100644" or "100755".',
        )
      }
      const path = validateArtifactPath(/** @type {string} */ (fields.path))
      const bytes = copyBytes(fields.bytes)
      return {
        path,
        mode: fields.mode,
        byteLength: bytes.byteLength,
        contentDigest: digestBytes(bytes),
      }
    },
  )

  entries.sort((left, right) =>
    Buffer.compare(
      Buffer.from(left.path, 'utf8'),
      Buffer.from(right.path, 'utf8'),
    ),
  )
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].path === entries[index].path) {
      throw new ArtifactProfileError(
        'DUPLICATE_PATH',
        `Artifact path is duplicated: ${JSON.stringify(entries[index].path)}.`,
      )
    }
  }
  const paths = new Set(entries.map((entry) => entry.path))
  for (const entry of entries) {
    let separatorIndex = entry.path.indexOf('/')
    while (separatorIndex !== -1) {
      const ancestor = entry.path.slice(0, separatorIndex)
      if (paths.has(ancestor)) {
        throw new ArtifactProfileError(
          'PATH_PREFIX_COLLISION',
          `Artifact file path ${JSON.stringify(ancestor)} is an ancestor of ${JSON.stringify(entry.path)}.`,
        )
      }
      separatorIndex = entry.path.indexOf('/', separatorIndex + 1)
    }
  }

  return {
    profile: ARTIFACT_SHA256_PROFILE,
    kind: 'tree',
    entries,
  }
}

/** @param {unknown} artifact */
export function digestArtifact(artifact) {
  return digestJcs(createArtifactManifest(artifact))
}

/** @param {Uint8Array} bytes */
function digestBytes(bytes) {
  const digest = createHash('sha256').update(bytes).digest('hex')
  return `sha256:${digest}`
}

/** @param {unknown} value */
function copyBytes(value) {
  if (!(value instanceof Uint8Array)) {
    throw new ArtifactProfileError(
      'INVALID_BYTES',
      'Artifact content must be supplied as a Uint8Array of raw bytes.',
    )
  }
  return Buffer.from(value)
}

/**
 * Read a plain data object without invoking accessors.
 *
 * @param {unknown} value
 * @param {string[]} allowedFields
 * @param {string} label
 */
function readRecord(value, allowedFields, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ArtifactProfileError(
      'INVALID_ARTIFACT',
      `${label} must be a plain data object.`,
    )
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ArtifactProfileError(
      'INVALID_ARTIFACT',
      `${label} must be a plain data object.`,
    )
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new ArtifactProfileError(
      'INVALID_ARTIFACT',
      `${label} must not contain symbol properties.`,
    )
  }

  const descriptors = Object.getOwnPropertyDescriptors(value)
  const result = Object.create(null)
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (!allowedFields.includes(name)) {
      throw new ArtifactProfileError(
        'INVALID_ARTIFACT',
        `${label} contains unknown field ${JSON.stringify(name)}.`,
      )
    }
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ArtifactProfileError(
        'INVALID_ARTIFACT',
        `${label} must use enumerable data properties only.`,
      )
    }
    result[name] = descriptor.value
  }
  return result
}

/**
 * @param {Record<string, unknown>} value
 * @param {string[]} expectedFields
 * @param {string} label
 */
function assertExactFields(value, expectedFields, label) {
  const actualFields = Object.keys(value)
  if (
    actualFields.length !== expectedFields.length ||
    expectedFields.some((field) => !Object.hasOwn(value, field))
  ) {
    throw new ArtifactProfileError(
      'INVALID_ARTIFACT',
      `${label} must contain exactly ${expectedFields.join(', ')}.`,
    )
  }
}

/** @param {unknown} value @param {string} label */
function readDenseArray(value, label) {
  if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new ArtifactProfileError(
      'INVALID_ARTIFACT',
      `${label} must be a dense array.`,
    )
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
    throw new ArtifactProfileError(
      'INVALID_ARTIFACT',
      `${label} must be a dense array with no extra properties.`,
    )
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[index]
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ArtifactProfileError(
        'INVALID_ARTIFACT',
        `${label} must use enumerable data properties.`,
      )
    }
    return descriptor.value
  })
}

/** @param {string} value @param {string} label */
function assertUnicodeScalarSequence(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new ArtifactProfileError(
          'INVALID_PATH',
          `${label} must not contain lone Unicode surrogates.`,
        )
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new ArtifactProfileError(
        'INVALID_PATH',
        `${label} must not contain lone Unicode surrogates.`,
      )
    }
  }
}
