<script setup lang="ts">
/** Runtime-visible values make matrix override behavior testable without styles. */
defineProps({
  /** First finite matrix axis. */
  enabled: { type: Boolean, default: false },
  /** Second finite matrix axis. */
  emphasized: { type: Boolean, default: false },
  /** Shared editable base prop, projected into every cell. */
  message: { type: String, default: 'Matrix message' },
  /** Long finite metadata exercises bounded wire correlation independently of cell identity. */
  tone: { type: String, default: 'short', values: ['short', 'x'.repeat(500)] },
  /** Numeric finite choices expose the exact runtime override type. */
  level: { type: Number, default: 1, values: [1, 2] },
})
</script>

<template>
  <p data-test-id="matrix-values" :data-tone="tone" :data-level="level" :data-level-type="typeof level">
    {{ message }} · enabled={{ enabled }} · emphasized={{ emphasized }}
  </p>
</template>
