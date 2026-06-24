import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Tierward',
  description: 'Governance skills for Claude Code — commit enforcement, audits, and structured pipelines for teams building with AI.',
  base: '/Tierward/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/Tierward/favicon.svg' }],
  ],

  themeConfig: {
    siteTitle: 'Tierward',

    nav: [
      { text: 'Guide', link: '/guide/quick-start' },
      { text: 'Skills', link: '/skills/' },
      { text: 'Config', link: '/config/doctor' },
      {
        text: 'v1.33',
        items: [
          { text: 'Changelog', link: 'https://github.com/marcoguillermaz/Tierward/blob/main/CHANGELOG.md' },
          { text: 'GitHub', link: 'https://github.com/marcoguillermaz/Tierward' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Quick Start', link: '/guide/quick-start' },
          { text: 'Tiers', link: '/guide/tiers' },
        ],
      },
      {
        text: 'Skills',
        items: [
          { text: 'All skills', link: '/skills/' },
        ],
      },
      {
        text: 'Configuration',
        items: [
          { text: 'doctor', link: '/config/doctor' },
          { text: 'Stop hook', link: '/config/stop-hook' },
          { text: 'team-settings.json', link: '/config/team-settings' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/marcoguillermaz/Tierward' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/tierward' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025 Marco Guillermaz',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/marcoguillermaz/Tierward/edit/main/site/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
