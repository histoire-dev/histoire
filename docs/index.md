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
