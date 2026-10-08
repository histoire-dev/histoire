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
  /** Unconstrained object prop accepts app-authored JSON domains. */
  item: { type: Object, default: () => ({ label: 'Canonical' }) },
  /** Unconstrained array prop preserves JSON types in matrix cells. */
  items: { type: Array, default: () => [0] },
  /** Unconstrained numeric prop exercises automatic samples and saved matrix edits. */
  amount: { type: Number, default: 7 },
})
</script>

<template>
  <p data-test-id="matrix-values" :data-item="JSON.stringify(item)" :data-items="JSON.stringify(items)" :data-tone="tone" :data-level="level" :data-level-type="typeof level" :data-amount="amount" :data-amount-type="typeof amount">
    {{ message }} · enabled={{ enabled }} · emphasized={{ emphasized }}
  </p>
</template>
