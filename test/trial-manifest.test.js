import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { ARTIFACT_SHA256_PROFILE } from '../src/artifact.js'
import { JCS_SHA256_PROFILE, JcsError } from '../src/jcs.js'
import {
  RUNNER_BINDING_SCHEMA_URI,
  RUNNER_BINDING_SCHEMA_URI_PATTERN,
} from '../src/runner-binding.js'
import {
  TRIAL_MANIFEST_DIGEST_PROFILE,
  TRIAL_MANIFEST_IDENTIFIER_PATTERN,
  TRIAL_MANIFEST_SCHEMA_URI,
  TRIAL_MANIFEST_SCHEMA_VERSION,
  TrialManifestError,
  canonicalizeTrialManifest,
  digestTrialManifest,
  parseTrialManifest,
  validateTrialManifest,
} from '../src/trial-manifest.js'

const example = JSON.parse(
  await readFile(
    new URL('../examples/trial-manifest-v0.1.json', import.meta.url),
    'utf8',
  ),
)
const schema = JSON.parse(
  await readFile(
    new URL('../schemas/trial-manifest-v0.1.schema.json', import.meta.url),
    'utf8',
  ),
)
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  unicodeRegExp: true,
})
const schemaMetaValid = ajv.validateSchema(schema)
const schemaMetaErrors = ajv.errors
const validateSchema = ajv.compile(schema)

const expectedDigest =
  'sha256:c34d6f6739564008a9c0e7fbc85b75faf2d102e180bcae0ec57169fa5c52f7c7'

test('schema freezes the closed TrialManifest v0.1 shape', () => {
  assert.equal(schemaMetaValid, true, ajv.errorsText(schemaMetaErrors))
  assert.equal(schema.$id, TRIAL_MANIFEST_SCHEMA_URI)
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, [
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
  ])
  assert.equal(
    schema.properties.schemaVersion.const,
    TRIAL_MANIFEST_SCHEMA_VERSION,
  )
  assert.equal(schema.$defs.identifier.pattern, TRIAL_MANIFEST_IDENTIFIER_PATTERN)
  assert.equal(schema.$defs.schemaUri.pattern, RUNNER_BINDING_SCHEMA_URI_PATTERN)
  assert.equal(schema.$defs.artifactIdentity.additionalProperties, false)
  assert.equal(
    schema.$defs.artifactIdentity.properties.profile.const,
    ARTIFACT_SHA256_PROFILE,
  )
  assert.equal(
    schema.$defs.recipeReference.properties.digestProfile.const,
    JCS_SHA256_PROFILE,
  )
  assert.equal(
    schema.properties.runnerBindingRef.properties.schemaUri.const,
    RUNNER_BINDING_SCHEMA_URI,
  )
  assert.equal(schema.properties.trialIds.minItems, 2)
  assert.equal(schema.properties.trialIds.maxItems, 30)
  assert.equal(schema.properties.trialIds.uniqueItems, true)
  assert.equal(schema.properties.retentionAnchors.minProperties, 1)
  assert.equal(schema.properties.validityChecks.minProperties, 1)
})

