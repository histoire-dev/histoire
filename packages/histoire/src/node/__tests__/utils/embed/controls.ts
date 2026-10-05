import type { Frame, Locator, Page } from 'playwright'

type AccessibleScope = Frame | Locator | Page

/** Choose a value through Histoire's accessible custom-select interaction. */
export async function chooseHistoireSelectOption(triggerScope: AccessibleScope, optionScope: AccessibleScope, label: string, option: string): Promise<void> {
  await triggerScope.getByRole('button', { name: label, exact: true }).click()
  await optionScope.getByRole('option', { name: option, exact: true }).click()
}
