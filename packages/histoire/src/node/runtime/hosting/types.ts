import type { HttpServer } from 'vite'

/** Shared Vite integration for both owned and caller-owned HTTP/1 listeners. */
export interface MiddlewareHostingOptions {
  /** HMR uses this exact server; Vite does not listen on or close it. */
  httpServer: HttpServer
  /** Explicit middleware mount; managed hosting uses configured base. */
  base?: string
  /** External origin; managed listeners resolve origin after binding. */
  publicOrigin?: string
}