test('validates, canonicalizes, and digests the example deterministically', () => {
  assert.equal(
    validateSchema(example),
    true,
    ajv.errorsText(validateSchema.errors),
  )
  assert.deepEqual(validateTrialManifest(example), example)
  assert.deepEqual(parseTrialManifest(JSON.stringify(example)), example)
  assert.equal(digestTrialManifest(example), expectedDigest)
  assert.equal(TRIAL_MANIFEST_DIGEST_PROFILE, JCS_SHA256_PROFILE)

  const reordered = {
    trialIds: [...example.trialIds],
    cost: { metric: example.cost.metric },
    validityChecks: {
      'permission-boundary': {
        severity: example.validityChecks['permission-boundary'].severity,
      },
      'schema-valid': {
        severity: example.validityChecks['schema-valid'].severity,
      },
    },
    retentionAnchors: {
      'anchor-citation-fidelity': {
        maximumLoss:
          example.retentionAnchors['anchor-citation-fidelity'].maximumLoss,
        weight: example.retentionAnchors['anchor-citation-fidelity'].weight,
        required:
          example.retentionAnchors['anchor-citation-fidelity'].required,
        direction:
          example.retentionAnchors['anchor-citation-fidelity'].direction,
        metric: example.retentionAnchors['anchor-citation-fidelity'].metric,
      },
      'anchor-tool-permission': {
        maximumLoss:
          example.retentionAnchors['anchor-tool-permission'].maximumLoss,
        weight: example.retentionAnchors['anchor-tool-permission'].weight,
        required: example.retentionAnchors['anchor-tool-permission'].required,
        direction: example.retentionAnchors['anchor-tool-permission'].direction,
        metric: example.retentionAnchors['anchor-tool-permission'].metric,
      },
    },
    currentTask: {
      direction: example.currentTask.direction,
      metric: example.currentTask.metric,
    },
    runnerBindingRef: {
      digest: example.runnerBindingRef.digest,
      digestProfile: example.runnerBindingRef.digestProfile,
      schemaUri: example.runnerBindingRef.schemaUri,
    },
    candidate: {
      artifact: {
        digest: example.candidate.artifact.digest,
        kind: example.candidate.artifact.kind,
        profile: example.candidate.artifact.profile,
      },
      recipe: {
        digest: example.candidate.recipe.digest,
        digestProfile: example.candidate.recipe.digestProfile,
        schemaUri: example.candidate.recipe.schemaUri,
        recipeId: example.candidate.recipe.recipeId,
      },
    },
    baseline: {
      artifact: {
        digest: example.baseline.artifact.digest,
        kind: example.baseline.artifact.kind,
        profile: example.baseline.artifact.profile,
      },
      recipe: {
        digest: example.baseline.recipe.digest,
        digestProfile: example.baseline.recipe.digestProfile,
        schemaUri: example.baseline.recipe.schemaUri,
        recipeId: example.baseline.recipe.recipeId,
      },
    },
    identities: {
      grader: example.identities.grader,
      dataset: example.identities.dataset,
      environment: example.identities.environment,
      model: example.identities.model,
      task: example.identities.task,
    },
    schemaVersion: example.schemaVersion,
  }

  assert.equal(
    canonicalizeTrialManifest(reordered),
    canonicalizeTrialManifest(example),
  )
  assert.equal(digestTrialManifest(reordered), expectedDigest)
})

test('the declared trial order is identity-bearing', () => {
  const reorderedTrials = structuredClone(example)
  reorderedTrials.trialIds.reverse()
  assert.notEqual(digestTrialManifest(reorderedTrials), expectedDigest)
})

test('preserves opaque Unicode identities without normalization', () => {
  const nfc = structuredClone(example)
  nfc.identities.task = 'task-café'
  const nfd = structuredClone(example)
  nfd.identities.task = 'task-cafe\u0301'

  assert.equal(validateSchema(nfc), true, ajv.errorsText(validateSchema.errors))
  assert.equal(validateSchema(nfd), true, ajv.errorsText(validateSchema.errors))
  assert.equal(validateTrialManifest(nfc).identities.task, nfc.identities.task)
  assert.equal(validateTrialManifest(nfd).identities.task, nfd.identities.task)
  assert.notEqual(digestTrialManifest(nfc), digestTrialManifest(nfd))
})

