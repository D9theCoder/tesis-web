import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Graphite observability canvas.
        graphite: {
          950: "#07090a",
          900: "#0a0d0f",
          850: "#0d1114",
          800: "#11161a",
          750: "#151b20",
          700: "#1b232a",
          600: "#263039",
          500: "#3a4750",
        },
        // Warm amber for active traversal.
        ember: {
          500: "#f59e0b",
          400: "#fbbf24",
          300: "#fcd34d",
        },
        // Cyan for model activity.
        signal: {
          500: "#06b6d4",
          400: "#22d3ee",
          300: "#67e8f9",
        },
        // Lime for confirmed findings.
        confirm: {
          500: "#84cc16",
          400: "#a3e635",
        },
        // Red for failures / containment.
        danger: {
          500: "#ef4444",
          400: "#f87171",
        },
        panel: "rgba(13,17,20,0.72)",
      },
      fontFamily: {
        display: ["\"Saira Condensed\"", "\"DIN Condensed\"", "\"Arial Narrow\"", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["\"IBM Plex Mono\"", "\"Cascadia Mono\"", "\"SFMono-Regular\"", "Menlo", "Consolas", "monospace"],
        body: ["\"IBM Plex Sans\"", "Aptos", "\"Segoe UI\"", "sans-serif"],
      },
      boxShadow: {
        glowamber: "0 0 18px 0 rgba(245,158,11,0.28)",
        glowsignal: "0 0 18px 0 rgba(34,211,238,0.25)",
        glowconfirm: "0 0 18px 0 rgba(163,230,53,0.25)",
      },
      animation: {
        scan: "scan 9s linear infinite",
        pulse: "pulse 2.4s ease-in-out infinite",
        blink: "blink 1.1s steps(2, start) infinite",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(220%)" },
        },
        pulse: {
          "0%,100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
        blink: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
