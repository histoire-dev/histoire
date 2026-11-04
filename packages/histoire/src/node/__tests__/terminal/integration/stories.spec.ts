/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this test */
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createTerminalProject, TERMINAL_DEV_ARGS } from '../../utils/terminal/project.js'
import { startPty } from '../../utils/terminal/pty.js'

/** Cleanup registered by each test; always joined, even after a failed assertion. */
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close().catch(() => {})
})

/** Story with two variants whose IDs differ from the fixture's default story. */
const story = (variants: string[]) => `<template><Story id="zeta" title="Zeta Book">${variants.map(id => `<Variant id="${id}" title="${id}"><button>${id}</button></Variant>`).join('')}</Story></template>\n`

/**
 * Stand-in for the operating system's browser: the real `open` package runs its real
 * `xdg-open` script, which launches this executable through `BROWSER` (the session bus is hidden:
 * newer xdg-utils detect the desktop over D-Bus and then ignore `BROWSER`). Only the final
 * launch is replaced; it appends the received URL to a file.
 */
async function createBrowserStub() {
  const directory = await mkdtemp(resolve(tmpdir(), 'histoire-open-stub-'))
  const record = resolve(directory, 'opened.txt')
  const launcher = resolve(directory, 'browser.sh')
  await writeFile(launcher, `#!/bin/sh\nprintf '%s\\n' "$1" >> '${record}'\n`)
  await chmod(launcher, 0o755)
  await writeFile(record, '')
  return {
    environment: { BROWSER: `${launcher} %s`, DBUS_SESSION_BUS_ADDRESS: '', XDG_RUNTIME_DIR: '', XDG_CURRENT_DESKTOP: '', DESKTOP_SESSION: '', GNOME_DESKTOP_SESSION_ID: '', KDE_FULL_SESSION: '', DISPLAY: '', WAYLAND_DISPLAY: '' },
    opened: async () => (await readFile(record, 'utf8')).split('\n').filter(Boolean),
    close: () => rm(directory, { recursive: true, force: true }),
  }
}

// Real built CLI with `--no-mcp` in a PTY: the stories screen lists the real collected catalog,
// opens the exact variant through the real `open` package (only the OS launcher is a stub),
// and stops being actionable when a story file edit removes the selected variant.
it.skipIf(process.platform !== 'linux')('browses the catalog without MCP and opens the exact requested variant', async () => {
  const project = await createTerminalProject()
  cleanup.push(() => project.close())
  await writeFile(resolve(project.root, 'Zeta.story.vue'), story(['alpha', 'beta']))
  const browser = await createBrowserStub()
  cleanup.push(() => browser.close())
  const cli = startPty({ args: TERMINAL_DEV_ARGS, cwd: project.root, columns: 110, rows: 30, environment: browser.environment })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Ready in/)
  const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(cli.text())![0]

  let mark = cli.mark()
  cli.write('p')
  await cli.waitForRaw(/\u001B\[\?1049h/, { from: mark })
  await cli.waitFor(/Stdio Book[\s\S]*Zeta Book/, { from: mark })
  expect(cli.text(mark)).toMatch(/2 of 2 stories/)

  // Second story (sorted by ID after the fixture's), then its second variant: not the first item.
  mark = cli.mark()
  cli.write('\u001B[B\r')
  await cli.waitFor(/alpha[\s\S]*beta/, { from: mark })
  cli.write('\u001B[B\r')
  await expect.poll(() => browser.opened(), { timeout: 20_000 }).toEqual([`${origin}/story/zeta?variantId=beta`])

  // The story list opens the story route without inventing a variant.
  mark = cli.mark()
  cli.write('\u001B')
  // A key right behind Escape would read as Alt+key: wait for the list to repaint.
  await cli.waitFor(/2 of 2 stories/, { from: mark })
  cli.write('o')
  await expect.poll(() => browser.opened(), { timeout: 20_000 }).toEqual([`${origin}/story/zeta?variantId=beta`, `${origin}/story/zeta`])

  // A real file edit removes the selected variant: the screen says so and `o` opens nothing.
  mark = cli.mark()
  cli.write('\r')
  await cli.waitFor(/beta/, { from: mark })
  mark = cli.mark()
  await writeFile(resolve(project.root, 'Zeta.story.vue'), story(['alpha', 'gamma']))
  await cli.waitFor(/gamma/, { from: mark, timeout: 60_000 })
  await cli.waitFor(/Selected variant is not in the catalog/, { from: mark })
  cli.write('o')
  await new Promise(resolveWait => setTimeout(resolveWait, 500))
  expect(await browser.opened()).toHaveLength(2)

  // Back to the main screen, the panel shows the catalog counts; `q` exits cleanly.
  mark = cli.mark()
  cli.write('q')
  await cli.waitForRaw(/\u001B\[\?1049l/, { from: mark })
  await cli.waitFor(/2 stories, 3 variants/, { from: mark })
  cli.write('q')
  expect(await cli.waitForExit()).toBe(0)
}, 180_000)

// The router mode and base come from the real running server, not from defaults.
it.skipIf(process.platform !== 'linux')('opens hash router URLs under the configured base', async () => {
  const project = await createTerminalProject()
  cleanup.push(() => project.close())
  await writeFile(resolve(project.root, 'Zeta.story.vue'), story(['alpha']))
  await writeFile(resolve(project.root, 'vite.config.ts'), `import vue from '@vitejs/plugin-vue'; export default { base: '/book/', plugins: [vue()], server: { open: false } }`)
  await writeFile(resolve(project.root, 'custom config.ts'), `
import { HstVue } from '@histoire/plugin-vue';
export default { plugins: [HstVue()], storyMatch: ['*.story.vue'], mcp: false, routerMode: 'hash' };
`)
  const browser = await createBrowserStub()
  cleanup.push(() => browser.close())
  const cli = startPty({ args: TERMINAL_DEV_ARGS, cwd: project.root, columns: 110, rows: 30, environment: browser.environment })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Ready in/)
  const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(cli.text())![0]
  const mark = cli.mark()
  cli.write('p')
  await cli.waitFor(/Zeta Book/, { from: mark })
  cli.write('\u001B[B\r')
  await cli.waitFor(/alpha/, { from: mark })
  cli.write('\r')
  await expect.poll(() => browser.opened(), { timeout: 20_000 }).toEqual([`${origin}/book/#/story/zeta?variantId=alpha`])
}, 180_000)