const digestBindingCases = [
  ['identities.task', (manifest) => {
    manifest.identities.task = 'task/alternate@1'
  }],
  ['identities.model', (manifest) => {
    manifest.identities.model = 'model/alternate@1'
  }],
  ['identities.environment', (manifest) => {
    manifest.identities.environment = 'environment/alternate@1'
  }],
  ['identities.dataset', (manifest) => {
    manifest.identities.dataset = 'dataset/alternate@1'
  }],
  ['identities.grader', (manifest) => {
    manifest.identities.grader = 'grader/alternate@1'
  }],
  ['baseline.recipe.recipeId', (manifest) => {
    manifest.baseline.recipe.recipeId = 'runner/search-safe@0.8.0'
  }],
  ['baseline.recipe.schemaUri', (manifest) => {
    manifest.baseline.recipe.schemaUri = 'urn:example:baseline-recipe:v0.2'
  }],
  ['baseline.recipe.digest', (manifest) => {
    manifest.baseline.recipe.digest = `sha256:${'4'.repeat(64)}`
  }],
  ['baseline.artifact.kind', (manifest) => {
    manifest.baseline.artifact.kind = 'blob'
  }],
  ['baseline.artifact.digest', (manifest) => {
    manifest.baseline.artifact.digest = `sha256:${'5'.repeat(64)}`
  }],
  ['candidate.recipe.recipeId', (manifest) => {
    manifest.candidate.recipe.recipeId = 'runner/search-safe@1.1.0'
  }],
  ['candidate.recipe.schemaUri', (manifest) => {
    manifest.candidate.recipe.schemaUri = 'urn:example:candidate-recipe:v0.2'
  }],
  ['candidate.recipe.digest', (manifest) => {
    manifest.candidate.recipe.digest = `sha256:${'6'.repeat(64)}`
  }],
  ['candidate.artifact.kind', (manifest) => {
    manifest.candidate.artifact.kind = 'blob'
  }],
  ['candidate.artifact.digest', (manifest) => {
    manifest.candidate.artifact.digest = `sha256:${'7'.repeat(64)}`
  }],
  ['baseline and candidate roles', (manifest) => {
    ;[manifest.baseline, manifest.candidate] = [
      manifest.candidate,
      manifest.baseline,
    ]
  }],
  ['runnerBindingRef.digest', (manifest) => {
    manifest.runnerBindingRef.digest = `sha256:${'8'.repeat(64)}`
  }],
  ['currentTask.metric', (manifest) => {
    manifest.currentTask.metric = 'task_quality'
  }],
  ['retentionAnchors definition identifier', (manifest) => {
    manifest.retentionAnchors['anchor-permission-alternate'] =
      manifest.retentionAnchors['anchor-tool-permission']
    delete manifest.retentionAnchors['anchor-tool-permission']
  }],
  ['retentionAnchors definition membership', (manifest) => {
    delete manifest.retentionAnchors['anchor-citation-fidelity']
  }],
  ['retentionAnchors metric', (manifest) => {
    manifest.retentionAnchors['anchor-tool-permission'].metric =
      'permission_compliance_v2'
  }],
  ['retentionAnchors required', (manifest) => {
    manifest.retentionAnchors['anchor-tool-permission'].required = false
  }],
  ['retentionAnchors weight', (manifest) => {
    manifest.retentionAnchors['anchor-tool-permission'].weight = 3
  }],
  ['retentionAnchors maximumLoss', (manifest) => {
    manifest.retentionAnchors['anchor-tool-permission'].maximumLoss = 0.02
  }],
  ['validityChecks definition identifier', (manifest) => {
    manifest.validityChecks['schema-valid-v2'] =
      manifest.validityChecks['schema-valid']
    delete manifest.validityChecks['schema-valid']
  }],
  ['validityChecks definition membership', (manifest) => {
    delete manifest.validityChecks['permission-boundary']
  }],
  ['validityChecks severity', (manifest) => {
    manifest.validityChecks['schema-valid'].severity = 'high'
  }],
  ['cost.metric', (manifest) => {
    manifest.cost.metric = 'tokens_per_trial'
  }],
  ['explicit no-cost declaration', (manifest) => {
    manifest.cost = null
  }],
  ['trialIds element identity', (manifest) => {
    manifest.trialIds[1] = 'trial-002-alternate'
  }],
  ['trialIds membership', (manifest) => {
    manifest.trialIds.push('trial-004')
  }],
]

for (const [name, mutate] of digestBindingCases) {
  test(`digest binds ${name}`, () => {
    const changed = structuredClone(example)
    mutate(changed)
    assert.equal(
      validateSchema(changed),
      true,
      ajv.errorsText(validateSchema.errors),
    )
    assert.notEqual(digestTrialManifest(changed), expectedDigest)
  })
}

