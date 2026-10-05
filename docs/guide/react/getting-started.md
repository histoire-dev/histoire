# Getting started with React

React 18 and 19 stories use `.story.tsx` or `.story.jsx` files with a default component export.

Install Histoire and React support alongside your React dependencies:

```sh
pnpm add -D histoire @histoire/plugin-react @vitejs/plugin-react
```

Keep your JSX plugin in `vite.config.ts`. Histoire reuses your Vite configuration:

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

Add scripts to `package.json`:

```json
{
  "scripts": {
    "story:dev": "histoire dev",
    "story:build": "histoire build",
    "story:preview": "histoire preview"
  }
}
```

Create `Button.story.tsx`:

```tsx
import { Story } from '@histoire/plugin-react'
import { Button } from './Button'

export default function ButtonStory() {
  return <Story title="Button"><Button>Hi</Button></Story>
}
```

Run `pnpm story:dev`. See [stories](./stories.md) and [state and controls](./controls.md) for variants and interactive state.

For TypeScript, set `jsx: "react-jsx"` and `moduleResolution: "bundler"` in your project configuration.
