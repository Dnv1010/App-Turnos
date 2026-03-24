import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
        bia: {
          navy: {
            900: "#0B1120",
            800: "#0F1629",
            750: "#162035",
            700: "#1A2340",
            600: "#1E2A45",
            500: "#243052",
            400: "#2A3555",
            300: "#3A4565",
          },
          teal: {
            DEFAULT: "#00D4AA",
            light: "#00F0C0",
            dark: "#00B892",
            10: "rgba(0, 212, 170, 0.1)",
            20: "rgba(0, 212, 170, 0.2)",
          },
          ink: "#0F1629",
          muted: "#A0AEC0",
          label: "#CBD5E1",
          placeholder: "#64748B",
        },
      },
    },
  },
  plugins: [],
};

export default config;
