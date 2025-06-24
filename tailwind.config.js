/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{html,js}"],// 扫描渲染进程的 HTML/JS 文件
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")]
}
