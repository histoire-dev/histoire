# Hierarchy

Organize the Stories tree by title, file path, or groups.

## Using the title

By default, Histoire splits story titles on slashes to build the tree. Use a title such as `Components/Button` to place Button in the Components folder.

```vue{2}
<template>
  <Story title="Folder/Sub Folder/My story" >
    <!-- Your story goes here -->
  </Story>
</template>
```

## Using the file path

Set `tree.file` to `"path"` in your [Histoire config](/guide/config) to organize stories by file path.

```ts{5}
// histoire.config.ts

export default defineConfig({
  tree: {
    file: 'path',
  },
})
```

## Custom logic

Set `tree.file` to a function for custom grouping by path. It receives the story’s `title` and `path` and returns the tree path as an array of strings.

```ts{5}
// histoire.config.ts

export default defineConfig({
  tree: {
    file: ({ title, path }) => title.split('/'), // equivalent to default behavior
  },
})
```

## Sorting

Entries sort in ascending order by default. Set `tree.order` to a comparison function to change the order.

```ts{5}
// histoire.config.ts

export default defineConfig({
  tree: {
    order: (a, b) => a.localeCompare(b), // equivalent to default behavior
  },
})
```

## Groups

Groups sit at the root of the tree and start expanded. They follow the order in `tree.groups` and work alongside the folder hierarchy from `tree.file`.

Add group objects to `tree.groups` in your Histoire config.

- `title`: the title of the group (use an empty string to have an untoggable group)
- `id` (optional): the id of the group, useful to reference it using the `Story` `group` prop
- `include` (optional): function that takes a file object [1] and returns a boolean, true if the file should be included in the group.

[1]: the file objects have the following properties:
- `title`: the title of the story
- `path`: the path of the story file

The stories are distributed in groups according to the following rules in this order:
- `group` prop of the `<Story>`
- `include` function of the groups, respecting the order in the `groups` array (a story may only appear in one group maximum)

Ungrouped stories appear after the last group.

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
