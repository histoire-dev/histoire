/** One selectable value of a choice field. */
export interface UiAgentElicitationOption {
  /** Value sent back to the agent. */
  value: string
  /** Visible label. */
  label: string
  /** Optional secondary text. */
  description?: string
}

/** Fields shared by every elicitation form field. */
interface UiAgentElicitationFieldBase {
  /** Property name in the submitted content. */
  key: string
  /** Visible label; the key is shown when omitted. */
  title?: string
  /** Optional help text. */
  description?: string
  /** Whether a value must be provided on accept. */
  required: boolean
}

/** Free text input. */
export interface UiAgentElicitationTextField extends UiAgentElicitationFieldBase {
  /** Field kind. */
  type: 'text'
  /** Expected string format. */
  format?: 'email' | 'uri' | 'date' | 'date-time'
  /** Minimum length. */
  minLength?: number
  /** Maximum length. */
  maxLength?: number
  /** Regular expression the value must match. */
  pattern?: string
  /** Initial value. */
  default?: string
}

/** Single-select from fixed options. */
export interface UiAgentElicitationChoiceField extends UiAgentElicitationFieldBase {
  /** Field kind. */
  type: 'choice'
  /** Allowed values. */
  options: UiAgentElicitationOption[]
  /** Initial value. */
  default?: string
}

/** Multi-select from fixed options. */
export interface UiAgentElicitationMultiChoiceField extends UiAgentElicitationFieldBase {
  /** Field kind. */
  type: 'multi-choice'
  /** Allowed values. */
  options: UiAgentElicitationOption[]
  /** Minimum selected count. */
  minItems?: number
  /** Maximum selected count. */
  maxItems?: number
  /** Initially selected values. */
  default?: string[]
}

/** Number input. */
export interface UiAgentElicitationNumberField extends UiAgentElicitationFieldBase {
  /** Field kind. */
  type: 'number'
  /** Only whole numbers are accepted. */
  integer: boolean
  /** Inclusive lower bound. */
  minimum?: number
  /** Inclusive upper bound. */
  maximum?: number
  /** Initial value. */
  default?: number
}

/** Yes/no switch. */
export interface UiAgentElicitationBooleanField extends UiAgentElicitationFieldBase {
  /** Field kind. */
  type: 'boolean'
  /** Initial value. */
  default?: boolean
}

/** One supported form field projected from an ACP elicitation schema. */
export type UiAgentElicitationField
  = | UiAgentElicitationTextField
    | UiAgentElicitationChoiceField
    | UiAgentElicitationMultiChoiceField
    | UiAgentElicitationNumberField
    | UiAgentElicitationBooleanField

/** One submitted field value. */
export type UiAgentElicitationValue = string | number | boolean | string[]

/** Fields shared by every pending elicitation card. */
interface UiAgentElicitationBase {
  /** Broker-owned identity. */
  requestId: string
  /** Agent asking. */
  agentId: string
  /** Thread whose active prompt asked. */
  threadId: string
  /** Redacted human-readable request. */
  message: string
  /** UTC time the request expires and is cancelled. */
  expiresAt: string
}

/** Structured input requested through a form. */
export interface UiAgentElicitationForm extends UiAgentElicitationBase {
  /** Elicitation mode. */
  mode: 'form'
  /** Optional form title. */
  title?: string
  /** Optional form description. */
  description?: string
  /** Supported fields in agent order. */
  fields: UiAgentElicitationField[]
}

/** Out-of-band step the user completes on a web page. */
export interface UiAgentElicitationUrl extends UiAgentElicitationBase {
  /** Elicitation mode. */
  mode: 'url'
  /** Validated http(s) address. */
  url: string
  /** Host shown before opening. */
  host: string
}

/** One pending agent request for user input. */
export type UiAgentElicitation = UiAgentElicitationForm | UiAgentElicitationUrl

/** Why a pending elicitation card was removed. */
export interface UiAgentElicitationResolved {
  /** Broker-owned identity. */
  requestId: string
  /** Removal cause. */
  reason: 'answered' | 'completed' | 'cancelled' | 'expired'
}

/** Browser answer to a pending elicitation. */
export interface UiAgentElicitationReply {
  /** Broker-owned identity. */
  requestId: string
  /** Submit, skip, or dismiss. */
  action: 'accept' | 'decline' | 'cancel'
  /** Submitted values, for `accept` on form requests. */
  content?: Record<string, UiAgentElicitationValue>
}
