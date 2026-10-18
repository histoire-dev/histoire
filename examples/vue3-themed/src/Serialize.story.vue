<template>
  <Story
    title="Serialize"
  >
    <Variant
      title="array"
    >
      <div class="example-stage">
        <div
          :list="['a', 2, { foo: 'bar' }]"
        >
          Array
        </div>
      </div>
    </Variant>
    <Variant
      title="object"
    >
      <div class="example-stage">
        <div
          :obj="{ a: 2, nested: { foo: 'bar' } }"
        >
          Object
        </div>
      </div>
    </Variant>
  </Story>
</template>
