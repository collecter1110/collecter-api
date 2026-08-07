import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 앱 포인트 컬러(민트) — 카테고리 도트, SELECTION 바, 키워드 칩에 쓴다.
        brand: {
          DEFAULT: "#37D39B",
          50: "#EDFBF5",
          200: "#B4E9D3",
          600: "#1F9B72",
        },
      },
    },
  },
  plugins: [],
};

export default config;
