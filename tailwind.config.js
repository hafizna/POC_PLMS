/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        zone1: {
          DEFAULT: "#dc2626",
          fill: "rgba(220, 38, 38, 0.4)",
          ring: "rgba(220, 38, 38, 0.6)",
        },
        zone2: {
          DEFAULT: "#ea580c",
          fill: "rgba(234, 88, 12, 0.35)",
          ring: "rgba(234, 88, 12, 0.55)",
        },
        zone3: {
          DEFAULT: "#d97706",
          fill: "rgba(217, 119, 6, 0.3)",
          ring: "rgba(217, 119, 6, 0.5)",
        },
      },
    },
  },
  plugins: [],
};
