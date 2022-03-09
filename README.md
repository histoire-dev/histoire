<p align="center">
  <img src="./logo.svg" alt="Histoire logo" width="256px" height="256px">
</p>

<br>

# Histoire

**⚠️ Histoire is in Early Access: the repository is currently only available to our [sponsors](https://github.com/sponsors/Akryum).**

> Fast and beautiful interactive component playgrounds

⚡️ Lightning fast development and instant HMR thanks to [Vite](http://vitejs.dev)  
👓 Build and visually test your components in isolation  
📚 Document your components with stories and variants  
📝 Generate source code examples automatically  
🎨 Beautiful and customizable interface  

![screenshot](./screenshot.png)

*(work-in-progress screenshot)*

## Supported frameworks

| Framework | Versions | Support | Auto CodeGen | Docs |
| --------- | -------- | ------- | ------------ | ---- |
| [Vue](https://vuejs.org/) | 3.2+ | ✅ | ✅ | Todo |
| [Svelte](https://svelte.dev/) | - | Planned | - | - |
| [React](https://reactjs.org/) | - | TBD | - | - |
| [Angular](https://angular.io/) | - | TBD | - | - |

## Quick Start

```bash
pnpm i -D histoire
pnpm exec histoire dev
pnpm exec histoire build
```

### Vue 3

In your Vite project, create a `MyComponent.story.vue` file inside your `src` directory:

```vue
<script setup>
import MyComponent from './MyComponent.vue'

function initState () {
  return {
    disabled: false,
  }
}
</script>

<template>
  <Story
    title="MyComponent"
    :layout="/* {
      type: 'grid',
      width: 200,
    } */"
  >
    <Variant
      title="playground"
      :init-state="initState"
    >
      <template #default="{ state }">
        <MyComponent
          :disabled="state.disabled"
        >
          Hello world
        </MyComponent>
      </template>

      <template #controls="{ state }">
        <div>
          <label>
            <input
              v-model="state.disabled"
              type="checkbox"
            >
            Disabled
          </label>
        </div>
      </template>
    </Variant>

    <Variant title="green">
      <MyComponent
        color="green"
      >
        Hello world
      </MyComponent>
    </Variant>
  </Story>
</template>
```

## Packages

This mono-repo contains the following packages:

| Package | Description |
| ------- | ----------- |
| [histoire](https://github.com/Akryum/histoire/tree/main/packages/histoire) | Main package |
| [@histoire/controls](https://github.com/Akryum/histoire/tree/main/packages/histoire-controls) | Builtin controls components |

## Contribution

See [Contributing Guide](https://github.com/Akryum/histoire/blob/main/CONTRIBUTING.md).

## Sponsors

### [Guillaume Chau](https://github.com/sponsors/Akryum)

<p align="center">
  <a href="https://guillaume-chau.info/sponsors/" target="_blank">
    <img src='https://akryum.netlify.app/sponsors.svg'/>
  </a>
</p>

## License

MIT
