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
      { text: 'Early access', link: '/early-access/' },
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
      '/': [
        {
          text: 'Getting Started',
          children: [
            {
              text: 'Introduction',
              link: '/guide/',
            },
            {
              text: 'Install',
              link: '/guide/install',
            },
            {
              text: 'Configuration',
              link: '/guide/config',
            },
          ],
        },
        {
          text: 'Write stories',
          children: [
            {
              text: 'Introduction',
              link: '/guide/stories',
            },
            {
              text: 'Variant',
              link: '/guide/variant',
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
              text: 'Serialization',
              link: '/guide/serialization',
            },
            {
              text: 'Hierarchy',
              link: '/guide/hierarchy',
            },
          ],
        },
        {
          text: 'Theme',
          children: [
            {
              text: 'Configuration',
              link: '/guide/theme',
            },
            {
              text: 'Customization',
              link: '/guide/customization',
            },
          ],
        }, {
          text: 'API Reference',
          children: [],
        },
      ],
    },
  },
}
