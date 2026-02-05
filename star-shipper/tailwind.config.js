/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Space theme colors
        space: {
          900: '#050a14',
          800: '#0a1225',
          700: '#0f1a30',
          600: '#1a2540',
          500: '#253050',
        },
        // UI accent colors
        cyber: {
          cyan: '#00d4ff',
          blue: '#0080ff',
          purple: '#8040ff',
          pink: '#ff40ff',
        },
        // Room type colors
        room: {
          cockpit: '#3b82f6',
          crew: '#22c55e',
          cargo: '#eab308',
          engine: '#f97316',
          reactor: '#06b6d4',
          weapons: '#ef4444',
          shields: '#8b5cf6',
          medbay: '#ec4899',
          mining: '#a855f7',
          hangar: '#64748b',
          research: '#14b8a6',
          sensors: '#38bdf8',
        },
      },
      fontFamily: {
        display: ['Rajdhani', 'Exo 2', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px currentColor, 0 0 10px currentColor' },
          '100%': { boxShadow: '0 0 10px currentColor, 0 0 20px currentColor' },
        },
      },
    },
  },
  plugins: [],
};
