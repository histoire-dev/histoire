<script lang="ts">
export default {
  name: 'HstColorShades',
}
</script>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import HstCopyIcon from '../HstCopyIcon.vue'

const props = defineProps<{
  shades: Record<string, string>
  // @TODO report eslint bug
  // eslint-disable-next-line func-call-spacing
  getName?: (key: string, color: string) => string
  search?: string
}>()

const shadesWithName = computed(() => {
  const shades = props.shades
  const getName = props.getName
  return Object.entries(shades).map(([key, color]) => {
    const name = getName ? getName(key, color) : key
    return {
      key,
      color,
      name,
    }
  })
})

const displayedShades = computed(() => {
  let list = shadesWithName.value
  if (props.search) {
    const reg = new RegExp(props.search, 'i')
    list = list.filter(({ name }) => reg.test(name))
  }
  return list
})
</script>

<template>
  <div
    v-if="displayedShades.length"
    class="htw-grid htw-gap-4 htw-grid-cols-[repeat(auto-fill,minmax(100px,1fr))] htw-m-4"
  >
    <div
      v-for="shade of displayedShades"
      :key="shade.key"
      class="htw-flex htw-flex-col htw-gap-2 htw-group"
    >
      <slot
        :color="shade.color"
      >
        <div
          class="htw-rounded-full htw-w-16 htw-h-16"
          :style="{
            backgroundColor: shade.color,
          }"
        />
      </slot>
      <div>
        <div class="htw-flex htw-gap-1">
          <pre class="htw-my-0">{{ shade.name }}</pre>
          <HstCopyIcon
            :content="shade.name"
            class="htw-hidden group-hover:htw-block"
          />
        </div>
        <div class="htw-flex htw-gap-1">
          <pre class="htw-my-0 htw-opacity-50">{{ shade.color }}</pre>
          <HstCopyIcon
            :content="shade.color"
            class="htw-hidden group-hover:htw-block"
          />
        </div>
      </div>
    </div>
  </div>
</template>
