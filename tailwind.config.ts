import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#036a71",
          50:  "#e6f4f5",
          100: "#b3dfe2",
          200: "#80cacf",
          300: "#4db5bc",
          400: "#1aa0a9",
          500: "#036a71",
          600: "#025d63",
          700: "#025055",
          800: "#014347",
          900: "#013639",
        },
        gold: {
          DEFAULT: "#c9a84c",
          light:   "#e2c97e",
          dark:    "#a07c2e",
        },
        surface: {
          DEFAULT: "#0f1117",
          card:    "#161b22",
          border:  "#21262d",
          hover:   "#1c2128",
        },
      },
      fontFamily: {
        sans: ["Cairo", "Tajawal", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
