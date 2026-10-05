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

  it('projects only complete finite metadata without evaluating validator functions', () => {
    const validator = () => {
      throw new Error('Validator must not run during detection')
    }
    const variant = { state: reactive({}) }
    const vnode = { type: { props: {
      size: { type: String, values: ['small', 'large'], validator },
      invalid: { type: String, enum: ['small', {}] },
      oversized: { type: Number, values: Array.from({ length: 65 }, (_, index) => index) },
      mixed: { type: [Boolean, String] },
    } } }
    syncVariantAutoProps(variant as any, [vnode], {}, '')
    expect(variant.state._hPropDefs[0].props).toMatchObject([
      { name: 'size', types: ['string'], values: ['small', 'large'] },
      { name: 'invalid', values: undefined },
      { name: 'oversized', values: undefined },
      { name: 'mixed', types: ['boolean', 'string'], values: undefined },
    ])
  })
})
