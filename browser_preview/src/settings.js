import { call, subscribe, native, nameOf, demoAdvance } from './bridge.js';
const $ = (s) => document.querySelector(s);
let state;
let tab = 'garden';
const title = { garden: ['我的小花园', '一株一株慢慢长大。'], shop: ['小小种子铺', '挑一颗喜欢的种子，让它陪你工作。'], collection: ['植物图鉴', '认识你的每一位小伙伴。'], memorial: ['纪念花园', '每段陪伴都值得被记住。'], settings: ['轻轻调整一下', '用你舒服的节奏照顾自己。'] };
const clip = (n) => Math.floor(n / 60_000);
function image(s, cls = 'portrait', stage = 'healthy') { return `<img class="${cls}" src="./plant-assets/${s}/states/${stage}.png" alt="${nameOf(s)}"/>`; }
function notice(t) { $('#toast').textContent = t; setTimeout(() => $('#toast').textContent = '', 4500); }
function card(kind) { const owned = state.unlocked.includes(kind); return `<div class="seed-card">${image(kind)}<h3>${nameOf(kind)}</h3><p>${kind === 'mint' ? '清新治愈，轻轻摇摆' : '温柔安静，撑起小伞'}</p><div class="seed-actions">${owned ? '<span class="owned">✓ 已解锁</span>' : `<span>💧 ${state.unlocked.length ? 6 : '免费'}</span>`}<button data-action="${owned ? 'plant' : 'buy'}" data-species="${kind}" ${owned && !(!state.current || state.current.stage === 'dead') ? 'disabled' : ''}>${owned ? '种下这一株' : state.unlocked.length ? '解锁种子' : '选它做第一株'}</button></div></div>`; }
function garden() {
    const p = state.current;
    if (!p)
        return `<section class="intro"><span class="intro-emoji">🌱</span><h2>一个温柔的开始</h2><p>从小薄荷或小蘑菇里选一个吧。第一株免费，不需要注册。</p><div class="card-grid">${card('mint')}${card('mushroom')}</div></section>`;
    const dead = p.stage === 'dead', sleep = state.sleep_reasons.length > 0;
    return `<section class="hero-card">${image(p.species, 'hero-plant', sleep ? 'sleep' : p.stage)}<div><div class="caption">${dead ? '这一代已枯萎' : sleep ? '正在安静休息' : '正在陪伴你'}</div><h2>${nameOf(p.species)} · 第 ${p.generation} 代</h2><p>${dead ? '它这一生已经结束，但会一直留在纪念花园。' : '状态：' + (sleep ? '睡眠（不扣生命）' : p.stage) + ' · 本周期累计 ' + clip(p.active_elapsed_ms) + ' 分钟'}</p><p>这一代陪你记录喝水 ${p.drink_count} 次 · 成长 ${p.growth_points} 点</p>${dead ? '<button class="primary" data-action="go-shop">想种下一株时，再来挑种子</button>' : '<button class="primary" data-action="go-settings">调整提醒设置</button>'}</div></section>${dead ? '<p class="hint">🍂 没有自动重种，也没有强制等待。何时开始下一代，由你决定。</p>' : ''}`;
}
function shop() { return `<p class="hint">解锁的是品种，不是一次性皮肤。每一代植物都有独立的生命记录。</p><div class="card-grid">${card('mint')}${card('mushroom')}</div><section class="hint secret">🔒 隐藏植物系列：未来开放 · 本版不包含第三种植物</section>`; }
function collection() { return `<div class="card-grid">${['mint', 'mushroom'].map(s => `<div class="seed-card ${state.unlocked.includes(s) ? '' : 'locked'}">${state.unlocked.includes(s) ? image(s) : '<div class="portrait mystery">?</div>'}<h3>${state.unlocked.includes(s) ? nameOf(s) : '???'}</h3><p>${state.unlocked.includes(s) ? '已经认识的小伙伴' : '尚未发现'}</p></div>`).join('')}</div>`; }
function memorial() { const all = [...state.memorials, ...(state.current?.stage === 'dead' ? [state.current] : [])]; return all.length ? `<div class="memorial-list">${all.slice().reverse().map(p => `<div class="memorial-item"><span>🍂</span><div><strong>${nameOf(p.species)} · 第 ${p.generation} 代</strong><p>有效陪伴 ${clip(p.total_active_ms)} 分钟 · 喝水 ${p.drink_count} 次</p></div><small>已枯萎 · 不可复活</small></div>`).join('')}</div>` : `<div class="empty-state">🍃<h3>纪念花园还没有故事</h3><p>好好相处的时光，会被轻轻珍藏。</p></div>`; }
function settings() { const s = state.settings; return `<section class="form-card"><label>喝水提醒间隔 <input type="number" id="remind" min="5" max="180" value="${s.reminder_minutes}"/> 分钟</label><label>空闲多久后自动睡眠 <input type="number" id="sleep-min" min="1" max="120" value="${s.idle_sleep_minutes}"/> 分钟</label><label class="check-row"><input type="checkbox" id="auto-idle" ${s.idle_sleep_enabled ? 'checked' : ''}/> 自动睡眠保护</label><label class="check-row"><input type="checkbox" id="quiet-hours" ${s.quiet_hours_enabled ? 'checked' : ''}/> 在非活跃时段自动让植物睡眠</label><label>每日活跃开始 <input type="time" id="active-start" value="${String(Math.floor(s.active_start_minute / 60)).padStart(2, '0')}:${String(s.active_start_minute % 60).padStart(2, '0')}" /></label><label>每日活跃结束 <input type="time" id="active-end" value="${String(Math.floor(s.active_end_minute / 60)).padStart(2, '0')}:${String(s.active_end_minute % 60).padStart(2, '0')}" /></label><p class="hint">睡眠不会恢复健康，也不会累积缺水和成长。入睡前的进度会被保留。</p><button class="primary" data-action="save-settings">保存设置</button></section>${!native ? '<section class="form-card"><h3>浏览器交互预览</h3><p>只用于验证界面，不代表 Rust 真正的时间判定。</p><button data-action="demo-advance">快进 30 分钟</button></section>' : ''}`; }
function render(g) { state = g; $('#coin-balance').textContent = String(g.droplets); $('#page-title').textContent = title[tab][0]; $('#page-desc').textContent = title[tab][1]; document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('selected', el.dataset.tab === tab)); $('#content-panel').innerHTML = { garden, shop, collection, memorial, settings }[tab](); }
function activateTab(x) { tab = x; render(state); }
document.querySelectorAll('.nav-item').forEach(el => el.addEventListener('click', () => activateTab(el.dataset.tab)));
$('#content-panel').addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target)
        return;
    const action = target.dataset.action;
    const species = target.dataset.species;
    if (action === 'go-shop') {
        activateTab('shop');
        return;
    }
    if (action === 'go-settings') {
        activateTab('settings');
        return;
    }
    if (action === 'demo-advance') {
        demoAdvance(30 * 60_000);
        return;
    }
    try {
        if (action === 'plant' || action === 'buy') {
            const requestId = crypto.randomUUID();
            if (action === 'plant')
                render(await call('plant_seed', { species, requestId }));
            else if (!state.unlocked.length)
                render(await call('plant_seed', { species, requestId }));
            else
                render(await call('purchase_species', { species, requestId }));
            notice(action === 'plant' || !state.unlocked.length ? '欢迎来到小花园，慢慢长大吧。' : '新朋友已经加入图鉴！');
        }
        if (action === 'save-settings') {
            const reminder_minutes = Number(document.querySelector('#remind').value);
            const idle_sleep_minutes = Number(document.querySelector('#sleep-min').value);
            const idle_sleep_enabled = document.querySelector('#auto-idle').checked;
            if (!Number.isInteger(reminder_minutes) || reminder_minutes < 5 || reminder_minutes > 180)
                throw Error('提醒间隔必须在 5–180 分钟');
            if (!Number.isInteger(idle_sleep_minutes) || idle_sleep_minutes < 1 || idle_sleep_minutes > 120)
                throw Error('自动睡眠阈值必须在 1–120 分钟');
            const quiet_hours_enabled = document.querySelector('#quiet-hours').checked;
            const parseTime = (id) => { const raw = document.querySelector(id).value; const [h, m] = raw.split(':').map(Number); return h * 60 + m; };
            const active_start_minute = parseTime('#active-start'), active_end_minute = parseTime('#active-end');
            if (active_start_minute === active_end_minute)
                throw Error('每日活跃时间的起止不能相同');
            render(await call('update_settings', { settings: { ...state.settings, reminder_minutes, idle_sleep_minutes, idle_sleep_enabled, quiet_hours_enabled, active_start_minute, active_end_minute } }));
            notice('已保存，新间隔在下一周期生效');
        }
    }
    catch (e) {
        notice('没有完成：' + String(e));
    }
});
void subscribe(render);
void call('get_snapshot').then(render).catch(e => notice(String(e)));
