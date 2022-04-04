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
          text: 'Builtin components',
          link: '/reference/components',
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
          text: 'Writing Stories',
          children: [
            {
              text: 'Stories',
              link: '/guide/stories',
            },
            {
              text: 'State & Controls',
              link: '/guide/controls',
            },
            {
              text: 'Documentation',
              link: '/guide/docs',
            },
            {
              text: 'Hierarchy',
              link: '/guide/hierarchy',
            },
          ],
        },
      ],
    },
  },
}
