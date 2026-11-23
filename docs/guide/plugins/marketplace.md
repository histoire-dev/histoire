# Plugin marketplace

Open **Settings › Plugins › Browse marketplace**. Use **Discover** for suggestions based on the project, or **All plugins** to search and filter by category, framework, publisher, or contribution. Press `/` to focus search or `Esc` to close the marketplace.

Development servers refresh the official catalog from `histoire.dev` when the marketplace opens or installed plugins are checked for updates. Changes to the catalog reach existing versions of Histoire that support the feed. A package is **Official** when it is listed in Histoire's curated catalog and published under `@histoire/`.

The server caches official data for one hour. If the feed fails, Histoire uses the last valid saved catalog or the copy bundled with Histoire. The official catalog request uses no npm credentials. To use bundled official data in a development project, set this in `histoire.config.ts`:

```ts
export default defineConfig({
  marketplace: { refreshOfficialCatalog: false },
})
```

## Community plugins

**Community plugins** is off by default. Enable it in Plugins settings to include npm packages with the `histoire-plugin` keyword and valid marketplace metadata. Registry requests run on the development server, using its npm registry setting; the browser does not fetch registry metadata directly.

Registry results are cached for one hour. If refresh fails, cached results can remain available with a stale-source notice. Official entries remain available when the registry is unreachable. Turning community plugins off stops direct npm registry metadata requests. The official catalog refresh still runs unless disabled in project configuration. Compatibility uses npm semver ranges; prereleases require the range to admit their prerelease tuple.

Plugin details show compatibility, declared access, contributions, requirements, options, changelog and versions. Declared access describes the plugin; it is not a sandbox permission grant. Installed plugins run as trusted project code. **Published with npm provenance** means the registry supplied an attestation, not that Histoire verified it.

### Private and scoped registries

Registry settings come from the development server's user `.npmrc` (or `npm_config_userconfig`), workspace `.npmrc`, project `.npmrc`, then supported `npm_config_*` environment values, in increasing priority. Unrelated ancestor files and global `.npmrc` are not read. Supported settings are `registry`, `@scope:registry`, and host/path-scoped `_authToken`, `_auth`, `username` and `_password`. `_password` is base64-encoded. `${ENV_NAME}` references expand on the server; an unset credential variable masks the lower-priority value for that key.

```ini
registry=https://registry.npmjs.org/
@acme:registry=https://packages.example.com/npm/
//packages.example.com/npm/:_authToken=${ACME_NPM_TOKEN}
```

Search uses the default registry. Package metadata, update history and version suggestions use the package scope's registry. A scoped registry setting alone does not merge its search results into the default registry's catalog. The registry must support npm search and package metadata endpoints used by the marketplace.

Credentials stay server-side and attach only to the matching host, port and path prefix; redirects are refused. Registry URLs cannot contain credentials, query strings or fragments. Tokens do not enter browser replies or catalog cache files. Package installation runs the selected manager, which reads its own registry settings; use settings supported by both when browsing and installing private packages.

## Install

1. Open a plugin and choose **Install**, or select a compatible version from **Choose version**.
2. In **Options**, adjust the fields the plugin exposes, then choose **Continue**. The diff updates as you edit. The generated call includes values that differ from the defaults.
3. In **Review**, check the package-manager command, changed files, and warnings. Choose **Install** to start.
4. Follow the progress through package resolution, installation, config update, restart, and plugin loading.

Only one plugin job runs per project. Changing project files after review invalidates the plan and requires another review. Closing the marketplace or choosing **Run in background** leaves the server-owned job running.

After a successful load, a short tour points to contributions actually registered in the workbench. Some plugins have no visible contribution to tour. A command action appears only when a toolbar item, pane or tab explicitly links to an available command registered by the same plugin.

## What changes in the project

Installation adds a development dependency to `package.json` and a named import/factory call to the literal `plugins` array in `histoire.config.ts` or another supported standalone config. Updates change the dependency version; options edit the plugin call; removal deletes the call and an unused import. Pinning saves an exact dependency version. Required framework plugins and builtins cannot be disabled or removed through marketplace management.

