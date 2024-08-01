<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <BaseButton color="green">
    {{ t('yes') }}
  </BaseButton>
</template>

<i18n lang="json">
{
  "en": {
    "yes": "Yes"
  },
  "es": {
    "yes": "Sí"
  },
  "fr": {
    "yes": "Oui"
  }
}
</i18n>
