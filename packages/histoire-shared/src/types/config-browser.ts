/** Browser choices supported by Histoire-owned isolated execution. */
export type HistoireBrowserSource = 'auto' | 'headless-shell' | 'chromium' | 'chrome' | 'msedge' | 'executable'

/** Trusted browser policy shared by each supported source choice. */
type HistoireBrowserSourceConfig = {
  /** Prefer existing compatible browser installations. */
  source?: 'auto' | 'headless-shell' | 'chromium' | 'chrome' | 'msedge'
} | {
  /** Use exactly the configured local executable; never fall back. */
  source: 'executable'
  /** Absolute path or project-root-relative executable path. */
  executablePath: string
}

/** Trusted browser policy for Histoire-owned screenshots and inspections. */
export type HistoireBrowserConfig = HistoireBrowserSourceConfig & {
  /** Reuse one browser process between captures while creating a fresh context each time. */
  reuse?: boolean
  /** Idle lifetime before a reused browser process closes; valid only when reuse is enabled. */
  idleTimeoutMs?: number
}
