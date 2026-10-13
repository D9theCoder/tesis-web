import type { Config } from "tailwindcss";

const color = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: {
      canvas: color("canvas"), surface: color("surface"), ink: color("text"), muted: color("muted"), accent: color("accent"),
      graphite: {
        950: color("canvas"), 900: color("surface-subtle"), 850: color("surface"), 800: color("surface-subtle"),
        750: color("surface-hover"), 700: color("border"), 600: color("border-strong"), 500: color("muted"),
        400: color("secondary"), 300: color("secondary"), 200: color("text"), 100: color("text"),
      },
      ember: { 500: color("warning"), 400: color("warning"), 300: color("warning") },
      signal: { 500: color("accent"), 400: color("accent"), 300: color("accent") },
      confirm: { 500: color("success"), 400: color("success") },
      danger: { 500: color("danger"), 400: color("danger") },
      violet: { 500: color("review"), 400: color("review"), 300: color("review") },
      panel: color("surface"),
    },
    fontFamily: { display: ["var(--font-sans)"], body: ["var(--font-sans)"], mono: ["var(--font-mono)"] },
  } },
  plugins: [],
};
export default config;
