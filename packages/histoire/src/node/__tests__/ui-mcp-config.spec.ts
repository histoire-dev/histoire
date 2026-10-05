import { stat } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { uiStdioConfig } from '../server/ui-channel/mcp.js'

describe('dev UI stdio client config', () => {
  it('uses actual executable and installed CLI flags without environment or credentials', async () => {
    const config = uiStdioConfig({ root: '/project with spaces', configFile: '/project with spaces/histoire.config.ts' })
    expect(config).toEqual({ command: process.execPath, args: [expect.stringMatching(/\/histoire\/bin\.mjs$/), 'mcp', '--root', '/project with spaces', '--config', '/project with spaces/histoire.config.ts'] })
    expect((await stat(config.args[0])).isFile()).toBe(true)
    expect(Object.keys(config)).toEqual(['command', 'args'])
  })
})
