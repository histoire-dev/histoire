<template>
  <Story
    title="Serialize"
  >
    <Variant
      title="array"
    >
      <div
        :list="['a', 2, { foo: 'bar' } ]"
      >
        Array
      </div>
    </Variant>
    <Variant
      title="object"
    >
      <div
        :obj="{ a: 2, nested: { foo: 'bar' } }"
      >
        Object
      </div>
    </Variant>
  </Story>
</template>
