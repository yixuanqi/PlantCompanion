# v0.5 交付验证说明

## 输入 / 修改范围
- 输入：用户上传的 `PlantCompanion_v0.3.rar`（其 `package.json` 版本号为 0.4.0）。
- 新建的集成工程：**独立副本**，未修改用户上传 RAR。
- 只修改 UI 资源渲染、`widget-v04.css`、窗口物理尺寸定位、离线预览构建脚本、测试和文档。不修改 Rust 生命状态机或 SQLite 存档结构。

## 已执行
- `node scripts/build_preview.mjs`：完成，预览 CSS 路径已修复。
- `node --test tests/*.test.mjs`：**21 / 21 通过**。
- `tsc -p tsconfig.static.json`：通过（使用 stub Tauri 声明）。
- 新版健康与睡眠图层：每态四张 694×736 RGBA；与各自 composite 的合成结果逐像素一致；四角 alpha=0；两态花盆 PNG 一致。
- Tauri capability `default` 保留，`shadow:false` 保留；窗口与 CSS 对齐为 320×390；原生吸附使用 `win.outer_size()`。

## 未能执行，不能声称完成
- Rust/Cargo 测试：执行环境无 cargo/rustc。
- Windows WebView2/Tauri 独立透明窗口、鼠标穿透、DPI/多屏、睡眠事件实机回归：环境不是 Windows。
- `npm run build` 的真实生产依赖：需要在用户 Windows 工程中 `npm install` 后运行。
- 新版原画美术最终验收：仅新健康/睡眠状态，仍为矢量绘本试制风格，不是最终水彩质感。

## Windows 验收步骤
1. 解压整个 v0.5 集成版为新目录，避免覆盖现有开发工程或存档。
2. `npm install`、`npm run test:static`、`npm run tauri dev`。
3. 当前是小蘑菇时，右下角 `⋯` → 「🎨 预览新版小蘑菇」，来回切换；休眠后确认睡眠态使用 v2，严重缺水、濒死及死亡仍采用旧版。
4. 确认不出现矩形白框、花盆裁切、文本越界、图层重影；在 100%、125%、150% DPI 下检查。
5. `browser_preview/visual_compare_v05.html` 可独立比较新版与旧版外观，但不能替代 Windows 原生验收。
