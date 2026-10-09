import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#F08A4B",
          green: "#7CC27C",
          teal: "#2BA6A8",
          ink: "#2B2B2B",
          sand: "#F6F3EE",
        },
      },
    },
  },
  plugins: [],
};

export default config;
