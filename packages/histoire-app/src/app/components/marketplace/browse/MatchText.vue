<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Plain catalog text; never interpreted as HTML. */ text: string
  /** Inclusive UTF-16 character ranges supplied by catalog search. */ ranges?: Array<[number, number]>
}>()
/** Clamp, sort and merge ranges before slicing so overlapping matches never duplicate text. */
const segments = computed(() => {
  const ranges = (props.ranges ?? []).filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && start <= end && end >= 0 && start < props.text.length).map(([start, end]) => [Math.max(0, start), Math.min(props.text.length, end + 1)] as [number, number]).sort((a, b) => a[0] - b[0])
  const result: Array<{ /** Original text fragment. */ text: string, /** Whether this fragment matches. */ matched: boolean }> = []
  let position = 0
  for (let index = 0; index < ranges.length; index++) {
    const [start, initialEnd] = ranges[index]
    let end = initialEnd
    while (index + 1 < ranges.length && ranges[index + 1][0] <= end) end = Math.max(end, ranges[++index][1])
    if (start > position) result.push({ text: props.text.slice(position, start), matched: false })
    result.push({ text: props.text.slice(start, end), matched: true })
    position = end
  }
  if (position < props.text.length) result.push({ text: props.text.slice(position), matched: false })
  return result
})
</script>

<template>
  <span><template v-for="(segment, index) in segments" :key="index"><mark v-if="segment.matched" class="htw:rounded-[2px] htw:bg-warn/25 htw:text-inherit">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></span>
</template>
