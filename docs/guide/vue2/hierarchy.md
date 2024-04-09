# Hierarchy

You can customize the story explorer tree.

## Using the title

By default, Histoire uses the title of your stories to create the hierarchy. If you want to put a story in a specific folder or subfolder, just write the path as the title of your Story.

```vue{2}
<template>
  <Story title="Folder/Sub Folder/My story" >
    <!-- Your story goes here -->
  </Story>
</template>
```

## Using the file path

If you want to use the real path of your story files, you can change that in your [Histoire configuration file](/guide/config).

```ts{5}
// histoire.config.ts

export default defineConfig({
  tree: {
    file: 'path',
  },
})
```

## Custom logic

If you want a custom hierarchy, you can define your own function that takes an object with the `title` and the `path` of your story as an argument, and returns an array of string being the path of your story in the app.

```ts{5}
// histoire.config.ts

export default defineConfig({
  tree: {
    file: ({ title, path }) => title.split('/'), // equivalent to default behavior
  },
})
```

## Sorting

By default, files and stories are sorted by ascending order. But you might want to sort things differently, for example display some stories at the beginning. You can do so by providing a sorting function in your configuration file.

```ts{5}
// histoire.config.ts

export default defineConfig({
  tree: {
    order: (a, b) => a.localeCompare(b), // equivalent to default behavior
  },
})
```

## Groups

Sometimes, you might have additional organization needs for the stories. Besides folders, Histoire also provides groups, which are little different:

- expanded by default
- only root level
- manual order
- independant from the hierarchy defined thanks to `tree.file` (see above)

You can define groups in your configuration with the `groups` property. It's an array of group objects with the following properties:

- `title`: the title of the group (use an empty string to have an untoggable group)
- `id` (optional): the id of the group, useful to reference it using the `Story` `group` prop
- `include` (optional): function that takes a file object [1] and returns a boolean, true if the file should be included in the group.

[1]: the file objects have the following properties:
- `title`: the title of the story
- `path`: the path of the story file

The stories are distributed in groups according to the following rules in this order:
- `group` prop of the `<Story>`
- `include` function of the groups, respecting the order in the `groups` array (a story may only appear in one group maximum)

Files not included in a group are always displayed after the last group.

Example:

```ts
// histoire.config.ts

export default defineConfig({
  tree: {
    groups: [
      {
        id: 'top',
        title: '', // No toggle
      },
      {
        title: 'My Group',
        include: file => /Code gen|Controls|Docs/.test(file.title),
      },
      {
        title: 'Components',
        include: file => !file.title.includes('Serialize'),
      },
      {
        title: 'Others',
        include: file => true,
      },
    ],
  },
})
```

You can use the `group` prop to reference a group in your stories using its `id`.

```vue{2}
<template>
  <Story group="top">
    This is a demo book using Vue 3.
  </Story>
</template>
```
