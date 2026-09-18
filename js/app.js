/* 名古屋・上高地 兩家旅 — 主程式 */
(() => {
const T = window.TRIP, CFG = window.APP_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtJPY = n => '¥' + Math.round(n).toLocaleString('ja-JP');
const fmtTWD = n => 'NT$' + Math.round(n).toLocaleString('zh-TW');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ---------- 本機狀態 ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('ngtrip.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ngtrip.' + k, JSON.stringify(v)); } catch {} },
};
const state = {
  tab: LS.get('tab', 'home'), me: LS.get('me', null), day: LS.get('day', null),
  settings: Object.assign({ drive: false, openaiKey: '', familyKey: '', model: CFG.OPENAI_MODEL || 'gpt-4o-mini', showOther: false }, LS.get('settings', {})),
  expenses: LS.get('expenses', []), messages: LS.get('messages', []), aiHistory: LS.get('aiHistory', []),
  checks: LS.get('checks', {}), customChecks: LS.get('customChecks', []),
  rate: LS.get('rate', null), wx: LS.get('wx', {}), guideSec: LS.get('guideSec', 'spots'), chatMode: LS.get('chatMode', 'group'),
};
const save = () => { ['tab','me','day','settings','expenses','messages','aiHistory','checks','customChecks','rate','wx','guideSec','chatMode'].forEach(k => LS.set(k, state[k])); };
const me = () => T.PEOPLE.find(p => p.id === state.me) || null;
const person = id => T.PEOPLE.find(p => p.id === id);
const pname = id => (person(id) || {}).name || id || '？';
const myGroup = () => (me() || {}).group || null;
const forMe = g => !myGroup() || !g || g === 'all' || g === myGroup();          // 天／航班／項目是否屬於我
const visibleDays = () => T.DAYS.filter(d => forMe(d.group));
const KANSAI_AREAS = ['大阪', '京都', '奈良'];
const spotForMe = sp => !(myGroup() === 'chen' && KANSAI_AREAS.includes(sp.area));
const textForMe = txt => !(myGroup() === 'chen' && /先行組/.test(txt || ''));

/* ---------- Firebase（選配）---------- */
let fdb = null, fbReady = false;
try {
  if (window.firebase && CFG.firebase && CFG.firebase.apiKey && CFG.firebase.databaseURL) {
    firebase.initializeApp(CFG.firebase); fdb = firebase.database(); fbReady = true;
  }
} catch (e) { console.warn('firebase init failed', e); }
const fref = path => fdb ? fdb.ref(`trips/${CFG.tripId || 'trip'}/${path}`) : null;
if (fbReady) {
  fref('expenses').on('value', snap => { const v = snap.val() || {}; state.expenses = Object.values(v).sort((a, b) => a.ts - b.ts); save(); if (state.tab === 'money') render(); });
  fref('messages').limitToLast(300).on('value', snap => { const v = snap.val() || {}; state.messages = Object.values(v).sort((a, b) => a.ts - b.ts); save(); if (state.tab === 'chat' && state.chatMode === 'group') { render(); scrollChat(); } });
}

/* ---------- 工具：導航 / 停車 / 加油 ---------- */
const coordsOf = target => {
  if (!target) return null;
  if (Array.isArray(target)) return target;
  if (target === 'hotel') return T.HOTEL.coords;
  if (target.startsWith('spot:')) return (T.SPOTS[target.slice(5)] || {}).coords || null;
  if (target.startsWith('rest:')) return (T.RESTAURANTS[target.slice(5)] || {}).coords || null;
  return null;
};
const queryOf = target => {
  if (!target) return '';
  if (target === 'hotel') return T.HOTEL.jp + ' ' + T.HOTEL.addr;
  if (target.startsWith('q:')) return target.slice(2);
  if (target.startsWith('spot:')) return (T.SPOTS[target.slice(5)] || {}).jp || '';
  if (target.startsWith('rest:')) { const r = T.RESTAURANTS[target.slice(5)] || {}; return r.q || r.jp || r.name || ''; }
  return String(target);
};
const navUrl = (target, mode = 'transit') => {
  const c = coordsOf(target);
  const dest = c ? `${c[0]},${c[1]}` : encodeURIComponent(queryOf(target));
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
};
const searchUrl = (q, c, z = 16) => c ? `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${c[0]},${c[1]},${z}z` : `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
const parkingUrl = c => searchUrl('駐車場', c, 16), gasUrl = c => searchUrl('ガソリンスタンド', c, 14);
const navBtn = (target, label = '導航') => `<a class="btn sm sky" target="_blank" rel="noopener" href="${navUrl(target)}">${ico('nav')}${esc(label)}</a>`;
const driveBtns = c => state.settings.drive && c ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${parkingUrl(c)}">🅿️ 停車場</a><a class="btn sm ghost" target="_blank" rel="noopener" href="${gasUrl(c)}">⛽ 加油站</a>` : '';
const ico = n => ({
  nav: '<svg viewBox="0 0 24 24"><path d="M12 2l7 19-7-4-7 4z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M3 12l18-8-6 18-3-8z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
}[n] || '');

