import type { McpProject } from '../protocol/project-schema.js'

/** Project execution readiness changes independently of stable catalog/dependency availability. */
export function withExecutionAvailability(capabilities: McpProject['capabilities'], available: boolean): McpProject['capabilities'] {
  if (available) return capabilities
  const reason = 'Server execution is unavailable. Restart Histoire to restore browser execution.'
  return { ...capabilities, screenshots: { ...capabilities.screenshots, available: false, reason }, ...(capabilities.inspection ? { inspection: { available: false, reason } } : {}), tests: { ...capabilities.tests, available: false, reason } }
}
