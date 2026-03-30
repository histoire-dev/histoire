<template>
  <Story
    title="BaseButton with NuxtLink"
    :layout="{
      type: 'single',
      iframe: false,
    }"
  >
    <Variant>
      <BaseButtonLink
        variant="primary"
        to="#"
      >
        Hello world
      </BaseButtonLink>
    </Variant>
  </Story>
</template>
