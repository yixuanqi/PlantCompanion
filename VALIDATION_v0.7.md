# v0.7 验证记录

## 本次执行（环境：Linux / Chromium 预览；无 Rust 工具链）

- `node scripts/build_preview.mjs`：完成。
- `npx tsc --noEmit -p tsconfig.static.json`：通过（Tauri API 由静态替身声明覆盖，不能代替真实 npm 包构建）。
- `npm run test:static`：29/29 通过（原有 22 条 + 交互新增 7 条）。
- 使用 headless Chromium + inline browser-preview 脚本执行鼠标事件：在植物上滚轮从 1.00 降到 0.95；Ctrl + 滚轮把透明度从 1.00 降到 0.95；拖动不增加饮水次数；短点击增加一次饮水次数。测试中的 `crypto.randomUUID` 使用 polyfill，因为 about:blank 测试环境不具备安全上下文。
- `cargo test`、`cargo check` 和 Windows Tauri 运行：**未执行**（当前环境无 cargo/rustc）。

## Windows 验收项（未通过前不可宣称发布）

1. 鼠标左键按住植物移动 7px 后应通过 Tauri `startDragging()` 启动原生拖动；松开不得计入喝水。
2. 移动到其他显示器，再退出和重启，位置应保留；显示器拔除后窗口应能回到可见区域。
3. 滚轮最多可缩至 50%，恢复到 100% 后画面应与 v0.6 一致；原生窗口本身尺寸应同步改变。
4. Ctrl+滚轮仅改变植物素材透明度，不触发网页缩放或全局快捷键；空白区域不会改变外观。
5. 50% 时右键原生菜单可完整显示；100% 时手绘菜单不超出窗口。
6. 100%/125%/150% Windows DPI 与双屏不同 DPI 下无裁切/点击错位。
7. 应用重启恢复位置、缩放和透明度；生命 SQLite 存档不被修改。
