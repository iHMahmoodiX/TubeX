import { defineConfig } from 'wxt';

// Hosts TubeX reads page context from. Keep this list narrow; see docs/INTEGRATIONS.md.
export const YOUTUBE_MATCHES = ['https://www.youtube.com/*', 'https://studio.youtube.com/*'];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TubeX',
    description: 'Local-first Persian/English workbench for YouTube creators.',
    minimum_chrome_version: '116',
    // Public key only: fixes the extension ID (cohhieggibbcifgenjclmjainpljkefh) so the Google OAuth
    // redirect URI https://cohhieggibbcifgenjclmjainpljkefh.chromiumapp.org/ stays the same on every install.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv1kvbdyJ6JCiXVA6r3lE0RpkYoeI0nwgMS/1LVPexSg5d8Y34pDqG6lpMroY21PUrsY8csm3pvkhoHssiTfTx3mvIyyAyIU1EfJ9XS8y7GhbABpUoXRWWr4ZmIFJCN2JWVzUh5lkz5gwiCv26vgFfqWRQAOamSY2Vsv2ivf7vXyrQDdGmmboEfy+APWNEiMxD15w8nf/qU9vb1w9xqPyO/CZNTLSalO37YLlydx8nJv872AQ/z1undN/XH/TJsRWO2Yjv06Ssy2nqVUrEHQv2ghNUUu2j42Hd4weNJFsg2F6FFqLm7Qx5SYQfJdHIxNybz287bRmKRt7Pl62sPIQ0QIDAQAB',
    permissions: ['storage', 'sidePanel', 'identity'],
    host_permissions: YOUTUBE_MATCHES,
    // Requested at runtime, per exact origin, when the owner connects a service in Settings.
    optional_host_permissions: ['https://www.googleapis.com/*', 'https://youtubeanalytics.googleapis.com/*', 'http://localhost/*', 'http://127.0.0.1/*', 'https://*/*'],
    action: { default_title: 'TubeX' },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
});
