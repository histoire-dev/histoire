# How to write stories?

Stories are vue files ending with `.story.vue`. You just need to use the `<Story>` tag at the root of your template. The title of the story is provided by the `title` argument.

```vue
<template>
    <Story title="🐱 Meow">
        🐱
    </Story>
</template>
```

You can of course add `<style>` and/or `<script>` elements just like you would with any `.vue` file.
