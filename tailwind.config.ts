import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // rgb(255 117 26)
        primary: "#FF751A",
        secondary: "#0B77B5",
      },
    },
  },
  plugins: [],
} satisfies Config;
