import type { RuntimeOutput } from '@histoire/dev-proxy/protocol'
import type { LineDecoder } from './decoder.js'
import type { LogHistory } from './history.js'
import { isTerminalLogEvent, TERMINAL_BOUNDS, truncateText } from '../protocol/core.js'
import { createLineDecoder } from './decoder.js'
import { sanitizeText } from './sanitize.js'

/** Minimal writable used for visible output. */
export interface OutputSink {
  write: (data: string | Uint8Array) => unknown
}

/** Where untouched output goes while no renderer owns the screen. */
export interface OutputPassthrough {
  stdout: OutputSink
  stderr: OutputSink
}

/** Single entry for every output source: child streams, child console events, proxy diagnostics. */
export interface OutputPipeline {
  /** Proxy `onOutput`: decodes into history and forwards the raw bytes unchanged. */
  onOutput: (output: RuntimeOutput) => void
  /** Child console `log` event payload (validated here): records it and forwards `text\n` on the matching stream. */
  onLog: (event: unknown, generation?: string) => void
  /** Proxy `onDiagnostic`: records it and forwards `text\n` on stderr. */
  onDiagnostic: (text: string) => void
  /** Flushes unfinished lines of every stream (shutdown). */
  flush: () => void
}

/**
 * Routes all runtime output through one decoder/sanitizer into the history.
 * Passthrough keeps the pre-existing visible output byte for byte; only the
 * retained copy is sanitized and redacted. No process-wide stream patching.
 * @param options History, credentials to redact, and the optional visible sinks.
 */
export function createOutputPipeline(options: { history: LogHistory, secrets?: readonly string[], passthrough?: OutputPassthrough }): OutputPipeline {
  const secrets = options.secrets ?? []
  const decoders = new Map<'stdout' | 'stderr', { generation: string, decoder: LineDecoder }>()

  /** Returns the decoder for a stream, flushing the previous generation's tail first. */
  function decoderFor(stream: 'stdout' | 'stderr', generation: string) {
    const current = decoders.get(stream)
    if (current?.generation === generation) return current.decoder
    current?.decoder.end()
    const decoder = createLineDecoder(line => options.history.append({ source: stream, level: stream === 'stderr' ? 'error' : 'log', text: line.text, truncated: line.truncated, generation }), secrets)
    decoders.set(stream, { generation, decoder })
    return decoder
  }

  /** Visible output must never fail because of a broken sink. */
  function forward(stream: 'stdout' | 'stderr', data: string | Uint8Array) {
    try {
      options.passthrough?.[stream].write(data)
    }
    catch {}
  }

  return {
    onOutput({ stream, generation, chunk }) {
      if (!chunk) {
        decoders.get(stream)?.decoder.end()
        decoders.delete(stream)
        return
      }
      forward(stream, chunk)
      decoderFor(stream, generation).write(chunk)
    },
    onLog(event, generation) {
      if (!isTerminalLogEvent(event)) return
      const cut = truncateText(event.text, TERMINAL_BOUNDS.logTextLength)
      const truncated = (event.truncated ?? 0) + cut.truncated
      options.history.append({ source: 'console', level: event.level, text: sanitizeText(cut.text, secrets, truncated > 0), truncated, generation })
      forward(event.level === 'warn' || event.level === 'error' ? 'stderr' : 'stdout', `${event.text}\n`)
    },
    onDiagnostic(text) {
      const cut = truncateText(text, TERMINAL_BOUNDS.logTextLength)
      options.history.append({ source: 'diagnostic', level: 'error', text: sanitizeText(cut.text, secrets, cut.truncated > 0), truncated: cut.truncated })
      forward('stderr', `${text}\n`)
    },
    flush() {
      for (const { decoder } of decoders.values()) decoder.end()
      decoders.clear()
    },
  }
}
