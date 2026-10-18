<script setup lang="ts">
const config = useAppConfig()
const toast = useToast()
const store = useStore()
const { data: items, loading } = store.items.query(query => query.many())

/** Nuxt UI toast uses same isolated Nuxt app context as query and theme. */
function notify() {
  toast.add({ title: 'Fixture ready', description: `${items.value.length} local items`, close: false })
}
</script>

<template>
  <UApp>
    <section class="p-6 text-default">
      <h2 class="m-0 text-base font-semibold">
        {{ config.fixture.title }}
      </h2>
      <p v-if="loading" role="status">
        Loading
      </p>
      <ul v-else aria-label="Fixture items" class="my-5 space-y-3 text-sm">
        <li v-for="item in items" :key="item.id">
          {{ item.label }}
        </li>
      </ul>
      <UButton @click="notify">
        Show toast
      </UButton>
    </section>
  </UApp>
</template>
