module.exports = {
  title: 'Histoire',
  description: 'Fast stories powered by Vite',

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
        text: '💚 Sponsor',
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
      ],
      '/': [
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
              text: 'Documentation',
              link: '/guide/vue3/docs',
            },
            {
              text: 'Hierarchy',
              link: '/guide/vue3/hierarchy',
            },
          ],
        },
      ],
    },
  },
}