const rejectedBindingMutationCases = [
  ['schemaVersion', 'UNSUPPORTED_VERSION', (manifest) => {
    manifest.schemaVersion = '0.2'
  }],
  ['baseline.recipe.digestProfile', 'UNSUPPORTED_DIGEST_PROFILE', (manifest) => {
    manifest.baseline.recipe.digestProfile = 'urn:example:digest:v9'
  }],
  ['baseline.artifact.profile', 'UNSUPPORTED_ARTIFACT_PROFILE', (manifest) => {
    manifest.baseline.artifact.profile = 'urn:example:artifact:v9'
  }],
  ['candidate.recipe.digestProfile', 'UNSUPPORTED_DIGEST_PROFILE', (manifest) => {
    manifest.candidate.recipe.digestProfile = 'urn:example:digest:v9'
  }],
  ['candidate.artifact.profile', 'UNSUPPORTED_ARTIFACT_PROFILE', (manifest) => {
    manifest.candidate.artifact.profile = 'urn:example:artifact:v9'
  }],
  ['runnerBindingRef.schemaUri', 'UNSUPPORTED_RUNNER_BINDING_SCHEMA', (manifest) => {
    manifest.runnerBindingRef.schemaUri = 'urn:example:runner-binding:v9'
  }],
  ['runnerBindingRef.digestProfile', 'UNSUPPORTED_DIGEST_PROFILE', (manifest) => {
    manifest.runnerBindingRef.digestProfile = 'urn:example:digest:v9'
  }],
  ['currentTask.direction', 'UNSUPPORTED_DIRECTION', (manifest) => {
    manifest.currentTask.direction = 'minimize'
  }],
  ['retentionAnchors direction', 'UNSUPPORTED_DIRECTION', (manifest) => {
    manifest.retentionAnchors['anchor-tool-permission'].direction = 'minimize'
  }],
  ['duplicate trialIds entry', 'INVALID_TRIAL_SET', (manifest) => {
    manifest.trialIds[1] = manifest.trialIds[0]
  }],
]

for (const [name, code, mutate] of rejectedBindingMutationCases) {
  test(`rejects unsupported mutation of ${name}`, () => {
    const changed = structuredClone(example)
    mutate(changed)
    assert.equal(validateSchema(changed), false)
    assert.throws(
      () => digestTrialManifest(changed),
      (error) => error instanceof TrialManifestError && error.code === code,
    )
  })
}

const invalidCases = [
  {
    name: 'unsupported schema version',
    code: 'UNSUPPORTED_VERSION',
    mutate(manifest) {
      manifest.schemaVersion = '0.2'
    },
  },
  {
    name: 'empty evaluator identity',
    code: 'INVALID_IDENTIFIER',
    mutate(manifest) {
      manifest.identities.dataset = ''
    },
  },
  {
    name: 'lone-surrogate Recipe identifier',
    code: 'INVALID_IDENTIFIER',
    mutate(manifest) {
      manifest.candidate.recipe.recipeId = '\ud800'
    },
  },
  {
    name: 'relative Recipe schema URI',
    code: 'INVALID_SCHEMA_URI',
    mutate(manifest) {
      manifest.baseline.recipe.schemaUri = './recipe.schema.json'
    },
  },
  {
    name: 'unsupported Recipe digest profile',
    code: 'UNSUPPORTED_DIGEST_PROFILE',
    mutate(manifest) {
      manifest.candidate.recipe.digestProfile = 'urn:example:digest:v9'
    },
  },
  {
    name: 'uppercase Recipe digest',
    code: 'INVALID_DIGEST',
    mutate(manifest) {
      manifest.candidate.recipe.digest = `sha256:${'A'.repeat(64)}`
    },
  },
  {
    name: 'unsupported artifact profile',
    code: 'UNSUPPORTED_ARTIFACT_PROFILE',
    mutate(manifest) {
      manifest.baseline.artifact.profile = 'urn:example:artifact:v9'
    },
  },
  {
    name: 'unsupported artifact kind',
    code: 'INVALID_ARTIFACT_KIND',
    mutate(manifest) {
      manifest.candidate.artifact.kind = 'directory'
    },
  },
  {
    name: 'malformed artifact digest',
    code: 'INVALID_DIGEST',
    mutate(manifest) {
      manifest.baseline.artifact.digest = 'sha256:00'
    },
  },
  {
    name: 'unsupported RunnerBinding schema',
    code: 'UNSUPPORTED_RUNNER_BINDING_SCHEMA',
    mutate(manifest) {
      manifest.runnerBindingRef.schemaUri = 'urn:example:runner-binding:v9'
    },
  },
  {
    name: 'unsupported metric direction',
    code: 'UNSUPPORTED_DIRECTION',
    mutate(manifest) {
      manifest.currentTask.direction = 'minimize'
    },
  },
  {
    name: 'empty anchor identifier',
    code: 'INVALID_IDENTIFIER',
    mutate(manifest) {
      manifest.retentionAnchors[''] =
        manifest.retentionAnchors['anchor-tool-permission']
      delete manifest.retentionAnchors['anchor-tool-permission']
    },
  },
  {
    name: 'non-positive anchor weight',
    code: 'INVALID_MANIFEST',
    mutate(manifest) {
      manifest.retentionAnchors['anchor-tool-permission'].weight = 0
    },
  },
  {
    name: 'negative anchor maximum loss',
    code: 'INVALID_MANIFEST',
    mutate(manifest) {
      manifest.retentionAnchors['anchor-tool-permission'].maximumLoss = -0.1
    },
  },
  {
    name: 'empty validity severity',
    code: 'INVALID_IDENTIFIER',
    mutate(manifest) {
      manifest.validityChecks['schema-valid'].severity = ''
    },
  },
  {
    name: 'malformed cost definition',
    code: 'INVALID_IDENTIFIER',
    mutate(manifest) {
      manifest.cost = { metric: '' }
    },
  },
  {
    name: 'empty retention-anchor definitions',
    code: 'INVALID_MANIFEST',
    mutate(manifest) {
      manifest.retentionAnchors = {}
    },
  },
  {
    name: 'empty validity-check definitions',
    code: 'INVALID_MANIFEST',
    mutate(manifest) {
      manifest.validityChecks = {}
    },
  },
  {
    name: 'too few trial identifiers',
    code: 'INVALID_TRIAL_SET',
    mutate(manifest) {
      manifest.trialIds = ['trial-001']
    },
  },
  {
    name: 'too many trial identifiers',
    code: 'INVALID_TRIAL_SET',
    mutate(manifest) {
      manifest.trialIds = Array.from({ length: 31 }, (_, index) => `trial-${index}`)
    },
  },
  {
    name: 'duplicate trial identifiers',
    code: 'INVALID_TRIAL_SET',
    mutate(manifest) {
      manifest.trialIds[1] = manifest.trialIds[0]
    },
  },
]

