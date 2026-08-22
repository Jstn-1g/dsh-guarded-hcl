#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { evaluateCandidate } from '../src/gate.js'

const [, , policyPath, evidencePath] = process.argv

if (!policyPath || !evidencePath) {
  console.error('Usage: hcl-gate <policy.json> <evaluation-evidence.json>')
  process.exitCode = 64
} else {
  try {
    const [policy, evidence] = await Promise.all([
      readJson(policyPath),
      readJson(evidencePath),
    ])
    const decision = evaluateCandidate(policy, evidence)
    process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`)
    process.exitCode = decision.accepted ? 0 : 2
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`hcl-gate: ${message}`)
    process.exitCode = 1
  }
}

async function readJson(path) {
  const source = await readFile(path, 'utf8')
  try {
    return JSON.parse(source)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON in ${path}: ${message}`)
  }
}
