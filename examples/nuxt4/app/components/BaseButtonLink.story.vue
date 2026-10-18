<template>
  <Story
    title="BaseButton with NuxtLink"
    :layout="{
      type: 'single',
    }"
  >
    <Variant>
      <div class="example-stage">
        <BaseButtonLink
          class="example-button"
          variant="primary"
          to="#"
        >
          Hello world
        </BaseButtonLink>
      </div>
    </Variant>
  </Story>
</template>