for (const invalidCase of invalidCases) {
  test(`Ajv/runtime reject ${invalidCase.name}`, () => {
    const manifest = structuredClone(example)
    invalidCase.mutate(manifest)
    const schemaAccepted = validateSchema(manifest)
    const schemaErrors = validateSchema.errors
    let runtimeError
    try {
      validateTrialManifest(manifest)
    } catch (error) {
      runtimeError = error
    }

    assert.equal(
      schemaAccepted,
      false,
      `Ajv unexpectedly accepted ${invalidCase.name}: ${ajv.errorsText(schemaErrors)}`,
    )
    assert.ok(runtimeError instanceof TrialManifestError)
    assert.equal(runtimeError.code, invalidCase.code)
  })
}

test('Ajv/runtime accept explicit no-cost and Unicode-scalar identities', () => {
  const manifest = structuredClone(example)
  manifest.cost = null
  manifest.identities.task = 'task-😀-𐐷'

  assert.equal(
    validateSchema(manifest),
    true,
    ajv.errorsText(validateSchema.errors),
  )
  assert.deepEqual(validateTrialManifest(manifest), manifest)
})

const requiredFieldCases = [
  ['trialManifest.schemaVersion', (manifest) => delete manifest.schemaVersion],
  ['trialManifest.identities', (manifest) => delete manifest.identities],
  ['trialManifest.baseline', (manifest) => delete manifest.baseline],
  ['trialManifest.candidate', (manifest) => delete manifest.candidate],
  ['trialManifest.runnerBindingRef', (manifest) => delete manifest.runnerBindingRef],
  ['trialManifest.currentTask', (manifest) => delete manifest.currentTask],
  ['trialManifest.retentionAnchors', (manifest) => delete manifest.retentionAnchors],
  ['trialManifest.validityChecks', (manifest) => delete manifest.validityChecks],
  ['trialManifest.cost', (manifest) => delete manifest.cost],
  ['trialManifest.trialIds', (manifest) => delete manifest.trialIds],
  ['trialManifest.identities.task', (manifest) => delete manifest.identities.task],
  ['trialManifest.identities.model', (manifest) => delete manifest.identities.model],
  ['trialManifest.identities.environment', (manifest) => delete manifest.identities.environment],
  ['trialManifest.identities.dataset', (manifest) => delete manifest.identities.dataset],
  ['trialManifest.identities.grader', (manifest) => delete manifest.identities.grader],
  ['trialManifest.baseline.recipe', (manifest) => delete manifest.baseline.recipe],
  ['trialManifest.baseline.artifact', (manifest) => delete manifest.baseline.artifact],
  ['trialManifest.candidate.recipe', (manifest) => delete manifest.candidate.recipe],
  ['trialManifest.candidate.artifact', (manifest) => delete manifest.candidate.artifact],
  ['trialManifest.baseline.recipe.recipeId', (manifest) => delete manifest.baseline.recipe.recipeId],
  ['trialManifest.baseline.recipe.schemaUri', (manifest) => delete manifest.baseline.recipe.schemaUri],
  ['trialManifest.baseline.recipe.digestProfile', (manifest) => delete manifest.baseline.recipe.digestProfile],
  ['trialManifest.baseline.recipe.digest', (manifest) => delete manifest.baseline.recipe.digest],
  ['trialManifest.candidate.recipe.recipeId', (manifest) => delete manifest.candidate.recipe.recipeId],
  ['trialManifest.candidate.recipe.schemaUri', (manifest) => delete manifest.candidate.recipe.schemaUri],
  ['trialManifest.candidate.recipe.digestProfile', (manifest) => delete manifest.candidate.recipe.digestProfile],
  ['trialManifest.candidate.recipe.digest', (manifest) => delete manifest.candidate.recipe.digest],
  ['trialManifest.baseline.artifact.profile', (manifest) => delete manifest.baseline.artifact.profile],
  ['trialManifest.baseline.artifact.kind', (manifest) => delete manifest.baseline.artifact.kind],
  ['trialManifest.baseline.artifact.digest', (manifest) => delete manifest.baseline.artifact.digest],
  ['trialManifest.candidate.artifact.profile', (manifest) => delete manifest.candidate.artifact.profile],
  ['trialManifest.candidate.artifact.kind', (manifest) => delete manifest.candidate.artifact.kind],
  ['trialManifest.candidate.artifact.digest', (manifest) => delete manifest.candidate.artifact.digest],
  ['trialManifest.runnerBindingRef.schemaUri', (manifest) => delete manifest.runnerBindingRef.schemaUri],
  ['trialManifest.runnerBindingRef.digestProfile', (manifest) => delete manifest.runnerBindingRef.digestProfile],
  ['trialManifest.runnerBindingRef.digest', (manifest) => delete manifest.runnerBindingRef.digest],
  ['trialManifest.currentTask.metric', (manifest) => delete manifest.currentTask.metric],
  ['trialManifest.currentTask.direction', (manifest) => delete manifest.currentTask.direction],
  [
    'trialManifest.retentionAnchors[].metric',
    (manifest) => delete manifest.retentionAnchors['anchor-tool-permission'].metric,
  ],
  [
    'trialManifest.retentionAnchors[].direction',
    (manifest) => delete manifest.retentionAnchors['anchor-tool-permission'].direction,
  ],
  [
    'trialManifest.retentionAnchors[].required',
    (manifest) => delete manifest.retentionAnchors['anchor-tool-permission'].required,
  ],
  [
    'trialManifest.retentionAnchors[].weight',
    (manifest) => delete manifest.retentionAnchors['anchor-tool-permission'].weight,
  ],
  [
    'trialManifest.retentionAnchors[].maximumLoss',
    (manifest) => delete manifest.retentionAnchors['anchor-tool-permission'].maximumLoss,
  ],
  [
    'trialManifest.validityChecks[].severity',
    (manifest) => delete manifest.validityChecks['schema-valid'].severity,
  ],
  ['trialManifest.cost.metric', (manifest) => delete manifest.cost.metric],
]

