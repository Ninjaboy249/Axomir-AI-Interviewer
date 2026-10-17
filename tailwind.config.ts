import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172026",
        paper: "#f7f5ef",
        moss: "#6b7f3f",
        teal: "#2f7774",
        ember: "#b85c38"
      },
      boxShadow: {
        soft: "0 18px 45px rgba(23, 32, 38, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
