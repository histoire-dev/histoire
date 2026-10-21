import type { HistoireSessionNotification } from '../adapters/types.js'

/**
 * Notifications emitted by a bridge port after full envelope validation. Membership lets
 * session handlers skip re-measuring and re-validating the same payload objects; any
 * other transport's notifications (or projected copies) are not members and stay validated.
 */
const validatedNotifications = new WeakSet<HistoireSessionNotification>()

/**
 * Records that a notification's payload already passed bridge envelope validation.
 * @param notification Notification built directly from a validated envelope payload.
 * @returns Same notification.
 */
export function markValidatedNotification<T extends HistoireSessionNotification>(notification: T): T {
  validatedNotifications.add(notification)
  return notification
}

/**
 * Whether a notification was emitted by a bridge port from a validated envelope.
 * @param notification Notification received by a session handler.
 */
export function isValidatedNotification(notification: HistoireSessionNotification): boolean {
  return validatedNotifications.has(notification)
}