/* ---------- 天氣（Open-Meteo）---------- */
const WMO = { 0:['☀️','晴'],1:['🌤️','晴時多雲'],2:['⛅','多雲'],3:['☁️','陰'],45:['🌫️','霧'],48:['🌫️','霧'],51:['🌦️','毛毛雨'],53:['🌦️','小雨'],55:['🌧️','雨'],61:['🌦️','小雨'],63:['🌧️','中雨'],65:['🌧️','大雨'],66:['🌧️','凍雨'],67:['🌧️','凍雨'],71:['🌨️','小雪'],73:['🌨️','雪'],75:['❄️','大雪'],77:['🌨️','雪粒'],80:['🌦️','陣雨'],81:['🌧️','陣雨'],82:['⛈️','強陣雨'],85:['🌨️','陣雪'],86:['🌨️','陣雪'],95:['⛈️','雷雨'],96:['⛈️','雷雨冰雹'],99:['⛈️','雷雨冰雹'] };
const wmo = c => WMO[c] || ['🌡️', '—'];
async function fetchWx(key, force = false) {
  const p = T.WX_POINTS[key]; if (!p) return null;
  const cached = state.wx[key];
  if (!force && cached && Date.now() - cached.ts < 3600e3) return cached.data;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FTokyo&forecast_days=16${p.elev ? '&elevation=' + p.elev : ''}`;
    const r = await fetch(u); if (!r.ok) throw new Error(r.status);
    const data = await r.json(); state.wx[key] = { ts: Date.now(), data }; save(); return data;
  } catch (e) { console.warn('wx', e); return cached ? cached.data : null; }
}
function wxCardHTML(key, date, data) {
  const p = T.WX_POINTS[key];
  let body = '';
  if (data && data.daily) {
    const i = data.daily.time.indexOf(date);
    if (i >= 0) {
      const [e, t] = wmo(data.daily.weather_code[i]);
      body = `<div class="wx"><div class="ico">${e}</div><div><div class="temps">${Math.round(data.daily.temperature_2m_max[i])}° <span class="muted">/ ${Math.round(data.daily.temperature_2m_min[i])}°</span></div>
        <div class="small">${t} · 降雨機率 ${data.daily.precipitation_probability_max[i] ?? '—'}% · 日出 ${(data.daily.sunrise[i]||'').slice(11)} 日落 ${(data.daily.sunset[i]||'').slice(11)}</div></div></div>`;
      body += `<div class="wx-days">` + data.daily.time.map((d, j) => `<div class="wx-d ${d === date ? 'on' : ''}"><div>${d.slice(5).replace('-', '/')}</div><div style="font-size:1.3rem">${wmo(data.daily.weather_code[j])[0]}</div><div class="tab-num">${Math.round(data.daily.temperature_2m_max[j])}°/${Math.round(data.daily.temperature_2m_min[j])}°</div></div>`).join('') + `</div>`;
      if (data.daily.precipitation_probability_max[i] >= 50) body += `<div class="sticky-note">☔ 這天降雨機率偏高，看看下面的「雨備行程」。</div>`;
      if (key === 'kamikochi' && data.daily.temperature_2m_min[i] <= 5) body += `<div class="sticky-note">🧤 上高地清晨接近 ${Math.round(data.daily.temperature_2m_min[i])}°C，手套毛帽發熱衣都帶。</div>`;
    } else {
      const open = daysBetween(todayStr(), date) - 15;
      body = `<div class="wx"><div class="ico">📅</div><div><div class="temps">${p.tmax}° <span class="muted">/ ${p.tmin}°</span> <span class="small muted">（10 月中旬平均）</span></div>
        <div class="small">降雨日約 ${p.rain} · ${esc(p.note)}</div><div class="tiny muted">逐日預報最多 16 天，${open > 0 ? `再 ${open} 天` : '現在'}可看到這天的預報。</div></div></div>`;
      if (data.current) body += `<div class="small muted" style="margin-top:6px">現在 ${p.name}：${wmo(data.current.weather_code)[0]} ${Math.round(data.current.temperature_2m)}°C</div>`;
    }
  } else {
    body = `<div class="wx"><div class="ico">🌡️</div><div><div class="temps">${p.tmax}° <span class="muted">/ ${p.tmin}°</span></div><div class="small">10 月中旬平均 · ${esc(p.note)}</div><div class="tiny muted">目前離線，顯示氣候平均值</div></div></div>`;
  }
  return `<div class="card tape"><div class="row between"><h2>🌤 ${esc(p.name)} 天氣</h2><button class="btn sm ghost" data-act="wx-refresh" data-key="${key}">${ico('refresh')}更新</button></div>${body}</div>`;
}

/* ---------- 匯率（open.er-api.com）---------- */
const FALLBACK_RATE = 0.205;
const rate = () => (state.rate && state.rate.twd) || FALLBACK_RATE;
async function fetchRate(force = false) {
  if (!force && state.rate && Date.now() - state.rate.ts < 6 * 3600e3) return state.rate.twd;
  try { const r = await fetch('https://open.er-api.com/v6/latest/JPY'); const j = await r.json(); if (j && j.rates && j.rates.TWD) { state.rate = { twd: j.rates.TWD, ts: Date.now(), src: 'open.er-api.com' }; save(); return j.rates.TWD; } } catch (e) { console.warn('rate', e); }
  return rate();
}
const rateLine = () => state.rate ? `1 JPY ≈ ${rate().toFixed(4)} TWD（${new Date(state.rate.ts).toLocaleString('zh-TW', { hour12: false })} 更新）` : `1 JPY ≈ ${FALLBACK_RATE} TWD（離線參考值）`;

/* ---------- 版面 ---------- */
const view = $('#view');
function render() {
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('#btnMe').textContent = me() ? `👤 ${me().name}` : '我是誰？';
  const fn = { home: renderHome, guide: renderGuide, money: renderMoney, chat: renderChat, more: renderMore }[state.tab] || renderHome;
  view.innerHTML = fn(); afterRender();
}
function afterRender() {
  if (state.tab === 'home') {
    const d = currentDay(); fetchWx(d.wx).then(data => { const el = $('#wxSlot'); if (el && state.tab === 'home' && currentDay().id === d.id) el.innerHTML = wxCardHTML(d.wx, d.date, data); });
  }
  if (state.tab === 'money' || state.tab === 'home') fetchRate().then(() => { const el = $('#rateLine'); if (el) el.textContent = rateLine(); });
  if (state.tab === 'chat') scrollChat();
}
function currentDay() {
  const DS = visibleDays();
  if (state.day) { const d = DS.find(x => x.id === state.day); if (d) return d; }
  const t = todayStr(); const hit = DS.find(d => d.date === t); if (hit) return hit;
  return DS.find(d => d.date >= t) || DS[0];
}

/* ===== 行程 ===== */
function renderHome() {
  const m = me(); const d = currentDay(); const t = todayStr();
  let head = '';
  const startDate = m && m.group === 'chen' ? '2026-10-13' : '2026-10-10';
  const dl = daysBetween(t, startDate);
  if (dl > 0) head = `<div class="card tape-r tilt-l"><span class="doodle">✈️</span><div class="countdown"><div class="n">${dl}</div><div><div>天後出發${m ? `（${T.GROUPS[m.group].name}）` : ''}</div><div class="small muted">${m && m.group === 'chen' ? '10/13（二）JX838 15:55 桃園 → 名古屋' : '10/10（六）10:15 桃園 → 大阪'}</div></div></div>${m ? '' : `<div class="small muted" style="margin-top:6px">點右上角「我是誰？」選自己，行程、早餐、房號、分帳會變成你的視角。</div>`}</div>`;
  else if (t <= '2026-10-19') head = `<div class="card tape-r tilt-l"><span class="doodle">🎒</span><h2>旅行第 ${daysBetween('2026-10-10', t) + 1} 天</h2><div class="small muted">今天 ${t}${m ? ` · ${m.name} · ${m.breakfast ? '含早餐' : '不含早餐 → コメダ'}` : ''}</div></div>`;
  else head = `<div class="card tape-r tilt-l"><h2>旅行結束 🎞️</h2><div class="small muted">記得把記帳結清、照片備份、相簿做起來。</div></div>`;

  const chips = visibleDays().map(x => `<button class="chip ${x.id === d.id ? 'on' : ''} ${x.group === 'yang' ? 'matcha' : ''}" data-act="day" data-id="${x.id}"><div class="hand" style="font-size:1.1rem">${x.date.slice(5).replace('-', '/')}</div><div class="tiny">${x.dow} ${x.hero}</div></button>`).join('');

  const items = d.items.map(it => {
    const other = m && it.group && it.group !== m.group;
    if (other && !state.settings.showOther) return '';
    if (other) { /* 另一組的移動以淡色顯示 */ }
    const spot = it.spot ? T.SPOTS[it.spot] : null; const rest = it.rest ? T.RESTAURANTS[it.rest] : null;
    const c = spot ? spot.coords : rest ? rest.coords : coordsOf(it.nav);
    const target = it.nav || (it.spot ? 'spot:' + it.spot : it.rest ? 'rest:' + it.rest : null);
    let acts = '';
    if (target) acts += navBtn(target);
    if (spot) acts += `<button class="btn sm" data-act="spot" data-id="${it.spot}">📍 景點介紹</button>`;
    if (rest) acts += `<button class="btn sm" data-act="rest" data-id="${it.rest}">🍽 餐廳資訊</button>`;
    acts += driveBtns(c);
    const g = it.group ? `<span class="badge-g ${it.group}">${T.GROUPS[it.group].short}</span>` : '';
    return `<li class="ti ${it.type} ${other ? 'other' : ''}"><div class="t">${esc(it.time)}</div><div class="dot"></div><div class="body"><div class="ttl">${g}${esc(it.title)}${rest && rest.verify ? ' <span class="pill warn">待確認</span>' : ''}</div>${it.desc ? `<div class="desc">${esc(it.desc)}</div>` : ''}${acts ? `<div class="acts">${acts}</div>` : ''}</div></li>`;
  }).join('');

  const alt = d.alt ? `<div class="note"><b>🔁 ${esc(d.alt.title)}</b><ul class="clean">${d.alt.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${d.alt.spot ? `<button class="btn sm" data-act="spot" data-id="${d.alt.spot}">📍 介紹</button>` : ''}</div>` : '';
  const flights = T.FLIGHTS.filter(f => f.date === d.date && forMe(f.group)).map(flightCard).join('');
  return `${head}
  <div class="chips">${chips}</div>
  <div class="card"><div class="hero-day"><div class="big">${d.date.slice(5).replace('-', '/')}</div><div><div class="small muted">星期${d.dow} · ${d.group === 'all' ? '11 人' : T.GROUPS[d.group].name}${d.swapped ? ` · <span class="pill persimmon">已調動</span>` : ''}</div><h2>${esc(d.title)}</h2>${d.swapped ? `<div class="tiny muted">${esc(d.swapped)}</div>` : ''}</div></div>
    ${m && d.items.some(i => i.group) ? `<label class="switch small"><span>顯示另一組今天的移動</span><input type="checkbox" data-act="toggle-other" ${state.settings.showOther ? 'checked' : ''}></label>` : ''}
    <ul class="timeline">${items}</ul>${alt}</div>
  <div id="wxSlot">${wxCardHTML(d.wx, d.date, (state.wx[d.wx] || {}).data)}</div>
  ${flights}
  <div class="card tape"><h2>☔ 雨備行程</h2><ul class="clean">${d.rain.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
  ${d.notes && d.notes.length ? `<div class="card"><h2>📝 今日備忘</h2><ul class="clean">${d.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
  <div class="card tilt-r"><h2>🏨 今晚住宿</h2>${d.date < '2026-10-13' ? `<div>大阪飯店（待訂）— 推薦見「指南 → 住宿」</div>` : d.date === '2026-10-19' ? '<div>飛機上 → 回家 🏠</div>' : `<div><b>${esc(T.HOTEL.name)}</b> <span class="small muted">${esc(T.HOTEL.jp)}</span></div><div class="small muted">${esc(T.HOTEL.addr)}</div><div class="btnrow">${navBtn('hotel', '導航回飯店')}<a class="btn sm" href="tel:${T.HOTEL.tel}">📞 ${T.HOTEL.tel}</a>${m ? `<span class="chip mini">房 ${m.room} · ${m.breakfast ? '含早餐' : '不含早餐'}</span>` : ''}</div>`}</div>
  <div class="card"><div class="row between"><h2>💴 匯率</h2><span class="small muted" id="rateLine">${rateLine()}</span></div><div class="row"><input type="number" inputmode="decimal" id="qJPY" placeholder="日圓" style="flex:1"><span>→</span><output id="qTWD" class="money-big">NT$0</output></div></div>
  ${state.settings.drive ? `<div class="card"><h2>🚗 自駕模式</h2><div class="small muted">每個景點下方已自動顯示停車場與加油站。也可以用目前位置搜尋：</div><div class="btnrow"><button class="btn sm" data-act="near" data-q="駐車場">🅿️ 我附近停車場</button><button class="btn sm" data-act="near" data-q="ガソリンスタンド">⛽ 我附近加油站</button></div></div>` : ''}`;
}
function flightCard(f) {
  return `<div class="card tape-r"><div class="row between"><h2>✈️ ${esc(f.no)}</h2><span class="small muted">${esc(f.airline)} · ${esc(f.plane)}</span></div>
    <div class="row between" style="margin-top:6px"><div><div class="hand" style="font-size:1.8rem">${f.from.time}</div><b>${f.from.code}</b><div class="tiny muted">${esc(f.from.name)}<br>${esc(f.from.terminal)}</div></div><div class="muted small">— ${esc(f.duration)} →</div><div style="text-align:right"><div class="hand" style="font-size:1.8rem">${f.to.time}</div><b>${f.to.code}</b><div class="tiny muted">${esc(f.to.name)}<br>${esc(f.to.terminal)}</div></div></div>
    <div class="small muted" style="margin-top:6px">${f.date.slice(5).replace('-', '/')}（${f.dow}）· ${f.group === 'all' ? '11 人' : T.GROUPS[f.group].name}${f.verify ? ' · <span class="pill warn">航班號待確認</span>' : ''}</div>${f.note ? `<div class="note small">${esc(f.note)}</div>` : ''}</div>`;
}

/* ===== 指南 ===== */
const GUIDE_SECS = [['spots','📍 景點'],['food','🍜 美食'],['must','⭐ 必吃必買必拍'],['photo','📸 拍照'],['transport','🚇 交通'],['hotel','🏨 住宿'],['weather','🌤 天氣'],['rain','☔ 雨備'],['news','📣 消息'],['sos','🆘 緊急']];
function renderGuide() {
  const sec = state.guideSec;
  const chips = GUIDE_SECS.map(([k, l]) => `<button class="chip ${k === sec ? 'on' : ''}" data-act="gsec" data-id="${k}">${l}</button>`).join('');
  return `<div class="chips">${chips}</div>` + ({ spots: guideSpots, food: guideFood, must: guideMust, photo: guidePhoto, transport: guideTransport, hotel: guideHotel, weather: guideWeather, rain: guideRain, news: guideNews, sos: guideSOS }[sec] || guideSpots)();
}
const areaOrder = ['名古屋','榮','伏見','熱田','大須','長久手','犬山','長野','常滑','名古屋站北','金城埠頭','大阪','京都','奈良'];
function guideSpots() {
  const groups = {};
  Object.entries(T.SPOTS).forEach(([id, s]) => { if (!s.intro || !spotForMe(s)) return; (groups[s.area] = groups[s.area] || []).push([id, s]); });
  const order = Object.keys(groups).sort((a, b) => (areaOrder.indexOf(a) + 99) % 99 - (areaOrder.indexOf(b) + 99) % 99);
  return order.map(a => `<h3 class="hand" style="font-size:1.4rem;margin:14px 0 4px">${esc(a)}</h3>` + groups[a].map(([id, s]) => `<div class="card"><div class="row between"><h2>${esc(s.name)}</h2><span class="small muted">${esc(s.jp)}</span></div><div class="small">${esc(s.intro)}</div>${s.cost ? `<div class="tiny muted" style="margin-top:4px">💴 ${esc(s.cost)}${s.hours ? ` · 🕒 ${esc(s.hours)}` : ''}</div>` : ''}<div class="btnrow"><button class="btn sm" data-act="spot" data-id="${id}">看攻略・拍照點</button>${navBtn('spot:' + id)}${driveBtns(s.coords)}</div></div>`).join('')).join('');
}
function spotModal(id) {
  const s = T.SPOTS[id]; if (!s) return '';
  return `<h2>${esc(s.name)}</h2><div class="muted small">${esc(s.jp)} · ${esc(s.area)}</div><p>${esc(s.intro)}</p>
  <div class="kv">${s.hours ? `<b>時間</b><span>${esc(s.hours)}</span>` : ''}${s.cost ? `<b>費用</b><span>${esc(s.cost)}</span>` : ''}${s.parking ? `<b>停車</b><span>${esc(s.parking)}</span>` : ''}</div>
  ${s.tips.length ? `<h3 style="margin-top:12px">💡 攻略</h3><ul class="clean">${s.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${s.photo.length ? `<h3 style="margin-top:12px">📸 拍照 tips</h3><ul class="clean">${s.photo.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  <div class="btnrow">${navBtn('spot:' + id, 'Google Maps 導航')}<a class="btn sm" target="_blank" rel="noopener" href="${navUrl('spot:' + id, 'driving')}">🚗 開車路線</a>${s.coords ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${parkingUrl(s.coords)}">🅿️ 停車場</a><a class="btn sm ghost" target="_blank" rel="noopener" href="${gasUrl(s.coords)}">⛽ 加油站</a>` : ''}<button class="btn sm" data-act="ask" data-q="${esc(s.name)} 有什麼要注意的？附近還有什麼好吃好逛？">🤖 問 AI</button></div>`;
}
function guideFood() {
  return `<div class="sticky-note">行程表上「隨便吃／自由安排」的餐我都排了推薦，見各天時間軸；這裡是全部餐廳總覽。<span class="pill warn">待確認</span> = 店名或位置網路上沒查到，出發前請電話確認。</div>` +
    Object.entries(T.RESTAURANTS).map(([id, r]) => `<div class="card"><div class="row between"><h2>${esc(r.name)}${r.verify ? ' <span class="pill warn">待確認</span>' : ''}</h2><span class="small muted">${esc(r.cuisine)}</span></div><div class="small muted">${esc(r.area)} · ${esc(r.price)}</div><div class="small" style="margin-top:4px">${esc(r.why)}</div><div class="btnrow"><button class="btn sm" data-act="rest" data-id="${id}">必點・預約</button>${navBtn('rest:' + id)}</div></div>`).join('');
}
function restModal(id) {
  const r = T.RESTAURANTS[id]; if (!r) return '';
  return `<h2>${esc(r.name)}${r.verify ? ' <span class="pill warn">待確認</span>' : ''}</h2><div class="muted small">${esc(r.jp)} · ${esc(r.cuisine)} · ${esc(r.area)}</div><p>${esc(r.why)}</p>
  <div class="kv"><b>價位</b><span>${esc(r.price)}</span><b>預約</b><span>${esc(r.reserve)}</span><b>時間</b><span>${esc(r.hours)}</span></div>
  <h3 style="margin-top:12px">🍽 必點</h3><ul class="clean">${r.must.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  ${r.notes ? `<h3>⚠️ 注意</h3><ul class="clean">${r.notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  <div class="btnrow">${navBtn('rest:' + id, 'Google Maps 導航')}<a class="btn sm" target="_blank" rel="noopener" href="${searchUrl(r.q || r.jp || r.name, r.coords, 15)}">🔍 地圖搜尋</a><button class="btn sm" data-act="addexp" data-title="${esc(r.name)}">💴 記一筆</button><button class="btn sm" data-act="ask" data-q="${esc(r.name)} 11 個人去要怎麼預約？有什麼必點？如果訂不到有什麼備案？">🤖 問 AI</button></div>`;
}
function guideMust() {
  const sec = (title, arr, cols) => `<div class="card tape"><h2>${title}</h2><div class="tablewrap"><table><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${arr.filter(x => textForMe(Object.values(x).join(' '))).map(x => `<tr>${Object.values(x).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  return sec('🍜 必吃', T.MUST.eat, ['名物', '哪裡吃', '哪天']) + sec('🛍 必買', T.MUST.buy, ['伴手禮', '哪裡買', '備註']) + sec('📸 必拍', T.MUST.shoot, ['畫面', '時機', '技巧']);
}
function guidePhoto() {
  return `<div class="card tape"><h2>📸 拍照通用技巧</h2><ul class="clean">${T.PHOTO_TIPS.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` +
    Object.entries(T.SPOTS).filter(([, s]) => s.photo && s.photo.length && spotForMe(s)).map(([id, s]) => `<details><summary>${esc(s.name)}</summary><div class="in"><ul class="clean">${s.photo.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></details>`).join('');
}
function guideTransport() {
  return T.TRANSPORT.map(x => `<div class="card"><h2>${esc(x.title)}</h2><div class="small">${esc(x.body)}</div></div>`).join('') +
    `<div class="card tilt-r"><h2>🛫 航班</h2></div>` + T.FLIGHTS.filter(f => forMe(f.group)).map(flightCard).join('') +
    `<div class="card"><h2>🚗 自駕模式</h2><label class="switch"><span>開啟後每個景點自動顯示 停車場／加油站</span><input type="checkbox" data-act="toggle-drive" ${state.settings.drive ? 'checked' : ''}></label><div class="small muted">日本加油：自助（セルフ）選「レギュラー」＝ 92 無鉛；ENEOS／apollostation／コスモ 最多；約 ¥170–180/L；還車前加滿並保留收據。停車場多為「投幣式 コインパーキング」，看板上「最大料金」是當日上限。</div></div>`;
}
function guideHotel() {
  const H = T.HOTEL; const m = me();
  const rooms = H.rooms.map(r => `<tr><td>${r.no}</td><td>${esc(r.type)}<div class="tiny muted">${r.size}</div></td><td>${r.who.map(pname).join('、')}</td><td class="small">${esc(r.bf)}</td></tr>`).join('');
  const nightly = H.nightly.map(n => `<tr><td>${n.d}${n.note ? `<div class="tiny muted">${n.note}</div>` : ''}</td><td class="tab-num">${fmtJPY(n.twinBf)}</td><td class="tab-num">${fmtJPY(n.roomOnly)}</td><td class="tab-num">${fmtJPY(n.single)}</td></tr>`).join('');
  return `<div class="card tape"><h2>🏨 ${esc(H.name)}</h2><div class="muted small">${esc(H.jp)} · ${esc(H.en)}</div><div class="small" style="margin-top:6px">${esc(H.addr)}</div><div class="kv" style="margin-top:8px"><b>入住</b><span>${esc(H.checkin)}</span><b>退房</b><span>${esc(H.checkout)}</span><b>交通</b><span>${esc(H.access)}</span><b>停車</b><span>${esc(H.parking)}${H.parkingVerify ? ' <span class="pill warn">待確認</span>' : ''}</span></div>
    <ul class="clean small">${H.features.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="btnrow">${navBtn('hotel', '導航')}<a class="btn sm" href="tel:${H.tel}">📞 ${H.tel}</a><a class="btn sm ghost" target="_blank" rel="noopener" href="${searchUrl(H.jp, H.coords, 17)}">🗺 地圖</a></div></div>
  <div class="card"><h2>🛏 房號分配（6 間・11 人）</h2>${m ? `<div class="sticky-note">你的房間：<b>No.${m.room}</b> · ${m.breakfast ? '含早餐 🍳' : '不含早餐（コメダ 早餐去！）'}</div>` : ''}<div class="tablewrap"><table><thead><tr><th>No.</th><th>房型</th><th>住客</th><th>早餐</th></tr></thead><tbody>${rooms}</tbody></table></div></div>
  <div class="card"><h2>💴 住宿費用（報價單 · 含稅）</h2><div class="money-big">${fmtJPY(H.totalJPY)} <span class="small muted">≈ ${fmtTWD(H.totalJPY * rate())}</span></div><div class="small muted">6 晚 · 11 人 · ${esc(H.issue)}</div>
    <h3 style="margin-top:10px">每人 6 晚合計</h3><ul class="clean small"><li>豪華雙床／雙人房 含早餐：<b>${fmtJPY(H.perPersonPrice.twinBf)}</b>/人（8 人）</li><li>豪華雙床房 不含早餐：<b>${fmtJPY(H.perPersonPrice.twinRoomOnly)}</b>/人（高魁澤、陳玟潔）</li><li>標準雙人房 單人入住 含早餐：<b>${fmtJPY(H.perPersonPrice.singleBf)}</b>（楊書竣）</li></ul>
    <details><summary>每晚單價（每人）</summary><div class="in tablewrap"><table><thead><tr><th>日期</th><th>雙床含早</th><th>雙床不含早</th><th>單人房</th></tr></thead><tbody>${nightly}</tbody></table></div></details>
    <div class="btnrow"><button class="btn sm primary" data-act="addhotel">把住宿費一鍵加入分帳</button></div></div>
  ${myGroup() === 'chen' ? '' : `<div class="card tilt-l"><h2>🛌 大阪 3 晚（先行組 10/10–10/13，待訂）</h2><div class="small muted">建議住難波／心齋橋：去關西機場（南海 Rapi:t）、去新大阪（御堂筋線 15 分）、逛道頓堀都方便。</div>${T.OSAKA_HOTEL_PICKS.map(h => `<div class="note"><b>${esc(h.name)}</b> <span class="tiny muted">${esc(h.area)}</span><div class="small">${esc(h.why)}</div><a class="btn sm ghost" target="_blank" rel="noopener" href="${searchUrl(h.q)}">🗺 地圖</a></div>`).join('')}</div>`}`;
}
function guideWeather() {
  const keys = ['osaka', 'kyoto', 'nagoya', 'nagakute', 'kamikochi', 'inuyama'].filter(k => !(myGroup() === 'chen' && ['osaka', 'kyoto'].includes(k)));
  setTimeout(() => keys.forEach(k => fetchWx(k).then(data => { const el = document.getElementById('wx-' + k); if (el) el.innerHTML = wxCardHTML(k, wxDateFor(k), data); })), 0);
  return `<div class="sticky-note">10 月中旬：名古屋白天 22°C 舒服、早晚 15°C；上高地只有 3–12°C，差 10 度！颱風尾季，出發前 5 天每天看。</div>` + keys.map(k => `<div id="wx-${k}">${wxCardHTML(k, wxDateFor(k), (state.wx[k] || {}).data)}</div>`).join('');
}
const wxDateFor = k => (T.DAYS.find(d => d.wx === k) || {}).date || '2026-10-14';
function guideRain() {
  return `<div class="sticky-note">每天的雨備也在「行程」頁該天下方。這裡是室內景點總表，隨時可替換。</div>` + visibleDays().map(d => `<details><summary>${d.date.slice(5).replace('-', '/')}（${d.dow}）${esc(d.title)}</summary><div class="in"><ul class="clean">${d.rain.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></details>`).join('') +
    `<div class="card tape"><h2>🏛 室內景點清單</h2>${['science', 'toyota', 'linear', 'noritake'].map(id => { const s = T.SPOTS[id]; return `<div class="note"><b>${esc(s.name)}</b><div class="small">${esc(s.intro)}</div><div class="tiny muted">${esc(s.hours)} · ${esc(s.cost)}</div><div class="btnrow"><button class="btn sm" data-act="spot" data-id="${id}">介紹</button>${navBtn('spot:' + id)}</div></div>`; }).join('')}<div class="small muted">還有：榮地下街（サカエチカ・森の地下街）、松坂屋／三越／LACHIC、イオンモール、飯店溫泉。</div></div>`;
}
function guideNews() {
  return `<div class="small muted">資料整理日 ${T.META.dataDate}。<span class="pill warn">待確認</span> = 出發前請再查。</div>` + T.NEWS.map(n => `<div class="card ${n.tag === '節慶' ? 'tape' : ''}"><div class="row between"><span class="pill ${n.tag === '節慶' ? 'persimmon' : n.tag === '門票' ? 'plum' : 'sky'}">${esc(n.tag)}</span><span class="tiny muted">${n.date}</span></div><h2 style="margin-top:6px">${esc(n.title)}${n.verify ? ' <span class="pill warn">待確認</span>' : ''}</h2><div class="small">${esc(n.body)}</div>${n.url ? `<div class="btnrow"><a class="btn sm" target="_blank" rel="noopener" href="${n.url}">🔗 官網</a></div>` : ''}</div>`).join('') +
    `<div class="card"><h2>🔗 相關連結</h2><div class="btnrow"><a class="btn sm" target="_blank" rel="noopener" href="${T.META.klook}">Klook 上高地一日遊</a><a class="btn sm" target="_blank" rel="noopener" href="https://www.nagoya-festival.jp/">名古屋祭 官網</a><a class="btn sm" target="_blank" rel="noopener" href="https://ghibli-park.jp/">吉卜力公園</a><a class="btn sm" target="_blank" rel="noopener" href="${T.META.ebisen}">機場蝦餅 攻略</a><a class="btn sm" target="_blank" rel="noopener" href="https://www.starlux-airlines.com/">星宇航空</a><a class="btn sm" target="_blank" rel="noopener" href="https://www.vjw.digital.go.jp/">Visit Japan Web</a></div></div>`;
}
function guideSOS() {
  return `<div class="card tape"><h2>🆘 緊急聯絡</h2>${T.EMERGENCY.map(e => `<div class="row between" style="padding:8px 0;border-bottom:1px dashed var(--line)"><div><b>${esc(e.name)}</b>${e.verify ? ' <span class="pill warn">待確認</span>' : ''}${e.note ? `<div class="tiny muted">${esc(e.note)}</div>` : ''}</div>${e.tel ? `<a class="btn sm" href="tel:${e.tel.replace(/[^+\d]/g, '')}">📞 ${esc(e.tel)}</a>` : ''}</div>`).join('')}</div>
  <div class="card"><h2>🏥 生病受傷怎麼辦</h2><ul class="clean small"><li>輕症：藥妝店（スギ薬局／マツキヨ）有藥師，出示症狀翻譯即可</li><li>看醫生：請飯店櫃台代為聯絡，名古屋醫療中心離飯店 10 分（英文可）；保留收據回台申請保險</li><li>護照遺失：先報警取得「遺失證明」，再聯絡駐外館處補發入國證明書</li><li>信用卡遺失：立即撥銀行 24 小時掛失專線（請先填在上面）</li></ul><div class="btnrow"><button class="btn sm" data-act="ask" data-q="我在名古屋，家人身體不舒服（請描述症狀），附近該去哪裡看醫生？要怎麼用日文說明？">🤖 問 AI 怎麼做</button></div></div>
  <div class="card"><h2>🗣 常用日文</h2><div class="kv small"><b>すみません</b><span>不好意思／請問</span><b>これをください</b><span>請給我這個</span><b>11人です</b><span>我們 11 個人（じゅういちにん）</span><b>予約した高です</b><span>我是預約的高先生</span><b>トイレはどこですか</b><span>洗手間在哪</span><b>免税お願いします</b><span>請幫我免稅</span><b>袋いりません</b><span>不用袋子</span><b>大丈夫です</b><span>沒關係／不用</span><b>助けてください</b><span>請幫我（緊急）</span><b>救急車を呼んでください</b><span>請叫救護車</span></div></div>`;
}

/* ===== 記帳／分帳 ===== */
const toJPY = e => e.currency === 'TWD' ? e.amount / (e.rate || rate()) : e.amount;
function balances() {
  const bal = {}; T.PEOPLE.forEach(p => bal[p.id] = 0);
  state.expenses.forEach(e => { const jpy = toJPY(e); const n = e.split.length || 1; bal[e.payer] = (bal[e.payer] || 0) + jpy; e.split.forEach(id => bal[id] = (bal[id] || 0) - jpy / n); });
  return bal;
}
function settle(bal) {
  const debt = [], cred = [];
  Object.entries(bal).forEach(([id, v]) => { if (v < -1) debt.push({ id, v: -v }); else if (v > 1) cred.push({ id, v }); });
  debt.sort((a, b) => b.v - a.v); cred.sort((a, b) => b.v - a.v);
  const out = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) { const x = Math.min(debt[i].v, cred[j].v); out.push({ from: debt[i].id, to: cred[j].id, v: x }); debt[i].v -= x; cred[j].v -= x; if (debt[i].v < 1) i++; if (cred[j].v < 1) j++; }
  return out;
}
function renderMoney() {
  const m = me(); const bal = balances(); const total = state.expenses.reduce((s, e) => s + toJPY(e), 0);
  const mine = m ? state.expenses.filter(e => e.split.includes(m.id)).reduce((s, e) => s + toJPY(e) / e.split.length, 0) : 0;
  const list = state.expenses.slice().reverse().map(e => `<div class="exp"><div><b>${esc(e.title)}</b> <span class="tiny muted">${esc(e.cat || '')}</span><div class="tiny muted">${e.date} · ${pname(e.payer)} 付 · ${e.split.length === 11 ? '11 人均分' : e.split.length + ' 人：' + e.split.map(pname).join('、')}</div></div><div><div class="amt">${e.currency === 'TWD' ? fmtTWD(e.amount) : fmtJPY(e.amount)}</div><div class="tiny muted">${e.currency === 'TWD' ? fmtJPY(toJPY(e)) : '≈ ' + fmtTWD(e.amount * (e.rate || rate()))}</div><button class="btn sm" data-act="editexp" data-id="${e.id}">改</button> <button class="btn sm ghost" data-act="delexp" data-id="${e.id}">刪</button></div></div>`).join('') || '<div class="muted small">還沒有帳。按「＋ 記一筆」開始。</div>';
  const sums = T.PEOPLE.map(p => `<div class="bal ${bal[p.id] > 1 ? 'pos' : bal[p.id] < -1 ? 'neg' : ''}"><span>${p.name}</span><span>${bal[p.id] > 1 ? '應收 ' : bal[p.id] < -1 ? '應付 ' : ''}${fmtJPY(Math.abs(bal[p.id]))}</span></div>`).join('');
  const st = settle(bal).map(s => `<li>${pname(s.from)} → ${pname(s.to)}：<b>${fmtJPY(s.v)}</b> <span class="tiny muted">≈ ${fmtTWD(s.v * rate())}</span></li>`).join('') || '<li class="muted">目前不用轉帳 🎉</li>';
  const byGroup = { yang: 0, chen: 0 }; state.expenses.forEach(e => { const per = toJPY(e) / e.split.length; e.split.forEach(id => { const p = person(id); if (p) byGroup[p.group] += per; }); });
  return `<div class="card tape-r tilt-l"><div class="row between"><h2>💴 匯率・記帳</h2><span class="tiny ${fbReady ? 'pill good' : 'pill warn'}">${fbReady ? '11 人即時同步' : '只存這支手機'}</span></div><div class="small muted" id="rateLine">${rateLine()}</div>
    <div class="row" style="margin-top:8px"><input type="number" inputmode="decimal" id="qJPY" placeholder="日圓 → 台幣" style="flex:1"><output id="qTWD" class="money-big">NT$0</output></div>
    <div class="row" style="margin-top:4px"><input type="number" inputmode="decimal" id="qTWDin" placeholder="台幣 → 日圓" style="flex:1"><output id="qJPYout" class="money-big">¥0</output></div>
    <div class="btnrow"><button class="btn sm ghost" data-act="rate-refresh">${ico('refresh')}更新匯率</button></div></div>
  <div class="card"><div class="row between"><div><div class="small muted">總花費</div><div class="money-big">${fmtJPY(total)}</div><div class="tiny muted">≈ ${fmtTWD(total * rate())}</div></div>${m ? `<div style="text-align:right"><div class="small muted">${m.name} 的份</div><div class="money-big">${fmtJPY(mine)}</div><div class="tiny muted">≈ ${fmtTWD(mine * rate())}</div></div>` : ''}</div>
    <div class="btnrow"><button class="btn primary" data-act="addexp">${ico('plus')}記一筆</button><button class="btn" data-act="quick" data-title="午餐" data-cat="🍜 餐飲">🍜 午餐</button><button class="btn" data-act="quick" data-title="晚餐" data-cat="🍜 餐飲">🍱 晚餐</button><button class="btn" data-act="quick" data-title="交通" data-cat="🚇 交通">🚇 交通</button><button class="btn" data-act="quick" data-title="門票" data-cat="🎫 門票">🎫 門票</button></div></div>
  <div class="card"><h2>🧮 誰欠誰（最少轉帳次數）</h2><ul class="clean">${st}</ul><details><summary>每人餘額</summary><div class="in">${sums}</div></details></div>
  <div class="card"><div class="row between"><h2>🧾 明細（${state.expenses.length} 筆）</h2><button class="btn sm ghost" data-act="copyexp">複製成文字</button></div>${list}</div>
  ${!fbReady ? `<div class="sticky-note small">想讓 11 支手機同步記帳與聊天：請家喻在 js/config.js 填入 Firebase 設定（免費，5 分鐘），見「更多 → 設定」說明。</div>` : ''}`;
}
function addExpModal(pre = {}) {
  const m = me(); const splitSet = pre.split ? new Set(pre.split) : null;
  const people = T.PEOPLE.map(p => `<button type="button" class="pbtn ${p.group} ${!splitSet || splitSet.has(p.id) ? 'on' : ''}" data-pid="${p.id}">${p.name}</button>`).join('');
  return `<h2>💴 ${pre.id ? '修改這筆' : '記一筆'}</h2>${pre.id ? `<input type="hidden" id="exId" value="${esc(pre.id)}">` : ''}
  <label class="lbl">項目</label><input type="text" id="exTitle" value="${esc(pre.title || '')}" placeholder="例：馬喰一代 飛驒牛晚餐">
  <div class="row"><div style="flex:1"><label class="lbl">金額</label><input type="number" inputmode="decimal" id="exAmt" value="${pre.amount || ''}" placeholder="0"></div><div style="width:110px"><label class="lbl">幣別</label><select id="exCur"><option value="JPY" ${pre.currency === 'JPY' ? 'selected' : ''}>JPY ¥</option><option value="TWD" ${pre.currency === 'TWD' ? 'selected' : ''}>TWD NT$</option></select></div></div>
  <div class="row"><div style="flex:1"><label class="lbl">誰付的</label><select id="exPayer">${T.PEOPLE.map(p => `<option value="${p.id}" ${(pre.payer ? pre.payer === p.id : (m && m.id === p.id)) ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div><div style="flex:1"><label class="lbl">類別</label><select id="exCat">${['🍜 餐飲', '🚇 交通', '🎫 門票', '🏨 住宿', '🛍 購物', '🎁 伴手禮', '📦 其他'].map(c => `<option ${pre.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
  <label class="lbl">日期</label><input type="date" id="exDate" value="${pre.date || (todayStr() >= '2026-10-10' && todayStr() <= '2026-10-19' ? todayStr() : currentDay().date)}">
  <label class="lbl">分給誰（點選切換）</label><div class="btnrow" style="margin:0 0 6px"><button type="button" class="btn sm" data-sel="all">全部 11 人</button><button type="button" class="btn sm" data-sel="yang">10/10 出發的 5 人</button><button type="button" class="btn sm" data-sel="chen">10/13 出發的 6 人</button><button type="button" class="btn sm ghost" data-sel="none">清空</button></div><div class="people-grid" id="exPeople">${people}</div>
  <div class="btnrow" style="margin-top:14px"><button class="btn primary block" id="exSave">${pre.id ? '儲存修改' : '儲存'}</button></div>`;
}

/* ===== 聊天 / AI ===== */
function renderChat() {
  const mode = state.chatMode;
  const tabs = `<div class="chips"><button class="chip ${mode === 'group' ? 'on' : ''}" data-act="chatmode" data-id="group">👨‍👩‍👧‍👦 家族群聊</button><button class="chip ${mode === 'ai' ? 'on' : ''}" data-act="chatmode" data-id="ai">🤖 AI 小幫手（ChatGPT）</button></div>`;
  if (mode === 'group') {
    const msgs = state.messages.map(x => `<div class="msg ${me() && x.from === me().id ? 'me' : ''}"><span class="from">${esc(pname(x.from))} · ${new Date(x.ts).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>${esc(x.text)}</div>`).join('') || '<div class="muted small" style="text-align:center;padding:20px">還沒有訊息。第一個說「集合！」的人請按送出 👋</div>';
    return tabs + `<div class="chatwrap">${!fbReady ? `<div class="sticky-note small">⚠️ 尚未設定 Firebase，訊息只會留在這支手機。設定方法見「更多 → 設定」。${CFG.LINE_GROUP_URL ? `<a class="btn sm matcha" href="${CFG.LINE_GROUP_URL}">開 LINE 群組</a>` : ''}</div>` : ''}<div class="msgs" id="msgs">${msgs}</div>
      <div class="suggest">${['我到了 📍', '集合！河童橋巴士站前', '等我 5 分鐘', '先去吃飯了，位置：', '幫我買一份 🙏', '大合照時間 📸'].map(s => `<button class="chip mini" data-act="quickmsg" data-t="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <div class="composer"><textarea id="chatIn" rows="1" placeholder="${me() ? me().name + '：說點什麼…' : '先按右上角選你是誰'}"></textarea><button class="btn primary" data-act="send">${ico('send')}</button><button class="btn sm ghost" data-act="sendloc" title="傳我的位置">📍</button></div></div>`;
  }
  const hasKey = aiReady();
  const hist = state.aiHistory.map(x => `<div class="msg ${x.role === 'user' ? 'me' : 'ai'}"><span class="from">${x.role === 'user' ? (me() ? me().name : '我') : '🤖 AI 小幫手'}</span>${mdLite(x.content)}</div>`).join('') || `<div class="msg ai"><span class="from">🤖 AI 小幫手</span>嗨！我知道這次 10 天的完整行程、11 個人的房號、每家餐廳與待確認事項，也會用目前的天氣與匯率回答。問我：「明天要穿什麼？」「上高地怎麼走最省力？」「這附近有什麼好吃？」「幫我算 3 人分 ¥12,600」…</div>`;
  return tabs + `<div class="chatwrap">${!hasKey ? `<div class="sticky-note small">🔑 ${CFG.AI_PROXY_URL ? '第一次使用請輸入家族密碼（問家喻）。' : '尚未設定 OpenAI API key。'}<button class="btn sm" data-act="aiset">現在設定</button></div>` : ''}<div class="msgs" id="msgs">${hist}</div>
    <div class="suggest">${['今天的行程重點和要注意什麼？', '明天名古屋和上高地要穿什麼？', '我現在在哪，附近有什麼好吃的？', '推薦附近的停車場和加油站', '幫我把這句翻成日文：我們預約了 11 位', '這家店訂不到的話有什麼備案？'].map(s => `<button class="chip mini" data-act="askfill" data-t="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div class="composer"><textarea id="aiIn" rows="1" placeholder="問 AI 小幫手…"></textarea><button class="btn primary" data-act="ai-send" id="aiSend">${ico('send')}</button><button class="btn sm ghost" data-act="ai-clear" title="清除對話">🧹</button></div></div>`;
}
const mdLite = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/^[-•] (.*)$/gm, '• $1').replace(/\n/g, '<br>');
function scrollChat() { const el = $('#msgs'); if (el) el.scrollIntoView({ block: 'end' }); window.scrollTo(0, document.body.scrollHeight); }
async function sendMsg(text) {
  if (!me()) { openMe(); return; } text = (text || '').trim(); if (!text) return;
  const msg = { id: uid(), ts: Date.now(), from: me().id, text };
  if (fbReady) { await fref('messages').child(msg.id).set(msg); }
  else { state.messages.push(msg); save(); render(); }
  scrollChat();
}
function buildContext() {
  const d = currentDay(); const t = todayStr(); const m = me();
  const days = T.DAYS.map(x => `${x.date}(${x.dow}) ${x.title}${x.group !== 'all' ? `[${T.GROUPS[x.group].name}]` : ''}\n` + x.items.map(i => `  ${i.time} ${i.title}${i.desc ? ' — ' + i.desc.slice(0, 120) : ''}`).join('\n') + `\n  雨備：${x.rain.join('；')}`).join('\n');
  const rests = Object.values(T.RESTAURANTS).map(r => `${r.name}（${r.cuisine}，${r.area}，${r.price}，${r.reserve}${r.verify ? '，⚠️店名待確認' : ''}）`).join('\n');
  const rooms = T.HOTEL.rooms.map(r => `房${r.no} ${r.type}: ${r.who.map(pname).join('、')}（${r.bf}）`).join('\n');
  const wx = Object.entries(state.wx).map(([k, v]) => { const dd = v.data && v.data.daily; if (!dd) return ''; return `${T.WX_POINTS[k].name}: ` + dd.time.slice(0, 16).map((x, i) => `${x.slice(5)} ${wmo(dd.weather_code[i])[1]} ${Math.round(dd.temperature_2m_max[i])}/${Math.round(dd.temperature_2m_min[i])}° 雨${dd.precipitation_probability_max[i]}%`).join(', '); }).filter(Boolean).join('\n');
  const news = T.NEWS.map(n => `[${n.tag}] ${n.title}：${n.body}`).join('\n');
  return `你是「名古屋・上高地 兩家旅」旅遊手帳 app 的 AI 小幫手，用繁體中文（台灣用語）親切、具體、簡短地回答。今天是 ${t}${state.geo ? `，使用者目前 GPS 位置 ${state.geo.lat.toFixed(4)},${state.geo.lon.toFixed(4)}` : ''}。提問者：${m ? `${m.name}（${T.GROUPS[m.group].name}，房${m.room}，${m.breakfast ? '含早餐' : '不含早餐'}）` : '未選擇'}。app 目前顯示的日子：${d.date} ${d.title}。
旅行：2026/10/10–10/19，共 11 人兩家族。先行組 5 人（楊才廣、黃思婷、楊家喻、張志郁、楊書竣）10/10 JX822 TPE10:15→KIX14:00，先玩大阪京都，10/13 新幹線到名古屋。直飛組 6 人（陳永康、楊淑媛、陳玟玲、高魁澤、陳玟潔、陳玟綺）10/13 星宇 TPE15:55→NGO18:45。全員 10/19 JX839 NGO19:55→TPE22:00。
飯店：名古屋クラウンホテル（名古屋市中区栄1-8-33，+81-52-211-6633，伏見站步行5分，有天然溫泉），10/13–10/19 六晚，總價 JPY 1,071,200。
${rooms}
匯率：${rateLine()}。
=== 行程 ===\n${days}
=== 餐廳 ===\n${rests}
=== 消息／注意 ===\n${news}
=== 天氣預報快取 ===\n${wx || '（尚無預報，10 月中旬平均：名古屋 22/15°C，上高地 12/3°C）'}
回答原則：先給結論再給步驤；牽涉金額請同時給日圓與約略台幣；不確定的店名或時間要提醒「出發前確認」；提到地點時可建議「用 app 的導航按鈕」。若問題與旅行無關也可以回答。`;
}
async function askAI(q) {
  q = (q || '').trim(); if (!q) return;
  if (!aiReady()) { openModal(aiSettingsModal()); return; }
  const useProxy = !!CFG.AI_PROXY_URL;
  const url = useProxy ? CFG.AI_PROXY_URL.replace(/\/$/, '') : 'https://api.openai.com/v1/chat/completions';
  const hdrs = { 'Content-Type': 'application/json' };
  if (useProxy) hdrs['x-family-key'] = state.settings.familyKey || CFG.FAMILY_PASSWORD || ''; else hdrs.Authorization = 'Bearer ' + (state.settings.openaiKey || CFG.OPENAI_API_KEY);
  state.aiHistory.push({ role: 'user', content: q }); state.aiHistory.push({ role: 'assistant', content: '…思考中' }); save(); render(); scrollChat();
  const idx = state.aiHistory.length - 1;
  try { await new Promise(res => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { state.geo = { lat: p.coords.latitude, lon: p.coords.longitude }; res(); }, () => res(), { timeout: 2500, maximumAge: 600e3 }) : res()); } catch {}
  const msgs = [{ role: 'system', content: buildContext() }, ...state.aiHistory.slice(-11, -1).filter(x => x.content !== '…思考中')];
  try {
    const r = await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify({ model: state.settings.model || 'gpt-4o-mini', messages: msgs, stream: true, temperature: 0.6 }) });
    if (!r.ok) {
      const t = await r.text(); let msg = '';
      try { msg = JSON.parse(t).error?.message || ''; } catch {}
      if (r.status === 401) { if (useProxy) { state.settings.familyKey = ''; save(); } throw new Error(useProxy ? '家族密碼錯誤，請到「更多 → 設定 → AI 小幫手」重新輸入' : 'API key 無效'); }
      if (r.status === 403) throw new Error(msg || '這個網址不被允許呼叫 AI，請用正式網址 chiayumd15.github.io 開 app');
      if (r.status === 429) throw new Error('OpenAI 額度用完或太頻繁，請稍後再試（' + (msg || '429') + '）');
      throw new Error(`${r.status} ${msg || t.slice(0, 160)}`);
    }
    let out = '';
    if (!r.body || !r.body.getReader) { const j = await r.json(); out = j.choices?.[0]?.message?.content || ''; state.aiHistory[idx].content = out || '（沒有回覆）'; save(); render(); scrollChat(); return; }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const ln of lines) { const s = ln.trim(); if (!s.startsWith('data:')) continue; const j = s.slice(5).trim(); if (j === '[DONE]') continue; try { const o = JSON.parse(j); const dlt = o.choices?.[0]?.delta?.content; if (dlt) { out += dlt; state.aiHistory[idx].content = out; const el = document.querySelectorAll('#msgs .msg')[idx]; if (el) { el.innerHTML = `<span class="from">🤖 AI 小幫手</span>${mdLite(out)}`; } } } catch {} }
    }
    state.aiHistory[idx].content = out || '（沒有回覆）'; save();
  } catch (e) { const net = /Failed to fetch|Load failed|NetworkError/i.test(e.message); state.aiHistory[idx].content = `❌ 呼叫失敗：${net ? '連不到 AI 中繼站，請確認網路（飛航模式？）後再試' : e.message}`; save(); render(); }
  scrollChat();
}
function aiReady() { return CFG.AI_PROXY_URL ? !!(state.settings.familyKey || CFG.FAMILY_PASSWORD) : !!(state.settings.openaiKey || CFG.OPENAI_API_KEY); }
function aiSettingsModal() {
  if (CFG.AI_PROXY_URL) return `<h2>🤖 AI 小幫手</h2><div class="small muted">AI 透過家族專用的中繼站呼叫 ChatGPT，不需要自己的帳號。請輸入家喻給的家族密碼，這支手機只要輸入一次。</div>
  <label class="lbl">家族密碼</label><input type="password" id="aiFamily" value="${esc(state.settings.familyKey)}" placeholder="問家喻">
  <label class="lbl">模型</label><select id="aiModel">${['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'].map(mm => `<option ${mm === state.settings.model ? 'selected' : ''}>${mm}</option>`).join('')}</select><div class="tiny muted">預設 gpt-4o-mini 快又便宜。</div>
  <div class="btnrow" style="margin-top:12px"><button class="btn primary block" id="aiKeySave">儲存</button></div>`;
  return `<h2>🤖 AI 小幫手設定</h2><div class="small muted">使用 OpenAI（ChatGPT）API。key 只存在這支手機的瀏覽器裡。到 platform.openai.com → API keys 建立一把，貼在下面。</div>
  <label class="lbl">OpenAI API key</label><input type="password" id="aiKey" value="${esc(state.settings.openaiKey)}" placeholder="sk-…">
  <label class="lbl">模型</label><select id="aiModel">${['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini', 'gpt-5'].map(mm => `<option ${mm === state.settings.model ? 'selected' : ''}>${mm}</option>`).join('')}</select><div class="tiny muted">gpt-4o-mini 便宜快速夠用；問複雜的行程調整可換 gpt-4o／gpt-4.1。</div>
  <div class="btnrow" style="margin-top:12px"><button class="btn primary block" id="aiKeySave">儲存</button></div>`;
}

/* ===== 更多 ===== */
function renderMore() {
  const m = me();
  const allItems = []; T.CHECKLIST.forEach(c => c.items.forEach(i => allItems.push(c.cat + '|' + i))); state.customChecks.forEach(i => allItems.push('✍️ 自己加的|' + i));
  const mych = m ? (state.checks[m.id] || {}) : (state.checks._anon || {});
  const done = allItems.filter(k => mych[k]).length;
  const cats = [...T.CHECKLIST.map(c => ({ cat: c.cat, items: c.items })), ...(state.customChecks.length ? [{ cat: '✍️ 自己加的', items: state.customChecks }] : [])];
  const ck = cats.map(c => `<details ${c.cat.startsWith('證件') ? 'open' : ''}><summary>${esc(c.cat)} <span class="tiny muted">${c.items.filter(i => mych[c.cat + '|' + i]).length}/${c.items.length}</span></summary><div class="in">${c.items.map(i => { const k = c.cat + '|' + i; return `<div class="ck ${mych[k] ? 'done' : ''}"><input type="checkbox" id="ck-${btoa(unescape(encodeURIComponent(k))).replace(/[^a-z0-9]/gi, '')}" data-act="ck" data-k="${esc(k)}" ${mych[k] ? 'checked' : ''}><label for="ck-${btoa(unescape(encodeURIComponent(k))).replace(/[^a-z0-9]/gi, '')}">${esc(i)}</label></div>`; }).join('')}</div></details>`).join('');
  const people = T.PEOPLE.map(p => `<tr><td><span class="badge-g ${p.group}">${T.GROUPS[p.group].short}</span>${p.name}</td><td>房 ${p.room}</td><td>${p.breakfast ? '🍳 含' : '— 不含'}</td><td class="tiny">${p.group === 'yang' ? '10/10 JX822' : '10/13 JX838'}</td></tr>`).join('');
  return `<div class="card tape tilt-l"><div class="row between"><h2>🧳 行李 Checklist${m ? ` · ${m.name}` : ''}</h2><span class="small muted tab-num">${done}/${allItems.length}</span></div><div class="progress"><i style="width:${allItems.length ? done / allItems.length * 100 : 0}%"></i></div><div class="tiny muted" style="margin-top:4px">每個人的清單分開記；先選「我是誰」。</div>${ck}<div class="row" style="margin-top:8px"><input type="text" id="ckNew" placeholder="自己加一項…" style="flex:1"><button class="btn sm" data-act="ckadd">${ico('plus')}加</button></div></div>
  <div class="card"><h2>👨‍👩‍👧‍👦 11 人名單・房號・航班</h2><div class="tablewrap"><table><thead><tr><th>姓名</th><th>房</th><th>早餐</th><th>去程</th></tr></thead><tbody>${people}</tbody></table></div><div class="tiny muted">分組依出發日：先行組 5 人（10/10）、直飛組 6 人（10/13）。若有誤請告訴家喻。</div><div class="btnrow"><button class="btn sm" data-act="me">切換我是誰</button></div></div>
  <div class="card"><h2>⚙️ 設定</h2>
    <label class="switch"><span>🚗 自駕模式（景點自動顯示停車・加油）</span><input type="checkbox" data-act="toggle-drive" ${state.settings.drive ? 'checked' : ''}></label>
    <label class="switch"><span>🌓 深色模式</span><select id="themeSel" style="width:auto"><option value="">跟隨系統</option><option value="light">淺色</option><option value="dark">深色</option></select></label>
    <div class="switch"><span>🤖 AI 小幫手（${CFG.AI_PROXY_URL ? '家族密碼' : 'OpenAI key'}）</span><button class="btn sm" data-act="aiset">${aiReady() ? '已設定 ✓' : '設定'}</button></div>
    <div class="switch"><span>☁️ 11 人同步（Firebase）</span><span class="pill ${fbReady ? 'good' : 'warn'}">${fbReady ? '已連線' : '未設定'}</span></div>
    <details><summary class="small">怎麼開啟 11 人同步？</summary><div class="in small"><ol class="clean"><li>到 console.firebase.google.com 建立專案（免費）</li><li>左側「Realtime Database」→ 建立資料庫 → 地區選 asia-southeast1 → 「測試模式」</li><li>專案設定 → 您的應用程式 → 新增 Web App → 複製 firebaseConfig</li><li>貼到 js/config.js 的 firebase:{…} → 重新部署</li></ol>之後記帳、分帳、群聊會在所有人手機即時同步。</div></details>
    <div class="btnrow" style="margin-top:10px"><button class="btn sm ghost" data-act="export">📤 匯出我的資料（備份）</button><button class="btn sm ghost" data-act="reload">🔄 重新載入最新版</button></div></div>
  <div class="card tilt-r"><h2>📲 加到 iPhone 主畫面</h2><ol class="clean small"><li>用 Safari 打開這個網址</li><li>點下方「分享」⬆️ → 「加入主畫面」</li><li>之後像 app 一樣全螢幕開啟，離線也能看行程</li></ol></div>
  <div class="tiny muted" style="text-align:center;margin:20px 0">${esc(T.META.title)} · 資料 ${T.META.dataDate} · 手繪風 手帳 app<br>景點／餐廳資訊為整理自公開資料，<span class="pill warn">待確認</span> 項目出發前請再查。</div>`;
}

/* ===== Modal / Toast / Me ===== */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }
let toastT; function toast(s) { const el = $('#toast'); el.textContent = s; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }
function openMe() {
  openModal(`<h2>你是誰？</h2><div class="small muted">選了之後，只會顯示你這組的行程；早餐、房號、記帳、聊天也會用你的身分。</div><h3 style="margin-top:10px">先行組（10/10 出發）</h3><div class="people-grid">${T.PEOPLE.filter(p => p.group === 'yang').map(p => `<button class="pbtn yang ${state.me === p.id ? 'on' : ''}" data-act="setme" data-id="${p.id}">${p.name}</button>`).join('')}</div><h3 style="margin-top:10px">直飛組（10/13 出發）</h3><div class="people-grid">${T.PEOPLE.filter(p => p.group === 'chen').map(p => `<button class="pbtn chen ${state.me === p.id ? 'on' : ''}" data-act="setme" data-id="${p.id}">${p.name}</button>`).join('')}</div>`);
}

/* ===== 事件 ===== */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act],[data-tab],[data-pid],[data-sel],#exSave,#aiKeySave,.modal-close');
  if (!b) return;
  if (b.dataset.tab) { state.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); return; }
  if (b.classList.contains('modal-close')) { closeModal(); return; }
  if (b.dataset.pid) { b.classList.toggle('on'); return; }
  if (b.dataset.sel) { document.querySelectorAll('#exPeople .pbtn').forEach(x => { const g = person(x.dataset.pid).group; x.classList.toggle('on', b.dataset.sel === 'all' || b.dataset.sel === g); }); return; }
  if (b.id === 'exSave') {
    const amt = parseFloat($('#exAmt').value); if (!amt) { toast('請輸入金額'); return; }
    const split = [...document.querySelectorAll('#exPeople .pbtn.on')].map(x => x.dataset.pid); if (!split.length) { toast('至少選一個人分'); return; }
    const exIdEl = $('#exId'); const old = exIdEl ? state.expenses.find(x => x.id === exIdEl.value) : null;
    const ex = { id: old ? old.id : uid(), ts: old ? old.ts : Date.now(), title: $('#exTitle').value.trim() || '未命名', amount: amt, currency: $('#exCur').value, payer: $('#exPayer').value, cat: $('#exCat').value, date: $('#exDate').value, split, rate: old && old.currency === $('#exCur').value ? old.rate : rate(), by: state.me, editedTs: old ? Date.now() : undefined };
    if (ex.editedTs === undefined) delete ex.editedTs;
    if (fbReady) await fref('expenses').child(ex.id).set(ex); else { if (old) state.expenses = state.expenses.map(x => x.id === ex.id ? ex : x); else state.expenses.push(ex); save(); }
    closeModal(); state.tab = 'money'; render(); toast(old ? '已修改 ✓' : '已記一筆 ✓'); return;
  }
  if (b.id === 'aiKeySave') { const fk = $('#aiFamily'), ak = $('#aiKey'); if (fk) state.settings.familyKey = fk.value.trim(); if (ak) state.settings.openaiKey = ak.value.trim(); state.settings.model = $('#aiModel').value; save(); closeModal(); render(); toast('已儲存'); return; }
  const a = b.dataset.act, id = b.dataset.id;
  switch (a) {
    case 'day': state.day = id; save(); render(); break;
    case 'gsec': state.guideSec = id; save(); render(); window.scrollTo(0, 0); break;
    case 'spot': openModal(spotModal(id)); break;
    case 'rest': openModal(restModal(id)); break;
    case 'me': openMe(); break;
    case 'setme': state.me = id; if (state.day && !visibleDays().some(d => d.id === state.day)) state.day = null; save(); closeModal(); render(); toast(`你好，${pname(id)}！`); break;
    case 'wx-refresh': toast('更新天氣…'); fetchWx(b.dataset.key, true).then(() => render()); break;
    case 'rate-refresh': toast('更新匯率…'); fetchRate(true).then(() => { render(); toast('匯率已更新'); }); break;
    case 'toggle-other': state.settings.showOther = b.checked; save(); render(); break;
    case 'toggle-drive': state.settings.drive = b.checked; save(); render(); toast(state.settings.drive ? '自駕模式開啟 🚗' : '自駕模式關閉'); break;
    case 'near': { const q = b.dataset.q; if (!navigator.geolocation) { window.open(searchUrl(q)); break; } toast('定位中…'); navigator.geolocation.getCurrentPosition(p => window.open(searchUrl(q, [p.coords.latitude, p.coords.longitude], 15), '_blank'), () => window.open(searchUrl(q), '_blank'), { timeout: 6000 }); break; }
    case 'addexp': openModal(addExpModal({ title: b.dataset.title || '' })); break;
    case 'quick': openModal(addExpModal({ title: b.dataset.title, cat: b.dataset.cat })); break;
    case 'addhotel': { const H = T.HOTEL; const rows = [['住宿 6 晚（雙床/雙人 含早餐）', H.perPersonPrice.twinBf, T.PEOPLE.filter(p => p.breakfast && p.room !== 1).map(p => p.id)], ['住宿 6 晚（不含早餐）', H.perPersonPrice.twinRoomOnly, T.PEOPLE.filter(p => !p.breakfast).map(p => p.id)], ['住宿 6 晚（單人房 含早餐）', H.perPersonPrice.singleBf, ['ysj']]];
      const payer = state.me || 'gkz'; for (const [title, per, ids] of rows) { const ex = { id: uid(), ts: Date.now(), title, amount: per * ids.length, currency: 'JPY', payer, cat: '🏨 住宿', date: '2026-10-13', split: ids, rate: rate(), by: state.me }; if (fbReady) await fref('expenses').child(ex.id).set(ex); else state.expenses.push(ex); }
      save(); state.tab = 'money'; render(); toast('已加入 3 筆住宿費（付款人＝' + pname(payer) + '，可再編輯）'); break; }
    case 'editexp': { const ex = state.expenses.find(x => x.id === id); if (ex) openModal(addExpModal(ex)); break; }
    case 'delexp': if (confirm('刪除這筆？')) { if (fbReady) await fref('expenses').child(id).remove(); else { state.expenses = state.expenses.filter(x => x.id !== id); save(); } render(); } break;
    case 'copyexp': { const txt = state.expenses.map(e => `${e.date} ${e.title} ${e.currency === 'TWD' ? 'NT$' : '¥'}${e.amount} 付:${pname(e.payer)} 分:${e.split.map(pname).join('/')}`).join('\n') + '\n\n' + settle(balances()).map(s => `${pname(s.from)} → ${pname(s.to)} ${fmtJPY(s.v)}`).join('\n'); try { await navigator.clipboard.writeText(txt); toast('已複製，可貼到 LINE'); } catch { prompt('複製以下文字', txt); } break; }
    case 'chatmode': state.chatMode = id; save(); render(); break;
    case 'send': { const el = $('#chatIn'); await sendMsg(el.value); el.value = ''; break; }
    case 'quickmsg': { if (!me()) { openMe(); break; } const el = $('#chatIn'); el.value = (el.value ? el.value + ' ' : '') + b.dataset.t; el.focus(); break; }
    case 'sendloc': { if (!me()) { openMe(); break; } if (!navigator.geolocation) { toast('這台裝置不支援定位'); break; } toast('定位中…'); navigator.geolocation.getCurrentPosition(p => sendMsg(`📍 我在這裡：https://maps.google.com/?q=${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`), () => toast('定位失敗，請允許位置權限'), { timeout: 8000 }); break; }
    case 'ask': closeModal(); state.tab = 'chat'; state.chatMode = 'ai'; save(); render(); askAI(b.dataset.q); break;
    case 'askfill': { const el = $('#aiIn'); el.value = b.dataset.t; el.focus(); break; }
    case 'ai-send': { const el = $('#aiIn'); const q = el.value; el.value = ''; askAI(q); break; }
    case 'ai-clear': if (confirm('清除 AI 對話？')) { state.aiHistory = []; save(); render(); } break;
    case 'aiset': openModal(aiSettingsModal()); break;
    case 'aitest': { toast('測試中…'); try { const fk = $('#aiFamily'); const pw = (fk ? fk.value.trim() : '') || state.settings.familyKey || CFG.FAMILY_PASSWORD; const r = await fetch(CFG.AI_PROXY_URL.replace(/\/$/, ''), { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-family-key': pw }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: '回覆：OK' }], max_tokens: 3 }) }); const t = await r.text(); let m = ''; try { m = JSON.parse(t).error?.message || ''; } catch {} toast(r.ok ? '✅ 連線成功，AI 可用' : `❌ ${r.status} ${m || (r.status === 401 ? '家族密碼錯誤' : '')}`); } catch (e) { toast('❌ 連不到中繼站：' + e.message); } break; }
    case 'ck': { const key = state.me || '_anon'; state.checks[key] = state.checks[key] || {}; if (b.checked) state.checks[key][b.dataset.k] = true; else delete state.checks[key][b.dataset.k]; save(); b.closest('.ck').classList.toggle('done', b.checked); break; }
    case 'ckadd': { const el = $('#ckNew'); const v = el.value.trim(); if (!v) break; state.customChecks.push(v); save(); render(); break; }
    case 'export': { const data = JSON.stringify({ expenses: state.expenses, messages: state.messages, checks: state.checks, customChecks: state.customChecks }, null, 1); try { await navigator.clipboard.writeText(data); toast('已複製 JSON 到剪貼簿'); } catch { prompt('資料', data); } break; }
    case 'reload': { if (navigator.serviceWorker) { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); } location.reload(true); break; }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'themeSel') { const v = e.target.value; LS.set('theme', v); applyTheme(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'qJPY') { const v = parseFloat(e.target.value) || 0; $('#qTWD').textContent = fmtTWD(v * rate()); }
  if (e.target.id === 'qTWDin') { const v = parseFloat(e.target.value) || 0; $('#qJPYout').textContent = fmtJPY(v / rate()); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && (e.target.id === 'chatIn' || e.target.id === 'aiIn')) { e.preventDefault(); document.querySelector(e.target.id === 'chatIn' ? '[data-act=send]' : '[data-act=ai-send]').click(); }
  if (e.key === 'Escape') closeModal();
});
$('#btnMe').addEventListener('click', openMe);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function applyTheme() { const v = LS.get('theme', ''); if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; const s = $('#themeSel'); if (s) s.value = v; }

/* ===== 啟動 ===== */
{ try { const q = new URLSearchParams(location.search).get('me'); if (q && person(q)) { state.me = q; save(); history.replaceState(null, '', location.pathname + location.hash); } } catch {}
  const h=(location.hash||'').replace('#',''); const [ht,hs]=h.split('/'); if(['home','guide','money','chat','more'].includes(ht)){ state.tab=ht; if(ht==='guide'&&hs) state.guideSec=hs; if(ht==='chat'&&hs) state.chatMode=hs; if(ht==='home'&&hs) state.day=hs; } }
applyTheme(); render();
if (!state.me) setTimeout(openMe, 600);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
