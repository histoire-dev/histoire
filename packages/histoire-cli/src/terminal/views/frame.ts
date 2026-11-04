import type { Style } from '../style.js'
import { defaultStyle } from '../style.js'
import { displayWidth, fitWidth } from '../width.js'

/**
 * Lays out a full-screen view: brand title bar, body rows, footer hint on the last row.
 * Every line is fitted to the width; the result is exactly `rows` lines.
 * @param options Title, body lines (already wrapped/fitted or not), footer text and screen size.
 * @param options.title Header text.
 * @param options.body Content rows; extra rows are cut.
 * @param options.footer Hint row.
 * @param options.columns Screen width.
 * @param options.rows Screen height.
 * @param options.style Palette; defaults to the one the environment allows.
 */
export function renderViewFrame(options: { title: string, body: readonly string[], footer: string, columns: number, rows: number, style?: Style }): string[] {
  const style = options.style ?? defaultStyle()
  const height = Math.max(1, options.rows - 2)
  const title = fitWidth(` ${options.title} `, options.columns)
  const lines = [style.seal(style.title(`${title}${' '.repeat(Math.max(0, options.columns - displayWidth(title)))}`))]
  for (let index = 0; index < height; index++) lines.push(fitWidth(options.body[index] ?? '', options.columns))
  lines.push(style.seal(fitWidth(style.hints(options.footer), options.columns)))
  return lines.slice(0, options.rows)
}
