> **v0.4 视觉修复更新**：挂件透明尺寸、局部动画与布局已修复；`browser_preview/visual_lab.html` 可直接检查，详见 `docs/15_v0.4_视觉修复记录与风险.md`。Rust/Windows 真机验收尚未完成。

# Plant Companion · AI Agent 编码入口（v0.3）

优先阅读 `README.md`、`VALIDATION.md`、`docs/02_生命周期与睡眠状态机.md`、`docs/05_动画与资源生产规范.md`。

1. 两株植物仅 mint/mushroom、无五官、统一清新手绘风；保留基础 Idle、入睡、唤醒、恢复与状态过渡。
2. **死亡不可逆、不会自动种植；用户可自由选择何时种下一代。** 死亡实例永久存纪念。
3. Rust `life-core` 是唯一真实生命周期；UI 动画和浏览器模拟禁止决定死亡。
4. `plant-store` 管理 SQLite 事务，钱包/死亡/纪念操作必须一次性提交；不得改回纯 JSON 真源。
5. 提醒使用已确认活跃时间；手动睡眠、锁屏、夜间和空闲窗口不计入死亡阈值；不能先死亡再撤销。
6. 每次修改先跑 `cargo test -p plant-life-core -p plant-store` 和 `npm run test:static`，再运行 `npm run build`，最后 Windows 真机验证 `npm run tauri dev/build`。
7. 目前 Rust 测试尚未实际运行。第一项工作：在安装了 Rust 的 Windows 环境执行测试，修复全部编译/逻辑错误，提供真实 PASS 日志。严禁推测测试结果。
8. 尚未完成的正式验收：Windows 会话通知精确处理、多屏/DPI/透明穿透、断电回归、精修美术资源。
