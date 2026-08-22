import { createHash } from 'node:crypto'

/**
 * Convert a JSON-compatible value into a deterministic string.
 * Object keys are sorted recursively; array ordering is preserved.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalStringify(value) {
  return JSON.stringify(sortValue(value))
}

/**
 * Return a SHA-256 digest for a JSON-compatible value.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function digestJson(value) {
  const digest = createHash('sha256')
    .update(canonicalStringify(value), 'utf8')
    .digest('hex')
  return `sha256:${digest}`
}

/** @param {unknown} value */
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue)

  if (value !== null && typeof value === 'object') {
    const object = /** @type {Record<string, unknown>} */ (value)
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, sortValue(object[key])]),
    )
  }

  return value
}
