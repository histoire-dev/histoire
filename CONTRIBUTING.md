# Histoire Contributing Guide

Welcome! We are really excited that you are interested in contributing to Histoire. Before submitting your contribution, please make sure to take a moment and read through the following guide:

## Local dev setup

1. Install dependencies with `pnpm`:

```sh
pnpm i
```

2. Compile Histoire in watch mode:

```sh
pnpm run watch
```

3. In the `examples` directory, you can run `story:dev` scripts to start Histoire on an example project.

```sh
cd examples/vue3
pnpm run story:dev
```

## Pull Request Guidelines

- Checkout a topic branch from a base branch, e.g. `main`, and merge back against that branch.

- If adding a new feature:

  - Add accompanying test case.
  - Provide a convincing reason to add this feature. Ideally, you should open a suggestion issue first and have it approved before working on it.

- If fixing bug:

  - If you are resolving a special issue, add `(fix #xxxx[,#xxxx])` (#xxxx is the issue id) in your PR title for a better release log, e.g. `fix: update entities encoding/decoding (fix #3899)`.
  - Provide a detailed description of the bug in the PR. Live demo preferred.
  - Add appropriate test coverage if applicable.

- It's OK to have multiple small commits as you work on the PR - GitHub can automatically squash them before merging.

- Make sure tests pass!


- Commit messages must follow the [commit message convention](./.github/commit-convention.md) so that changelogs can be automatically generated.<!-- Commit messages are automatically validated before commit (by invoking [Git Hooks](https://git-scm.com/docs/githooks) via [yorkie](https://github.com/yyx990803/yorkie)). -->

<!--
- No need to worry about code style as long as you have installed the dev dependencies - modified files are automatically formatted with ESLint on commit (by invoking [Git Hooks](https://git-scm.com/docs/githooks) via [yorkie](https://github.com/yyx990803/yorkie)).
-->
