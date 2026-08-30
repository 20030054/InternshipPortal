import type { Config } from "tailwindcss";

// Palette from MASTER_PROMPT.md §10. Colors are read from CSS custom
// properties (defined in src/app/globals.css) rather than hard-coded here,
// so the palette has exactly one source of truth. Use gold sparingly — the
// master prompt is explicit that if more than one thing on a screen is
// gold, nothing is.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        deep: "var(--color-deep)", // primary, dominant, headers and primary actions
        mid: "var(--color-mid)", // secondary, progress indicators
        gold: "var(--color-gold)", // accent only: current step, required actions, waiver flags
        ink: "var(--color-ink)", // body text
        muted: "var(--color-muted)", // secondary text
        tint: "var(--color-tint)", // surface tint, table striping
        danger: "var(--color-danger)", // denials, overdue
        ok: "var(--color-ok)", // verified, passed
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-source-serif)", "Cambria", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
