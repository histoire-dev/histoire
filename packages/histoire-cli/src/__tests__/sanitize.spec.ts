import { expect, it } from 'vitest'
import { sanitizeText } from '../terminal/output/sanitize.js'

it('drops carriage returns and bidi controls but keeps newlines', () => {
  expect(sanitizeText('safe\rEVIL\nnext')).toBe('safeEVIL\nnext')
  expect(sanitizeText('a‮b⁦c⁩d‏e')).toBe('abcde')
})
