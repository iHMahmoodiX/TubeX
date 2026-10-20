import { defineConfig } from 'wxt';

// Hosts TubeX reads page context from. Keep this list narrow; see docs/INTEGRATIONS.md.
export const YOUTUBE_MATCHES = ['https://www.youtube.com/*', 'https://studio.youtube.com/*'];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TubeX',
    description: 'Local-first Persian/English workbench for YouTube creators.',
    minimum_chrome_version: '116',
    permissions: ['storage', 'sidePanel'],
    host_permissions: YOUTUBE_MATCHES,
    action: { default_title: 'TubeX' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
});
