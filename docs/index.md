---
layout: home

hero:
  name: Histoire
  text: A new way to write stories
  tagline: Powered by Vite
  image:
    src: /logo.svg
    alt: Histoire logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Why Histoire?
      link: /guide/
    - theme: alt
      text: View on GitHub
      link: https://github.com/histoire-dev/histoire

features:
  - title: 📖 Stories
    details: Write stories to showcase and document your components.
  - title: ⚡ Fast
    details: Incredibly fast development building and production page loading!
  - title: 🔧️ No-config
    details: Sane and configurable defaults, automatically reuses your Vite config!
  - title: 🎨 Themable
    details: Customize the look of the generated app with your own branding.
  - title: 💻️ Copyable code
    details: Automatically generates dynamic template source code!
  - title: 🌙 Dark mode
    details: Enjoy a more pleasing experience during night.
---

<!-- Frameworks -->

<h2 class="text-center !text-lg mt-12 mb-6">
  Choose your framework
</h2>

<div class="flex items-center justify-center gap-4 flex-wrap">
  <a
    href="./guide/vue3/getting-started.html"
    class="p-10 rounded bg-gray-100 dark:bg-gray-900 transition-colors hover:bg-green-100"
  >
    <img src="/vue.svg" alt="Vue logo" class="w-16 h-16" />
  </a>
  <a
    href="./guide/svelte3/getting-started.html"
    class="p-10 rounded bg-gray-100 dark:bg-gray-900 transition-colors hover:bg-orange-100"
  >
    <img src="/svelte.svg" alt="Svelte logo" class="w-16 h-16" />
  </a>
</div>

<!-- Other content -->

<hr class="border-0 border-t border-gray-500 opacity-10 my-24" />

<div class="container mx-auto">
  <h2>
    Meet the team
  </h2>

  <MeetTeam class="mb-24" />

  <h2>
    Sponsors
  </h2>

  <p align="center">
    <a href="https://guillaume-chau.info/sponsors/" target="_blank">
      <img src='https://akryum.netlify.app/sponsors.svg'/>
    </a>
  </p>

  <div class="flex justify-center mb-12">
    <SponsorButton/>
  </div>

  <div class="flex justify-center my-4">
    <a href="https://www.netlify.com">
      <img src="https://www.netlify.com/img/global/badges/netlify-color-accent.svg" alt="Deploys by Netlify" />
    </a>
  </div>
</div>

<style lang="postcss" scoped>
h2 {
  @apply text-center text-2xl md:text-3xl;
}
</style>

<div class="flex flex-col items-center">
  <a rel="me" href="https://m.webtoo.ls/@histoire" class="flex items-center gap-2 mt-24">
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4"><title>Mastodon</title><path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/></svg>
    Follow us on Mastodon
  </a>
</div>
