/**
 * Message types of the host <-> preview protocol.
 *
 * Re-exported from `@histoire/shared` (which also declares the payload of each
 * message): the generated preview runtime imports them from this module's
 * bundled build, so the path stays stable for it.
 */
export {
  COLLECT_TESTS,
  CONTROLS_READY,
  CONTROLS_RESIZE,
  EVENT_SEND,
  PREVIEW_SETTINGS_SYNC,
  PREVIEW_SYNC,
  RUN_TESTS,
  SANDBOX_READY,
  SELECT_VARIANT,
  STATE_SYNC,
  TEST_DEFINITIONS,
  TEST_RESULT,
  VARIANT_READY,
} from '@histoire/shared'
