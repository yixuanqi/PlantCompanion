# 桌面小植物 v0.4 · 从这里开始

## 最快看到修复效果

1. 打开 `browser_preview/visual_lab.html`，可直接双击，无需 Node/Rust。
2. 切换薄荷 / 蘑菇、6 种状态、明暗背景，观察叶冠/菌盖局部动画与固定花盆。
3. 在 `browser_preview/` 双击 `Windows_打开预览.bat`，运行带种子铺与状态的交互模拟。

## 开发 Windows 本机版

安装 Rust stable、Node.js、MSVC C++ Build Tools、WebView2 Runtime；执行：

```powershell
npm install
node --test tests/*.test.mjs
npm run tauri dev
```

注意：本交付环境没有 Rust/Cargo，不能声明已通过本机编译或 Windows DWM 透明窗验收。

## 本轮真实修复

- Tauri 窗体与 HTML 画布均为 300×336，避免窗口小于内容裁切；
- `src/widget-v04.css` 只让叶冠/菌盖与菌柄轻摆，花盆完全不动；
- `public/plant-assets/*/motion_layers/*` 是 36 张真实透明图层；
- 对话气泡与右键菜单固定在边界内，Chromium 离屏测得无裁切；
- `qa_previews/` 可查看明暗桌面截图、局部运动 GIF。

## 尚需真实开发的部分

- 高分辨率可编辑手绘原画（目前仍为概念稿的工程切层）；
- Windows 原生透明、鼠标穿透、DPI、多屏及 Rust/Cargo 运行验证。

参见 `docs/15_v0.4_视觉修复记录与风险.md`。