for (const [path, remove] of requiredFieldCases) {
  test(`fails closed when required field ${path} is missing`, () => {
    const manifest = structuredClone(example)
    remove(manifest)
    assert.equal(validateSchema(manifest), false)
    assert.throws(
      () => validateTrialManifest(manifest),
      (error) =>
        error instanceof TrialManifestError &&
        error.code === 'INVALID_MANIFEST',
    )
  })
}

test('fails closed on unknown fields at every object level', () => {
  const cases = []
  cases.push({ ...example, unexpected: true })

  const identityUnknown = structuredClone(example)
  identityUnknown.identities.seed = 'seed-1'
  cases.push(identityUnknown)

  const subjectUnknown = structuredClone(example)
  subjectUnknown.baseline.authorization = true
  cases.push(subjectUnknown)
  const recipeUnknown = structuredClone(example)
  recipeUnknown.candidate.recipe.signature = 'not-supported'
  cases.push(recipeUnknown)
  const artifactUnknown = structuredClone(example)
  artifactUnknown.candidate.artifact.path = './candidate'
  cases.push(artifactUnknown)

  const bindingUnknown = structuredClone(example)
  bindingUnknown.runnerBindingRef.signature = 'not-supported'
  cases.push(bindingUnknown)
  const taskUnknown = structuredClone(example)
  taskUnknown.currentTask.threshold = 1
  cases.push(taskUnknown)

  const anchorUnknown = structuredClone(example)
  anchorUnknown.retentionAnchors['anchor-tool-permission'].threshold = 1
  cases.push(anchorUnknown)
  const checkUnknown = structuredClone(example)
  checkUnknown.validityChecks['schema-valid'].command = 'npm test'
  cases.push(checkUnknown)
  const costUnknown = structuredClone(example)
  costUnknown.cost.currency = 'USD'
  cases.push(costUnknown)

  for (const manifest of cases) {
    assert.equal(validateSchema(manifest), false)
    assert.throws(
      () => validateTrialManifest(manifest),
      (error) =>
        error instanceof TrialManifestError &&
        error.code === 'INVALID_MANIFEST',
    )
  }
})

