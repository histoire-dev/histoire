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
    <section class="rounded-lg border border-default bg-default p-6 text-default">
      <h2 class="text-xl font-semibold">
        {{ config.fixture.title }}
      </h2>
      <p v-if="loading" role="status">
        Loading
      </p>
      <ul v-else aria-label="Fixture items" class="my-4 space-y-2">
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
