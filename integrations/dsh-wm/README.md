# dsh-wm Sunset conformance fixture

This optional integration consumes measurements produced by the real
[`dsh-wm`](https://github.com/WayneJin0918/dsh-wm) Sunset fixture. It does not
copy upstream code or claim an official integration.

The workflow pins and verifies upstream commit
`cd06866a638b1dcc80defa6d674ff3470ff0ad31`, its fixture trees, and the scorer
blobs. The local runner performs the same checks and refuses changes to the
relevant worktree paths. It then evaluates two explicitly synthetic oracle
scenarios:

- known regression: GT-vs-GT baseline and Sunset pred-vs-GT candidate;
- oracle recovery: Sunset pred-vs-GT baseline and GT-vs-GT candidate;
- current-task signal: mean SSIM;
- required retention anchor: second-half SSIM;
- validity checks: exactly eight paired frames and no scorer warnings.

The candidate remains near-perfect early in the rollout but collapses in the
second half. The guarded gate must reject it before promotion.

Run it against a checkout of the pinned upstream revision:

```bash
git clone https://github.com/WayneJin0918/dsh-wm.git ../dsh-wm
git -C ../dsh-wm checkout cd06866a638b1dcc80defa6d674ff3470ff0ad31
npm run example:dsh-wm -- ../dsh-wm
```

These are scorer-to-contract conformance fixtures, not results from two real
Harness Recipes. A genuine M2 comparison still requires baseline and candidate
prediction runs over the same frozen dataset. This is not a live Cordis
adapter, a full Pack/Recipe/Scorecard implementation, or a security sandbox.

The artifact digests bind the pinned scorer, ground-truth tree, and prediction
tree. The same prediction has the same digest whether it appears as the
baseline or candidate in a conformance scenario.
