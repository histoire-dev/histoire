# Ecosystem <Badge type="tip" text="1.0-beta.2+" />

Configure shared Vue libraries in your [setup file](./app-setup.md#global-setup), or follow the linked plugin instructions for Nuxt and Quasar CLI.

In dark mode, Histoire adds the class from `theme.darkClass` (default `dark`) to each story's `<html>` element. Libraries with a matching CSS selector follow the change automatically. Use [`onDarkChange`](./app-setup.md#dark-mode) for libraries with a programmatic theme setting.

## Nuxt

Use [`@histoire/plugin-nuxt`](./getting-started.md#nuxt).

## Quasar

### Quasar CLI

Use [`@histoire/plugin-quasar`](./getting-started.md#quasar-cli). It loads your `quasar.config` file, boot files, store and styles.

### Vite plugin

In projects using `@quasar/vite-plugin` with a regular `vite.config` file, install Quasar in your setup file:

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { Dark, Notify, Quasar } from 'quasar'
import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'

export const setupVue3 = defineSetupVue3(({ app, onDarkChange }) => {
  app.use(Quasar, {
    plugins: { Notify },
  })

  onDarkChange(dark => Dark.set(dark))
})
```

## Vuetify

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'

export const setupVue3 = defineSetupVue3(({ app, onDarkChange }) => {
  const vuetify = createVuetify()
  app.use(vuetify)

  onDarkChange((dark) => {
    vuetify.theme.change(dark ? 'dark' : 'light')
  })
})
```

`theme.change()` requires Vuetify 3.9+. With older versions, set `vuetify.theme.global.name.value` instead.

`vite-plugin-vuetify` with `autoImport: true` works as is.

## PrimeVue

Point the dark mode selector to Histoire's dark class:

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import Aura from '@primeuix/themes/aura'
import PrimeVue from 'primevue/config'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(PrimeVue, {
    theme: {
      preset: Aura,
      options: {
        darkModeSelector: '.dark',
      },
    },
  })
})
```

## Element Plus

Element Plus styles its dark mode with the `dark` class on `<html>`, so it follows Histoire automatically once you import its dark CSS variables:

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(ElementPlus)
})
```

## Naive UI

Naive UI themes through a provider component. Add it as a [wrapper](./wrapper.md) and follow dark mode with `onDarkChange`:

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { darkTheme, NConfigProvider } from 'naive-ui'
import { defineComponent, h, ref } from 'vue'

export const setupVue3 = defineSetupVue3(({ addWrapper, onDarkChange }) => {
  const dark = ref(false)
  onDarkChange((value) => {
    dark.value = value
  })

  addWrapper(defineComponent({
    // Histoire passes these to every wrapper.
    props: ['story', 'variant'],
    setup: (_, { slots }) => () => h(NConfigProvider, { theme: dark.value ? darkTheme : null }, slots),
  }))
})
```

## Ionic

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { IonicVue } from '@ionic/vue'
import '@ionic/vue/css/core.css'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(IonicVue)
})
```

Restrict [`storyMatch`](../../reference/config.md#storymatch) to your sources, so Histoire doesn't search the native project folders.

## Vue I18n

```ts
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createI18n } from 'vue-i18n'
import messages from './locales'

export const setupVue3 = defineSetupVue3(({ app }) => {
  app.use(createI18n({ legacy: false, locale: 'en', messages }))
})
```

## Auto-import plugins

Component auto-import plugins (`unplugin-vue-components`, `vite-plugin-vuetify`...) and API auto-import plugins (`unplugin-auto-import`) from your `vite.config` work in stories.

If a plugin writes files (like `.d.ts` declarations) and conflicts with Histoire, exclude it with [`viteIgnorePlugins`](../config.md#ignoring-plugins).

Histoire runs known UI libraries (Vuetify, Quasar, PrimeVue, Element Plus, Ionic, Ant Design Vue) through Vite while collecting stories, so their CSS imports work. For other libraries that import CSS from JavaScript, add them to [`viteNodeInlineDeps`](../../reference/config.md#vitenodeinlinedeps).

## NativeScript

NativeScript-Vue renders native views instead of the DOM, so its components can't render in Histoire. Keep your presentational logic in plain Vue components to write stories for it.
