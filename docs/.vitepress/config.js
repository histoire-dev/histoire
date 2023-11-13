module.exports = {
  title: 'Histoire',
  description: 'Fast stories powered by Vite',
  head: [
    ['meta', { property: 'og:title', content: 'Histoire' }],
    ['meta', { property: 'og:site_name', content: 'Histoire' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:description', content: 'Fast stories powered by Vite' }],
    ['meta', { property: 'og:url', content: 'https://histoire.dev/' }],
    ['meta', { property: 'og:image', content: 'https://histoire.dev/opengraph.png' }],
    ['meta', { property: 'og:image:width', content: '600' }],
    ['meta', { property: 'og:image:height', content: '315' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:site', content: '@histoire_dev' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.bunny.net/css?family=fira-sans:400,400i,600,600i' }],
  ],

  lastUpdated: true,

  themeConfig: {
    logo: '/logo.svg',

    editLink: {
      pattern: 'https://github.com/histoire-dev/histoire/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2022-present Guillaume Chau',
    },

    nav: [
      {
        text: 'Guide',
        items: [
          {
            text: 'Frameworks',
            items: [
              {
                text: 'Vue 3',
                link: '/guide/vue3/getting-started',
              },
              {
                text: 'Vue 2.7',
                link: '/guide/vue2/getting-started',
              },
              {
                text: 'Svelte 3',
                link: '/guide/svelte3/getting-started',
              },
            ],
          },
          {
            text: 'About',
            items: [
              {
                text: 'Why Histoire?',
                link: '/guide/',
              },
              {
                text: 'Getting started',
                link: '/guide/getting-started',
              },
              {
                text: 'Configuration',
                link: '/guide/config',
              },
              {
                text: 'Plugins',
                link: '/guide/plugins/official',
              },
              {
                text: 'Builtin controls',
                link: 'https://controls.histoire.dev/',
              },
            ],
          },
        ],
      },
      { text: 'Examples', link: '/examples/' },
      { text: 'API Reference', link: '/reference/config' },
      {
        text: 'Changelog',
        link: 'https://github.com/histoire-dev/histoire/blob/main/CHANGELOG.md',
      },
      {
        text: 'Sponsor',
        items: [
          {
            text: 'Guillaume Chau',
            link: 'https://github.com/sponsors/Akryum',
          },
          {
            text: 'Hugo Attal',
            link: 'https://github.com/sponsors/hugoattal',
          },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/histoire-dev/histoire' },
      { icon: { svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Mastodon</title><path d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611.118 1.24.325 2.47.62 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z"/></svg>' }, link: 'https://m.webtoo.ls/@histoire' },
      { icon: 'twitter', link: 'https://twitter.com/histoire_dev' },
      { icon: 'discord', link: 'https://discord.gg/KpCnT72rJk' },
    ],

    sidebar: {
      '/reference/': [
        {
          text: 'API Reference',
          items: [
            {
              text: 'Configuration reference',
              link: '/reference/config',
            },
            {
              text: 'Client API',
              link: '/reference/client',
            },
            {
              text: 'Plugin API',
              link: '/reference/plugin-api',
            },
          ],
        },
        {
          text: 'Story components (Vue)',
          collapsible: true,
          items: [
            {
              text: 'Story',
              link: '/reference/vue3/story',
            },
            {
              text: 'Variant',
              link: '/reference/vue3/variant',
            },
          ],
        },
        {
          text: 'Story components (Svelte)',
          collapsible: true,
          items: [
            {
              text: 'Hst.Story',
              link: '/reference/svelte3/story',
            },
            {
              text: 'Hst.Variant',
              link: '/reference/svelte3/variant',
            },
          ],
        },
      ],
      '/guide/vue3/': [
        {
          text: 'Guide - Vue 3',
          collapsible: true,
          items: [
            {
              text: 'Getting Started',
              link: '/guide/vue3/getting-started',
            },
            {
              text: 'Stories',
              link: '/guide/vue3/stories',
            },
            {
              text: 'State & Controls',
              link: '/guide/vue3/controls',
            },
            {
              text: 'Events',
              link: '/guide/vue3/events',
            },
            {
              text: 'App setup',
              link: '/guide/vue3/app-setup',
            },
            {
              text: 'Wrapper',
              link: '/guide/vue3/wrapper',
            },
            {
              text: 'Documentation',
              link: '/guide/vue3/docs',
            },
            {
              text: 'Hierarchy',
              link: '/guide/vue3/hierarchy',
            },
          ],
        },
        {
          text: 'Learn more',
          collapsible: true,
          items: [
            {
              text: 'About Histoire ⮌',
              link: '/guide/',
            },
            {
              text: 'Configuration ⮌',
              link: '/guide/config',
            },
            {
              text: 'Plugins ⮌',
              link: '/guide/plugins/official',
            },
          ],
        },
      ],
      '/guide/vue2/': [
        {
          text: 'Guide - Vue 2',
          collapsible: true,
          items: [
            {
              text: 'Getting Started',
              link: '/guide/vue2/getting-started',
            },
            {
              text: 'Stories',
              link: '/guide/vue2/stories',
            },
            {
              text: 'State & Controls',
              link: '/guide/vue2/controls',
            },
            {
              text: 'Events',
              link: '/guide/vue2/events',
            },
            {
              text: 'App setup',
              link: '/guide/vue2/app-setup',
            },
            {
              text: 'Wrapper',
              link: '/guide/vue2/wrapper',
            },
            {
              text: 'Documentation',
              link: '/guide/vue2/docs',
            },
            {
              text: 'Hierarchy',
              link: '/guide/vue2/hierarchy',
            },
          ],
        },
        {
          text: 'Learn more',
          collapsible: true,
          items: [
            {
              text: 'About Histoire ⮌',
              link: '/guide/',
            },
            {
              text: 'Configuration ⮌',
              link: '/guide/config',
            },
            {
              text: 'Plugins ⮌',
              link: '/guide/plugins/official',
            },
          ],
        },
      ],
      '/guide/svelte3/': [
        {
          text: 'Guide - Svelte 3',
          collapsible: true,
          items: [
            {
              text: 'Getting Started',
              link: '/guide/svelte3/getting-started',
            },
            {
              text: 'Stories',
              link: '/guide/svelte3/stories',
            },
            {
              text: 'State & Controls',
              link: '/guide/svelte3/controls',
            },
            {
              text: 'Events',
              link: '/guide/svelte3/events',
            },
            {
              text: 'Documentation',
              link: '/guide/svelte3/docs',
            },
            {
              text: 'Hierarchy',
              link: '/guide/svelte3/hierarchy',
            },
          ],
        },
        {
          text: 'Learn more',
          collapsible: true,
          items: [
            {
              text: 'About Histoire ⮌',
              link: '/guide/',
            },
            {
              text: 'Configuration ⮌',
              link: '/guide/config',
            },
            {
              text: 'Plugins ⮌',
              link: '/guide/plugins/official',
            },
          ],
        },
      ],
      '/guide/': [
        {
          text: 'About',
          items: [
            {
              text: 'Why Histoire',
              link: '/guide/',
            },
            {
              text: 'Getting Started',
              link: '/guide/getting-started',
            },
            {
              text: 'Configuration',
              link: '/guide/config',
            },
          ],
        },
        {
          text: 'Plugins',
          items: [
            {
              text: 'Official plugins',
              link: '/guide/plugins/official',
            },
            {
              text: 'Plugin development guide',
              link: '/guide/plugins/development',
            },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'General examples',
          collapsible: true,
          items: [
            {
              text: 'Tailwind CSS',
              link: '/examples/tailwind',
            },
          ],
        },
        {
          text: 'Vue 3 examples',
          collapsible: true,
          items: [
            {
              text: 'Single stories',
              link: '/examples/vue3/single-stories',
            },
            {
              text: 'Variant stories',
              link: '/examples/vue3/variant-stories',
            },
            {
              text: 'Controlled stories',
              link: '/examples/vue3/controlled-stories',
            },
          ],
        },
        {
          text: 'Visual regression testing',
          collapsible: true,
          items: [
            {
              text: 'Lost Pixel',
              link: '/examples/visual-regression-testing/lost-pixel',
            },
            {
              text: 'Percy',
              link: '/examples/visual-regression-testing/percy',
            },
          ],
        },
      ],
    },

    algolia: {
      appId: 'JB9PU89D4X',
      apiKey: '1c9759220b24c8ccbc064a6df95e2108',
      indexName: 'histoire',
    },
  },
}
