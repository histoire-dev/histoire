<script lang="ts" setup>
import ModalWithSlots from './ModalWithSlots.vue'
import SlotWithProps from './SlotWithProps.vue'

const vTooltip = {
  bind: (el, { value }) => {
    el.setAttribute('title', value)
  },
}

function initState() {
  return {
    count: 0,
    text: 'Foo',
    foo: { text: 'Foo' },
  }
}

function onClick(event, _arg = '') {
  console.log(event)
}
</script>

<template>
  <!-- eslint-disable vue/no-deprecated-v-bind-sync -->
  <Story
    title="Code gen"
    icon="carbon:code"
    icon-color="#8B5CF6"
  >
    <Variant
      id="html"
      title="html"
      icon="carbon:code"
      :init-state="() => ({
        object: { foo: 'bar' },
      })"
    >
      <template #default="{ state }">
        <h1>Title</h1>
        <hr>
        <pre>{{ { object: state.object } }}</pre>
        <div data-test-id="object">
          {{ { object: state.object } }}
        </div>
        <button>A button</button>
        <button class="btn btn-primary">
          A button
        </button>
        <button
          class="btn btn-primary btn-danger"
          :class="[
            { 'btn-success': false },
          ]"
          style="color: red; font-weight: bold;"
          :style="{
            backgroundColor: 'blue',
          }"
        >
          A button
        </button>
        <input
          type="phone"
          placeholder="Enter your phone number"
        >
        <ul>
          <li>Single</li>
        </ul>
        <p>
          <span>Next to it:</span>****
        </p>
        <p>
          <span>Not next to it:</span>
          ****
        </p>
        <button> Spaces </button>
      </template>
    </Variant>
    <Variant
      id="props"
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
      id="click-events"
      title="click event"
      icon="carbon:cursor-1"
    >
      <button @click="onClick">
        Click me
      </button>
      <button @click="onClick($event, 'foo')">
        Click me
      </button>
      <button @click="(event) => onClick(event)">
        Click me
      </button>
    </Variant>
    <Variant
      id="v-model"
      title="v-model input"
      icon="carbon:text-selection"
      icon-color="#EAB308"
      :init-state="initState"
    >
      <template #default="{ state }">
        <input
          v-model.number="state.count"
          type="number"
        >
        <input
          v-model="state.text"
        >
        <HstText
          v-model="state.text"
        />
        <HstText
          v-model.number="state.count"
          type="number"
        />
        <HstText
          v-model:foo="state.count"
          :my-prop.sync="state.foo.text"
        />
      </template>
    </Variant>
    <Variant
      id="custom-directive"
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
      id="slots"
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
      id="slot-with-props"
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
      id="slot-with-props-named"
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
    <Variant
      id="list"
      title="list"
      icon="carbon:list"
      :init-state="() => ({
        items: [
          {
            id: 1,
            name: 'Foo',
          },
          {
            id: 2,
            name: 'Bar',
          },
        ],
      })"
    >
      <template #default="{ state }">
        <ul>
          <li
            v-for="item of state.items"
            :key="item.id"
          >
            {{ item.name }}
          </li>
        </ul>
      </template>
    </Variant>
    <Variant
      id="function"
      title="function"
      icon="carbon:function-math"
    >
      <div
        :hello="(arg1, arg2, arg3) => 'meow'.repeat(arg3)"
        :get-name="shade => `${'\'very-'.repeat(5)}long-${shade}`"
      />
    </Variant>
  </Story>
</template>
