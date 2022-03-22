# Theme

Histoire can be white-labeled to match your brand guidelines. Here are the available options:

```ts
// histoire.config.ts

export default defineConfig({ 
    theme: {
        title: "Acme Inc.",
        logo: {
            square: "./img/square.png",
            light: "./img/light.png",
            dark: "./img/dark.png"
        },
        favicon: "./favicon.ico",
        logoHref: "https://histoire.dev"
    }
})
```
