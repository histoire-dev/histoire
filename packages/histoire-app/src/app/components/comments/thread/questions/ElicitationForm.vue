<script setup lang="ts">
import type { UiAgentElicitationForm, UiAgentElicitationValue } from '@histoire/shared'
import { HstButton } from '@histoire/controls/vue'
import { validateElicitationContent } from '@histoire/shared'
import { computed, ref } from 'vue'
import { useAgentsStore } from '../../../../stores/agents.js'
import { foldCustomFields } from './elicitation-fields.js'
import ElicitationField from './ElicitationField.vue'

const props = defineProps<{
  /** Pending form request. */
  request: UiAgentElicitationForm
}>()
const agents = useAgentsStore()
/** Rendered rows, with free-text answers folded into their question. */
const rows = computed(() => foldCustomFields(props.request.fields))
/** Entered values by field key, seeded with agent defaults; never sent anywhere but the agent. */
const values = ref<Record<string, UiAgentElicitationValue | undefined>>(Object.fromEntries(props.request.fields.map(field => [field.key, field.default])))
const errors = ref<Record<string, string>>({})
/** Validates with the same rules as the server, then answers. */
function submit(): void {
  const checked = validateElicitationContent(props.request.fields, values.value)
  if ('errors' in checked) {
    errors.value = checked.errors
    return
  }
  errors.value = {}
  agents?.replyElicitation(props.request.requestId, 'accept', checked.content)
}
</script>

<template>
  <form class="elicitation-form" novalidate @submit.prevent="submit">
    <ElicitationField
      v-for="{ field, custom } in rows"
      :key="field.key"
      v-model="values[field.key]"
      :field="field"
      :custom="custom"
      :custom-value="custom && values[custom.key]"
      :error="errors[field.key] ?? (custom && errors[custom.key])"
      @update:custom-value="custom && (values[custom.key] = $event)"
    />
    <div class="question-actions">
      <HstButton color="flat" type="button" @click="agents?.replyElicitation(request.requestId, 'decline')">
        Skip
      </HstButton>
      <HstButton color="primary" type="submit">
        Submit
      </HstButton>
    </div>
  </form>
</template>

<style scoped>
.elicitation-form { display: grid; gap: 12px; }
</style>
