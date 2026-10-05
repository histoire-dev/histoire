# Nuxt UI and rstore

Nuxt 4, Nuxt UI 4, Tailwind 4 Vite integration, and `@rstore/nuxt` under `/_stories/`.
Nuxt module installs in-memory rstore plugin per isolated Vue app. Query and toast need no remote service, fonts, or icons.

```sh
pnpm --filter histoire-example-nuxt-ui story:dev
pnpm --filter histoire-example-nuxt-ui story:build
pnpm --filter histoire-example-nuxt-ui story:build:node
```

Vanilla embed host runs on `http://localhost:5173`. Set its source URL to this book's `/_stories/` URL. Exact origins in `histoire.config.ts` allow that host. Choose dark appearance through session settings; sandbox applies `dark` to its own document.

Nuxt UI configures Tailwind's Vite plugin through its Nuxt module. CSS imports follow [Nuxt UI installation](https://ui.nuxt.com/docs/getting-started/installation/nuxt) and [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite).
