<script lang="ts" setup>
import { type Ref, watch, computed } from 'vue'

const { locale } = useI18n()

interface LocaleWrapperProps {
  locale: Ref<string>
}

const props = defineProps<LocaleWrapperProps>()
const computedLocale = computed(() => props.locale)

watch(computedLocale, (newLocale) => {
  locale.value = newLocale
})
</script>

<template>
  <slot />
</template>
