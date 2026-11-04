/** Placeholder replacing configured credentials in retained text. */
const REDACTION = '[credential]'

/** Longest string-type escape (OSC, DCS, ...) swallowed before the sequence is abandoned. */
const MAX_STRING_SEQUENCE = 4096

/**
 * Whether a code unit is a Unicode bidirectional control (marks, embeddings, isolates). They
 * can visually reorder surrounding text, so retained and rendered text never keeps them.
 * @param code UTF-16 code unit.
 */
function isBidiControl(code: number): boolean {
  return code === 0x061C || code === 0x200E || code === 0x200F || (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069)
}

/** Scanner states of the terminal escape recognizer. */
const enum State {
  Text,
  Escape,
  Csi,
  Str,
  StrEscape,
  EscapeIntermediate,
}

/**
 * Creates a stateful remover of untrusted terminal control sequences. State
 * survives between calls, so an escape split across chunks is still removed.
 * Keeps printable text, `\n`, `\r` and `\t`; drops every other C0/C1 control, bidi
 * controls, CSI, OSC, DCS/APC/PM/SOS and two-byte escapes. Unterminated sequences are
 * abandoned at a newline or after a bound instead of swallowing later output.
 */
export function createControlStripper(): (text: string) => string {
  let state = State.Text
  let stringLength = 0

  /** Handles one UTF-16 unit; returns it when it is visible text, otherwise ''. */
  function step(char: string): string {
    const code = char.charCodeAt(0)
    switch (state) {
      case State.Text:
        if (code === 0x1B) state = State.Escape
        else if (code === 0x9B) state = State.Csi
        else if (code === 0x9D || code === 0x90 || code === 0x98 || code === 0x9E || code === 0x9F) {
          state = State.Str
          stringLength = 0
        }
        else if (code === 0x0A || code === 0x0D || code === 0x09) return char
        else if (code < 0x20 || (code >= 0x7F && code <= 0x9F) || isBidiControl(code)) return ''
        else return char
        return ''
      case State.Escape:
        if (char === '[') state = State.Csi
        else if (char === ']' || char === 'P' || char === 'X' || char === '^' || char === '_') {
          state = State.Str
          stringLength = 0
        }
        else if (code >= 0x20 && code <= 0x2F) state = State.EscapeIntermediate
        else {
          // A lone ESC before a line break must not eat the break.
          state = State.Text
          return code === 0x0A || code === 0x0D ? char : ''
        }
        return ''
      case State.EscapeIntermediate:
        if (code < 0x20 || code > 0x2F) state = State.Text
        return ''
      case State.Csi:
        if (code >= 0x40 && code <= 0x7E) state = State.Text
        else if (code < 0x20 || code > 0x3F) {
          // Malformed: leave the sequence and treat the unit as ordinary input.
          state = State.Text
          return step(char)
        }
        return ''
      case State.Str:
        if (code === 0x07 || code === 0x9C) state = State.Text
        else if (code === 0x1B) state = State.StrEscape
        else if (code === 0x0A || ++stringLength > MAX_STRING_SEQUENCE) {
          state = State.Text
          return step(char)
        }
        return ''
      case State.StrEscape:
        if (char === '\\') {
          state = State.Text
          return ''
        }
        // ESC inside a string starts a fresh sequence.
        state = State.Escape
        return step(char)
    }
  }

  return (text) => {
    let result = ''
    for (let index = 0; index < text.length; index++) result += step(text[index])
    return result
  }
}

/**
 * Replaces credentials in a complete text. When the text was cut at a bound, a
 * trailing fragment that starts a credential is removed too.
 * @param text Text to redact.
 * @param secrets Configured credentials; empty strings are ignored.
 * @param truncated Whether the end of the text was cut by a bound.
 */
export function redactSecrets(text: string, secrets: readonly string[], truncated = false): string {
  let result = text
  for (const secret of secrets) {
    if (!secret) continue
    result = result.replaceAll(secret, REDACTION)
    if (!truncated) continue
    // The cut may have split a credential; drop its visible beginning (4+ units).
    for (let length = Math.min(secret.length - 1, result.length); length >= 4; length--) {
      if (result.endsWith(secret.slice(0, length))) {
        result = result.slice(0, -length)
        break
      }
    }
  }
  return result
}

/**
 * Sanitizes a complete, self-contained text (controls, then credentials). Carriage returns
 * are dropped too: unlike the streaming decoder, a complete text has no line to rewrite, and
 * a kept `\r` would let one rendered row overwrite itself.
 * @param text Text to sanitize.
 * @param secrets Configured credentials.
 * @param truncated Whether the end of the text was cut by a bound.
 */
export function sanitizeText(text: string, secrets: readonly string[] = [], truncated = false): string {
  return redactSecrets(createControlStripper()(text).replaceAll('\r', ''), secrets, truncated)
}

/**
 * Sanitizes untrusted text shown inside one terminal row: like {@link sanitizeText}, then
 * line breaks and tabs collapse to spaces so the value cannot add rows or break alignment.
 * @param text Text to sanitize.
 * @param secrets Configured credentials.
 */
export function sanitizeLine(text: string, secrets: readonly string[] = []): string {
  return sanitizeText(text, secrets).replace(/\s+/g, ' ')
}
