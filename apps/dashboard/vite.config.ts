import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const UI_PKG = path.resolve(import.meta.dirname, '../../packages/ui/src');

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 600,
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
