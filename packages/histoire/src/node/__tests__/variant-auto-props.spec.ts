import { reactive } from '@histoire/vendors/vue'
import { describe, expect, it } from 'vitest'
import { syncVariantAutoProps } from '../../../../histoire-plugin-vue/src/client/app/auto-props.js'

describe('syncVariantAutoProps', () => {
  it('applies boolean false prop overrides', () => {
    const variant = {
      state: reactive({}),
    }
    const vnode = {
      type: {
        props: {
          disabled: {
            type: Boolean,
          },
        },
      },
    }
    const externalState = reactive({
      _hPropState: {
        0: {
          disabled: false,
        },
      },
    })

    syncVariantAutoProps(variant as any, [vnode], externalState, '')

    expect(vnode.props).toEqual({
      disabled: false,
    })
    expect(vnode.dynamicProps).toEqual(['disabled'])
  })
})
