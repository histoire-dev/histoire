<template>
  <div>
    <slot
      foo="bar"
      :object="{ answer: 42 }"
      :fn="(n) => 'hello'.repeat(n)"
    />
    <slot
      name="named"
      foo="bar"
      :object="{ answer: 42 }"
      :fn="(n) => 'hello'.repeat(n)"
    />
  </div>
</template>
