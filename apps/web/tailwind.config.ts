import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../node_modules/streamdown/dist/index.js",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        brand: {
          50: "#eef8ff",
          100: "#d8efff",
          500: "#2684ff",
          600: "#1267d6",
          900: "#123057",
        },
        mint: "#15b79e",
        amber: "#f79009",
      },
      boxShadow: {
        panel: "0 18px 60px rgba(16, 24, 40, 0.08)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out both",
        "fade-up": "fadeUp 0.45s ease-out both",
        "fade-down": "fadeDown 0.35s ease-out both",
        "scale-in": "scaleIn 0.3s ease-out both",
        "slide-left": "slideLeft 0.35s ease-out both",
        "slide-right": "slideRight 0.35s ease-out both",
        shimmer: "shimmer 2s infinite",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "bounce-subtle": "bounceSubtle 0.5s ease-out both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideLeft: {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideRight: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        bounceSubtle: {
          "0%": { transform: "scale(0.94)" },
          "50%": { transform: "scale(1.03)" },
          "100%": { transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
