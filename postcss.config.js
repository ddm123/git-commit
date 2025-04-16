module.exports = {
  plugins: {
    'postcss-import': {},  // 处理 @import
    'tailwindcss': {
      config: './tailwind.config.js' // 指定 Tailwind CSS 配置文件
    },
    'autoprefixer': {}     // 自动添加浏览器前缀
  }
}