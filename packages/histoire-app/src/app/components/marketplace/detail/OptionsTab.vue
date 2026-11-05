<script setup lang="ts">
import type { MarketplaceOption } from '@histoire/shared'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'

defineProps<{
  /** Ordered reference fields; this screen never changes config values. */ options: MarketplaceOption[]
}>()
</script>

<template>
  <div v-if="options.length" class="htw:overflow-x-auto htw:rounded-[14px] htw:border htw:border-solid htw:border-border htw:bg-surface htw:p-[18px]">
    <table class="htw:w-full htw:border-collapse htw:text-left htw:text-[13px] htw:text-body">
      <caption class="htw:sr-only">
        Plugin options
      </caption>
      <thead>
        <tr class="htw:border-0 htw:border-b htw:border-solid htw:border-border htw:text-text">
          <th scope="col" class="htw:px-[10px] htw:pb-[10px] htw:font-extrabold">
            Option
          </th><th scope="col" class="htw:px-[10px] htw:pb-[10px] htw:font-extrabold">
            Type
          </th><th scope="col" class="htw:px-[10px] htw:pb-[10px] htw:font-extrabold">
            Default
          </th><th scope="col" class="htw:px-[10px] htw:pb-[10px] htw:font-extrabold">
            Description
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="option in options" :key="option.key">
          <th scope="row" class="htw:p-[10px] htw:align-top htw:font-bold htw:text-text">
            {{ option.label }}<code class="htw:mt-[4px] htw:block htw:font-mono htw:text-[12px] htw:font-normal htw:text-muted">{{ option.key }}</code>
          </th>
          <td class="htw:p-[10px] htw:align-top">
            <code class="htw:font-mono htw:text-[12px]">{{ option.type }}</code>
          </td>
          <td class="htw:p-[10px] htw:align-top">
            <code class="htw:font-mono htw:text-[12px]">{{ option.default === undefined ? '—' : JSON.stringify(option.default) }}</code>
          </td>
          <td class="htw:p-[10px] htw:align-top htw:text-muted">
            {{ option.description ?? '—' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <WorkbenchEmptyState v-else icon="settings" title="No options" tone="neutral" />
</template>
