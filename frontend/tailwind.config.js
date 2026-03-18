/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // 'class' strategy: add/remove class="dark" on <html> to toggle dark mode
  darkMode: 'class',
  theme: {
    extend: {
      // CSS-variable-driven semantic colour tokens usable as Tailwind classes
      // e.g. bg-ds-surface, text-ds-text, border-ds-border, ring-ds-primary
      colors: {
        ds: {
          primary:        'rgb(var(--ds-primary) / <alpha-value>)',
          'primary-hover':'rgb(var(--ds-primary-hover) / <alpha-value>)',
          bg:             'rgb(var(--ds-bg) / <alpha-value>)',
          surface:        'rgb(var(--ds-surface) / <alpha-value>)',
          'surface-hover':'rgb(var(--ds-surface-hover) / <alpha-value>)',
          border:         'rgb(var(--ds-border) / <alpha-value>)',
          text:           'rgb(var(--ds-text) / <alpha-value>)',
          'text-muted':   'rgb(var(--ds-text-muted) / <alpha-value>)',
          'text-inverse': 'rgb(var(--ds-text-inverse) / <alpha-value>)',
          accent:         'rgb(var(--ds-accent) / <alpha-value>)',
          'sidebar-bg':   'rgb(var(--ds-sidebar-bg) / <alpha-value>)',
          'sidebar-active':'rgb(var(--ds-sidebar-active) / <alpha-value>)',
          'sidebar-hover':'rgb(var(--ds-sidebar-hover) / <alpha-value>)',
          'sidebar-text': 'rgb(var(--ds-sidebar-text) / <alpha-value>)',
        },
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        rag: {
          red:   '#ef4444',
          amber: '#f59e0b',
          green: '#22c55e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      transitionDuration: {
        theme: '200ms',
      },
    },
  },
  plugins: [],
};
