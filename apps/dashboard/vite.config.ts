import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const UI_PKG = path.resolve(import.meta.dirname, '../../packages/ui/src')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // @boardly/ui subpath aliases
      '@boardly/ui/button': path.join(UI_PKG, 'components/button.tsx'),
      '@boardly/ui/card': path.join(UI_PKG, 'components/card.tsx'),
      '@boardly/ui/confirm-dialog': path.join(UI_PKG, 'components/confirm-dialog.tsx'),
      '@boardly/ui/dialog': path.join(UI_PKG, 'components/dialog.tsx'),
      '@boardly/ui/dropdown-menu': path.join(UI_PKG, 'components/dropdown-menu.tsx'),
      '@boardly/ui/enterprise-data-grid': path.join(UI_PKG, 'components/enterprise-data-grid.tsx'),
      '@boardly/ui/input': path.join(UI_PKG, 'components/input.tsx'),
      '@boardly/ui/label': path.join(UI_PKG, 'components/label.tsx'),
      '@boardly/ui/avatar': path.join(UI_PKG, 'components/avatar.tsx'),
      '@boardly/ui/searchable-select': path.join(UI_PKG, 'components/searchable-select.tsx'),
      '@boardly/ui/sidebar': path.join(UI_PKG, 'components/sidebar.tsx'),
      '@boardly/ui/switch': path.join(UI_PKG, 'components/switch.tsx'),
      '@boardly/ui/utils': path.join(UI_PKG, 'utils.ts'),
      '@boardly/ui': path.join(UI_PKG, 'index.ts'),
    },
  },
})
