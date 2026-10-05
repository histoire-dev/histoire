<script setup lang="ts">
import { computed } from 'vue'
import { useShortcutRegistry } from '../../../util/shortcuts.js'

const registry = useShortcutRegistry()
const entries = computed(() => [...(registry?.reference.values() ?? [])].filter(item => __HISTOIRE_DEV__ || !item.devOnly))
/** Conflict display uses actual registry bindings; no second shortcut definition source. */
function conflicts(id: string): boolean {
  const entry = registry?.reference.get(id)
  return Boolean(entry && entries.value.some(other => other.id !== id && other.scope === entry.scope && other.keys.some(key => entry.keys.includes(key))))
}
</script>

<template>
  <section>
    <h1>Keyboard shortcuts</h1><div class="histoire-settings-card">
      <div v-for="entry in entries" :key="entry.id" class="histoire-settings-row">
        <strong>{{ entry.label }}</strong><kbd>{{ registry?.hint(entry.id) }}</kbd><span v-if="conflicts(entry.id)" role="status">Conflict</span>
      </div><div v-if="!entries.length" class="histoire-settings-row">
        No shortcuts registered.
      </div>
    </div>
  </section>
</template>
