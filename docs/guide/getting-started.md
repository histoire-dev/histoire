<script setup>
function playAudio () {
  document.querySelector('#histoire-audio').play()
}
</script>

<audio id="histoire-audio">
  <source src="/histoire.mp3" type="audio/mpeg">
</audio>

# Getting started with Histoire

## Overview

> Histoire is the French word for "Story" and is pronounced `/is.twaʁ/`, like "is·twar" <button class="btn p-1 leading-none" v-on:click="playAudio"><Icon icon="carbon:volume-up-filled" class="w-4 h-4 align-middle"/></button>

Use Node.js **22.12 or later** and [Vite](https://vitejs.dev) **7 or 8**. Check your framework's Node.js requirements as well.

Choose your framework to install Histoire and write your first story.

- [Vue 3](./vue3/getting-started.md), including Nuxt and Quasar
- [React](./react/getting-started.md)
- [Svelte](./svelte3/getting-started.md), including SvelteKit

[Learn what you can build with Histoire](./index.md).

<div class="demo-links-box border-green-200 dark:border-green-900">
  <img src="/vue.svg" class="w-10 h-10 mt-3" />
  <DemoLinks framework="vue3" />
</div>

<div class="demo-links-box border-orange-200 dark:border-orange-900">
  <img src="/svelte.svg" class="w-10 h-10 mt-3" />
  <DemoLinks framework="svelte3" />
</div>

## Sponsors

Our sponsors support Histoire's open-source development.

<div class="flex justify-center mt-6 mb-12 gap-2">
  <SponsorButton/>
  <a
    href="./index.html#sponsors"
    class="px-4 py-2 btn inline-flex items-center gap-2 !font-normal"
  >
    See our sponsors &raquo;
  </a>
</div>

## Supported frameworks

Titles marked <Badge type="tip" text="1.0-beta.2+" /> describe features available from Histoire 1.0.0-beta.2. Use [continuous releases](https://nightly.akryum.dev/histoire-dev/histoire) to try changes between releases.

| Framework | Version | Story support | Generated source | Automatic docs |
| --------- | -------- | ------- | ------------ | ---- |
| [Vue →](./vue3/getting-started.md) | `3.5.26+` | ✅ | ✅ | ✅ |
| [Svelte →](./svelte3/getting-started.md) | `4 / 5` | ✅ | - | 🏗️ |
| Solid | - | - | - | - |
| Angular | - | - | - | - |
| [React →](./react/getting-started.md) | `18 / 19` | ✅ | - | - |

Story support includes story discovery, rendering, built-in controls, synchronized custom controls, and static source. Generated source reflects the current state and can be copied. Automatic docs generate documentation and controls from component definitions.

Nuxt **3 / 4** uses `@histoire/plugin-nuxt` alongside the Vue plugin. SvelteKit **2 / 3** uses the Svelte plugin.

### Vite 8 support <Badge type="tip" text="1.0-beta.2+" />

Vite 8 is supported alongside Vite 7. Use a framework Vite plugin compatible with your project's Vite version.

## Explore the workbench <Badge type="tip" text="1.0-beta.2+" />

<a href="/demo/" target="_self">Open the demo</a> to browse stories, select variants, edit props, read docs, and inspect generated source. The demo is a static book. To try project tests, comments, canvas screenshots, or MCP activity, run a development server.

Start with [workbench layout](./ui-shell.md), [navigation and search](./ui-navigation.md), [the inspector](./ui-inspector.md), and [props matrix](./ui-matrix.md).

## Dev console <Badge type="tip" text="1.0-beta.2+" />

`histoire dev` opens an interactive panel in supported terminals. Logs scroll above the workbench address, startup progress, story and variant counts, and test activity. Press `?` to see available shortcuts.

| Key | Action |
| --- | --- |
| `r` / `R` | Restart / fresh restart (ignores the cached catalog and forces dependency optimization once) |
| `o` | Open the workbench |
| `y` | Copy the workbench address |
| `i` | Session information: versions, root, config, counts, addresses, MCP state |
| `l` | Logs |
| `e` | Latest error |
| `n` | HTTP requests through the workbench address since the console started (method, path, status, duration; query strings, headers and WebSocket traffic are not kept) |
| `p` | Stories and variants |
| `t` | Tests, see [Terminal tests](./testing.md#terminal-tests) |
| `c` | Clear visible output |
| `x` | Delete retained log and request history (test results are kept) |
| `q` | Quit |

In full-screen views, scroll with the arrow keys, `Page Up`, `Page Down`, `Home`, or `End`. Press `/` to search, `Enter` to open an entry, `y` to copy it, or `Y` to copy all filtered entries.

Press `Esc` (or `Enter` again) to return from a log or error detail to its list, or from a list to the main screen. Press `q` to return to the main screen. `Ctrl+C` always quits.

In session information, `Up`/`Down` select an address, `y` copies it, `o` opens it, `r` shows its QR code to scan from a phone and `u` refreshes the runtime facts. Network addresses are listed only when the server listens beyond loopback (`--host`).

In the stories view, `Enter` lists a story's variants and opens a variant in the workbench. `o` opens the selected story or variant, `t` opens Tests for it and runs it, and `u` reloads the catalog.

### Activation

The panel starts automatically outside CI and without a Node inspector. It needs interactive stdin and stdout, raw input, at least 40 columns by 10 rows, and a usable `TERM` on non-Windows systems. To choose a mode explicitly:

- `--tui` forces the panel, ignoring CI and inspector detection. A missing TTY, raw input or terminal size still falls back to plain output.
- `--no-tui` always uses plain output.
- `HISTOIRE_TUI=plain|auto|1` sets the default (`1` forces, `auto` is the default). A flag wins over the variable. Other values fail before the project loads.

If the terminal shrinks below 40 × 10, Histoire switches to plain output and restores the panel when the terminal grows. If the renderer fails, Histoire uses plain output for the rest of the session. On Unix, `Ctrl+Z` restores the terminal and Histoire checks the mode again on resume.

### Plain mode

Plain mode prints the `Histoire:`, `Local:` and `MCP:` address lines, restart and ready lines, and project output, with no control sequences. When stdin is interactive it reads these newline-terminated commands: `help`, `restart`, `restart fresh`, `open`, `tests`, `watch`, `stop`, `quit`. With piped or closed stdin no reader is installed.

## Community

If you have questions or need help, reach out to the community at [Discord](https://discord.gg/KpCnT72rJk) and [GitHub Discussions](https://github.com/histoire-dev/histoire/discussions).
