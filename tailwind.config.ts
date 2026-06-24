import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1c1b1f",
        paper: "#faf9f7",
        accent: "#4f46e5",
      },
    },
  },
  plugins: [],
};
export default config;