The server detects pnpm, npm, Yarn or Bun from project metadata and lockfiles. **Package manager** can override detection. The command runs without a shell. Package managers may change lockfiles, formatting and `node_modules`; the review's package diff is an estimate of their manifest output.

Config changes use revision checks, a temporary config load and a backup. Recovery receipts are stored in `.histoire/marketplace`. Official and registry metadata caches live under `node_modules/.cache/histoire/marketplace`.

### Dependency repair after failure

If a package step fails or is cancelled, look for **Restoring dependencies** in the log. Histoire restores the saved manifest and lockfiles, runs a frozen install with the same package manager, then restores those files again. It verifies that a new package is absent or that an updated, pinned, or removed package is back to its original version.

Histoire checks required peers after installation, even if the package manager reports success.

The failure says **No project files were changed** only when recovery succeeded. Failed or unverifiable repair reports remaining `node_modules` paths and does not claim restoration. Repair checks the requested package's presence/version; it does not compare every transitive file. Inspect the log and reported leftovers before retrying or restoring dependencies manually with the project's package manager.

Cancellation during package installation stops its process tree before recovery starts. A second cancellation stops dependency repair and reports leftovers. The project remains busy until repair finishes. Config-write failures use the same dependency repair path after safe input restoration; successor-load failures and uncertain process-crash recovery report their own recovery status. Cancellation is no longer offered once config saving begins, except during repair.

## Manage and update

Plugins settings shows installed versions, Required labels and compatible updates. **More actions** opens **Options**, **Changelog**, **Pin version** or **Remove**. Enable switches use **Apply and restart** for staged config changes. Local and workspace plugins are shown as local and receive no registry updates.

**Update** shows release notes and the reviewed config diff. When available, **Apply config migration** controls declarative changes to literal options. Migrations never execute package code. Computed arguments, conflicting destinations or unsupported edits require manual steps. A lower-version pin warns about the downgrade and does not apply migrations. Exact pins still receive update notifications.

**Skip this version** dismisses that target version. **Update all** processes eligible updates in sequence.

<a id="offline-official-history"></a>

### Official release history

The hosted catalog includes up to 50 approved published releases per official plugin. Each release supplies its own options, requirements, notes and migrations. Older releases without published marketplace metadata may appear only in bundled history. Installation still requires a release compatible with the project's Histoire and peers. Use **Choose version** to see the available releases and their requirements.

When the bundled source is active, committed release snapshots provide offline compatibility checks, release notes, migrations, and compatible-version advice. Community consent can enable additional history from the configured registry. Static books use bundled data for manual instructions.

### Restart and preferences

**After install** defaults to **Restart**: once the change is applied, the dev server replaces its process, so the plugin loads from fresh code (also after updates). Choosing **Ask** pauses before that restart, and before any config write, until **Restart now** confirms. The reviewed policy remains attached to the job across dismissal and reload.

When Histoire runs in-process (SDK embedding) there is no process to replace. Package-only changes then show **Restart the dev server to finish**; restart it yourself to load the plugin.

Community consent, package-manager override, restart policy and skipped versions are browser-local [UI settings](../ui-settings.md#plugins). They are sent with requests and are never written to project config.

## Manual and static books

Static books list bundled official plugins. Choose **Install** to open manual instructions. Copy the package-manager command and config snippet, apply them in your project, then rebuild the book with `histoire build`.

Development also uses manual instructions when there is no safe standalone literal config, package-manager detection fails, a workspace dependency cannot be edited safely, or a migration requires hand editing. Config module graphs importing `package.json` or a managed lockfile require manual changes because installation could otherwise restart Histoire before its config write. Literal local imports and loader-reported Histoire/Vite dependencies are inspected without executing them; runtime-computed imports remain outside that static analysis.

Plugin authors can [publish marketplace metadata](./development.md#publish-to-the-marketplace); all fields are listed in the [manifest reference](../../reference/plugin-api.md#marketplace-manifest).
