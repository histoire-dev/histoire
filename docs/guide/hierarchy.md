# Hierarchy

## In title

By default, Histoire use the title of your stories to create the hierarchy. If you want to put a story in a specific folder or subfolder, just write a path as the title of your Story.

```vue{2}
<template>
    <Story title="Folder/Sub Folder/My story" >
        <!-- Your story -->
    </Story>
</template>
```

## In path

If you want to use the real path of your story files, you can set it in your [Histoire configuration file](/guide/config).

```ts{5}
// histoire.config.ts

export default defineConfig({ 
    tree: {
        file: "path"
    }
})
```

## Custom

If you want a custom hierarchy, you can define your own function that takes the `title` and the `path` of your story as the argument, and return an array of string being the path of your story in the app;

```ts{5}
// histoire.config.ts

export default defineConfig({ 
    tree: {
        file: ({ title, path }) => title.split("/") // equivalent to default behavior
    }
})
```

## Sorting

By default, files and stories are ordered by ascending order. But you might want to sort things differently, for example display some stories at the beginning. You can do so by providing a sorting function in your configuration file.

```ts{5}
// histoire.config.ts

export default defineConfig({ 
    tree: {
        order: (a, b) => a.localeCompare(b) // equivalent to default behavior
    }
})
```
