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
      repo: 'histoire-dev/histoire',
      branch: 'main',
      dir: 'docs',
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
      { icon: 'twitter', link: 'https://twitter.com/histoire_dev' },
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
      ],
    },

    algolia: {
      appId: 'JB9PU89D4X',
      apiKey: '1c9759220b24c8ccbc064a6df95e2108',
      indexName: 'histoire',
    },
  },
}
