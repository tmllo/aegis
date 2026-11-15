/** @type {import('tailwindcss').Config} */
// Colours, fonts and radii all point at CSS variables. The app's values are the
// Flight Record tokens in src/styles/flight.css; src/styles/tokens.css holds the
// neutral defaults the archived concepts start from.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        // Flight Record names: ink = the background, used as text on paper fills.
        ink: 'rgb(var(--bg) / <alpha-value>)',
        paper: 'rgb(var(--text) / <alpha-value>)',
        mark: 'rgb(var(--neutral-mark) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        dim: 'rgb(var(--text-dim) / <alpha-value>)',
        faint: 'rgb(var(--text-faint) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        crit: 'rgb(var(--crit) / <alpha-value>)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
        display: 'var(--font-display)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      // Type scale: nothing under 14 px; labels and values that matter at 22 px and up.
      fontSize: {
        micro: ['14px', '20px'],
        body: ['16px', '24px'],
        lead: ['18px', '26px'],
        value: ['22px', '28px'],
        title: ['32px', '36px'],
        display: ['44px', '44px'],
        numeral: ['72px', '72px'],
      },
      spacing: { gut: 'var(--gut)', touch: 'var(--touch)', 'touch-lg': 'var(--touch-lg)', 'touch-xl': 'var(--touch-xl)' },
      minHeight: { touch: 'var(--touch)', 'touch-lg': 'var(--touch-lg)', 'touch-xl': 'var(--touch-xl)' },
      minWidth: { touch: 'var(--touch)', 'touch-lg': 'var(--touch-lg)', 'touch-xl': 'var(--touch-xl)' },
    },
  },
  plugins: [],
};
