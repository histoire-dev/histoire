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

  themeConfig: {
    repo: 'histoire-dev/histoire',
    docsDir: 'docs',
    docsBranch: 'main',
    editLinks: true,
    editLinkText: 'Suggest changes to this page',
    logo: 'logo.svg',

    nav: [
      // { text: 'Guide', link: '/guide/' },
      { text: 'Early access', link: '/guide/' },
      {
        text: 'Changelog',
        link: 'https://github.com/Akryum/histoire/blob/master/CHANGELOG.md',
      },
    ],

    sidebar: {
      '/reference/': [
        {
          text: 'Configuration reference',
          link: '/reference/config',
        },
        {
          text: 'Story components (Vue 3)',
          link: '/reference/components-vue3',
        },
        {
          text: 'Plugin API',
          link: '/reference/plugin-api',
        },
      ],
      '/': [
        {
          text: 'Why Histoire',
          link: '/guide/why',
        },
        {
          text: 'Getting Started',
          link: '/guide/getting-started',
        },
        {
          text: 'Configuration',
          link: '/guide/config',
        },
        {
          text: 'Using with Vue 3',
          children: [
            {
              text: 'Stories',
              link: '/guide/vue3/stories',
            },
            {
              text: 'State & Controls',
              link: '/guide/vue3/controls',
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
          text: 'Examples',
          children: [
            {
              text: 'Single stories',
              link: '/guide/examples/single-stories',
            },
            {
              text: 'Variant stories',
              link: '/guide/examples/variant-stories',
            },
            {
              text: 'Controlled stories',
              link: '/guide/examples/controlled-stories',
            },
          ],
        },
        {
          text: 'Plugins',
          link: '/guide/plugins',
        },
      ],
    },
  },
}
