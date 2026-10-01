import { describe, expect, it, vi } from 'vitest'
import { runStoryVitestTests } from './utils/story-vitest-shim.js'

describe('preview Vitest task lifecycle', () => {
  it('awaits pending hard and soft assertions before teardown and the next test', async () => {
    const order: string[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let summary
    try {
      summary = await runStoryVitestTests((shim) => {
        shim.afterEach(() => order.push('afterEach'))
        for (const soft of [false, true]) {
          shim.it(soft ? 'soft' : 'hard', () => {
            const assertion = soft ? shim.expect.soft : shim.expect
            assertion(new Promise(resolve => setTimeout(() => {
              order.push('assertion')
              resolve(1)
            }, 10))).resolves.toBe(2)
          })
        }
        shim.it('next', () => shim.expect(true).toBe(true))
      })
    }
    finally {
      warn.mockRestore()
    }
    expect(summary.tests.map(test => test.state)).toEqual(['failed', 'failed', 'passed'])
    expect(summary.tests.slice(0, 2).map(test => test.errors.length)).toEqual([1, 1])
    expect(order).toEqual(['assertion', 'afterEach', 'assertion', 'afterEach', 'afterEach'])
  })

  it('passes one task context to callbacks and unwinds completion callbacks in reverse', async () => {
    const contexts: any[] = []
    const order: string[] = []
    const summary = await runStoryVitestTests((shim) => {
      shim.it('callbacks', () => {
        shim.onTestFinished((context) => {
          contexts.push(context)
          order.push('first')
        })
        shim.onTestFinished(({ task, ...rest }) => {
          contexts.push({ task, ...rest })
          order.push('second')
          shim.expect(task.name).toBe('callbacks')
          shim.expect(task.result.state).toBe('pass')
        })
      })
    })
    expect(summary.ok).toBe(true)
    expect(order).toEqual(['second', 'first'])
    expect(contexts[0].task).toBe(contexts[1].task)
    expect(contexts[1].task.context).toBe(contexts[1])
  })

  it('passes the current task context to test bodies and per-test hooks', async () => {
    const contexts: any[] = []
    const summary = await runStoryVitestTests((shim) => {
      shim.beforeEach((context) => {
        contexts.push(context)
        context.expect(context.task.name).toBe('context')
      })
      shim.it('context', (context) => {
        contexts.push(context)
        context.expect(context.task.context).toBe(context)
      })
    })
    expect(summary.ok).toBe(true)
    expect(contexts).toHaveLength(2)
    expect(contexts[0]).toBe(contexts[1])
  })

  it('checks expected assertions before afterEach assertions', async () => {
    const summary = await runStoryVitestTests((shim) => {
      shim.afterEach(() => shim.expect(true).toBe(true))
      shim.it('body assertion', () => {
        shim.expect.assertions(1)
        shim.expect(true).toBe(true)
      })
    })
    expect(summary.ok).toBe(true)
  })

  it('passes suite metadata to suite lifecycle hooks', async () => {
    const suiteNames: string[] = []
    const summary = await runStoryVitestTests((shim) => {
      shim.describe('named suite', () => {
        shim.beforeAll((_, suite) => suiteNames.push(suite.name))
        shim.it('body', () => {})
      })
    })
    expect(summary.ok).toBe(true)
    expect(suiteNames).toEqual(['named suite'])
  })

  it('runs completion callbacks before releasing aroundEach resources after a failure', async () => {
    const order: string[] = []
    const summary = await runStoryVitestTests((shim) => {
      shim.aroundEach(async (runTest) => {
        order.push('acquire')
        await runTest()
        order.push('release')
      })
      shim.it('fails', () => {
        shim.onTestFinished(() => order.push('finished'))
        throw new Error('test failure')
      })
    })
    expect(summary.failed).toBe(1)
    expect(order).toEqual(['acquire', 'finished', 'release'])
  })

  it.each(['completion', 'assertions', 'soft completion'])('reports %s failures to failure callbacks after completion', async (failure) => {
    const order: string[] = []
    const contexts: any[] = []
    const summary = await runStoryVitestTests((shim) => {
      shim.it('late failure', () => {
        shim.onTestFinished((context) => {
          contexts.push(context)
          order.push('finished')
          if (failure === 'completion') throw new Error('cleanup failed')
          if (failure === 'soft completion') shim.expect.soft(1).toBe(2)
        })
        shim.onTestFailed((context) => {
          contexts.push(context)
          order.push('failed')
          shim.expect(context.task.result.state).toBe('fail')
          shim.expect(context.task.result.errors).toHaveLength(1)
        })
        if (failure === 'assertions') shim.expect.assertions(1)
      })
    })
    expect(summary.tests[0].state).toBe('failed')
    expect(summary.tests[0].errors).toHaveLength(1)
    expect(order).toEqual(['finished', 'failed'])
    expect(contexts[0]).toBe(contexts[1])
  })

  it('reports body soft assertion failures before lifecycle callbacks', async () => {
    const states: string[] = []
    const summary = await runStoryVitestTests((shim) => {
      shim.it('soft body failure', () => {
        shim.onTestFinished(({ task }) => states.push(task.result.state))
        shim.onTestFailed(({ task }) => states.push(task.result.state))
        shim.expect.soft(1).toBe(2)
      })
    })

    expect(summary.tests[0].state).toBe('failed')
    expect(summary.tests[0].errors).toHaveLength(1)
    expect(states).toEqual(['fail', 'fail'])
  })

  it('honors explicit lifecycle hook timeouts', async () => {
    const summary = await runStoryVitestTests((shim) => {
      shim.beforeEach(() => new Promise(() => {}), 5)
      shim.it('blocked by setup', () => {
        throw new Error('test body must not run')
      })
    })

    expect(summary.tests[0].state).toBe('failed')
    expect(summary.tests[0].errors[0]).toMatchObject({
      message: expect.stringContaining('Hook timed out in 5ms.'),
    })
  }, 1_000)

  it('continues with later tests after a hook timeout', async () => {
    let firstSetup = true
    const ran = vi.fn()
    const summary = await runStoryVitestTests((shim) => {
      shim.beforeEach(() => {
        if (firstSetup) {
          firstSetup = false
          return new Promise(() => {})
        }
      }, 5)
      shim.it('timed out setup', () => {
        throw new Error('test body must not run')
      })
      shim.it('next test', ran)
    })

    expect(summary.tests.map(test => test.state)).toEqual(['failed', 'passed'])
    expect(ran).toHaveBeenCalledOnce()
  }, 1_000)

  it('honors cleanup timeouts returned by beforeEach', async () => {
    const body = vi.fn()
    const summary = await runStoryVitestTests((shim) => {
      shim.beforeEach(() => () => new Promise(() => {}), 5)
      shim.it('body completes before cleanup', body)
    })

    expect(body).toHaveBeenCalledOnce()
    expect(summary.tests[0].state).toBe('failed')
    expect(summary.tests[0].errors[0]).toMatchObject({
      message: expect.stringContaining('Hook timed out in 5ms.'),
    })
  }, 1_000)

  it('honors aroundEach setup timeouts without entering the test body', async () => {
    const body = vi.fn()
    const summary = await runStoryVitestTests((shim) => {
      shim.aroundEach(() => new Promise(() => {}), 5)
      shim.it('blocked by wrapper', body)
    })

    expect(summary.tests[0].state).toBe('failed')
    expect(summary.tests[0].errors[0]).toMatchObject({
      message: expect.stringContaining('The setup phase of "aroundEach" hook timed out after 5ms.'),
    })
    expect(body).not.toHaveBeenCalled()
  }, 1_000)

  it('honors aroundEach teardown timeouts after the test body', async () => {
    const body = vi.fn()
    const summary = await runStoryVitestTests((shim) => {
      shim.aroundEach(async (runTest) => {
        await runTest()
        await new Promise(() => {})
      }, 5)
      shim.it('body completes', body)
    })

    expect(body).toHaveBeenCalledOnce()
    expect(summary.tests[0].state).toBe('failed')
    expect(summary.tests[0].errors[0]).toMatchObject({
      message: expect.stringContaining('The teardown phase of "aroundEach" hook timed out after 5ms.'),
    })
  }, 1_000)

  it('honors aroundAll teardown timeouts after its suite', async () => {
    const summary = await runStoryVitestTests((shim) => {
      shim.aroundAll(async (runSuite) => {
        await runSuite()
        await new Promise(() => {})
      }, 5)
      shim.it('body completes', () => {})
    })

    expect(summary.tests[0].state).toBe('failed')
    expect(summary.tests[0].errors[0]).toMatchObject({
      message: expect.stringContaining('The teardown phase of "aroundAll" hook timed out after 5ms.'),
    })
  }, 1_000)
})
