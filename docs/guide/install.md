# Installation

## Package

Install Histoire package into your project:

```shell
pnpm i -D histoire
# OR
npm i -D histoire
# OR
yarn add -D histoire
```

## Commands

Histoire provides two commands:
- `histoire dev`: start a server with hot-reload
- `histoire build`: build the app for production

You can add these to your `package.json` like this:

```json
{
  "scripts": {
    "story:dev": "histoire dev",
    "story:build": "histoire build"
  }
}
```

## Next steps

You're all set up! You can now start the development server:

```shell
pnpm run story:dev
```

Then, [create a few stories](/guide/stories). Once you're happy with them, build the story app:

```shell
pnpm run story:build
```
