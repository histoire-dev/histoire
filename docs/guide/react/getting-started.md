# Getting started with React <Badge type="tip" text="1.0-beta.2+" />

Use Histoire with React 18 or 19. Check the [Node.js and Vite requirements](../getting-started.md#overview) before installing.

Install Histoire and its React plugin in your React project.

```sh
pnpm add -D histoire @histoire/plugin-react
```

Histoire reuses the JSX plugin in your Vite config. If the project has no JSX plugin yet, install `@vitejs/plugin-react` and add it to `vite.config.ts`.

```sh
pnpm add -D @vitejs/plugin-react
```

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [react()] })
```

Register React support in `histoire.config.ts`:

```ts
import { HstReact } from '@histoire/plugin-react'
import { defineConfig } from 'histoire'

export default defineConfig({ plugins: [HstReact()] })
```

Create a `.story.tsx` or `.story.jsx` file with a default component export. For example, create `Button.story.tsx`:

```tsx
import { Story } from '@histoire/plugin-react'

export default function ButtonStory() {
  return <Story title="Button"><button>Continue</button></Story>
}
```

Add these scripts to `package.json`.

```json
{
  "scripts": {
    "story:dev": "histoire dev",
    "story:build": "histoire build",
    "story:preview": "histoire preview"
  }
}
```

Run `pnpm story:dev` and open the printed address. Select **Button** in Stories. To add variants and interactive state, see [React stories](./stories.md) and [state and controls](./controls.md).

For TypeScript, set `jsx: "react-jsx"` and `moduleResolution: "bundler"` in your project configuration.
