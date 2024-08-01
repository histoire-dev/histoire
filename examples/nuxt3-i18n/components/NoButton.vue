<script setup type="ts">
const { t } = useI18n()
</script>

<template>
  <BaseButton color="red">
    {{ t('no') }}
  </BaseButton>
</template>

<i18n lang="json">
{
  "en": {
    "no": "No"
  },
  "es": {
    "no": "No"
  },
  "fr": {
    "no": "Non"
  }
}
</i18n>
