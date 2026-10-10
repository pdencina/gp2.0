import type { Config } from "tailwindcss";

// Sistema de diseño de Grupos Pequeños.
// Los tonos "DEFAULT" de la marca son los accesibles (texto blanco sobre ellos, y ellos como texto sobre blanco, pasan
// el contraste AA); las variantes claras (400) son para ilustraciones, barras y detalles decorativos.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: {
            DEFAULT: "#1E8082",
            50: "#EDF8F8",
            100: "#D3EFEF",
            200: "#A7DFDF",
            300: "#74C9CA",
            400: "#2BA6A8",
            500: "#23898B",
            600: "#1E8082",
            700: "#1A6A6C",
            800: "#175557",
            900: "#134446",
          },
          orange: {
            DEFAULT: "#C2501A",
            50: "#FEF4EC",
            100: "#FDE5D3",
            200: "#FBC9A7",
            300: "#F8A874",
            400: "#F08A4B",
            500: "#DB6A2B",
            600: "#C2501A",
            700: "#A24016",
            800: "#843617",
          },
          green: {
            DEFAULT: "#2E8540",
            50: "#EFF8F0",
            100: "#D9EFDC",
            200: "#B4DFBA",
            300: "#8ECC98",
            400: "#7CC27C",
            500: "#46A45A",
            600: "#2E8540",
            700: "#26703A",
            800: "#205A32",
          },
          ink: "#1F2430",
          sand: "#F7F5F1",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(31, 36, 48, 0.04), 0 1px 3px rgba(31, 36, 48, 0.05)",
        lift: "0 2px 4px rgba(31, 36, 48, 0.04), 0 8px 24px -6px rgba(31, 36, 48, 0.12)",
        pop: "0 12px 40px -8px rgba(31, 36, 48, 0.25)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
