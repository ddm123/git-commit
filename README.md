# 编译CSS
``` bash
npm run build:css
```

# 预览效果
``` bash
npm run start
```
## 或者
``` bash
npm run start -- --disable-gpu
```

# 其它命令
1. 安装electron模块
 ``` bash
 ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install electron --save-dev --verbose
 ```
 2. 安装指定版模块
``` bash
 npm install tailwindcss@3.4.1 --save-dev
```

 # 打包
``` bash
npm install --save-dev electron-builder
npx electron-builder -mwl #build for macOS, Windows and Linux
# 打包指定平台
# npx electron-builder --linux
# npx electron-builder --mac
# npx electron-builder --win --x64
# npx electron-builder --win --ia32
# npx electron-builder --win --arm64
```

# 测试运行
``` bash
./out/git-commit-1.0.0.AppImage --no-sandbox  --disable-gpu
```

