# Story Components

## Story

Create a story. Must be at the top level of the story file.

### `title`

Title of the story.

```vue
<template>
  <Story title="My story">
    Hello world
  </Story>
</template>
```

### `id`

Id of the story used in the URL. By default, the id is automatically generated from the file path. Setting an id manually will ensure the URL parameter doesn't change with the order of the variants in the story.

```vue
<template>
  <Story id="my-story">
    Hello world
  </Story>
</template>
```

### `layout`

Layout of the story. Object with the following properties:
  - `type`: `'single'` or `'grid'`
  - with `type: 'single'` you can specify:
    - `iframe`: Whether to isolate the story in an iframe. You might want to disable it if you want to pass complexe parameters that can't be serialized.
  - with `type: 'grid'` you can specify:
    - `width`: Column size. Can be number (pixels) or string (like `'100%'`).

[Learn more](../guide/vue3/stories.md#layout)

### `initState`

Function that returns the intial state. Will be used as default value for variants.

```vue
<script setup>
function initState () {
  return {
    disabled: false,
    content: "Hello world"
  }
}
</script>

<template>
  <Story title="My Button" :init-state="initState">
    <template #default="{ state }">
      <button :disabled="state.disabled">
        {{ state.content }}
      </button>
    </template>
  </Story>
</template>
```

[Learn more](../guide/vue3/controls.md#init-state)

### `setupApp`

A function to configure the Vue application. This will be the default for the variants in the story.

It receives a payload object as parameter with the following properties:

- `app`: The Vue application instance.
- `story`: The story object.
- `variant`: The variant object.

```vue
<script setup>
function mySetupApp ({ app, story, variant }) {
  app.provide('demo', 'meow')
}
</script>

<template>
  <Story :setup-app="mySetupApp">
    <!-- ... -->
  </Story>
</template>
```

[Learn more](../guide/vue3/app-setup.md#local-setup)

### `group`

The id of a group to include the story in.

```vue
<template>
  <Story group="my-group">
    Hello world
  </Story>
</template>
```

[Learn more](../guide/vue3/hierarchy.md#groups)

### `icon`

An [Iconify id](https://icones.js.org/) to customize the story icon in the tree.

```vue
<template>
  <Story icon="lucide:cpu">
    Hello world
  </Story>
</template>
```

### `iconColor`

The icon color.

```vue
<template>
  <Story icon-color="#8B5CF6">
    Hello world
  </Story>
</template>
```

### `docsOnly`

This story will only render a documentation page.

```vue
<template>
  <Story
    group="top"
    docs-only
    icon="carbon:bookmark"
  />
</template>

<docs lang="md">
# Welcome

This is a demo book using Vue 3.

---

Learn more about Histoire [here](https://histoire.dev/).
</docs>

```

### `source`

The copiable source code of the story.

```vue
<script setup>
const source = `<h1>Toto</h1>

<input
  v-model.number="count"
  type="number"
>`
</script>

<template>
  <Story :source="source">
    <!-- ... -->
  </Story>
</template>
```

### `responsiveDisabled`

Disables the responsive menu, preview resize handles and makes the preview laways fit the available space.

```vue
<template>
  <Story responsive-disabled>
    <!-- ... -->
  </Story>
</template>
```

## Variant

Create different sub stories around the same component by using the `<Variant>` tag multiple times inside the same `<Story>` tag.

### `title`

Title of the variant.

```vue
<template>
  <Story title="Cars">
    <Variant title="default">
      🚗
    </Variant>
    <Variant title="Fast">
      🏎️
    </Variant>
    <Variant title="Slow">
      🚜
    </Variant>
  </Story>
</template>
```

### `id`

Id of the variant used in the URL. By default, the id is automatically generated with the index of the variant in the list. Setting an id manually will ensure the URL parameter doesn't change with the order of the variants in the story.

```vue
<template>
  <Story>
    <Variant id="default">
      🚗
    </Variant>
    <Variant id="fast">
      🏎️
    </Variant>
    <Variant id="slow">
      🚜
    </Variant>
  </Story>
</template>
```

### `initState`

Function that returns the intial state.

```vue
<script setup>
function initState () {
  return {
    disabled: false,
    content: "Hello world"
  }
}
</script>

<template>
  <Story title="My Button">
    <Variant title="Default" :init-state="initState">
      <template #default="{ state }">
        <button :disabled="state.disabled">
          {{ state.content }}
        </button>
      </template>
    </Variant>
  </Story>
</template>
```

[Learn more](../guide/vue3/controls.md#init-state)

### `setupApp`

A function to configure the Vue application.

It receives a payload object as parameter with the following properties:

- `app`: The Vue application instance.
- `story`: The story object.
- `variant`: The variant object.

```vue
<script setup>
function mySetupApp ({ app, story, variant }) {
  app.provide('demo', 'meow')
}
</script>

<template>
  <Story>
    <Variant :setup-app="mySetupApp">
      <!-- ... -->
    </Variant>
  </Story>
</template>
```

[Learn more](../guide/vue3/app-setup.md#local-setup)

### `icon`

An [Iconify id](https://icones.js.org/) to customize the variant icon in the UI.

```vue
<template>
  <Story>
    <Variant icon="lucide:car">
      🚗
    </Variant>
  </Story>
</template>
```

### `iconColor`

The icon color.

```vue
<template>
  <Story>
    <Variant icon-color="#8B5CF6">
      🚗
    </Variant>
  </Story>
</template>
```

### `source`

The copiable source code of the variant.

```vue
<script setup>
const source = `<h1>Toto</h1>

<input
  v-model.number="count"
  type="number"
>`
</script>

<template>
  <Story>
    <Variant :source="source">
      <!-- ... -->
    </Variant>
  </Story>
</template>
```

### `responsiveDisabled`

Disables the responsive menu, preview resize handles and makes the preview laways fit the available space.

```vue
<template>
  <Story>
    <Variant responsive-disabled>
      <!-- ... -->
    </Variant>
  </Story>
</template>
```

### Slot: `default`

Content of the variant.

Props:

- `state`: Object with the current state of the variant.

```vue
<template>
  <Story>
    <Variant>
      <template #default="{ state }">
        <pre>{{ state }}</pre>
      </template>
    </Variant>
  </Story>
</template>
```

### Slot: `controls`

Content of the 'Controls' pane used to interact with the story.

Props:

- `state`: Object with the current state of the variant.

```vue
<template>
  <Story>
    <Variant>
      <template #controls="{ state }">
        <!-- Interact with state here -->
      </template>
    </Variant>
  </Story>
</template>
```

[Learn more](../guide/vue3/controls.md#controls-panel)

### Slot: `source`

Manual copiable source code.

```vue
<template>
  <Story>
    <Variant>
      <template #source>
        <textarea v-pre>
          <h1>Toto</h1>

          <input
            v-model.number="count"
            type="number"
          >
        </textarea>
      </template>
    </Variant>
  </Story>
</template>
```

[Learn more](../guide/vue3/docs.md#source-code)
