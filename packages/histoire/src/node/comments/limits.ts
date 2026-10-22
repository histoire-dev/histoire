/** Persisted history never exceeds this message count. */
export const COMMENT_MESSAGE_LIMIT = 64
/** Persisted thread JSON never exceeds this byte budget. */
export const COMMENT_BYTE_LIMIT = 48 * 1024
/** One project comment document stays bounded for startup and snapshot safety. */
export const COMMENT_FILE_BYTE_LIMIT = 2 * 1024 * 1024
/** Admission reserves this encoded-byte budget for one visibly bounded final reply. */
export const COMMENT_AGENT_REPLY_BYTES = 24 * 1024
/** Maximum persisted agent steps per message. */
export const COMMENT_STEP_LIMIT = 64
/** Maximum persisted plan entries per message. */
export const COMMENT_PLAN_LIMIT = 50
/** Maximum persisted plan decisions per message. */
export const COMMENT_DECISION_LIMIT = 8
/** Longest persisted plan text per decision. */
export const COMMENT_DECISION_PLAN_CHARS = 16_000
