<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  directives: {
    tooltip: {
      mounted: (el, { value }) => {
        el.setAttribute('title', value)
      },
    },
  },
})
</script>

<script lang="ts" setup>
import ModalWithSlots from './ModalWithSlots.vue'
import SlotWithProps from './SlotWithProps.vue'

function initState () {
  return {
    count: 0,
  }
}

function onClick (event) {
  console.log(event)
}
</script>

<template>
  <Story
    title="Code gen"
  >
    <Variant
      title="props"
      :init-state="initState"
    >
      <template #default="{ state }">
        <input
          placeholder="Counter..."
        >
        <input
          :value="state.count"
        >
        <input
          :value="state.count"
          placeholder="Counter..."
        >
        <input
          :value="{ foo: 'bar' }"
          :items="[1, 2, 3]"
        >
      </template>
    </Variant>
    <Variant
      title="click event"
    >
      <button @click="onClick">
        Click me
      </button>
      <button @click="(event) => onClick(event)">
        Click me
      </button>
    </Variant>
    <Variant
      title="v-model input"
      :init-state="initState"
    >
      <template #default="{ state }">
        <input
          v-model.number="state.count"
          type="number"
        >
      </template>
    </Variant>
    <Variant
      title="custom directive"
    >
      <button v-tooltip="'Info'">
        A button
      </button>
      <button v-tooltip.bottom="'Info'">
        A button
      </button>
      <button v-tooltip.bottom:foo="'Info'">
        A button
      </button>
      <button v-tooltip="{ content: 'Info', html: true }">
        A button
      </button>
    </Variant>
    <Variant
      title="slots"
    >
      <ModalWithSlots>
        <template #title>
          Title
        </template>

        Content

        <template #footer>
          Footer
        </template>
      </modalwithslots>
    </Variant>
    <Variant
      title="slots props (default slot)"
    >
      <SlotWithProps>
        <template #default="{ foo, object, fn }">
          <p :title="foo">
            foo: {{ foo }}
          </p>
          <p :title="object.answer.toString()">
            object.answer: {{ object.answer }}
          </p>
          <p :title="fn(2)">
            fn: {{ fn(2) }}
          </p>
        </template>
      </SlotWithProps>
    </Variant>
    <Variant
      title="slots props (named slot)"
    >
      <SlotWithProps>
        <template #named="{ foo, object, fn }">
          <p :title="foo">
            foo: {{ foo }}
          </p>
          <p :title="object.answer.toString()">
            object.answer: {{ object.answer }}
          </p>
          <p :title="fn(2)">
            fn: {{ fn(2) }}
          </p>
        </template>
      </SlotWithProps>
    </Variant>
  </Story>
</template>
