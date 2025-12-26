<script lang="ts" setup>
import HstDate from './HstDate.vue'

function initState() {
  return {
    label: 'My really long label',
    date: new Date(),
    dateText: '',
    datetime: true,
  }
}
</script>

<template>
  <Story
    title="HstDate"
    group="controls"
    :layout="{
      type: 'grid',
      width: '100%',
    }"
  >
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <div class="space-y-4">
          <HstDate
            v-model="state.date"
            :title="state.label"
            :datetime="state.datetime"
            @update:date-string="state.dateText = $event"
          />
          <div class="text-sm text-gray-600 space-y-1">
            <p>Date object: {{ state.date instanceof Date ? state.date.toISOString() : 'null' }}</p>
            <p>String value: {{ state.dateText || '(empty)' }}</p>
          </div>
        </div>
      </template>

      <template #controls="{ state }">
        <HstText
          v-model="state.label"
          title="Label"
        />
        <HstText
          v-model="state.dateText"
          title="Text"
        />

        <HstCheckbox
          v-model="state.datetime"
          title="Date time"
        />
      </template>
    </Variant>

    <Variant
      title="no-label"
      :init-state="initState"
    >
      <template #default="{ state }">
        <div class="space-y-4">
          <HstDate
            v-model="state.date"
            :datetime="state.datetime"
            @update:date-string="state.dateText = $event"
          />
          <div class="text-sm text-gray-600 space-y-1">
            <p>Date object: {{ state.date instanceof Date ? state.date.toISOString() : 'null' }}</p>
            <p>String value: {{ state.dateText || '(empty)' }}</p>
          </div>
        </div>
      </template>

      <template #controls="{ state }">
        <HstText
          v-model="state.dateText"
          title="Text"
        />
      </template>
    </Variant>
  </Story>
</template>
