import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

const UI_PKG = path.resolve(import.meta.dirname, '../../packages/ui/src');

// Phase 2 sourcemap upload — see apps/dashboard/vite.config.ts for the full
// rationale. Same guard, same release-identity requirement.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryUploadEnabled =
  !!sentryAuthToken && !!sentryOrg && !!sentryProject && !!process.env.VITE_GIT_SHA;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(sentryUploadEnabled
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: sentryOrg,
            project: sentryProject,
            release: { name: process.env.VITE_GIT_SHA! },
            sourcemaps: {
              assets: './dist/**',
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
            telemetry: false,
          }),
        ]
      : []),
  ],
  build: {
    // See apps/dashboard/vite.config.ts. Never ship dist/*.map from a host that
    // serves static files, and gate on the upload actually being wired rather
    // than on the token alone — an inactive plugin never deletes the maps.
    sourcemap: sentryUploadEnabled ? 'hidden' : false,
  },
  server: {
    port: 5174,
    proxy: {
      '/v1': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@boardly/ui/button': path.join(UI_PKG, 'components/button.tsx'),
      '@boardly/ui/card': path.join(UI_PKG, 'components/card.tsx'),
      '@boardly/ui/confirm-dialog': path.join(UI_PKG, 'components/confirm-dialog.tsx'),
      '@boardly/ui/date-picker': path.join(UI_PKG, 'components/date-picker.tsx'),
      '@boardly/ui/dialog': path.join(UI_PKG, 'components/dialog.tsx'),
      '@boardly/ui/dropdown-menu': path.join(UI_PKG, 'components/dropdown-menu.tsx'),
      '@boardly/ui/enterprise-data-grid': path.join(UI_PKG, 'components/enterprise-data-grid.tsx'),
      '@boardly/ui/input': path.join(UI_PKG, 'components/input.tsx'),
      '@boardly/ui/label': path.join(UI_PKG, 'components/label.tsx'),
      '@boardly/ui/avatar': path.join(UI_PKG, 'components/avatar.tsx'),
      '@boardly/ui/searchable-select': path.join(UI_PKG, 'components/searchable-select.tsx'),
      '@boardly/ui/select': path.join(UI_PKG, 'components/select.tsx'),
      '@boardly/ui/sidebar': path.join(UI_PKG, 'components/sidebar.tsx'),
      '@boardly/ui/switch': path.join(UI_PKG, 'components/switch.tsx'),
      '@boardly/ui/tooltip': path.join(UI_PKG, 'components/tooltip.tsx'),
      '@boardly/ui/utils': path.join(UI_PKG, 'utils.ts'),
      '@boardly/ui': path.join(UI_PKG, 'index.ts'),
    },
  },
});
