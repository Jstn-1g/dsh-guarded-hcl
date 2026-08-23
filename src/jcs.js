import { createHash } from 'node:crypto'

export const JCS_SHA256_PROFILE =
  'urn:dsh-guarded-hcl:digest-profile:jcs-sha256:v0.1'

/** Error raised when input cannot be represented by the JCS profile. */
export class JcsError extends TypeError {
  constructor(code, message) {
    super(message)
    this.name = 'JcsError'
    this.code = code
  }
}

/**
 * Parse JSON text while enforcing the I-JSON constraints required by RFC 8785.
 * In particular, escaped-equivalent duplicate property names are rejected
 * before JSON.parse can silently overwrite them.
 *
 * @param {string} source
 * @returns {unknown}
 */
export function parseIJson(source) {
  if (typeof source !== 'string') {
    throw new JcsError('INVALID_JSON', 'JSON input must be a string.')
  }
  scanJsonText(source)
  let value
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw new JcsError('INVALID_JSON', `Invalid JSON: ${error.message}`)
  }
  validateJcsValue(value)
  return value
}

/**
 * Serialize an in-memory JSON value using RFC 8785 JCS.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalizeJcs(value) {
  validateJcsValue(value)
  return serialize(value)
}

/** @param {string} source */
export function canonicalizeJsonText(source) {
  return canonicalizeJcs(parseIJson(source))
}

/** @param {unknown} value */
export function digestJcs(value) {
  return digestCanonical(canonicalizeJcs(value))
}

/** @param {string} source */
export function digestJsonText(source) {
  return digestCanonical(canonicalizeJsonText(source))
}

function digestCanonical(canonical) {
  const value = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return `sha256:${value}`
}

function serialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    return `[${Array.from(
      { length: value.length },
      (_, index) => serialize(descriptors[index].value),
    ).join(',')}]`
  }
  const object = /** @type {Record<string, unknown>} */ (value)
  const descriptors = Object.getOwnPropertyDescriptors(object)
  return `{${Object.keys(descriptors)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serialize(descriptors[key].value)}`)
    .join(',')}}`
}

/** @param {unknown} value */
function validateJcsValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'string') {
    assertUnicodeScalarSequence(value)
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new JcsError(
        'NON_FINITE_NUMBER',
        'JCS does not permit NaN or Infinity.',
      )
    }
    return
  }
  if (typeof value !== 'object') {
    throw new JcsError(
      'UNSUPPORTED_VALUE',
      `JCS does not permit values of type ${typeof value}.`,
    )
  }
  if (ancestors.has(value)) {
    throw new JcsError('CYCLIC_VALUE', 'JCS does not permit cyclic values.')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length !== 0) {
        throw new JcsError(
          'UNSUPPORTED_VALUE',
          'JCS does not permit symbol properties on arrays.',
        )
      }
      const descriptors = Object.getOwnPropertyDescriptors(value)
      const propertyNames = Object.getOwnPropertyNames(value)
      const expectedNames = [
        ...Array.from({ length: value.length }, (_, index) => String(index)),
        'length',
      ]
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(descriptors, index)) {
          throw new JcsError(
            'UNSUPPORTED_VALUE',
            'JCS does not permit sparse arrays.',
          )
        }
      }
      if (
        propertyNames.length !== expectedNames.length ||
        expectedNames.some((name) => !Object.hasOwn(descriptors, name))
      ) {
        throw new JcsError(
          'UNSUPPORTED_VALUE',
          'JCS arrays may contain indexed JSON values only.',
        )
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[index]
        if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
          throw new JcsError(
            'UNSUPPORTED_VALUE',
            'JCS arrays must use enumerable data properties.',
          )
        }
        validateJcsValue(descriptor.value, ancestors)
      }
      return
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new JcsError(
        'UNSUPPORTED_VALUE',
        'JCS input must use plain JSON objects.',
      )
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      throw new JcsError('UNSUPPORTED_VALUE', 'JCS does not permit symbol keys.')
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const names = Object.keys(descriptors)
    const enumerableNames = Object.keys(value)
    if (names.length !== enumerableNames.length) {
      throw new JcsError(
        'UNSUPPORTED_VALUE',
        'JCS does not permit hidden object properties.',
      )
    }
    for (const key of enumerableNames) {
      const descriptor = descriptors[key]
      if (!Object.hasOwn(descriptor, 'value')) {
        throw new JcsError(
          'UNSUPPORTED_VALUE',
          'JCS does not permit accessor properties.',
        )
      }
      assertUnicodeScalarSequence(key)
      validateJcsValue(descriptor.value, ancestors)
    }
  } finally {
    ancestors.delete(value)
  }
}

function assertUnicodeScalarSequence(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new JcsError(
          'LONE_SURROGATE',
          'JCS does not permit lone Unicode surrogates.',
        )
      }
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new JcsError(
        'LONE_SURROGATE',
        'JCS does not permit lone Unicode surrogates.',
      )
    }
  }
}

/** Detect duplicate names without replacing the platform JSON parser. */
function scanJsonText(source) {
  let index = 0

  function fail(message, code = 'INVALID_JSON') {
    throw new JcsError(code, `${message} at offset ${index}.`)
  }

  function whitespace() {
    while (/\s/u.test(source[index] ?? '') && index < source.length) index += 1
  }

  function string() {
    const start = index
    if (source[index] !== '"') fail('Expected a JSON string')
    index += 1
    while (index < source.length) {
      const code = source.charCodeAt(index)
      if (source[index] === '"') {
        index += 1
        try {
          return JSON.parse(source.slice(start, index))
        } catch (error) {
          fail(`Invalid JSON string: ${error.message}`)
        }
      }
      if (source[index] === '\\') {
        index += 1
        const escape = source[index]
        if (escape === 'u') {
          const hex = source.slice(index + 1, index + 5)
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) fail('Invalid Unicode escape')
          index += 5
          continue
        }
        if (!'"\\/bfnrt'.includes(escape ?? '')) fail('Invalid string escape')
        index += 1
        continue
      }
      if (code <= 0x1f) fail('Unescaped control character in JSON string')
      index += 1
    }
    fail('Unterminated JSON string')
  }

  function number() {
    const match = source
      .slice(index)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u)
    if (!match) fail('Invalid JSON number')
    index += match[0].length
  }

  function literal(expected) {
    if (!source.startsWith(expected, index)) fail(`Expected ${expected}`)
    index += expected.length
  }

  function array() {
    index += 1
    whitespace()
    if (source[index] === ']') {
      index += 1
      return
    }
    while (true) {
      value()
      whitespace()
      if (source[index] === ']') {
        index += 1
        return
      }
      if (source[index] !== ',') fail('Expected comma or closing bracket')
      index += 1
      whitespace()
    }
  }

  function object() {
    index += 1
    const keys = new Set()
    whitespace()
    if (source[index] === '}') {
      index += 1
      return
    }
    while (true) {
      const key = string()
      if (keys.has(key)) {
        fail(`Duplicate JSON property ${JSON.stringify(key)}`, 'DUPLICATE_PROPERTY')
      }
      keys.add(key)
      whitespace()
      if (source[index] !== ':') fail('Expected colon after object property')
      index += 1
      value()
      whitespace()
      if (source[index] === '}') {
        index += 1
        return
      }
      if (source[index] !== ',') fail('Expected comma or closing brace')
      index += 1
      whitespace()
    }
  }

  function value() {
    whitespace()
    const token = source[index]
    if (token === '{') object()
    else if (token === '[') array()
    else if (token === '"') string()
    else if (token === 't') literal('true')
    else if (token === 'f') literal('false')
    else if (token === 'n') literal('null')
    else number()
  }

  value()
  whitespace()
  if (index !== source.length) fail('Unexpected trailing JSON input')
}
