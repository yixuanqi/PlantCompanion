> **v0.4 视觉修复更新**：挂件透明尺寸、局部动画与布局已修复；`browser_preview/visual_lab.html` 可直接检查，详见 `docs/15_v0.4_视觉修复记录与风险.md`。Rust/Windows 真机验收尚未完成。

# v0.3 工程验证报告 | 2026-10-28

| 验证 | 结果 | 说明 |
|---|---|---|
| Node 源码/模拟行为 | **13/13 PASS** | `npm run test:static`，含死亡后手动重种、幂等请求、跨代冷却、睡眠、两款图片格式等 |
| TypeScript 类型检查 | **PASS（替身类型）** | `tsc --noEmit -p tsconfig.static.json`；真实 @tauri-apps/api 未安装 |
| 浏览器静态预览生成 | **PASS** | `node scripts/build_preview.mjs`；无 Rust 连接，仅 UI 仿真 |
| 小薄荷/小蘑菇 | **均有 RGBA PNG + 动画** | 共 12 张状态图与多组序列；小蘑菇为概念提取技术版 |
| Rust life-core | **29 项已编写，未执行** | 本环境无 rustc/cargo；不得写成 PASS |
| Rust plant-store | **4 项已编写，未执行** | 含事务中断回滚、余额幂等与纪念唯一记录 |
| Tauri Windows EXE | **未编译** | 需 Windows 的 Rust/MSVC/WebView2 工具链 |
| 锁屏/挂起/WTS 事件 | **部分实现** | 空闲保护 + Windows 输入桌面锁定轮询 + 长采样间隔丢弃；未做原生会话事件推送 |
| 真机多屏、DPI、透明穿透 | **未验证** | 必须在 Windows 测试，当前不能宣称生产可用 |
| Windows 长时间性能与断电恢复 | **未验证** | SQLite 已实现回滚测试代码，待实际 Cargo 及断电模拟验收 |

## 本轮新增

1. SQLite 原子保存当前 Game / 钱包流水 / 纪念数据 / 关键事件；迁移旧 JSON 备份，失败事务不会更改任何行。
2. 种植与购买带 request ID 幂等处理；下一代的喝水点击冷却独立，不受上一株影响。
3. 安静时段（默认 08:00–22:00）、手动睡眠、1 小时暂停、休眠冻结与唤醒。
4. 两种植物真实透明 PNG 技术素材与生命周期动画，应用中已取消小蘑菇 Emoji 占位。
5. 保留枯死状态与纪念花园，绝不自动创建下一代；已有植物不可随意切换。
6. UI 生命阶段淡入淡出、拟人气泡自动提醒节流、喝水第一下只唤醒睡眠植物。

## 真实 Windows 验收门槛（不可跳过）

- `cargo test -p plant-life-core -p plant-store -- --nocapture` 100% 通过，`npm run build`、`npm run tauri build` 成功。
- 关闭/恢复显示器、锁屏/解锁、休眠/唤醒时不发生误死亡，系统时钟调整不改变死亡判定。
- 125%/150% DPI、主副屏切换、空白透明窗口点击穿透、托盘/设置和拖拽实测。
- 至少 8 小时实际低功耗空闲测试，检查动画不卡顿、CPU/内存稳定。
- 处理技术抠图边缘残留，完成叶片和蘑菇伞帽独立动画绑定。

**当前定位：可供继续开发和 Windows 编译验证的 Alpha 源码工程，非已验收的正式安装包。**
