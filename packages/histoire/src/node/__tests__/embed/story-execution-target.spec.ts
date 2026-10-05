import { describe, expect, it } from 'vitest'
import {
  createStoryExecutionOwner,
  getStoryExecutionTarget,
  registerStoryExecutionTargetResolver,
  withStoryExecution,
} from '../../../../../histoire-shared/src/test-execution.js'

/** Ownership needs node identity/ancestry, not import-time browser globals. */
function actor(parent: Node | null = null): Node {
  return { parentNode: parent } as Node
}

describe('story channel actor scope', () => {
  it('restores nested owners after failure and preserves test execution ancestry', () => {
    const firstRoot = actor()
    const secondRoot = actor()
    const first = actor(firstRoot)
    const second = actor(secondRoot)
    const firstExecutions = createStoryExecutionOwner(firstRoot)
    const secondExecutions = createStoryExecutionOwner(secondRoot)

    withStoryExecution(() => {
      expect(getStoryExecutionTarget()).toBe(first)
      expect(() => withStoryExecution(() => {
        expect(getStoryExecutionTarget()).toBe(second)
        throw new Error('Nested setup failed')
      }, second)).toThrow('Nested setup failed')
      expect(getStoryExecutionTarget()).toBe(first)
    }, first)

    expect(getStoryExecutionTarget()).toBeUndefined()
    expect(firstExecutions.size).toBe(1)
    expect(secondExecutions.size).toBe(1)
    expect([...firstExecutions][0]).not.toBe([...secondExecutions][0])
  })

  it('captures independent owners without leaving ambient target across await', async () => {
    const first = actor()
    const second = actor()
    let resume!: () => void
    const pending = new Promise<void>((resolve) => {
      resume = resolve
    })
    /** Captured actor can be retained by channel handle after setup returns. */
    const capture = (target: Node) => withStoryExecution(async () => {
      const captured = getStoryExecutionTarget()
      await pending
      expect(getStoryExecutionTarget()).toBeUndefined()
      return captured
    }, target)

    const firstCapture = capture(first)
    expect(getStoryExecutionTarget()).toBeUndefined()
    const secondCapture = capture(second)
    expect(getStoryExecutionTarget()).toBeUndefined()
    resume()
    const [capturedFirst, capturedSecond] = await Promise.all([firstCapture, secondCapture])
    expect(capturedFirst).toBe(first)
    expect(capturedSecond).toBe(second)
  })

  it('uses actual framework context after synchronous scope and closes only owned resolver', () => {
    const first = actor()
    const replacement = actor()
    const broken = registerStoryExecutionTargetResolver('broken-test', () => {
      throw new Error('Component context unavailable')
    })
    const initial = registerStoryExecutionTargetResolver('framework-test', () => first)
    let closeReplacement: (() => void) | undefined
    try {
      expect(getStoryExecutionTarget()).toBe(first)
      closeReplacement = registerStoryExecutionTargetResolver('framework-test', () => replacement)
      initial()
      expect(getStoryExecutionTarget()).toBe(replacement)
      closeReplacement()
      expect(getStoryExecutionTarget()).toBeUndefined()
    }
    finally {
      broken()
      initial()
      closeReplacement?.()
    }
  })

  it('gives explicit nested mount authority over enclosing framework context', () => {
    const enclosing = actor()
    const nested = actor()
    const close = registerStoryExecutionTargetResolver('enclosing-test', () => enclosing)
    try {
      withStoryExecution(() => expect(getStoryExecutionTarget()).toBe(nested), nested)
      expect(getStoryExecutionTarget()).toBe(enclosing)
    }
    finally { close() }
  })

  it('keeps ownerless bootstrap dormant instead of borrowing enclosing visible actor', () => {
    const enclosing = actor()
    const close = registerStoryExecutionTargetResolver('hidden-test', () => enclosing)
    try {
      withStoryExecution(() => expect(getStoryExecutionTarget()).toBeUndefined())
      expect(getStoryExecutionTarget()).toBe(enclosing)
    }
    finally { close() }
  })
})
