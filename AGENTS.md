# Plant Companion v0.7 · Agent 执行入口

优先阅读 `README_START_HERE.md`、`docs/17_单一资源与极简交互规范.md`、`docs/02_生命周期与睡眠状态机.md`。

- 唯一可用蘑菇资源：`public/plant-assets/mushroom/`，其可编辑 SVG 母版位于 `assets/species/mushroom/source/`。禁止恢复旧版和重新制作从 256px 概念图切出的蘑菇 PNG。
- 首发只有 mint 与 mushroom。小蘑菇六阶段与睡眠统一采用四图层 `pot / stalk / cap / foliage`，小薄荷仍采用三图层 `pot / stem / crown`。
- 桌面挂件基准透明窗口 **268×292**；滚轮缩放到 50%–100% 时必须同步缩放真实 Tauri 窗口与前端画布。不再出现常驻状态条、拖动圆按钮或三点圆按钮。鼠标悬停植物查看状态，左键确认喝水，右键菜单操作，左键按住移动至少 7px 拖动；滚轮缩放，Ctrl+滚轮调植物透明度（仅命中实际可见植物像素）；系统托盘保留设置/睡眠/唤醒。
- Rust `life-core` 是生命周期唯一真源。死亡不可逆、不自动重种；睡眠仅冻结时间，唤醒不重置饮水周期。
- 任何状态不得回退使用旧蘑菇资源或把旧 `mushroom_v2` 再次添加。新增蘑菇状态现为同一 SVG 母版的算法过渡图，尚未达到最终手绘美术要求。
- 先运行 `node scripts/build_preview.mjs && npm run test:static && tsc --noEmit -p tsconfig.static.json`，再在真正的 Windows 环境运行 `cargo test -p plant-life-core -p plant-store` 和 `npm run tauri dev`。本环境未验证 Windows 原生 GUI。
- 禁止为了修视觉改动 SQLite、商店、种植或死亡规则。
