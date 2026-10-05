import type { ReactNode } from 'react'
import { defineComponent, h, nextTick } from '@histoire/vendors/vue'
import { createContext, Fragment, useContext, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { HstButton, HstColorShades, HstSwitch, HstTokenGrid } from '../controls/index.js'
import { wrapVueControl } from '../controls/wrap-vue-control.js'

it('updates Vue props, forwards model events, and unmounts control', async () => {
  const control = defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup: (props, { emit }) => () => h('button', { onClick: () => emit('update:modelValue', 'edited') }, props.modelValue),
  })
  const Wrapped = wrapVueControl(control)
  const target = document.createElement('div')
  const root = createRoot(target)
  const onChange = vi.fn()
  try {
    flushSync(() => root.render(<Wrapped value="first" onChange={onChange} />))
    expect(target.textContent).toBe('first')
    flushSync(() => root.render(<Wrapped value="second" onChange={onChange} />))
    await nextTick()
    expect(target.textContent).toBe('second')
    target.querySelector('button')!.click()
    expect(onChange).toHaveBeenCalledWith('edited')
  }
  finally { flushSync(() => root.unmount()) }
  expect(target.childNodes).toHaveLength(0)
})

it('renders React children in Vue control slots and forwards native listeners', () => {
  const target = document.createElement('div')
  const root = createRoot(target)
  const onClick = vi.fn()
  try {
    flushSync(() => root.render(<HstButton onClick={onClick}><strong>Action</strong></HstButton>))
    expect(target.querySelector('button')?.textContent).toBe('Action')
    target.querySelector('button')!.click()
    expect(onClick).toHaveBeenCalledOnce()
  }
  finally { flushSync(() => root.unmount()) }
})

it('exports Boolean switch and preserves React model events and disabled state', async () => {
  const target = document.createElement('div')
  document.body.append(target)
  const root = createRoot(target)
  const onChange = vi.fn()
  try {
    flushSync(() => root.render(<HstSwitch title="Sync" value={false} onChange={onChange} />))
    const input = target.querySelector<HTMLInputElement>('[role="switch"]')!
    input.click()
    expect(onChange).toHaveBeenCalledWith(true)
    flushSync(() => root.render(<HstSwitch title="Sync" value disabled onChange={onChange} />))
    await nextTick()
    expect(input.checked).toBe(true)
    expect(input.disabled).toBe(true)
    input.click()
    expect(onChange).toHaveBeenCalledOnce()
  }
  finally {
    flushSync(() => root.unmount())
    target.remove()
  }
})

it('preserves built-in color previews when React children are absent or empty', async () => {
  const target = document.createElement('div')
  const root = createRoot(target)
  const shades = { red: '#ff0000', blue: '#0000ff' }
  /** Locate each preview before its shade name and value, independently of styles. */
  const previews = () => Array.from(target.querySelectorAll('pre'))
    .filter(element => element.textContent === 'red' || element.textContent === 'blue')
    .map(element => element.parentElement!.parentElement!.parentElement!.firstElementChild)
  /** Update React and wait for Vue's reactive props and slot selection. */
  async function render(children?: ReactNode) {
    flushSync(() => root.render(<HstColorShades shades={shades}>{children}</HstColorShades>))
    await nextTick()
  }
  try {
    await render()
    expect(previews().map(element => element?.tagName)).toEqual(['DIV', 'DIV'])
    await render([null, false, '', <Fragment key="empty" />])
    expect(previews().map(element => element?.tagName)).toEqual(['DIV', 'DIV'])
    await render(<b>Custom preview</b>)
    await vi.waitFor(() => expect(target.querySelectorAll('b')).toHaveLength(2))
    await render()
    expect(target.querySelectorAll('b')).toHaveLength(0)
    expect(previews().map(element => element?.tagName)).toEqual(['DIV', 'DIV'])
  }
  finally { flushSync(() => root.unmount()) }
})

it('keeps React context, events, and ownership for every repeated Vue slot', async () => {
  const Context = createContext('missing')
  const onClick = vi.fn()
  const cleanup = vi.fn()
  /** Each slot occurrence must own an independent React subtree. */
  function Preview() {
    const text = useContext(Context)
    useEffect(() => cleanup, [])
    return <button type="button" onClick={onClick}>{text}</button>
  }
  const preview = <><Preview /></>
  const target = document.createElement('div')
  const root = createRoot(target)
  /** Wait for both frameworks before inspecting repeated portals. */
  async function render(tokens: Record<string, number>, text: string) {
    flushSync(() => root.render(
      <Context.Provider value={text}>
        <HstTokenGrid tokens={tokens}>{preview}</HstTokenGrid>
      </Context.Provider>,
    ))
    await nextTick()
    await vi.waitFor(() => expect(target.querySelectorAll('button')).toHaveLength(Object.keys(tokens).length))
  }
  try {
    await render({ a: 1, b: 2 }, 'sample')
    const initialButtons = Array.from(target.querySelectorAll('button'))
    expect(initialButtons.map(button => button.textContent)).toEqual(['sample', 'sample'])
    initialButtons.forEach(button => button.click())
    expect(onClick).toHaveBeenCalledTimes(2)
    await render({ b: 2, a: 1 }, 'updated')
    expect(Array.from(target.querySelectorAll('button'))).toEqual([initialButtons[1], initialButtons[0]])
    expect(Array.from(target.querySelectorAll('button')).map(button => button.textContent)).toEqual(['updated', 'updated'])
    expect(cleanup).not.toHaveBeenCalled()
    await render({ b: 2 }, 'remaining')
    expect(target.querySelector('button')).toBe(initialButtons[1])
    expect(target.contains(initialButtons[0])).toBe(false)
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce())
  }
  finally { flushSync(() => root.unmount()) }
  expect(cleanup).toHaveBeenCalledTimes(2)
  expect(target.childNodes).toHaveLength(0)
})