test('does not invoke accessors and rejects hidden, symbol, and custom objects', () => {
  let getterInvoked = false
  const accessor = structuredClone(example)
  Object.defineProperty(accessor.candidate.recipe, 'recipeId', {
    enumerable: true,
    get() {
      getterInvoked = true
      throw new Error('getter must not run')
    },
  })
  assert.throws(() => validateTrialManifest(accessor), /data property/i)
  assert.equal(getterInvoked, false)

  const hidden = structuredClone(example)
  Object.defineProperty(hidden.retentionAnchors, 'hidden', { value: true })
  assert.throws(() => validateTrialManifest(hidden), /data property/i)

  const symbol = structuredClone(example)
  symbol.validityChecks[Symbol('extension')] = true
  assert.throws(() => validateTrialManifest(symbol), /symbol properties/i)

  const custom = structuredClone(example)
  Object.setPrototypeOf(custom.baseline.artifact, { inherited: true })
  assert.throws(() => validateTrialManifest(custom), /plain data object/i)

  const customArray = structuredClone(example)
  Object.setPrototypeOf(customArray.trialIds, Object.create(Array.prototype))
  assert.throws(() => validateTrialManifest(customArray), /plain data array/i)

  const sparse = structuredClone(example)
  delete sparse.trialIds[1]
  assert.throws(() => validateTrialManifest(sparse), /dense array/i)

  const extraArrayProperty = structuredClone(example)
  extraArrayProperty.trialIds.note = 'unexpected'
  assert.throws(() => validateTrialManifest(extraArrayProperty), /dense array/i)
})

test('returns a detached normalized data model', () => {
  const source = structuredClone(example)
  const normalized = validateTrialManifest(source)
  source.identities.task = 'mutated-task'
  source.candidate.recipe.recipeId = 'mutated-recipe'
  source.retentionAnchors['anchor-tool-permission'].weight = 99
  source.trialIds[0] = 'mutated-trial'

  assert.deepEqual(normalized, example)
})

test('duplicate-safe text parsing rejects ambiguous property names', () => {
  const source = JSON.stringify(example).replace(
    '"schemaVersion":"0.1"',
    '"schemaVersion":"0.1","schemaVersion":"0.1"',
  )
  assert.throws(
    () => parseTrialManifest(source),
    (error) => error instanceof JcsError && error.code === 'DUPLICATE_PROPERTY',
  )
})

test('trial-manifest package subpath exposes the public API', async () => {
  const publicApi = await import('dsh-guarded-hcl/trial-manifest')
  const rootApi = await import('dsh-guarded-hcl')
  assert.equal(publicApi.TRIAL_MANIFEST_SCHEMA_URI, TRIAL_MANIFEST_SCHEMA_URI)
  assert.equal(publicApi.digestTrialManifest(example), expectedDigest)
  assert.equal(rootApi.TRIAL_MANIFEST_SCHEMA_URI, TRIAL_MANIFEST_SCHEMA_URI)
  assert.equal(rootApi.digestTrialManifest(example), expectedDigest)
  assert.match(
    import.meta.resolve(
      'dsh-guarded-hcl/schemas/trial-manifest-v0.1.schema.json',
    ),
    /schemas\/trial-manifest-v0\.1\.schema\.json$/u,
  )
})
