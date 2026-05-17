import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        lekton: ["var(--font-lekton)", "monospace"],
      },
      colors: {
        forest: {
          DEFAULT: "#0d3d2e",
          light: "#1a5c47",
          muted: "#3d6b5c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
