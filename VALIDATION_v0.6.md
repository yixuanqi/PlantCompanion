# v0.6 验证记录

- Node 全部回归：22/22 PASS（包括单一路径、新版蘑菇六态、花盆同图、旧切换入口删除、无底栏和睡眠/死亡模拟）。
- TypeScript：`tsc --noEmit -p tsconfig.static.json` PASS（替身类型检查，并非 Tauri 实际打包）。
- 生成浏览器模拟：`node scripts/build_preview.mjs` PASS；浏览器预览的 src/styles、widget CSS 与图片复制已检查。
- 离线 Chromium `page.set_content` 实际渲染检查：268×292 布局，植物 bbox (13,47,242,242)，底部条 DOM = null；另验证右键菜单可在窗口内绘制。截图 `qa_widget_mushroom.png`、`qa_widget_menu.png`；此检查没有启动真实 Rust 生命周期引擎。
- 六态透明 PNG contact sheet：`mushroom_states_qa.jpg`；Healthy/Sleep 真 SVG 层，其余过渡派生状态仍需美术质量验收。
- 未完成：Rust/Cargo 测试（此环境没有 Rust 工具链）、Windows 原生 Tauri 构建、WebView2/DWM/DPI/系统托盘和整机长期运行验证。
