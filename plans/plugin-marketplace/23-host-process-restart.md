# 23 — Host process restart

Status: **complete** (orchestrator, 2026-11-05). Dependencies: 06, 09, 10, 12, 18. Wave 11. See [receipt](receipts/23.md).

## Goal

Load changed plugin code in a new process. A config reload inside the same process can keep plugin modules cached (receipt 21 deviation 4), and package-only changes used to depend on the browser calling `POST /__histoire/dev/restart`.

## Design

- **Dev proxy protocol:** new child message `{ type: 'restart', generation, source, fresh? }` (`source` at most `RESTART_SOURCE_MAX_LENGTH` = 200 characters) and restart cause kind `runtime`. Only a ready, current generation is honored; the proxy records the cause and replaces the child process through the existing coordinator, so it coalesces with a config-watcher restart.
- **Runtime bridge:** `NODE/runtime/host-restart.ts` holds the process host (`setHostRestart`, `getHostRestart`). `commands/dev-child.ts` registers delivery over IPC. In-process SDK/MCP runtimes register nothing.
- **Jobs:** `JobRunnerOptions.restart` (default `getHostRestart()` in handlers). After the config step, or after a package-only change, the job marks `restart` running, writes the handoff receipt and asks the host (`Installed <id>`, fresh when packages changed). The successor process completes `load` from the receipt. Ask mode holds before the first restart trigger with `awaiting: 'continue'`. Without a host, or when delivery fails, package-only changes end with `awaiting: 'restart'` (manual).
- **Workbench:** no browser restart request. "Restart now" only resumes `awaiting: 'continue'`; `awaiting: 'restart'` shows "Restart the dev server to finish". `install/restart.ts` removed.
- **CLI:** `runtime` cause prints `<source>, restarting[ fresh]...`.
