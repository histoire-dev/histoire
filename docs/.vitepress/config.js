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
      { text: 'Guide', link: '/guide/' },
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
          text: 'Story components (Vue 3)',
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
      ],
      '/guide/': [
        {
          text: 'Guide',
          collapsible: true,
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
          text: 'Using with Vue 3',
          collapsible: true,
          items: [
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
          text: 'Plugins',
          items: [
            {
              text: 'Official plugins',
              link: '/guide/plugins#official',
            },
            {
              text: 'Plugin development guide',
              link: '/guide/plugins#plugin-development',
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
