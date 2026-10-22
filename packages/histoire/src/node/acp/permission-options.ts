import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk'
import type { UiAgentPermissionChoice } from '@histoire/shared'

/** Cancellation; ACP reserves it for abandoned requests, never an explicit choice. */
export const cancelledPermission: RequestPermissionResponse = { outcome: { outcome: 'cancelled' } }
/** Longest plan text shown on an approval card. */
const PLAN_TEXT_LIMIT = 32_000

/** One card choice and the exact agent response it selects. */
export interface PermissionChoice extends UiAgentPermissionChoice {
  /** Response sent when the user picks this choice. */
  response: RequestPermissionResponse
}

/**
 * Selects the first agent option of a kind.
 * @param request Agent permission request.
 * @param kind ACP option kind.
 */
export function selectOption(request: RequestPermissionRequest, kind: RequestPermissionRequest['options'][number]['kind']): RequestPermissionResponse | undefined {
  const option = request.options.find(item => item.kind === kind)
  return option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : undefined
}

/**
 * Explicit user or policy denial: the agent's `reject_once` option, else cancellation.
 * @param request Agent permission request.
 */
export function rejectedPermission(request: RequestPermissionRequest): RequestPermissionResponse {
  return selectOption(request, 'reject_once') ?? cancelledPermission
}

/**
 * Whether the agent asks to leave plan mode (Claude Code's ExitPlanMode).
 * @param request Agent permission request.
 */
export function isPlanExit(request: RequestPermissionRequest): boolean {
  return request.toolCall.kind === 'switch_mode'
}

/**
 * Plan markdown carried by the request's text content, or its raw `plan` input.
 * @param request Agent permission request.
 * @param sanitize Redacts known secrets.
 */
export function planText(request: RequestPermissionRequest, sanitize: (text: string) => string): string | undefined {
  const texts = (request.toolCall.content ?? []).flatMap(item => item.type === 'content' && item.content.type === 'text' ? [item.content.text] : [])
  const input = request.toolCall.rawInput as { plan?: unknown } | undefined
  const raw = texts.length ? texts.join('\n\n') : typeof input?.plan === 'string' ? input.plan : ''
  return raw.trim() ? sanitize(raw).slice(0, PLAN_TEXT_LIMIT) : undefined
}

/**
 * Plan exit choices that never weaken Histoire's own permission policy.
 * "Approve" selects the agent's one-time exit (Claude Code: "manually approve edits"),
 * so later edits and commands still ask Histoire. Elevated exits (accept edits, auto,
 * bypass, clear context) would stop the agent asking, so they are never offered.
 * @param request Agent permission request.
 */
export function planChoices(request: RequestPermissionRequest): PermissionChoice[] {
  const choices: PermissionChoice[] = [{ id: 'reject', label: 'Keep planning', intent: 'reject', response: rejectedPermission(request) }]
  const approve = selectOption(request, 'allow_once')
  if (approve) choices.push({ id: 'approve', label: 'Approve', intent: 'approve', response: approve })
  return choices
}
