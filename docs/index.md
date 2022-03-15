---
home: true
sidebar: false
heroImage: /logo.svg
tagline: Fast stories powered by Vite

# actionText: Get Started
# actionLink: /guide/
actionText: Get Started
actionLink: /guide/

features:
  - title: 📖 Stories
    details: Write stories to showcase and document your components.
  - title: ⚡ Fast
    details: Incredibly fast development building and production page loading!
  - title: 🔧️ No-config
    details: Sane and configurable defaults, automatically reuses your Vite config!
  - title: 🎨 Themable
    details: Customize the look of the generated app with your own branding.
  - title: 💻️ Copiable code
    details: Automatically generates dynamic template source code!
  - title: 🌙 Dark mode
    details: Enjoy a more pleasing experience during night.

footer: MIT Licensed | Copyright © 2022-present Guillaume Chau & Histoire Contributors
---

<div class="!xl:htw-hidden -htw-mx-32 htw-mb-12 htw-bg-gray-200 htw-p-2 htw-rounded-lg htw-h-[550px] htw-flex htw-flex-col">
  <div class="htw-flex-none htw-h-4 htw-flex htw-gap-1 htw-justify-end">
    <div
      v-for="n in 3"
      class="htw-w-2 htw-h-2 htw-rounded-full htw-bg-gray-400"
    />
  </div>

  <iframe
    src="https://vue3.examples.histoire.dev/"
    class="htw-w-full htw-h-full htw-border htw-border-none htw-rounded htw-bg-white"
  />
</div>

<MeetTeam class="htw-mb-24" />

<h2 class="htw-text-center htw-text-3xl">
  Sponsored by
</h2>

<p align="center">
  <a href="https://guillaume-chau.info/sponsors/" target="_blank">
    <img src='https://akryum.netlify.app/sponsors.svg'/>
  </a>
</p>

<div class="htw-flex htw-justify-center htw-mb-12">
  <SponsorButton/>
</div>
