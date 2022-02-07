// @ts-nocheck
// @TODO remove no-check and fix vnode type errors

import { VNode } from 'vue'
import { Text } from '@vue/runtime-core'
import { pascal, kebab } from 'case'
import { indent, serializeJs } from './util'

export async function generateSourceCode (vnode: VNode | VNode[]) {
  const list = Array.isArray(vnode) ? vnode : [vnode]
  const lines: string[] = []
  for (const vnode of list) {
    lines.push(...await printVNode(vnode))
  }
  return lines.join('\n')
}

async function printVNode (vnode: VNode): Promise<string[]> {
  console.log(vnode)

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
    const attrs: string[][] = []
    for (const prop in vnode.props) {
      const value = vnode.props[prop]
      if (typeof value !== 'string' || vnode.dynamicProps?.includes(prop)) {
        const serialized = serializeJs(value).split('\n')
        if (serialized.length > 1) {
          let indented: string[] = [`:${kebab(prop)}="${serialized[0]}`]
          indented.push(...serialized.slice(1, serialized.length - 1))
          indented.push(`${serialized[serialized.length - 1]}"`)
          attrs.push(indented)
        } else {
          attrs.push([`:${kebab(prop)}="${serialized[0]}"`])
        }
      } else {
        attrs.push([`${kebab(prop)}="${value}"`])
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
    const tag = [`<${tagName}`]
    if (attrs.length > 1 || attrs[0].length > 1) {
      for (const attrLines of attrs) {
        tag.push(...indent(attrLines))
      }
      tag.push('>')
    } else if (attrs.length === 1) {
      tag[0] += ` ${attrs[0]}>`
    }

    if (childLines.length > 0) {
      lines.push(...tag)
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
