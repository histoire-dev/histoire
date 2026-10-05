/** Emits matrix prop overrides through the existing control state synchronization route. */
export function previewPropsOverride() {
  return `    const propsOverrides = new Map()

    /** Selection changes discard the isolated frame's prior override baseline. */
    function clearPropsOverrides() { propsOverrides.clear() }

    /** Resolve a prop exactly as inspector controls do, with flat-state hint fallback. */
    function propsOverrideDestination(targetVariant, name) {
      const definition = targetVariant.state._hPropDefs?.find(component => component.props?.some(prop => prop.name === name))
      return definition ? { index: definition.index, name } : { name }
    }

    /** Capture only overridden fields; never clone callbacks or unrelated live state. */
    function capturePropsOverride(targetVariant, destination) {
      const owner = destination.index === undefined ? targetVariant.state : targetVariant.state._hPropState?.[destination.index]
      return { ...destination, present: Boolean(owner && Object.hasOwn(owner, destination.name)),
        value: owner && Object.hasOwn(owner, destination.name) ? toRawDeep(owner[destination.name], true) : undefined }
    }

    /** Restore removed overrides before applying the new complete set. */
    function restorePropsOverride(targetVariant, original) {
      const owner = original.index === undefined ? targetVariant.state : targetVariant.state._hPropState?.[original.index]
      if (!owner) return
      if (original.present) owner[original.name] = original.value
      else delete owner[original.name]
    }

    /** Merge keeps component prop overrides at the same _hPropState path as controls. */
    function commitPropsOverride(targetVariant, entry) {
      const patch = {}
      for (const [name, value] of Object.entries(entry.props)) {
        const destination = propsOverrideDestination(targetVariant, name)
        const original = entry.originals.get(name)
        // Auto-prop definitions can arrive after an early override. Move its
        // baseline to the controls path once that path becomes available.
        if (original && original.index !== destination.index) {
          restorePropsOverride(targetVariant, original)
          entry.originals.set(name, capturePropsOverride(targetVariant, destination))
        }
        if (destination.index === undefined) patch[name] = value
        else {
          patch._hPropState ??= toRawDeep(targetVariant.state._hPropState ?? {}, true)
          patch._hPropState[destination.index] ??= {}
          patch._hPropState[destination.index][name] = value
        }
      }
      applyVariantStateUpdate({ storyId: story.value?.id, variantId: targetVariant.id, state: patch, getVariantById, guards: variantStateGuards })
    }

    /** Canonical incoming state cannot erase the isolated cell's own axis values. */
    function reapplyPropsOverride(variantId) {
      const targetVariant = getVariantById(variantId)
      const entry = propsOverrides.get(variantId)
      if (targetVariant && entry) commitPropsOverride(targetVariant, entry)
    }

    /** Bounded JSON values cannot mutate runtime metadata or foreign variants. */
    function applyPropsOverride(message) {
      const targetVariant = getVariantById(message.variantId)
      if (initialSelection.controls || !targetVariant || targetVariant.id !== variant.value?.id) return
      try {
        if (!message.props || typeof message.props !== 'object' || Array.isArray(message.props)) return
        measureWireValue(message.props, { maxBytes: 64 * 1024 })
        if (Object.keys(message.props).some(name => name.startsWith('_h'))) return
      }
      catch { return }
      let entry = propsOverrides.get(targetVariant.id)
      if (!entry) {
        entry = { props: {}, originals: new Map() }
        propsOverrides.set(targetVariant.id, entry)
      }
      for (const name of Object.keys(entry.props)) {
        if (!Object.hasOwn(message.props, name)) {
          restorePropsOverride(targetVariant, entry.originals.get(name))
          entry.originals.delete(name)
        }
      }
      for (const name of Object.keys(message.props)) {
        if (!entry.originals.has(name)) entry.originals.set(name, capturePropsOverride(targetVariant, propsOverrideDestination(targetVariant, name)))
      }
      entry.props = message.props
      commitPropsOverride(targetVariant, entry)
      if (typeof message.requestId === 'string' && message.requestId.length <= 200) {
        postToParent({ type: RUNTIME_RESULT, requestId: message.requestId, storyId: story.value?.id, variantId: targetVariant.id, result: { supported: true } })
      }
    }`
}
