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
| [@histoire/controls-stories](./packages/histoire-controls-stories) | Stories for builtin controls |
| [@histoire/plugin-vue](./packages/histoire-plugin-vue) | Vue 3 integration |
| [@histoire/plugin-react](./packages/histoire-plugin-react) | React 18/19 integration |
| [@histoire/plugin-svelte](./packages/histoire-plugin-svelte) | Svelte 4/5 and SvelteKit 2/3 integration |
| [@histoire/plugin-nuxt](./packages/histoire-plugin-nuxt) | Nuxt 3/4 integration |
| [@histoire/plugin-percy](./packages/histoire-plugin-percy) | Visual regression testing with Percy |
| [@histoire/plugin-screenshot](./packages/histoire-plugin-screenshot) | Visual regression testing with simple screenshots |
| [@histoire/shared](./packages/histoire-shared) | Shared utilities |
| [@histoire/vendors](./packages/histoire-vendors) | Pre-bundled dependencies |

## Local dev setup

1. Install dependencies with [pnpm](https://pnpm.io/):

```sh
corepack enable
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

Example `story:dev` scripts watch built outputs across repository packages. After output changes settle for 1.5 seconds, Histoire restarts automatically with fresh runtime code and the browser reconnects. Story and component edits still use Vite HMR without restarting the process.

Keep `pnpm run watch` running separately when editing Histoire packages. The example launcher does not build packages; if a rebuild temporarily removes outputs or startup fails, it waits for later output changes and starts again. Optimizer caches are preserved. A rebuild can interrupt active tests; run them again after Histoire finishes restarting.

`story:dev` uses the built Histoire UI. In `vue3`, `pnpm run dev:hst` uses the same automatic restart launcher with `HISTOIRE_DEV=true`, enabling HMR for Histoire UI sources. Both commands forward CLI arguments, for example `pnpm run story:dev -- --port 6006 --config "custom config.ts"`.

4. After you have tested your changes in development mode, build the story apps and test them using the `story:build` and `story:preview` scripts:

```sh
pnpm run story:build
pnpm run story:preview
```

## Running tests

### TypeScript compilers

`pnpm exec tsc` runs native TypeScript 7 for builds and type checks. Workspaces
that use TypeScript declare `@typescript/native` from the shared catalog.
The `typescript` catalog entry aliases `@typescript/typescript6`, keeping the
TypeScript 6 JavaScript API available to Vue tooling, ESLint, vendor builds,
Svelte tooling, and tests that parse TypeScript. Declare both catalog entries
in each workspace so pnpm resolves framework peers to the compatibility API.
`pnpm exec tsc6` runs the compatibility compiler explicitly. Keep both catalog
entries when updating TypeScript; replacing `typescript` with stock TypeScript 7
breaks those tools.

### Vite and bundlers

Workspace builds use Vite 8 with Rolldown and Oxc. Keep Vite versions on the
shared catalog and use `build.rolldownOptions` in workspace Vite configs.
Histoire still supports Vite 7 consumers through its Rollup config path.
The Svelte 4 example and VitePress retain their separate Vite 5 dependencies.

`@histoire/vendors` still builds with Rollup and the TypeScript 6 API. Histoire
also uses Rollup's parser and esbuild for deployed Node bundles; these direct
dependencies are independent of Vite's bundler.

### Documentation and demo

Use Node.js 22.12+ and the repository's pinned pnpm version:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm docs:build
pnpm --filter histoire-example-vue3 exec playwright install chromium
pnpm docs:check
pnpm docs:serve
```

`docs:build` first compiles the Vue demo's workspace dependencies in dependency order, so it works from a fresh checkout without a separate `pnpm build`. It then builds a static Vue book into ignored `docs/public/demo/` before VitePress copies it into `docs/.vitepress/dist/demo/`. Publish the whole `docs/.vitepress/dist/` directory. The `/demo/` asset base and hash routing keep direct story links usable without host rewrite rules. Demo links perform a full navigation so VitePress does not treat the book as a Markdown page.

`docs:dev` also builds this book before starting VitePress; compile workspace packages first with `pnpm build` or `pnpm docs:build`. After changing a demo story, run `pnpm docs:demo` to refresh it. `examples/vue3/histoire.docs.config.ts` selects existing interactive examples and omits stress and failure fixtures; the regular Vue test book remains unchanged.

`docs:check` serves the production output using a plain static server and checks the actual browser: demo navigation, prop edits reaching the canvas, generated source, docs links surviving reload, narrow-screen rendering, and development actions staying hidden. It needs the Vue example's Playwright dependency and Chromium. It uses an ephemeral loopback port and closes both server and browser on failure.

Refresh screenshots after workbench changes:

```sh
pnpm docs:build
pnpm docs:screenshots
pnpm docs:build
pnpm docs:check
```

`docs:screenshots` runs the same browser checks, captures light/dark workbench images under `docs/public/screenshots/`, and updates the README's `screenshot.png`. Review both images before committing. Rebuild afterward so the published docs contain the new images.

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

## Official plugin releases

### Official release history

Each bundled official plugin records release metadata in its `marketplace-history.json`. Set the package version, requirements, frameworks, notes, and migrations before taking its first snapshot. The release script generates the snapshots and index. To regenerate them manually, run these commands from the repository root:

```sh
pnpm marketplace:history
pnpm marketplace:index
```

Review the diagnostics and commit the history files and generated `packages/histoire/src/node/marketplace/catalog/official.json` with the release changes. The scripts read plain JSON from the official package allowlist. Each version is snapshotted once, and reruns preserve existing entries. The index requires a snapshot for each current package version.

Snapshots record `version`, `requires`, `frameworks`, and optional `releaseNotes`, `migrations`, and `publishedAt`. Supply a valid publication date if one is known. The history keeps the newest 50 unique versions by npm semver. Recover older entries from their published metadata. The server uses each release's requirements and frameworks for offline compatibility checks. History files are release inputs and stay out of published plugin packages.

### Publish changes to the hosted official catalog

After publishing to npm, set the listing version and exact published versions to retain in `scripts/marketplace/official-catalog-input.json`. Every selected release needs valid marketplace metadata. Run:

```sh
pnpm marketplace:catalog
pnpm marketplace:catalog --check
```

Review and include the input and generated `docs/public/marketplace/v1/official.json` in the same PR. After the docs deploy, verify the feed serves valid JSON with the intended release at `https://histoire.dev/marketplace/v1/official.json`. To roll back, revert the catalog data commit and redeploy the docs. Publish breaking format changes at a new URL so existing consumers can continue to use the `v1` feed.

Check the packed plugin manifest against the oldest Histoire version the release should support. pnpm packs `workspace:^` against the version in the current workspace, and Marketplace checks the published peer range before offering installation.

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
