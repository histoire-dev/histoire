import { histoireCarbonIcons, histoireIconNames } from '@histoire/shared/dist/icons/index.js'
import { addCollection } from '@iconify/vue'

export { getHistoireIcon as getWorkbenchIcon } from '@histoire/shared/dist/icons/index.js'
export type { HistoireIconData as WorkbenchIconData } from '@histoire/shared/dist/icons/index.js'

/** Available offline names; regenerate the JSON subset when adding a Carbon glyph. */
export const workbenchIconNames = histoireIconNames
/** Iconify-compatible map retained for older first-party components. */
export const workbenchIcons = Object.fromEntries(workbenchIconNames.map(name => [name, `carbon:${name}`]))

// Existing first-party Icon components share the same cache as WorkbenchIcon.
addCollection(histoireCarbonIcons)
