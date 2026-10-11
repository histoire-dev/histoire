/**
 * Read the actual provider-owned model in source and bundled workbenches.
 * Bundled script setup returns a render closure, so setupState is not a
 * portable observation point. Vue's existing injection retains exact model.
 */
export const TEST_DISCOVERY_FACTS = `() => {
  let provides = document.querySelector('.tests-panel')?.__vueParentComponent?.provides
  let model
  while (provides && !model) {
    const key = Object.getOwnPropertySymbols(provides).find(key => key.description === 'Histoire project tests')
    if (key) model = provides[key]
    provides = Object.getPrototypeOf(provides)
  }
  return model && {status:model.discoveryStatus.value,error:model.discoveryError.value && {message:String(model.discoveryError.value),code:model.discoveryError.value.code},progress:model.discoveryProgress.value,
    variants:model.rows.value.map(row=>({target:row.target,collection:model.entries.value.get(JSON.stringify([row.target.storyId,row.target.variantId]))?.collection,summary:row.summary}))}
}`
