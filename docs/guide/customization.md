# Theme customization

To better match your colors guidelines, you can customize every colors used in the app. Note that Histoire uses Tailwind for its UI, so the colors pattern must match the Tailwind pattern.

## Use builtin patterns

Histoire provides some builtin patterns to easily change the color of the app.

```ts
// histoire.config.ts

import { defaultColors } from 'histoire'

export default defineConfig({ 
  theme: {
    colors: {
      gray: defaultColors.zinc,
      primary: defaultColors.cyan
    }
  }
})
```

Available colors patterns:
- `slate`
- `gray`
- `zinc`
- `neutral`
- `stone`
- `red`
- `orange`
- `amber`
- `yellow`
- `lime`
- `green`
- `emerald`
- `teal`
- `cyan`
- `sky`
- `blue`
- `indigo`
- `violet`
- `purple`
- `fuchsia`
- `pink`
- `rose`

## Use custom colors

You can also define your own colors.

```ts
// histoire.config.ts

export default defineConfig({ 
  theme: {
    colors: {
      gray: {
        50: '#fafafa',
        100: '#f4f4f5',
        200: '#e4e4e7',
        300: '#d4d4d8',
        400: '#a1a1aa',
        500: '#71717a',
        600: '#52525b',
        700: '#3f3f46',
        750: '#323238',
        800: '#27272a',
        850: '#1f1f21',
        900: '#18181b',
        950: '#101012',
      },
      primary: {
        50: '#ecfeff',
        100: '#cffafe',
        200: '#a5f3fc',
        300: '#67e8f9',
        400: '#22d3ee',
        500: '#06b6d4',
        600: '#0891b2',
        700: '#0e7490',
        800: '#155e75',
        900: '#164e63',
      }
    }
  }
})
```
