<script lang="ts" setup>
import YesButton from './YesButton.vue'

const { locale, availableLocales } = useI18n()

function initState() {
  return {
    locale: locale.value,
  }
}
</script>

<template>
  <Story
    title="YesButton"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant
      title="yes button"
      :init-state="initState"
    >
      <template #default="{ state }">
        <LocaleWrapper :locale="state.locale">
          <YesButton />
        </LocaleWrapper>
      </template>
      <template #controls="{ state }">
        <HstSelect v-model="state.locale" :options="availableLocales" title="Choose locale" />
      </template>
    </Variant>
  </Story>
</template>
