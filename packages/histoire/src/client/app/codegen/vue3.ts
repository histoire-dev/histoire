// @ts-nocheck
// @TODO remove no-check and fix vnode type errors

import { VNode } from 'vue'
import { Text } from '@vue/runtime-core'
import { pascal, kebab } from 'case'
import { indent } from './util'

export async function generateSourceCode (vnode: VNode | VNode[]) {
  const list = Array.isArray(vnode) ? vnode : [vnode]
  const lines: string[] = []
  for (const vnode of list) {
    lines.push(...await printVNode(vnode))
  }
  return lines.join('\n')
}

async function printVNode (vnode: VNode): Promise<string[]> {
  if (vnode.type === Text) {
    return [vnode.children.trim()]
  }

  const lines: string[] = []

  if (typeof vnode.type === 'object' || typeof vnode.type === 'string') {
    // Wait for async component
    if (vnode.type?.__asyncLoader && !vnode.type.__asyncResolved) {
      await vnode.type.__asyncLoader()
    }

    // Attributes
    const attrs: string[] = []
    for (const prop in vnode.props) {
      if (vnode.dynamicProps?.includes(prop)) {
        attrs.push(`:${kebab(prop)}="${JSON.stringify(vnode.props[prop])}"`) // @TODO better JS serialization
      } else {
        attrs.push(`${kebab(prop)}="${vnode.props[prop]}"`)
      }
    }

    // Tags
    const tagName = getTagName(vnode)

    // Children
    const childLines: string[] = []
    if (typeof vnode.children === 'string') {
      childLines.push(vnode.children)
    } else {
      const children: VNode[] = Array.isArray(vnode.children) ? vnode.children : vnode.children?.default?.() ?? []
      for (const child of children) {
        childLines.push(...await printVNode(child))
      }
    }

    // @TODO handle slots

    // Template
    let tag = `<${tagName}`
    if (attrs.length > 1) {
      tag += `\n${indent(attrs).join('\n')}\n`
    } else if (attrs.length === 1) {
      tag += ` ${attrs.join('')}`
    }

    if (childLines.length > 0) {
      lines.push(`${tag}>`)
      lines.push(...indent(childLines))
      lines.push(`</${tagName}>`)
    } else {
      lines.push(`${tag}${childLines.length > 1 ? '' : ' '}/>`)
    }
  }

  return lines
}

function getTagName (vnode: VNode) {
  if (typeof vnode.type === 'string') {
    return vnode.type
  } else if (vnode.type?.__asyncResolved) {
    const asyncComp = vnode.type?.__asyncResolved
    return asyncComp.name ?? getNameFromFile(asyncComp.__file)
  } else if (vnode.type?.name) {
    return vnode.type.name
  } else if (vnode.type?.__file) {
    return getNameFromFile(vnode.type.__file)
  }
  return 'Anonymous'
}

function getNameFromFile (file: string) {
  const parts = /\/([^/]+)\.vue$/.exec(file)
  if (parts) {
    return pascal(parts[1])
  }
  return 'Anonymous'
}
