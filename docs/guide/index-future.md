# Getting started

Histoire allows you to create apps showcasing your components by writing stories.

<SponsorButton/>

## Installation

Install Histoire into your project:

```shell
pnpm i -D histoire
# OR
npm i -D histoire
# OR
yarn add -D histoire
```

Then add the following scripts to your `package.json`:

```json
{
  "scripts": {
    "story:dev": "histoire dev",
    "story:build": "histoire build"
  }
}
```

Start the development server:

```bash
pnpm run story:dev
```

Create a story file ending with `.story.vue`:

```vue
<template>
  <Story title="🐱 Meow">
    <Variant
      title="default"
    >
      🐱
    </Variant>
  </Story>
</template>
```

Build the story app with:

```bash
pnpm run story:build
```
