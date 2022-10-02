/* eslint-disable prefer-const */
// @TODO remove @ts-ignore

import { VNode } from 'vue'
import { pascalCase, paramCase } from 'change-case'
import { createAutoBuildingObject, indent, serializeJs, voidElements } from '@histoire/shared'
import type { Variant } from '@histoire/shared'

export async function generateSourceCode (variant: Variant) {
  const vnode = variant.slots().default?.({ state: variant.state ?? {} }) ?? []
  const list = Array.isArray(vnode) ? vnode : [vnode]
  const lines: string[] = []
  for (const n in list) {
    const vnode = list[n]
    lines.push(...(await printVNode(vnode, variant.state?._hPropState?.[n])).lines)
  }
  return lines.join('\n')
}

async function printVNode (vnode: VNode, propsOverrides: Record<string, any> = null): Promise<{ lines: string[], isText?: boolean }> {
  if (vnode.tag == null && vnode.text) {
    return {
      lines: [vnode.text],
      isText: true,
    }
  }

  const lines = []

  const attrs: string[][] = []
  let multilineAttrs = false
  const skipProps: string[] = [
    'key',
  ]

  // Directives
  function genDirective (dirName: string, dir, valueCode: string = null) {
    let modifiers = ''
    for (const key in dir.modifiers) {
      if (dir.modifiers[key]) {
        modifiers += `.${key}`
      }
    }
    let arg = ''
    if (dir.arg) {
      arg = `:${dir.arg}`
    }
    if (valueCode) {
      // Cleanup render code
      valueCode = valueCode.replace(/^\$(setup|props|data)\./g, '')
    }
    const valueLines = valueCode ? [valueCode] : serializeAndCleanJs(dir.value)
    const attr: string[] = []
    const dirAttr = `v-${dirName}${arg}${modifiers}="`
    if (valueLines.length > 1) {
      attr.push(`${dirAttr}${valueLines[0]}`)
      attr.push(...valueLines.slice(1, valueLines.length - 1))
      attr.push(`${valueLines[valueLines.length - 1]}"`)
      multilineAttrs = true
    } else {
      attr.push(`${dirAttr}${valueLines[0] ?? ''}"`)
    }
    attrs.push(attr)

    if (dirName === 'model') {
      let propName = 'value'
      let eventName = 'input'
      // @ts-ignore
      const modelOption = vnode.componentOptions?.Ctor?.options?.model
      if (modelOption?.prop) {
        propName = modelOption.prop
      }
      if (modelOption?.event) {
        eventName = modelOption.event
      }
      skipProps.push(propName)
      skipProps.push(eventName)
    }
  }
  // @ts-ignore
  if (vnode.data?.model) {
    // @ts-ignore
    genDirective('model', vnode.data.model, vnode.data.model.expression)
  }
  if (vnode.data?.directives) {
    for (const dir of vnode.data.directives) {
      genDirective(dir.name, dir, dir.expression)
    }
  }

  // Attributes
  function addAttr (prop: string, value: any, isListener = false) {
    let modifiers: string[] = []

    const formatModifiers = () => modifiers.map(m => `.${m}`).join('')

    // v-model on component
    const vmodelListener = `update:${prop}`

    // @ts-ignore
    if (typeof value !== 'string' || vnode.componentOptions?.listeners?.[vmodelListener]) {
      let directive = ':'
      if (isListener) {
        directive = '@'
      }

      let serialized: string[]

      // @ts-ignore
      if (directive === ':' && vnode.componentOptions?.listeners?.[vmodelListener]) {
        modifiers.push('sync')
        // Expression
        const rawFn = vnode.componentOptions.listeners[vmodelListener].toString()
        const result = /\$set\((.+?), "(.+?)"/.exec(rawFn)
        if (result) {
          serialized = [`${result[1]}.${result[2]}`]
        }
      }

      if (typeof value === 'undefined') {
        return
      }
      if (!serialized) {
        if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
          // It was formatted from auto building object (slot props)
          serialized = cleanupExpression(value.substring(2, value.length - 2).trim()).split('\n')
        } else if (typeof value === 'function') {
          let code = cleanupExpression(value.toString().replace(/'/g, '\\\'').replace(/"/g, '\''))
          const testResult = /function ([^\s]+)\(/.exec(code)
          if (testResult) {
            // Function name only
            serialized = [testResult[1]]
          } else {
            if (code.startsWith('($event) => ')) {
              // Remove unnecessary `($event) => `
              code = code.substring('($event) => '.length)
            }
            if (code.startsWith('function($event)')) {
              // Remove unnecessary `function($event)`
              const lines = code.split('\n')
              lines.shift()
              lines.pop()
              code = lines.map(l => l.trim().replace(/;$/, '')).join('\n')
              code = code.replace('return ', '').trim()
            }
            // Remove script setup glue code
            code = code.replace(/_setup\./g, '')
            serialized = code.split('\n')
            if (code.includes('_vm')) {
              return
            }
          }
        } else {
          serialized = serializeAndCleanJs(value)
        }
      }
      if (serialized.length > 1) {
        multilineAttrs = true
        const indented: string[] = [`${directive}${prop}${formatModifiers()}="${serialized[0]}`]
        indented.push(...serialized.slice(1, serialized.length - 1))
        indented.push(`${serialized[serialized.length - 1]}"`)
        attrs.push(indented)
      } else {
        attrs.push([`${directive}${prop}${formatModifiers()}="${serialized[0]}"`])
      }
    } else {
      attrs.push([`${prop}${formatModifiers()}="${value}"`])
    }
  }

  if (vnode.data?.props) {
    for (const prop in vnode.data.props) {
      if (skipProps.includes(prop) || (propsOverrides && prop in propsOverrides)) {
        continue
      }
      const value = vnode.data.props[prop]
      addAttr(prop, value)
    }
  }
  if (vnode.data?.domProps) {
    for (const prop in vnode.data.domProps) {
      if (skipProps.includes(prop) || (propsOverrides && prop in propsOverrides)) {
        continue
      }
      const value = vnode.data.domProps[prop]
      addAttr(prop, value)
    }
  }
  if (vnode.data?.attrs) {
    for (const key in vnode.data.attrs) {
      if (skipProps.includes(key) || (propsOverrides && key in propsOverrides)) {
        continue
      }
      const value = vnode.data.attrs[key]
      addAttr(key, value)
    }
  }
  if (vnode.data?.staticClass) {
    addAttr('class', vnode.data.staticClass)
  }
  if (vnode.data?.class) {
    addAttr('class', vnode.data.class)
  }
  if (vnode.data?.staticStyle) {
    const objectValue = vnode.data.staticStyle
    const stringValues = []
    for (const key in objectValue) {
      stringValues.push(`${paramCase(key)}: ${objectValue[key]};`)
    }
    addAttr('style', stringValues.join(' '))
  }
  if (vnode.data?.style) {
    addAttr('style', vnode.data.style)
  }
  if (vnode.data?.on) {
    for (const key in vnode.data.on) {
      if (skipProps.includes(key)) {
        continue
      }
      addAttr(key, vnode.data.on[key], true)
    }
  }

  if (propsOverrides) {
    for (const prop in propsOverrides) {
      addAttr(prop, propsOverrides[prop])
    }
  }

  if (attrs.length > 1) {
    multilineAttrs = true
  }

  // Tags
  const tagName = getTagName(vnode)

  // Children
  let isChildText = false
  const childLines: string[] = []
  const rawChildren = [
    ...Array.isArray(vnode.children) ? vnode.children : [],
    ...Array.isArray(vnode.componentOptions?.children) ? vnode.componentOptions.children : [],
  ]
  let isAllChildText
  for (const child of rawChildren) {
    // @ts-ignore
    const result = await printVNode(child)
    if (result.isText) {
      if (isAllChildText === undefined) {
        isAllChildText = true
      }
      const text = result.lines[0]
      if (!childLines.length || /^\s/.test(text)) {
        childLines.push(text.trim())
      } else {
        childLines[childLines.length - 1] += text
      }
    } else {
      if (isAllChildText === undefined) {
        isAllChildText = false
      }
      childLines.push(...result.lines)
    }
  }
  if (isAllChildText !== undefined) {
    isChildText = isAllChildText
  }

  // Slots
  if (vnode.data?.scopedSlots) {
    for (const key in vnode.data.scopedSlots) {
      if (key.startsWith('$') || key.startsWith('_')) continue
      const autoObject = createAutoBuildingObject(key => `{{ ${key} }}`, (target, p) => {
        // Vue 3
        if (p === '__v_isRef') {
          return () => false
        }
      })
      const result = vnode.data.scopedSlots[key](autoObject.proxy)
      const children = Array.isArray(result) ? result : [result]
      const slotLines: string[] = []
      for (const child of children) {
        if (typeof child === 'object') {
          slotLines.push(...(await printVNode(child as VNode)).lines)
        }
      }
      const slotProps = Object.keys(autoObject.cache)
      if (slotProps.length) {
        childLines.push(`<template #${key}="{ ${slotProps.join(', ')} }">`)
        childLines.push(...indent(slotLines))
        childLines.push('</template>')
      } else if (key === 'default') {
        childLines.push(...slotLines)
      } else {
        childLines.push(`<template #${key}>`)
        childLines.push(...indent(slotLines))
        childLines.push(`</template>`)
      }
    }
  }

  // Template
  const tag = [`<${tagName}`]
  if (multilineAttrs) {
    for (const attrLines of attrs) {
      tag.push(...indent(attrLines))
    }
    if (childLines.length > 0) {
      tag.push('>')
    }
  } else {
    if (attrs.length === 1) {
      tag[0] += ` ${attrs[0]}`
    }
    if (childLines.length > 0) {
      tag[0] += '>'
    }
  }

  const isVoid = voidElements.includes(tagName.toLowerCase())

  if (childLines.length > 0) {
    if (childLines.length === 1 && tag.length === 1 && !attrs.length && isChildText) {
      lines.push(`${tag[0]}${childLines[0]}</${tagName}>`)
    } else {
      lines.push(...tag)
      lines.push(...indent(childLines))
      lines.push(`</${tagName}>`)
    }
  } else if (tag.length > 1) {
    lines.push(...tag)
    lines.push(isVoid ? '>' : '/>')
  } else {
    lines.push(`${tag[0]}${isVoid ? '' : ' /'}>`)
  }

  return {
    lines,
  }
}

export function getTagName (vnode: VNode) {
  if (typeof vnode.tag === 'string' && !vnode.componentOptions) {
    return vnode.tag
    // @ts-ignore
  } else if (vnode.componentOptions?.Ctor?.options?.name) {
    // @ts-ignore
    return vnode.componentOptions?.Ctor?.options.name
    // @ts-ignore
  } else if (vnode.componentOptions?.Ctor?.options?.__file) {
    // @ts-ignore
    return getNameFromFile(vnode.componentOptions?.Ctor?.options.__file)
  }
  return 'Anonymous'
}

function getNameFromFile (file: string) {
  const parts = /([^/]+)\.vue$/.exec(file)
  if (parts) {
    return pascalCase(parts[1])
  }
  return 'Anonymous'
}

function serializeAndCleanJs (value: any) {
  const isAutoBuildingObject = !!value?.__autoBuildingObject
  const result = serializeJs(value)
  if (isAutoBuildingObject) {
    // @ts-ignore
    return [cleanupExpression(result.__autoBuildingObjectGetKey)]
  } else {
    return cleanupExpression(result).split('\n')
  }
}

function cleanupExpression (expr: string) {
  return expr.replace(/\$setup\./g, '')
}
