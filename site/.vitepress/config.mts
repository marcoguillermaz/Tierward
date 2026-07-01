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
        text: 'v1.34',
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
        collapsed: false,
        items: [
          { text: 'Overview', link: '/skills/' },
          {
            text: 'Universal (S M L)',
            collapsed: true,
            items: [
              { text: '/arch-audit', link: '/skills/arch-audit' },
              { text: '/commit', link: '/skills/commit' },
              { text: '/perf-audit', link: '/skills/perf-audit' },
              { text: '/security-audit', link: '/skills/security-audit' },
              { text: '/simplify', link: '/skills/simplify' },
              { text: '/skill-dev', link: '/skills/skill-dev' },
              { text: '/skill-security', link: '/skills/skill-security' },
              { text: '/systematic-debugging', link: '/skills/systematic-debugging' },
            ],
          },
          {
            text: 'Team (M L)',
            collapsed: true,
            items: [
              { text: '/accessibility-audit', link: '/skills/accessibility-audit' },
              { text: '/api-contract-audit', link: '/skills/api-contract-audit' },
              { text: '/api-design', link: '/skills/api-design' },
              { text: '/compliance-audit', link: '/skills/compliance-audit' },
              { text: '/dependency-audit', link: '/skills/dependency-audit' },
              { text: '/dependency-scan', link: '/skills/dependency-scan' },
              { text: '/doc-audit', link: '/skills/doc-audit' },
              { text: '/infra-audit', link: '/skills/infra-audit' },
              { text: '/migration-audit', link: '/skills/migration-audit' },
              { text: '/pr-review', link: '/skills/pr-review' },
              { text: '/responsive-audit', link: '/skills/responsive-audit' },
              { text: '/skill-db', link: '/skills/skill-db' },
              { text: '/skill-review', link: '/skills/skill-review' },
              { text: '/test-audit', link: '/skills/test-audit' },
              { text: '/ui-audit', link: '/skills/ui-audit' },
              { text: '/ux-audit', link: '/skills/ux-audit' },
              { text: '/visual-audit', link: '/skills/visual-audit' },
            ],
          },
          {
            text: 'Tier L',
            collapsed: true,
            items: [
              { text: '/context-review', link: '/skills/context-review' },
            ],
          },
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
