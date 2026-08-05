/**
 * Emits the two sandbox capture components:
 * - `PreviewTestCapture` renders the selected variant for the preview iframe,
 * - `PreviewControlsCapture` renders only the story `#controls` slot for the
 *   host Controls panel (used by vitest-mocked stories).
 *
 * Both mount the story off-screen first so its slots register.
 */
export function previewComponents() {
  return `const PreviewTestCapture = defineComponent({
  name: 'PreviewTestCapture',
  props: {
    story: {
      type: Object,
      required: true,
    },
    variant: {
      type: Object,
      required: true,
    },
  },
  emits: {
    ready: () => true,
  },
  setup(props, { emit }) {
    function onReady() {
      emit('ready')
    }

    return () => [
      h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
        story: props.story,
      })]),
      h('div', {
        class: '__histoire-preview-canvas',
        'data-histoire-variant-id': props.variant.id,
        'data-test-id': 'sandbox-render',
      }, [h(GenericRenderStory, {
        story: props.story,
        variant: props.variant,
        onReady,
      })]),
    ]
  },
})

const PreviewControlsCapture = defineComponent({
  name: 'PreviewControlsCapture',
  props: {
    story: {
      type: Object,
      required: true,
    },
    variant: {
      type: Object,
      required: true,
    },
  },
  emits: {
    ready: () => true,
  },
  setup(props, { emit }) {
    return () => [
      // The story must execute (with mocks active) for its slots to register;
      // only the controls slot below is visible.
      h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
        story: props.story,
      })]),
      h(GenericRenderStory, {
        class: '__histoire-render-custom-controls',
        slotName: 'controls',
        story: props.story,
        variant: props.variant,
        onReady: () => emit('ready'),
      }),
    ]
  },
})`
}
