/** Standalone expect implementation and shared assertion state for story iframes. */
export const STORY_EXPECT_CODE = `
chai.use(JestExtend)
chai.use(JestChaiExpect)
chai.use(JestAsymmetricMatchers)

/** Creates an assertion function with isolated counters and Vitest matcher extensions. */
export function createExpect() {
  /** Binds each assertion to the active task for soft failures and tracked promises. */
  const expect = (value, message) => {
    const { assertionCalls = 0 } = getState(expect) ?? {}
    setState({ assertionCalls: assertionCalls + 1 }, expect)
    return chai.expect(value, message).withContext({
      'vitest-test': globalThis.__vitest_worker__?.current,
    })
  }

  Object.assign(expect, chai.expect)
  Object.assign(expect, globalThis[ASYMMETRIC_MATCHERS_OBJECT])

  expect.getState = () => getState(expect)
  expect.setState = state => setState(state, expect)

  setState({
    assertionCalls: 0,
    isExpectingAssertions: false,
    isExpectingAssertionsError: null,
    expectedAssertionsNumber: null,
    expectedAssertionsNumberErrorGen: null,
    currentTestName: '',
  }, expect)

  expect.assert = chai.assert
  expect.extend = matchers => chai.expect.extend(expect, matchers)
  expect.addEqualityTesters = customTesters => addCustomEqualityTesters(customTesters)
  expect.soft = (...args) => expect(...args).withContext({ soft: true })
  expect.unreachable = message => {
    chai.assert.fail(\`expected\${message ? \` "\${message}" \` : ' '}not to be reached\`)
  }

  chai.util.addMethod(expect, 'assertions', expected => {
    const errorGen = () => new Error(\`expected number of assertions to be \${expected}, but got \${expect.getState().assertionCalls}\`)
    expect.setState({
      expectedAssertionsNumber: expected,
      expectedAssertionsNumberErrorGen: errorGen,
    })
  })

  chai.util.addMethod(expect, 'hasAssertions', () => {
    expect.setState({
      isExpectingAssertions: true,
      isExpectingAssertionsError: new Error('expected any number of assertion, but got none'),
    })
  })

  expect.extend(customMatchers)

  return expect
}

const expect = globalThis[GLOBAL_EXPECT] ?? createExpect()
if (globalThis[GLOBAL_EXPECT] !== expect) {
  Object.defineProperty(globalThis, GLOBAL_EXPECT, {
    value: expect,
    writable: true,
    configurable: true,
  })
}
`
