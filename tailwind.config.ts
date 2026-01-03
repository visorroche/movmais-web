import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#23C26B",
        secondary: "#0B77B5",
      },
    },
  },
  plugins: [],
} satisfies Config;
