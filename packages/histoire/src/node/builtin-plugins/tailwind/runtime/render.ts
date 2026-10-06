import type { TailwindToken, TailwindTokenCategory } from '../types.js'
import { h } from '../../../vendors/vue.js'

/** Render finite visual sample without altering authored/copyable token value. */
export function renderTokenSample(category: TailwindTokenCategory, token: TailwindToken, state: Record<string, any>) {
  const style: Record<string, string> = { ...token.preview }
  const typography = category.kind === 'text' || category.kind === 'text-color'
  if (typography && category.id !== 'font-size') style.fontSize = `${state.fontSize}px`
  if (category.id === 'spacing') style.width = token.preview.padding ?? token.preview.width
  const child = category.kind === 'padding' || category.kind === 'margin'
    ? h('div', { class: 'histoire-tailwind-inner' })
    : typography ? state.sampleText : null
  return h('div', { 'class': ['histoire-tailwind-sample', `histoire-tailwind-${category.kind}`], 'data-tailwind-token': token.name }, [
    h('div', { style, 'class': ['histoire-tailwind-value', token.utility], 'data-tailwind-value': token.name }, child),
  ])
}

/** Scoped sample geometry; controls retain their own shared style/theme. */
export const tailwindSampleCss = `
.histoire-tailwind-sample {
  min-width: 0;
  max-width: 100%;
  overflow: auto;
  padding: 8px;
}
.histoire-tailwind-value { min-width: 0; }
.histoire-tailwind-color .histoire-tailwind-value {
  height: 80px;
  border-radius: 4px;
}
.histoire-tailwind-text-color .histoire-tailwind-value { min-height: 80px; }
.histoire-tailwind-border-color .histoire-tailwind-value {
  height: 80px;
  border: 2px solid;
  border-radius: 4px;
}
.histoire-tailwind-text .histoire-tailwind-value { overflow-wrap: anywhere; }
.histoire-tailwind-box, .histoire-tailwind-border { padding: 24px; }
.histoire-tailwind-box .histoire-tailwind-value, .histoire-tailwind-border .histoire-tailwind-value {
  width: 96px;
  height: 96px;
  background: rgb(113 113 122 / .5);
}
.histoire-tailwind-border .histoire-tailwind-value { border-style: solid; }
.histoire-tailwind-width .histoire-tailwind-value {
  height: 32px;
  background: rgb(113 113 122 / .5);
}
.histoire-tailwind-height { max-height: 240px; }
.histoire-tailwind-height .histoire-tailwind-value {
  width: 64px;
  background: rgb(113 113 122 / .5);
}
.histoire-tailwind-padding .histoire-tailwind-value {
  width: fit-content;
  background: rgb(113 113 122 / .15);
}
.histoire-tailwind-margin { border: 1px dashed rgb(113 113 122 / .5); }
.histoire-tailwind-inner {
  width: 48px;
  height: 48px;
  background: rgb(113 113 122 / .5);
}
`
