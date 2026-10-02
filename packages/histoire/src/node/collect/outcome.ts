/** Completed execution of one registered story file. */
export interface StoryCollectionOutcome {
  /** Empty and failed outcomes must never reuse a previous collected story. */
  status: 'collected' | 'empty' | 'failed'
  /** Original failure is retained privately and sanitized before publication. */
  error?: unknown
  /** Raw registered source fingerprint captured before executing collected metadata. */
  sourceSha256?: string
}
