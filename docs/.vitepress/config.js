module.exports = {
  title: 'Peeky',
  description: 'A fast and fun test runner for Vite & Node 🐈️',

  head: [
    ['link', { rel: 'stylesheet', href: 'https://cdn.rawgit.com/luizbills/feather-icon-font/v4.7.0/dist/feather.css' }],
  ],

  themeConfig: {
    repo: 'Akryum/peeky',
    docsDir: 'docs',
    docsBranch: 'master',
    editLinks: true,
    editLinkText: 'Suggest changes to this page',
    logo: 'logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/' },
      {
        text: '💜️ Sponsor',
        link: 'https://github.com/sponsors/Akryum',
      },
      {
        text: 'Changelog',
        link: 'https://github.com/Akryum/peeky/blob/master/CHANGELOG.md',
      },
    ],

    sidebar: {
      // catch-all fallback
      '/': [
        {
          text: 'Guide',
          children: [
            {
              text: 'Introduction',
              link: '/guide/introduction',
            },
            {
              text: 'Getting Started',
              link: '/guide/',
            },
            {
              text: 'Setup guides',
              children: [
                {
                  text: 'Vite',
                  link: '/guide/setup/vite',
                },
                {
                  text: 'TypeScript',
                  link: '/guide/setup/typescript',
                },
                {
                  text: 'Eslint',
                  link: '/guide/setup/eslint',
                },
              ],
            },
            {
              text: 'Writing tests',
              link: '/guide/writing-tests',
            },
            {
              text: 'Runtime environments',
              link: '/guide/runtime-env',
            },
            {
              text: 'Configuration',
              link: '/guide/config',
            },
          ],
        },
      ],
    },
  },
}
