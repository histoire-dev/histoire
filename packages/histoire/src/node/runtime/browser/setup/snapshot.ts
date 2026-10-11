import type { ScreenshotSetupAttempt, ScreenshotSetupSnapshot } from '@histoire/shared'

/** Returns an empty detached snapshot for one new owner. */
export function initialSetupSnapshot(): ScreenshotSetupSnapshot {
  return { revision: 0, state: 'unverified', attempts: [], repairs: [] }
}

/** Copies public nested values so observers cannot mutate cached state. */
export function detachSetupSnapshot(value: ScreenshotSetupSnapshot): ScreenshotSetupSnapshot {
  return {
    ...value,
    attempts: copySetupAttempts(value.attempts),
    repairs: value.repairs.map(repair => ({
      ...repair,
      ...(repair.command ? { command: { executable: repair.command.executable, args: [...repair.command.args] } } : {}),
    })),
  }
}

/** Copies a bounded attempt list without repeating a renderer. */
export function copySetupAttempts(attempts: readonly ScreenshotSetupAttempt[]): ScreenshotSetupAttempt[] {
  return attempts.slice(0, 4).map(copySetupAttempt)
}

/** Adds one deterministic source result while retaining the four-candidate bound. */
export function addSetupAttempt(attempts: ScreenshotSetupAttempt[], attempt: ScreenshotSetupAttempt): void {
  const existing = attempts.findIndex(value => value.source === attempt.source)
  if (existing >= 0) attempts[existing] = copySetupAttempt(attempt)
  else if (attempts.length < 4) attempts.push(copySetupAttempt(attempt))
}

/** Copies nested private-safe diagnostic fields so later mutation cannot alter observations. */
function copySetupAttempt(attempt: ScreenshotSetupAttempt): ScreenshotSetupAttempt {
  return {
    ...attempt,
    ...(attempt.driver ? { driver: { ...attempt.driver } } : {}),
    ...(attempt.diagnostic ? { diagnostic: { ...attempt.diagnostic } } : {}),
  }
}
