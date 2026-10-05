import type { HistoireStoryHostChannel } from '@histoire/protocol'
import type { HistoireTestRegistration } from '@histoire/shared'

/** Capture current story actor for explicitly enabled application channel. */
export function useHostChannel(name: string): HistoireStoryHostChannel
export type { HistoireStoryHostChannel } from '@histoire/protocol'
export { getControlsHost } from '@histoire/shared'
export { useHistoireGlobals, useHistoireGlobalsStore } from '@histoire/shared'
export type { HistoireControlsOverlay, HistoireControlsOverlayHandle, HistoireControlsOverlayResult, HistoireGlobalsStore } from '@histoire/shared'

/**
 * @deprecated
 */
export function hstEvent(name: string, argument): void

/**
 * Logs an event to the 'Events' sidepane.
 * @param name Event name
 * @param argument Additional log data displayed when inspecting the event.
 */
export function logEvent(name: string, argument): void

/**
 * Returns `true` when in the NodeJS server while collecting stories.
 */
export function isCollecting(): boolean
export function isTesting(): boolean

/**
 * Registers story-scoped Vitest cases. The callback is executed with the mounted
 * story context and should define tests with `describe`, `it`, or `test`.
 */
export function onTest(register: HistoireTestRegistration): void

export function toggleDark(value?: boolean): boolean
export function isDark(): boolean
