import type { HistoireServerHandle } from '../../api/types.js'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getProjectServices } from '../../api/internal.js'
import { createHistoireProject } from '../../api/project.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

describe('terminal Node project acquisition', () => {
  it.each(['middleware', 'managed', 'preview'] as const)('does not acquire %s after a starting subscriber closes project', async (kind) => {
    const fixture = await createMcpProjectFixture()
    await writeFile(join(fixture.root, 'histoire.config.mjs'), `export default {
      mcp: false, storyMatch: [], plugins: [{ name: 'terminal-acquisition', configResolved() {
        throw new Error('Configuration evaluated after project close')
      } }],
    }`)
    const project = await createHistoireProject({ root: fixture.root, configFile: 'histoire.config.mjs' })
    const server = createServer()
    const listening = server.listeners('listening')
    const errors = server.listeners('error')
    let closing: Promise<void> | undefined
    let handle: HistoireServerHandle | undefined
    project.subscribe((snapshot) => {
      if (snapshot.status === 'starting' && !closing) closing = project.close()
    })
    try {
      const acquisition = kind === 'middleware'
        ? project.createMiddleware({ httpServer: server, base: '/book/', publicOrigin: 'http://127.0.0.1:6006' })
        : kind === 'managed' ? project.startDev({ port: 0, host: '127.0.0.1' }) : project.preview({ port: 0, host: '127.0.0.1' })
      await expect(acquisition.then((result) => {
        handle = result
        return result
      })).rejects.toMatchObject({ code: 'DISPOSED' })
      await closing
      await project.close()
      expect(project.getSnapshot().status).toBe('closed')
      expect(getProjectServices(project).dev).toBeUndefined()
      expect(getProjectServices(project).preview).toBeUndefined()
      expect(server.listeners('listening')).toEqual(listening)
      expect(server.listeners('error')).toEqual(errors)
      expect(server.listening).toBe(false)
    }
    finally {
      await handle?.close()
      await project.close()
      await fixture.close()
    }
  })

  it('joins same close promise when terminal publication subscriber closes again', async () => {
    const fixture = await createMcpProjectFixture()
    const project = await createHistoireProject({ root: fixture.root })
    let joined: Promise<void> | undefined
    let reentered = false
    project.subscribe((snapshot) => {
      if (snapshot.status === 'closed' && !reentered) {
        reentered = true
        joined = project.close()
      }
    })
    try {
      const closing = project.close()
      expect(joined).toBe(closing)
      await closing
      expect(project.close()).toBe(closing)
    }
    finally {
      await project.close()
      await fixture.close()
    }
  })
})
