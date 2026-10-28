import { call, subscribe, asset, nameOf, native } from './bridge.js';
const el = (selector) => document.querySelector(selector);
const sprite = el('#plant-sprite');
const ghost = el('#transition-sprite');
const layered = el('#plant-layered');
const pot = el('#layer-pot');
const stem = el('#layer-stem');
const crown = el('#layer-top');
const bubble = el('#bubble');
const menu = el('#context-menu');
const placeholder = el('#plant-placeholder');
const pill = el('#stage-pill');
const dew = el('#dew');
let snapshot;
let lastStage = '';
let lastSleep = false;
let lastSpecies;
let lastInstance = '';
let bubbleTimer;
let motionTimer;
let transitionTimer;
let lastAutomaticSpeech = [];
let motionToken = 0;
const lines = {
    mint: { healthy: '今天的阳光刚刚好～', thirsty: '我的叶子有点软软的啦。', dry: '喝口水吧，我也伸伸叶子～', critical: '我的叶子快垂下来了……', dead: '这片叶子的故事，留在花园里吧。', sleep: '你忙你的，我先眯一会儿～', wake: '你回来啦，我伸个懒腰～', water: '咕噜咕噜！又精神起来啦。' },
    mushroom: { healthy: '我的小伞晒到太阳啦～', thirsty: '伞缘软软的，想歇一下。', dry: '要不要一起咕噜一口水？', critical: '小伞快垂到花盆里啦……', dead: '这朵小伞住进纪念花园啦。', sleep: '让我缩进小伞里一会儿。', wake: '你回来啦，我醒咯～', water: '哇，伞帽又撑起来了！' }
};
const line = (key) => lines[snapshot?.current?.species ?? 'mint'][key] || lines.mint[key] || '';
const conditionOf = (s) => s.current ? (s.sleep_reasons.length ? 'sleep' : s.current.stage) : '';
const motionAsset = (species, stage, part) => `./plant-assets/${species}/motion_layers/${stage}/${part}.png`;
const flag = el('#demo-flag');
if (!native)
    flag.hidden = false;
