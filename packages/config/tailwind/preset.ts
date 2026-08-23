import type { Config } from 'tailwindcss';

/**
 * Boardly Tailwind CSS preset.
 *
 * All color tokens use CSS custom properties so that Company Admin white-label
 * theming can override brand colors at runtime by injecting CSS vars on <html>
 * without a CSS rebuild. See DESIGN_TOKENS.md for the full token specification.
 *
 * Usage in app tailwind.config.ts:
 *   import preset from '@boardly/config/tailwind';
 *   export default { presets: [preset], content: ['./src/**\/*.{ts,tsx}'] };
 */
const preset: Config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand — overridable via CSS vars for white-label theming
        brand: {
          50: 'var(--color-brand-50, #eef2ff)',
          100: 'var(--color-brand-100, #e0e7ff)',
          200: 'var(--color-brand-200, #c7d2fe)',
          300: 'var(--color-brand-300, #a5b4fc)',
          400: 'var(--color-brand-400, #818cf8)',
          500: 'var(--color-brand-500, #6366f1)',
          600: 'var(--color-brand-600, #4f46e5)',
          700: 'var(--color-brand-700, #4338ca)',
          800: 'var(--color-brand-800, #3730a3)',
          900: 'var(--color-brand-900, #312e81)',
          950: 'var(--color-brand-950, #1e1b4b)',
        },

        // Semantic status colors
        success: {
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
        },
        info: {
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
        },

        // Stage categories (mapped from stages.category in DB)
        stage: {
          'not-started': '#94a3b8',
          'in-progress': '#6366f1',
          blocked: '#f59e0b',
          done: '#22c55e',
        },

        // Surface / background tokens (light → dark via CSS vars)
        surface: {
          base: 'var(--surface-base, #ffffff)',
          raised: 'var(--surface-raised, #f8fafc)',
          overlay: 'var(--surface-overlay, #f1f5f9)',
          border: 'var(--surface-border, #e2e8f0)',
          hover: 'var(--surface-hover, #f1f5f9)',
        },

        // Text tokens
        text: {
          primary: 'var(--text-primary, #0f172a)',
          secondary: 'var(--text-secondary, #475569)',
          disabled: 'var(--text-disabled, #94a3b8)',
          inverse: 'var(--text-inverse, #ffffff)',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },

      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        full: '9999px',
      },

      boxShadow: {
        xs: '0 1px 2px rgba(0,0,0,0.05)',
        sm: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
        md: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)',
        lg: '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)',
        xl: '0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)',
        brand: '0 0 0 3px rgba(99,102,241,0.4)',
      },

      transitionDuration: {
        fast: '100ms',
        base: '150ms',
        slow: '200ms',
        modal: '300ms',
      },

      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      zIndex: {
        base: '0',
        raised: '10',
        dropdown: '100',
        sticky: '200',
        overlay: '300',
        modal: '400',
        toast: '500',
      },

      // Kanban board specific
      width: {
        'kanban-col': '280px',
        sidebar: '240px',
        'sidebar-collapsed': '64px',
      },

      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'slide-down': 'slideDown 200ms ease-out',
        'scale-in': 'scaleIn 150ms ease-out',
        shimmer: 'shimmer 1.5s infinite',
      },

      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default preset;
