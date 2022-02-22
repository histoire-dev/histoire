import { resolveConfigFile } from '../config.js'
import { createContext } from '../context.js'
import { createServer } from '../server.js'
import chokidar from 'chokidar'
import pc from 'picocolors'

export interface DevOptions {
  port: number
}

export async function devCommand (options: DevOptions) {
  let stop: () => Promise<void>

  async function start () {
    const ctx = await createContext({
      mode: 'dev',
    })
    const { server, close } = await createServer(ctx, options.port)
    server.printUrls()

    // Histoire config watcher
    let watcher: chokidar.FSWatcher
    if (server.config.configFile) {
      watcher = chokidar.watch(server.config.configFile, {
        ignoreInitial: true,
      })
      watcher.on('change', () => {
        restart('Vite')
      })
    }

    return async () => {
      await watcher?.close()
      await close()
    }
  }

  async function restart (source: string) {
    if (stop) {
      console.log(pc.blue(`${source} config changed, restarting...`))
      stop()
      stop = null // Don't call stop again until new start() is done
      stop = await start()
    }
  }

  stop = await start()

  const configFile = await resolveConfigFile()
  if (configFile) {
    const watcher = chokidar.watch(configFile, {
      ignoreInitial: true,
    })
    watcher.on('change', () => {
      restart('Histoire')
    })
  }
}