function say(message, ms = 3900) {
    if (!message)
        return;
    menu.hidden = true;
    bubble.textContent = message;
    bubble.classList.toggle('below', !snapshot?.current);
    bubble.classList.add('visible');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('visible'), ms);
}
function sayRare(message) {
    const now = Date.now();
    lastAutomaticSpeech = lastAutomaticSpeech.filter(n => now - n < 3600000);
    if (lastAutomaticSpeech.length >= 2)
        return;
    lastAutomaticSpeech.push(now);
    say(message);
}
function stopMotion() { motionToken++; clearTimeout(motionTimer); layered.classList.remove('watering', 'waking', 'falling'); }
function motion(name, ms) {
    stopMotion();
    const token = motionToken;
    // Remove/re-add class to restart keyframe deterministically, with no animation of the pot.
    void layered.offsetWidth;
    layered.classList.add(name);
    motionTimer = setTimeout(() => { if (token === motionToken)
        layered.classList.remove(name); }, ms);
}
function animateDroplet() { dew.classList.remove('drop'); void dew.offsetWidth; dew.classList.add('drop'); }
function render(s) {
    const previous = snapshot;
    snapshot = s;
    const p = s.current;
    const cond = conditionOf(s);
    const sleeping = s.sleep_reasons.length > 0;
    const switched = p && (p.instance_id !== lastInstance || lastSpecies !== p.species);
    placeholder.style.display = p ? 'none' : 'flex';
    if (!p) {
        layered.style.display = 'none';
        sprite.style.display = 'none';
        ghost.style.display = 'none';
        pill.textContent = '来挑一颗小种子吧';
        lastStage = '';
        lastInstance = '';
        lastSpecies = undefined;
        lastSleep = false;
        return;
    }
    layered.style.display = 'block';
    sprite.style.display = 'none';
    layered.dataset.species = p.species;
    layered.dataset.stage = cond;
    pot.src = motionAsset(p.species, cond, 'pot');
    stem.src = motionAsset(p.species, cond, 'stem');
    crown.src = motionAsset(p.species, cond, 'crown');
    sprite.alt = nameOf(p.species) + ' · ' + cond;
    // Cross-fade only the upper part: keep pot fixed during lifecycle changes.
    if (!switched && lastStage && lastStage !== p.stage && !sleeping && !lastSleep) {
        clearTimeout(transitionTimer);
        ghost.src = asset(p.species, lastStage);
        ghost.style.display = 'block';
        ghost.classList.remove('fade-out');
        ghost.classList.add('crossfading');
        void ghost.offsetWidth;
        ghost.classList.add('fade-out');
        transitionTimer = setTimeout(() => { ghost.style.display = 'none'; ghost.classList.remove('crossfading', 'fade-out'); }, 460);
    }
    if (switched) {
        stopMotion();
        ghost.style.display = 'none';
        bubble.classList.remove('visible');
    }
    const stageLabels = { healthy: '精神满满', thirsty: '有一点点渴', dry: '该喝水啦', critical: '快蔫掉了', dead: '已枯萎', sleep: '正在休息' };
    const remain = Math.max(0, Math.ceil((p.cycle_reminder_ms - p.active_elapsed_ms) / 60_000));
    pill.textContent = cond === 'dead' ? '已枯萎 · 等你决定是否重种' : cond === 'sleep' ? '正在休息 · 倒计时已暂停' : `${stageLabels[cond]} · 还有 ${remain} 分钟`;
    // Stage change events are not triggered by incoming heartbeat snapshots.
    if (!switched && lastStage && lastStage !== p.stage) {
        if (p.stage === 'dead') {
            stopMotion();
            say(line('dead'), 5400);
        }
        else
            sayRare(line(p.stage));
    }
    if (!switched && lastSleep !== sleeping) {
        say(sleeping ? line('sleep') : line('wake'));
        motion(sleeping ? 'falling' : 'waking', 950);
    }
    lastStage = p.stage;
    lastSleep = sleeping;
    lastSpecies = p.species;
    lastInstance = p.instance_id;
}
async function refresh() { try {
    render(await call('get_snapshot'));
}
catch (error) {
    console.error(error);
    say('有点迷路啦，暂时读不到花园状态。');
} }
async function openSettings() {
    if (native) {
        const { getAllWindows } = await import('@tauri-apps/api/window');
        const win = (await getAllWindows()).find(w => w.label === 'settings');
        await win?.show();
        await win?.setFocus();
    }
    else
        window.open('settings.html', '_blank');
}
async function water() {
    if (!snapshot?.current) {
        say('先挑选一颗种子吧～');
        void openSettings();
        return;
    }
    if (snapshot.current.stage === 'dead') {
        say('这株小植物已经住进纪念花园了。');
        void openSettings();
        return;
    }
    if (snapshot.sleep_reasons.length) {
        if (snapshot.sleep_reasons.includes('manual')) {
            try {
                render(await call('exit_manual_sleep'));
                say(line('wake'));
                motion('waking', 950);
            }
            catch (err) {
                say(String(err));
            }
        }
        else
            say('我还在休息，稍等一会儿再叫我吧～');
        return; // First click only wakes; never also confirms a drink.
    }
    try {
        const [next, result] = await call('confirm_drink', { requestId: crypto.randomUUID() });
        render(next);
        if (result.startsWith('Accepted')) {
            motion('watering', 1100);
            animateDroplet();
            say(line('water'));
        }
        else if (result === 'TooSoon')
            say('慢慢喝，不用急着点我呀～');
        else if (result === 'Sleeping')
            say('我还在睡觉呢～');
        else if (result === 'Dead')
            say('这株小植物已经枯萎了。');
    }
    catch (err) {
        say(String(err));
    }
}
function toggleMenu() {
    const opening = menu.hidden;
    menu.hidden = !opening;
    if (opening) {
        bubble.classList.remove('visible');
    }
}
el('#plant-zone').addEventListener('click', () => void water());
el('#more').addEventListener('click', toggleMenu);
el('#plant-zone').addEventListener('contextmenu', (e) => { e.preventDefault(); toggleMenu(); });
el('#menu-drink').addEventListener('click', () => { menu.hidden = true; void water(); });
el('#menu-sleep').addEventListener('click', async () => { menu.hidden = true; try {
    render(await call('enter_manual_sleep'));
    say(line('sleep'));
}
catch (e) {
    say(String(e));
} });
el('#menu-wake').addEventListener('click', async () => { menu.hidden = true; try {
    render(await call('exit_manual_sleep'));
    say(line('wake'));
    motion('waking', 950);
}
catch (e) {
    say(String(e));
} });
el('#menu-snooze').addEventListener('click', async () => { menu.hidden = true; try {
    render(await call('snooze_one_hour'));
    say('我先打个盹，一小时后见～');
}
catch (e) {
    say(String(e));
} });
el('#menu-settings').addEventListener('click', () => { menu.hidden = true; void openSettings(); });
el('#menu-hide').addEventListener('click', async () => {
    menu.hidden = true;
    if (native) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().hide();
    }
    else
        say('浏览器预览中暂时不隐藏～');
});
el('#drag-handle').addEventListener('pointerdown', async () => {
    if (native) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().startDragging();
    }
});
window.addEventListener('keydown', event => { if (event.key === 'Escape')
    menu.hidden = true; });
void subscribe(render);
void refresh();
if (native) {
    void import('@tauri-apps/api/event').then(({ listen }) => listen('plant-effects', event => {
        if (event.payload.some(item => item === 'reminder'))
            sayRare(line('dry'));
    }));
}
