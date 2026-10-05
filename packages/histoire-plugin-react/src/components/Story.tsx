import type { ReactElement, ReactNode } from 'react'
import type { StoryProps, VariantProps } from '../types.js'
import { Children, isValidElement } from 'react'
import { HstContext, useHstContext } from './context.js'
import { Variant } from './Variant.js'

/** Find variant declarations inside fragments and element children without executing content. */
function findVariants(children: ReactNode): ReactElement<VariantProps>[] {
  const result: ReactElement<VariantProps>[] = []
  // Declaration discovery intentionally inspects children instead of rendering them.
  // eslint-disable-next-line react/no-children-for-each
  Children.forEach(children, (child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return
    if (child.type === Variant) result.push(child as ReactElement<VariantProps>)
    else if (child.props.children) result.push(...findVariants(child.props.children))
  })
  return result
}

/** Declare story metadata, configure variants, or display selected variant. */
export function Story<S extends Record<string, any> = Record<string, any>>(props: StoryProps<S>) {
  const context = useHstContext()
  const variants = typeof props.children === 'function' ? [] : findVariants(props.children)
  const implicit = variants.length === 0
  const declarations = implicit ? [<Variant key="_default" {...props} />] : variants
  let collectedStory = context.collectedStory
  if (context.mode === 'collect') {
    const { file, storyData } = context.collection!
    collectedStory = {
      id: props.id ?? file.id,
      title: props.title ?? file.fileName,
      group: props.group,
      layout: props.layout,
      matrix: props.matrix,
      icon: props.icon,
      iconColor: props.iconColor,
      docsOnly: props.docsOnly,
      variants: [],
    }
    // Replace repeated React renders instead of duplicating metadata.
    const index = storyData.findIndex(story => story.id === collectedStory!.id)
    if (index === -1) storyData.push(collectedStory)
    else storyData[index] = collectedStory
  }
  return declarations.map((declaration, index) => (
    <HstContext.Provider key={declaration.key ?? index} value={{ ...context, collectedStory, storyProps: props, index, implicit }}>
      {declaration}
    </HstContext.Provider>
  ))
}
