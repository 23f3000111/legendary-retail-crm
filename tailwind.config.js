/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Command deck ─────────────────────────────────────────────────
        // A cool, luminous light surface. Panels float on it as glass; the
        // colour is spent on the data, not on the chrome.
        canvas: '#EEF2FA',
        'canvas-deep': '#E3E9F6',
        surface: '#FFFFFF',
        'surface-2': '#F7F9FD',
        sunken: '#EDF1F9',
        line: '#DDE4F2',
        'line-strong': '#C6D1E8',

        // ── Ink ──────────────────────────────────────────────────────────
        ink: '#0F1B33',
        'ink-2': '#4A5B7A',
        'ink-3': '#8494B2',
        'ink-inv': '#FFFFFF',

        // ── Signal accents (UI chrome, not chart series) ─────────────────
        primary: '#4F46E5',
        'primary-bright': '#6366F1',
        'primary-deep': '#3730A3',
        electric: '#22D3EE',

        // ── Categorical series ───────────────────────────────────────────
        // Validated as an ordered set on a white surface:
        // adjacent CVD ΔE 21.0 · normal-vision ΔE 33.0 · all ≥ 3:1 contrast.
        s1: '#0369A1', // deep cyan
        s2: '#EA580C', // orange
        s3: '#2563EB', // blue
        s4: '#E11D48', // rose
        s5: '#5B21B6', // violet
        s6: '#059669', // emerald
        other: '#94A3B8',

        // ── Sequential (magnitude) — single hue, validated monotone ───────
        'seq-1': '#8E9CF7',
        'seq-2': '#6C77E8',
        'seq-3': '#4F52D0',
        'seq-4': '#3A38A8',
        'seq-5': '#272470',

        // ── Status — reserved, always shipped with an icon and a word ─────
        good: '#059669',
        warn: '#B45309',
        serious: '#C2410C',
        critical: '#BE123C',
      },
      fontFamily: {
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        luxe: '0.24em',
        wide2: '0.12em',
      },
      backgroundImage: {
        // The four tile gradients, in the order the KPI row uses them.
        'grad-violet': 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 55%, #A78BFA 100%)',
        'grad-blue': 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 55%, #60A5FA 100%)',
        'grad-cyan': 'linear-gradient(135deg, #0E7490 0%, #06B6D4 55%, #22D3EE 100%)',
        'grad-teal': 'linear-gradient(135deg, #047857 0%, #10B981 55%, #34D399 100%)',
        'grad-command': 'linear-gradient(100deg, #3730A3 0%, #4F46E5 42%, #7C3AED 100%)',
        'grad-rail': 'linear-gradient(180deg, #FFFFFF 0%, #F7F9FD 100%)',
      },
      boxShadow: {
        // Glass floats a little above the deck and catches light on its top edge.
        glass:
          'inset 0 1px 0 0 rgba(255,255,255,0.9), 0 1px 2px 0 rgba(15,27,51,0.05), 0 10px 30px -14px rgba(15,27,51,0.18)',
        lift: '0 18px 46px -18px rgba(15,27,51,0.32), inset 0 1px 0 0 rgba(255,255,255,0.9)',
        tile: '0 10px 26px -12px rgba(15,27,51,0.42)',
        glow: '0 0 0 1px rgba(79,70,229,0.16), 0 8px 26px -10px rgba(79,70,229,0.42)',
      },
      transitionTimingFunction: {
        luxe: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        sweep: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '70%,100%': { transform: 'scale(2.1)', opacity: '0' },
        },
      },
      animation: {
        // A slow light sweep across the command bar — the one ambient effect.
        sweep: 'sweep 7s cubic-bezier(0.4,0,0.2,1) infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
}
