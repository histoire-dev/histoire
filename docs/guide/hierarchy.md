# Hierarchy

## In title

By default, Histoire uses the title of your stories to create the hierarchy. If you want to put a story in a specific folder or subfolder, just write the path as the title of your Story.

```vue{2}
<template>
  <Story title="Folder/Sub Folder/My story" >
    <!-- Your story goes here -->
  </Story>
</template>
```

## In path

If you want to use the real path of your story files, you can change that in your [Histoire configuration file](/guide/config).

```ts{5}
// histoire.config.ts

export default defineConfig({ 
  tree: {
    file: "path"
  }
})
```

## Custom

If you want a custom hierarchy, you can define your own function that takes an object with the `title` and the `path` of your story as an argument, and returns an array of string being the path of your story in the app.

```ts{5}
// histoire.config.ts

export default defineConfig({ 
  tree: {
    file: ({ title, path }) => title.split("/") // equivalent to default behavior
  }
})
```

## Sorting

By default, files and stories are sorted by ascending order. But you might want to sort things differently, for example display some stories at the beginning. You can do so by providing a sorting function in your configuration file.

```ts{5}
// histoire.config.ts

export default defineConfig({ 
  tree: {
    order: (a, b) => a.localeCompare(b) // equivalent to default behavior
  }
})
```
