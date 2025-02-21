# Histoire Contributing Guide

Welcome! We are really excited that you are interested in contributing to Histoire. Before submitting your contribution, please make sure to take a moment and read through the following guide:

## Means of Contributing

Contributing doesn't necessarily mean you need to write code and open Pull Requests. There are many other ways you can help the project!

- Try the [latest version](https://github.com/histoire-dev/histoire/releases) of Histoire and [report bugs](https://github.com/histoire-dev/histoire/issues/new?assignees=&labels=to+triage&template=bug-report.yml).
- Discuss your ideas with the community on the [discussion board](https://github.com/histoire-dev/histoire/discussions).
- Answer to other people's questions.
- Report typos or issues of the docs.
- Support us financially on GitHub sponsors:
  - [Guillaume](https://github.com/sponsors/Akryum)
  - [Hugo](https://github.com/sponsors/hugoattal)
- Do you like Histoire? Spread the love on social media!

## Packages

This mono-repo contains the following packages:

| Package | Description |
| ------- | ----------- |
| [histoire](./packages/histoire) | Main package |
| [@histoire/app](./packages/histoire-app) | Pre-bundled UI |
| [@histoire/controls](./packages/histoire-controls) | Builtin controls components |
| [@histoire/controls-stories](./packages/histoire-controls) | Stories for builtin controls |
| [@histoire/plugin-vue](./packages/histoire-plugin-vue) | Vue 3 integration |
| [@histoire/plugin-vue2](./packages/histoire-plugin-vue) | Vue 2 integration |
| [@histoire/plugin-nuxt](./packages/histoire-plugin-nuxt) | Nuxt 3 integration |
| [@histoire/plugin-percy](./packages/histoire-plugin-percy) | Visual regression testing with Percy |
| [@histoire/plugin-screenshot](./packages/histoire-plugin-screenshot) | Visual regression testing with simple screenshots |
| [@histoire/shared](./packages/histoire-shared) | Shared utilities |
| [@histoire/vendors](./packages/histoire-vendors) | Pre-bundled dependencies |

## Local dev setup

1. Install dependencies with [pnpm](https://pnpm.io/):

```sh
node corepack enable
pnpm i
```

2. Compile Histoire in watch mode:

```sh
pnpm run watch
```

Wait before the initial build is done and the terminal output stabilizes.

If you do not intend to make changes to the histoire main packages, you can use this script instead:

```sh
pnpm run build
```

3. In the `examples` directory, you can run `story:dev` scripts to start Histoire on an example project.

```sh
cd examples/vue3
pnpm run story:dev
```

> For the `vue3` example, you can use the `pnpm run dev:hst` command to start the app with a special configuration enabling HMR for the Histoire UI. Especially useful when working on the UI!

4. After you have tested your changes in development mode, build the story apps and test them using the `story:build` and `story:preview` scripts:

```sh
pnpm run story:build
pnpm run story:preview
```

## Running tests

### Linting

We use ESLint to check for code quality and style.

```sh
# Root of the mono-repo
pnpm run lint
```

### Unit tests

We use [Vitest](https://vitest.dev/) to run unit tests on workspaces listed under the `packages` folder.

For developping:

```sh
# Root of the mono-repo
pnpm run test:dev
```

(You can also run this in specific package folders.)

For running all tests in the terminal:

```sh
# Root of the mono-repo
pnpm run test
```

### Example projects tests

Examples projects found in the `examples` can also have tests. To run them all:

```sh
# Root of the mono-repo
pnpm run test:examples
```

In an example project, you can run the following script if there are tests:

```sh
cd examples/vue3

pnpm run test:examples
```

To develop new tests in an example project, you can use:

```sh
cd examples/vue3

pnpm run story:dev
# In another terminal
pnpm run test:dev
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

- Make sure to follow the code style of the project.

- Make sure tests pass!

- Commit messages must follow the [commit message convention](./.github/commit-convention.md) so that changelogs can be automatically generated.<!-- Commit messages are automatically validated before commit (by invoking [Git Hooks](https://git-scm.com/docs/githooks) via [yorkie](https://github.com/yyx990803/yorkie)). -->

<!--
- No need to worry about code style as long as you have installed the dev dependencies - modified files are automatically formatted with ESLint on commit (by invoking [Git Hooks](https://git-scm.com/docs/githooks) via [yorkie](https://github.com/yyx990803/yorkie)).
-->
