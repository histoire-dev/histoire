import type { VariantProps } from '../types.js'
import { useLayoutEffect } from 'react'
import { useVariantState } from '../client/state.js'
import { configureVariant } from '../util/variant.js'
import { useHstContext } from './context.js'

/** Declare one variant; render only its selected content or controls. */
export function Variant<S extends Record<string, any> = Record<string, any>>(props: VariantProps<S>) {
  const context = useHstContext()
  const variant = context.story?.variants[context.index ?? 0]
  const state = useVariantState(variant?.state) as S
  useLayoutEffect(() => {
    if (context.mode === 'collect') {
      const story = context.collectedStory!
      story.variants[context.index ?? 0] = {
        id: context.implicit ? '_default' : props.id ?? `${story.id}-${context.index ?? 0}`,
        title: context.implicit ? 'default' : props.title ?? 'untitled',
        icon: props.icon,
        iconColor: props.iconColor,
      }
    }
    else if (context.mode === 'mount' && variant) {
      context.pending.push(configureVariant(variant, props, context))
    }
  }, [context, variant, props])

  if (context.mode !== 'render' || !variant || context.variant?.id !== variant.id) return null
  if (context.slotName === 'controls') {
    return (props.controls ?? context.storyProps?.controls)?.({ state }) ?? null
  }
  if (context.slotName !== 'default') return null
  return typeof props.children === 'function' ? props.children({ state }) : props.children
}
