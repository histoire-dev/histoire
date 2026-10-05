const { getHistoireColorChannels, parseColor } = require('@histoire/protocol')
const inherited = require('./tailwind.config.cjs')

/** Peer controls inherit only owning provider palette, with canonical defaults outside custom palettes. */
function color(colorName, shade, fallback) {
  const value = getHistoireColorChannels(parseColor(fallback))
  const variable = `--_histoire-color-${colorName}-${shade}`
  return ({ opacityValue = 1 }) => `rgb(var(${variable}, ${value.channels}) / calc(var(${variable}-alpha, ${value.alpha}) * ${opacityValue}))`
}
const colors = Object.fromEntries(Object.entries(inherited.theme.extend.colors).map(([name, shades]) => [name, Object.fromEntries(Object.entries(shades).map(([shade, fallback]) => [shade, color(name, shade, fallback)]))]))
module.exports = { ...inherited, theme: { ...inherited.theme, extend: { ...inherited.theme.extend, colors } } }
