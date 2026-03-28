import type { AutoPropComponentDefinition, PropDefinition, Variant } from '@histoire/shared'
import { applyState } from '@histoire/shared'
import { getTagName } from '../codegen'

export function syncVariantAutoProps(
  variant: Variant,
  vnodes: any,
  externalState: Variant['state'],
  lastSnapshot: string,
) {
  const defs = scanForAutoProps(vnodes, externalState)
  const snapshot = JSON.stringify(defs)

  if (!lastSnapshot || lastSnapshot !== snapshot) {
    applyState(variant.state, {
      _hPropDefs: defs,
    })

    if (!variant.state._hPropState) {
      applyState(variant.state, {
        _hPropState: {},
      })
    }
  }

  return snapshot
}

function scanForAutoProps(vnodes: any, externalState: Variant['state']) {
  const result: AutoPropComponentDefinition[] = []
  const traversalState = {
    index: 0,
  }

  visitVNodes(vnodes, externalState, traversalState, result)

  return result.filter(def => def.props.length)
}

function visitVNodes(vnodes: any, externalState: Variant['state'], traversalState: { index: number }, result: AutoPropComponentDefinition[]) {
  for (const vnode of normalizeVNodes(vnodes)) {
    if (!vnode) continue

    if (typeof vnode.type === 'object') {
      const index = traversalState.index++
      const propDefs: PropDefinition[] = []

      for (const key in vnode.type.props) {
        const prop = vnode.type.props[key]
        let types
        let defaultValue

        if (prop) {
          const rawTypes = Array.isArray(prop.type)
            ? prop.type
            : typeof prop === 'function'
              ? [prop]
              : [prop.type]

          types = rawTypes.map((type) => {
            switch (type) {
              case String:
                return 'string'
              case Number:
                return 'number'
              case Boolean:
                return 'boolean'
              case Object:
                return 'object'
              case Array:
                return 'array'
              default:
                return 'unknown'
            }
          })

          defaultValue = typeof prop.default === 'function'
            ? prop.default.toString()
            : prop.default
        }

        propDefs.push({
          name: key,
          types,
          required: prop?.required,
          default: defaultValue,
        })

        if (externalState?._hPropState?.[index]?.[key] != null) {
          if (!vnode.props) {
            vnode.props = {}
          }
          vnode.props[key] = externalState._hPropState[index][key]

          if (!vnode.dynamicProps) {
            vnode.dynamicProps = []
          }

          if (!vnode.dynamicProps.includes(key)) {
            vnode.dynamicProps.push(key)
          }
        }
      }

      result.push({
        name: getTagName(vnode),
        index,
        props: propDefs,
      } as AutoPropComponentDefinition)
    }

    if (Array.isArray(vnode.children)) {
      visitVNodes(vnode.children, externalState, traversalState, result)
    }
  }
}

function normalizeVNodes(vnodes: any) {
  if (!Array.isArray(vnodes)) {
    return vnodes == null ? [] : [vnodes]
  }

  const result = []

  for (const vnode of vnodes) {
    if (Array.isArray(vnode)) {
      result.push(...normalizeVNodes(vnode))
    }
    else if (vnode != null) {
      result.push(vnode)
    }
  }

  return result
}
