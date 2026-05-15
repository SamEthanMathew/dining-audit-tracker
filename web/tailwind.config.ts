import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cmu: {
          DEFAULT: "#c41230",
          dark: "#8c0d23",
        },
        platinum: "#94a3b8",
        gold: "#facc15",
        silver: "#cbd5e1",
        bronze: "#b45309",
      },
    },
  },
  plugins: [],
} satisfies Config;
