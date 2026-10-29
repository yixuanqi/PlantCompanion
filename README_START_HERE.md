# 桌面小植物 v0.7 · 鼠标拖动 / 缩放 / 透明度

本版基于 v0.6 极简挂件工程开发，不更改小蘑菇/小薄荷资产、生命状态机、SQLite 数据结构或种植规则。

## 操作

| 指针操作 | 结果 |
|---|---|
| 植物可见部分左键点击 | 确认喝水（如果睡眠则先唤醒） |
| 植物可见部分左键按住并移动 ≥7px | 拖动整个 Tauri 窗口；不计为喝水 |
| 指针在植物可见部分滚轮 | 缩放：50%–100%，启动默认 100% |
| 指针在植物可见部分 Ctrl+滚轮 | 植物透明度：25%–100%，启动默认 100% |
| 植物右键 | 正常尺寸显示手绘操作菜单；较小尺寸使用原生 Windows 菜单避免内容截断 |
| 指针在空白/窗口之外 | 不触发上述滚轮、拖动和右键操作 |

- 只监听挂件 `#plant-zone` 内的鼠标/指针事件，并按静态状态 PNG 的 Alpha 蒙版做细粒度命中判断；**没有全局快捷键注册**。
- 拖动和缩放改变真实 Tauri 窗口的位置和尺寸，减小半透明挂件对桌面的覆盖区域。
- 窗口放大缩小固定屏幕上的右下角位置，拖动则跟随鼠标；重新启动保留上次的位置、缩放、透明度。
- 外观偏好单独保存在应用数据目录的 `widget-view-v1.json`，**不会修改** `plants-v1.sqlite3` 中的生命与商店数据。
- 新增参数 `--widget-zoom` 和 `--plant-opacity` 只属于桌面挂件页面，不影响设置窗。

## 测试

```powershell
node scripts/build_preview.mjs
npm run test:static
npx tsc --noEmit -p tsconfig.static.json
cargo test -p plant-life-core -p plant-store
npm run tauri dev
```

后两项需要本机 Rust/Windows 环境；本次交付环境未运行 Cargo 或 Windows WebView2 真机编译，所以 Windows 125%/150% DPI、原生 `startDragging()` 与新窗口尺寸的联动需真机验收。

## 本版工程安全说明

不覆盖 AppData，不更改 `capabilities/default.json` 的 `identifier: default`，不删除任何现有植物资源。增量包建议在 Git 已提交的 v0.6 基线上应用。
