/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Navy and gold reference CSS variables so dark/light themes
        // update every derived utility (bg, text, border, from, to, ring…)
        // without any !important overrides. Variables hold space-separated
        // RGB channel values so Tailwind's opacity modifier /N still works.
        navy: {
          50:  'rgb(var(--navy-50)  / <alpha-value>)',
          100: 'rgb(var(--navy-100) / <alpha-value>)',
          200: 'rgb(var(--navy-200) / <alpha-value>)',
          300: 'rgb(var(--navy-300) / <alpha-value>)',
          400: 'rgb(var(--navy-400) / <alpha-value>)',
          500: 'rgb(var(--navy-500) / <alpha-value>)',
          600: 'rgb(var(--navy-600) / <alpha-value>)',
          700: 'rgb(var(--navy-700) / <alpha-value>)',
          800: 'rgb(var(--navy-800) / <alpha-value>)',
          900: 'rgb(var(--navy-900) / <alpha-value>)',
          950: 'rgb(var(--navy-950) / <alpha-value>)',
        },
        gold: {
          300: 'rgb(var(--gold-300) / <alpha-value>)',
          400: 'rgb(var(--gold-400) / <alpha-value>)',
          500: 'rgb(var(--gold-500) / <alpha-value>)',
          600: 'rgb(var(--gold-600) / <alpha-value>)',
        },
        // Semantic status colors — static, same in both themes
        success: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        info: {
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
        },
        cat: {
          1: 'rgb(var(--cat-1) / <alpha-value>)',
          2: 'rgb(var(--cat-2) / <alpha-value>)',
          3: 'rgb(var(--cat-3) / <alpha-value>)',
          4: 'rgb(var(--cat-4) / <alpha-value>)',
          5: 'rgb(var(--cat-5) / <alpha-value>)',
          6: 'rgb(var(--cat-6) / <alpha-value>)',
          7: 'rgb(var(--cat-7) / <alpha-value>)',
          8: 'rgb(var(--cat-8) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // The type scale has a FLOOR: 11 px. text-2xs replaces every text-[9px],
      // text-[10px] and text-[10.5px] the review found (121 in source, 10 px
      // rendered on every page). Below 11 px a label stops being readable at
      // arm's length on a laptop, which is where directors read this tool.
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
      },
      // Categorical palette (see index.css --cat-*): bg-cat-3, text-cat-3/80 …
      // Property-scoped replacement for transition-all: everything a hover or
      // press legitimately changes, and nothing that triggers layout.
      transitionProperty: {
        ui: 'color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, outline-color',
      },
      // DEFAULT here means every `transition-colors` / `transition-ui` in the
      // product runs on the house curve at the micro duration unless a call
      // site says otherwise — one motion vocabulary without touching 500 files.
      transitionTimingFunction: {
        DEFAULT: 'var(--ease-out)',
        house: 'var(--ease-out)',
        move:  'var(--ease-move)',
      },
      transitionDuration: {
        DEFAULT: 'var(--dur-micro)',
        micro: 'var(--dur-micro)',
        enter: 'var(--dur-enter)',
        draw:  'var(--dur-draw)',
      },
      zIndex: {
        nav: 'var(--z-nav)',
        fab: 'var(--z-fab)',
        popover: 'var(--z-popover)',
        modal: 'var(--z-modal)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-gradient':   'var(--gradient-hero)',
      },
      boxShadow: {
        'card':      'var(--shadow-card)',
        'card-lg':   'var(--shadow-card-lg)',
        'modal':     'var(--shadow-modal)',
        'popover':   'var(--shadow-popover)',
        'glow-gold': '0 0 20px rgb(var(--gold-500) / 0.25)',
      },
      animation: {
        'float':      'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':    'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
