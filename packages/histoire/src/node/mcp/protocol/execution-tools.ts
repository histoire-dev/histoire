import { MCP_INSPECTION_TOOLS } from './inspection-schema.js'

/** Canonical kind-to-tool mapping used by admission, discovery and UI activity. */
export const MCP_EXECUTION_TOOLS = {
  screenshot: 'histoire_capture_screenshot',
  tests: 'histoire_run_tests',
  ...MCP_INSPECTION_TOOLS,
} as const
