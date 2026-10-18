<script lang="ts" setup>
const options = {
  'crash-bandicoot': 'Crash Bandicoot',
  'the-last-of-us': 'The Last of Us',
  'ghost-of-tsushima': 'Ghost of Tsushima',
}

const radioOptions = {
  'death-stranding': 'Death Stranding',
  'metal-gear': 'Metal Gear',
  'elden-ring': 'Elden Ring',
}

/** Creates independent editable values for each variant. */
function initState() {
  return {
    text: 'Hello',
    checkbox: false,
    number: 20,
    longText: 'Longer text...',
    select: 'crash-bandicoot',
    colorselect: '#000000',
    radio: 'metal-gear',
    object: { foo: 'bar' },
  }
}
</script>

<template>
  <Story :meta="{ wrapper: false }" title="Controls">
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <div class="example-stage example-stack">
          <h1 class="example-heading">
            State
          </h1>
          <pre class="state-output example-output">{{ state }}</pre>
        </div>
      </template>

      <template #controls="{ state }">
        <HstText
          v-model="state.text"
          title="HstText"
        />
        <HstCheckbox
          v-model="state.checkbox"
          title="HstCheckbox"
        />
        <HstNumber
          v-model="state.number"
          title="HstNumber"
        />
        <HstSlider
          v-model="state.number"
          :min="0"
          :max="100"
          title="HstSlider"
        />
        <HstTextarea
          v-model="state.longText"
          title="HstTextarea"
        />
        <HstSelect
          v-model="state.select"
          title="HstSelect"
          :options="options"
        />
        <HstColorSelect
          v-model="state.colorselect"
          title="HstColorSelect"
        />
        <HstRadio
          v-model="state.radio"
          title="HstRadio"
          :options="radioOptions"
        />
        <HstJson
          v-model="state.object"
          title="HstJson"
        />
      </template>
    </Variant>
  </Story>
</template>
