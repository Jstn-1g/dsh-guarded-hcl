# Contributing

The most useful contribution is evidence that this contract works—or fails to
work—at a real evaluator boundary.

## Start locally

```bash
git clone https://github.com/Jstn-1g/dsh-guarded-hcl.git
cd dsh-guarded-hcl
npm ci --ignore-scripts
npm run check
npm test
```

Requires Node.js 22 or newer. The project has no runtime dependencies.

## High-value contributions

1. A pinned external evaluator fixture that produces baseline and candidate
   measurements.
2. A mapping from current Cordis lifecycle interfaces to the proposed
   optimizer, evaluator, and commit-controller boundaries.
3. A focused counterexample showing that a schema field or gate invariant is
   ambiguous or unsafe.

An integration fixture should identify the upstream repository and exact
revision, explain how scores were produced, avoid copying secrets or private
datasets, and assert the expected promotion or rejection result in CI.

## Pull requests

- Keep changes narrow and dependency-free unless a dependency is essential to
  the contract.
- Add a public-behavior test for every gate change.
- Run `npm run check`, `npm test`, and the affected example.
- Preserve the scope statements: this is unofficial, early-stage, not a live
  Cordis plugin, and not a security sandbox.

Please use GitHub Issues before beginning a large adapter or schema redesign so
the public interface can be agreed before implementation.
