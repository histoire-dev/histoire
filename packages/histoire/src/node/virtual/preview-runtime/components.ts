/**
 * Emits the sandbox capture components:
 * - `PreviewFrameActor` wraps one variant renderer mount and owns its frame
 *   actor slot (see `frame-actors.ts`),
 * - `PreviewTestCapture` renders the selected variant for the preview iframe,
 * - `PreviewControlsCapture` renders only the story `#controls` slot for the
 *   host Controls panel.
 *
 * Both captures mount the story off-screen first so its slots register. The
 * test capture leaves that to the support plugin's RenderStory when it can.
 */
export function previewComponents() {
  return `/** Host remount requests bump this to give the selected variant a fresh renderer within its actor. */
const storyMountRevision = ref(0)

const PreviewFrameActor = defineComponent({
  name: 'PreviewFrameActor',
  props: {
    story: {
      type: Object,
      required: true,
    },
    variant: {
      type: Object,
      required: true,
    },
    getElement: {
      type: Function,
      required: true,
    },
    /** Forwarded to GenericRenderStory: let the support plugin configure the story in its render app. */
    configureStory: {
      type: Boolean,
      default: false,
    },
  },
  emits: {
    ready: () => true,
  },
  setup(props, { emit }) {
    // Keyed by variant: every renderer mount is a new actor, even for a variant
    // shown before in this document.
    const slot = createFrameActorSlot(() => ({ storyId: props.story.id, variantId: props.variant.id }), props.getElement)
    // Before unmount, so plugins clean up while the rendered variant still exists.
    onBeforeUnmount(() => disposeFrameActorSlot(slot))
    // Remount replaces only the renderer: the actor and its plugin attachments stay.
    return () => h(GenericRenderStory, {
      key: storyMountRevision.value,
      story: props.story,
      variant: props.variant,
      configureStory: props.configureStory,
      enableInspection: histoireConfig.inspection?.enabled === true && histoireConfig.inspection?.components === true && !initialSelection.controls,
      onReady: () => emit('ready'),
    })
  },
})

const PreviewTestCapture = defineComponent({
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
    const canvas = ref(null)
    function onReady() {
      emit('ready')
    }

    return () => [
      // Skipped for support plugins whose RenderStory configures the story
      // in its own app (one app setup per frame instead of two).
      h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
        story: props.story,
        optional: true,
      })]),
      h('div', {
        ref: canvas,
        class: '__histoire-preview-canvas',
        'data-histoire-variant-id': props.variant.id,
        'data-histoire-runtime-content': '',
        'data-test-id': 'sandbox-render',
      }, [h(PreviewFrameActor, {
        // Retain hidden story mount and variant state; fresh renderer must acknowledge selection.
        key: props.variant.id,
        story: props.story,
        variant: props.variant,
        getElement: () => canvas.value,
        configureStory: true,
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
    const controlsBootstrapReady = ref(false)

    return () => [
      // Story must execute before its controls render. Svelte variant slots
      // depend on metadata populated by this hidden mount, and plain-object
      // metadata mutations do not retrigger an already-rendered Svelte tree.
      h('div', { class: 'htw-sandbox-hidden' }, [h(GenericMountStory, {
        story: props.story,
        onReady: () => {
          controlsBootstrapReady.value = true
        },
      })]),
      controlsBootstrapReady.value
        ? h(GenericRenderStory, {
            class: '__histoire-render-custom-controls',
            slotName: 'controls',
            story: props.story,
            variant: props.variant,
            onReady: () => emit('ready'),
          })
        : null,
    ]
  },
})`
}
