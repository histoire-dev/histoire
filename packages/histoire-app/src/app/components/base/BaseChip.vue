<script setup lang="ts">
withDefaults(defineProps<{
  /** Semantic emphasis shared by marketplace metadata. */ tone?: 'neutral' | 'accent' | 'warn' | 'outline'
  /** Native button for removable filters or recovery actions. */ as?: 'span' | 'button'
  /** Smaller badge used next to compact headings. */ compact?: boolean
}>(), { tone: 'neutral', as: 'span', compact: false })

/** Static classes keep every tone available to Tailwind's source scan. */
const tones = {
  /** Ordinary metadata. */ neutral: 'htw:bg-chip htw:text-body',
  /** Official status and active constraints. */ accent: 'htw:bg-accent-soft htw:text-accent-text',
  /** Breaking changes or deprecated versions. */ warn: 'htw:bg-warn/10 htw:text-warn',
  /** Suggested constraints on a neutral surface. */ outline: 'htw:bg-surface htw:text-body htw:inset-ring htw:inset-ring-border',
}
</script>

<template>
  <component :is="as" :type="as === 'button' ? 'button' : undefined" class="htw:inline-flex htw:shrink-0 htw:items-center htw:gap-1 htw:rounded-full htw:text-[11px] htw:font-semibold" :class="[tones[tone], compact ? 'htw:min-h-[18px] htw:px-1.5' : 'htw:min-h-[22px] htw:px-[9px]', as === 'button' ? 'htw:cursor-pointer htw:border-0 htw:py-0 htw:focus-visible:outline-2 htw:focus-visible:outline-accent' : '']">
    <slot />
  </component>
</template>
