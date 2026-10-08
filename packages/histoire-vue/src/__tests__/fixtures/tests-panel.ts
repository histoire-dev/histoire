import type { VueWrapper } from '@vue/test-utils'

/** Displayed test names paired with their accessible state labels. */
export function testRows(wrapper: Pick<VueWrapper, 'findAll'>): string[][] {
  return wrapper.findAll('.histoire-test-row').map(row => [row.get('.histoire-test-name').text(), row.get('[role="img"]').attributes('aria-label')!])
}
