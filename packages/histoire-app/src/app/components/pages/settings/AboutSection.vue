<script setup lang="ts">
import { version } from '../../../../../package.json'

const props = defineProps<{ buildInfo?: { version?: string, commit?: string, branch?: string, builtAt?: string } }>()
</script>

<template>
  <section>
    <h1>About</h1><div class="histoire-settings-card">
      <div class="histoire-settings-row">
        <strong>Histoire</strong><code>{{ version }}</code>
      </div><div v-if="props.buildInfo?.version" class="histoire-settings-row">
        <strong>Project version</strong><code>{{ props.buildInfo.version }}</code>
      </div><div v-if="props.buildInfo?.commit" class="histoire-settings-row">
        <strong>Commit</strong><code>{{ props.buildInfo.commit.slice(0, 8) }}</code>
      </div><div v-if="props.buildInfo?.branch" class="histoire-settings-row">
        <strong>Branch</strong><code>{{ props.buildInfo.branch }}</code>
      </div><div v-if="props.buildInfo?.builtAt" class="histoire-settings-row">
        <strong>Built</strong><time>{{ props.buildInfo.builtAt }}</time>
      </div>
    </div>
  </section>
</template>
