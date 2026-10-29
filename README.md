> **最新 v0.7：** 先看 `README_START_HERE.md`；唯一新蘑菇资源，永久移除旧图与常驻底部操作条。



# 桌面小植物 · 可开发工程 v0.3

Windows 右下角的无五官清新手绘植物：**小薄荷 + 小蘑菇**。喝水提醒、成长与不可逆枯死，睡眠/锁屏/夜间保护、种子铺、图鉴和纪念花园。本地运行，不要求账号或 AI API。

## 已确定且不会改变的规则

- 每株植物独立且死后不可复活；**枯死后保持枯死，只有用户主动选择才会种下一株**。不强制次日重种。
- 睡眠时冻结有效活动时间、成长和死亡；醒来仍是原有生命阶段。睡着时点击第一次只能唤醒，不可同时记喝水。
- 植物没有眼睛和嘴，但仍有 Idle、枯萎、喝水恢复、入睡、醒来动画和拟人手绘对话气泡。
- v0.3 仅两种植物；商店隐藏款预留扩展接口，不伪造后续资源。

## 技术实现

- `crates/life-core`: 纯 Rust 生命周期状态机（29 项 Rust 测试）。不依赖墙上时间进行死亡判定；空闲时间先暂存，证实用户未离开后才记入活跃时间。
- `crates/plant-store`: SQLite 原子事务保存 Game + 钱包变更 + 纪念记录 + 关键事件（4 项 Rust 测试），支持 v0.2 JSON 首次迁移，不删除旧档。
- `src-tauri`: 透明置顶植物窗、托盘菜单、自动空闲保护、Windows 活动桌面锁定检测（轮询）、30 秒 checkpoint、原生业务命令。
- `src`: TypeScript 组件；UI 只通过 Tauri 命令更改业务数据。种子铺、图鉴、纪念、时间设置和手绘气泡。
- `public/plant-assets`: 两株各六个生命/睡眠透明 PNG；薄荷保留动画序列，蘑菇改为原生四图层程序动画。**两套都是技术素材，未达到逐叶片精修的商业美术标准。**
- `browser_preview`: 独立本地 Web 模拟，**不代表原生 Rust 引擎**。

## Windows 开工与验证

需要 Windows 10/11、Rust stable、Node 22、MSVC C++ Build Tools、WebView2，以及首次安装依赖时可联网。

```powershell
npm install
node scripts/build_preview.mjs
npm run test:static
cargo test -p plant-life-core -p plant-store -- --nocapture
npm run build
npm run tauri dev
```

也可以双击 `scripts/Windows_完整验证.bat`，一次运行本地测试和 Windows 安装包构建。安装包通常位于 `target/release/bundle/nsis`。仓库包含 `.github/workflows/windows-ci.yml` 可在 GitHub Actions Windows runner 编译并上传安装包。

浏览器预览：

```powershell
cd browser_preview
python -m http.server 8060
# 浏览器访问 http://127.0.0.1:8060/settings.html
```

## v0.3 已测结果与限制

在本次生成环境中，**Node 模拟/静态检查 13/13 PASS，TypeScript 的项目静态替身类型检查 PASS**。本环境无 `cargo`/`rustc`，无法联网安装，也没有 Windows GUI，因此 **Rust 33 项测试未运行、正式 Tauri 编译与真机运行未验证，不能声称 Windows 成品完成**。

剩余正式发布门禁：Windows 实际 Rust/Cargo 测试与 Tauri 构建，WTS 系统会话锁屏/挂起事件精确监听（当前使用轮询+超时保守保护），多屏/DPI/透明区域鼠标穿透，长期性能与断电恢复实测，真分层美术资源（技术抠图仍存在边缘瑕疵）。详见 `VALIDATION.md`。

