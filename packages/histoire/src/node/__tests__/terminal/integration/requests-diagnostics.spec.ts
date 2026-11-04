/* eslint-disable no-control-regex -- terminal escape sequences are the subject of this test */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createTerminalProject } from '../../utils/terminal/project.js'
import { startPty } from '../../utils/terminal/pty.js'

/** Cleanup registered by each test; always joined, even after a failed assertion. */
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close().catch(() => {})
})

// Real built CLI in a PTY with MCP enabled and one story that fails to collect: public HTTP
// requests (query and header secrets never shown), runtime diagnostics in the session screen
// and `x` deleting the request history.
it('lists real requests without secrets, shows collection and MCP diagnostics, and deletes requests with x', async () => {
  const project = await createTerminalProject()
  cleanup.push(() => project.close())
  await writeFile(resolve(project.root, 'custom config.ts'), `
import { HstVue } from '@histoire/plugin-vue';
export default { plugins: [HstVue()], storyMatch: ['*.story.vue'] };
`)
  await writeFile(resolve(project.root, 'Broken.story.vue'), `<script setup>throw new Error('broken story setup')</script>\n<template><Story title="Broken"><Variant title="x"><button>x</button></Variant></Story></template>\n`)
  const cli = startPty({ args: ['dev', '--port', '0', '--host', '127.0.0.1', '--config', 'custom config.ts', '--mcp-port', '0'], cwd: project.root, columns: 130, rows: 30 })
  cleanup.push(() => cli.close())
  await cli.waitFor(/Ready in/, { timeout: 90_000 })
  const local = (await cli.waitFor(/Local: (http:\/\/127\.0\.0\.1:\d+\/)/))[1]

  // Real traffic through the public listener; the query and the header carry secrets.
  const response = await fetch(`${local}__probe/asset.js?token=PTY-QUERY-SECRET`, { headers: { authorization: 'Bearer PTY-HEADER-SECRET' } })
  await response.arrayBuffer()
  let mark = cli.mark()
  cli.write('n')
  await cli.waitForRaw(/\u001B\[\?1049h/, { from: mark })
  await cli.waitFor(/GET \/__probe\/asset\.js {2}\d{3} {2}(completed|failed)/, { from: mark })
  cli.write('\u001B')
  await cli.waitForRaw(/\u001B\[\?1049l/, { from: mark })

  // Session screen: collection issue of the broken story, enabled MCP endpoint, request count.
  mark = cli.mark()
  cli.write('i')
  await cli.waitFor(/Collection {2}partial · \d+ issues?/, { from: mark, timeout: 30_000 })
  const info = cli.text(mark)
  expect(info).toMatch(/COLLECTION_FAILED Broken\.story\.vue/)
  expect(info).toMatch(/MCP {9}http:\/\/127\.0\.0\.1:\d+\/mcp[^\n]*0 clients/)
  expect(info).toMatch(/Requests {4}\d+ retained/)
  mark = cli.mark()
  cli.write('\u001B')
  // A key right behind Escape would read as Alt+key: wait for the main screen first.
  await cli.waitForRaw(/\u001B\[\?1049l/, { from: mark })
  cli.write('x')
  await cli.waitFor(/Deleted \d+ log entries, \d+ requests/, { from: mark })
  expect(cli.text()).not.toMatch(/PTY-(QUERY|HEADER)-SECRET/)
  cli.write('q')
  expect(await cli.waitForExit()).toBe(0)
}, 240_000)
