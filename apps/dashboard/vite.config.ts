import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

const UI_PKG = path.resolve(import.meta.dirname, '../../packages/ui/src');

// Phase 2 sourcemap upload. Guarded on SENTRY_AUTH_TOKEN: without a token the
// plugin would fail the build, and a public DSN cannot upload. Release must be
// byte-identical to the backend's GIT_SHA at deploy time or the uploaded maps
// are indexed under a release no event references.
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
    // Preload the latin Geist subset: it is the only font file requested on
    // first paint (other subsets stay dormant behind unicode-range). The
    // hashed filename is resolved from the bundle at build time.
    // latin-ext and broader scripts intentionally fall back to system fonts
    // (single render-blocking font request; non-Latin content keeps rendering).
    {
      name: 'preload-geist-latin',
      apply: 'build',
      transformIndexHtml(html, ctx) {
        const bundle = (ctx as unknown as { bundle?: Record<string, object> }).bundle;
        if (!bundle) return html;
        const asset = Object.keys(bundle).find((f) => /geist-latin-wght-normal-.*\.woff2$/.test(f));
        if (!asset) return html;
        const tag = `<link rel="preload" href="/${asset}" as="font" type="font/woff2" crossorigin>`;
        return html.replace('</head>', `    ${tag}\n  </head>`);
      },
    },
  ],
  build: {
    chunkSizeWarningLimit: 600,
    // Phase 1 (today): no sourcemaps at all. `hidden` would still write
    // dist/*.map, which any static host serves at a guessable URL — source
    // disclosure with zero Sentry benefit, since nothing is uploaded yet.
    // Phase 2: with SENTRY_AUTH_TOKEN present, switch to 'hidden' and let
    // sentryVitePlugin upload + delete the maps after the bundle is written.
    sourcemap: !!process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false,
    rollupOptions: {
      output: {
        // Stable vendor chunks: third-party code stays cached across deploys
        // while per-route chunks (from React.lazy) change independently.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router-dom|scheduler)\//.test(id))
            return 'vendor-react';
          if (/node_modules\/(@tanstack\/react-query|zustand)\//.test(id)) return 'vendor-query';
          if (/node_modules\/(@dnd-kit)\//.test(id)) return 'vendor-dnd';
          if (/node_modules\/(sonner|date-fns|lucide-react)\//.test(id)) return 'vendor-ui';
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // @boardly/ui subpath aliases
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
