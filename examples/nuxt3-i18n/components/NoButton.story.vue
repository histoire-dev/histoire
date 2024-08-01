<script lang="ts" setup>
import NoButton from './NoButton.vue'

const { locale, availableLocales } = useI18n()

function initState() {
  return {
    locale: locale.value,
  }
}
</script>

<template>
  <Story
    title="NoButton"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant
      title="no button"
      :init-state="initState"
    >
      <template #default="{ state }">
        <LocaleWrapper :locale="state.locale">
          <NoButton />
        </LocaleWrapper>
      </template>
      <template #controls="{ state }">
        <HstSelect v-model="state.locale" :options="availableLocales" title="Choose locale" />
      </template>
    </Variant>
  </Story>
</template>
