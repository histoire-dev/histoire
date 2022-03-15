module.exports = {
  title: 'Histoire',
  description: 'Fast stories powered by Vite',

  themeConfig: {
    repo: 'Akryum/histoire',
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
      // catch-all fallback
      // '/': [
      //   {
      //     text: 'Guide',
      //     children: [
      //       {
      //         text: 'Getting Started',
      //         link: '/guide/',
      //       },
      //     ],
      //   },
      // ],
    },
  },
}
