/* ============================================================================
   きょうのよてい — app.js
   HTML / CSS / JavaScript + Firebase Firestore 版。
   機能ごとにセクション分けし、コメントを付けています。
   ============================================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs,
  addDoc, updateDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============================================================================
   1. Firebase 初期化
   ※ ご自身の Firebase プロジェクトの設定値に書き換えてください。
   Firebaseコンソール → プロジェクトの設定 → マイアプリ から取得できます。
   ============================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyDBj4SmdltBms4tNnoagrz8U3WhC0upq4c",
  authDomain: "mychs-dayplans0x0x.firebaseapp.com",
  projectId: "mychs-dayplans0x0x",
  storageBucket: "mychs-dayplans0x0x.firebasestorage.app",
  messagingSenderId: "452128702920",
  appId: "1:452128702920:web:4624da7a3c9cf742e280fd"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

/* ============================================================================
   2. デザイントークン・定数
   ============================================================================ */
const CATEGORY_LABEL = { do: "やること", want: "やりたいこと", challenge: "チャレンジ" };
const CATEGORY_COLOR_VAR = { do: "var(--do-color)", want: "var(--want-color)", challenge: "var(--challenge-color)" };

const STAMPS = ["⭐️", "🌈", "🍀", "🐣", "🎈", "🍓", "🐬", "🌻", "🦋", "🍩"];

/* ============================================================================
   2-1. 効果音（Web Audio APIで生成。音声ファイルは不要）
   チェックON＝シャキン（剣を抜く音）／チェックOFF＝カサッ（紙が擦れる音）／
   コンプリート＝ファンファーレ
   ============================================================================ */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function playTone(freq, startTime, duration, type, gainValue) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}
function playNoiseBurst(startTime, duration, filterType, filterFreq, gainValue) {
  const ctx = getAudioCtx();
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(startTime);
}
// チェックON：「シャキン」（高音の下降スイープ＋金属的なノイズ）
function playCheckOnSound() {
  try {
    const t = getAudioCtx().currentTime;
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(2000, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.13);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t); osc.stop(t + 0.16);
    playNoiseBurst(t, 0.07, "highpass", 3500, 0.07);
  } catch (e) { /* Web Audio非対応環境では無音でスキップ */ }
}
// チェックOFF：「カサッ」（紙が擦れるような短いノイズ）
function playCheckOffSound() {
  try {
    const t = getAudioCtx().currentTime;
    playNoiseBurst(t, 0.11, "bandpass", 1200, 0.11);
  } catch (e) { /* noop */ }
}
// コンプリート：レベルアップ風ファンファーレ（上昇アルペジオ）
function playCompleteFanfare() {
  try {
    const t = getAudioCtx().currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => playTone(f, t + i * 0.1, 0.3, "square", 0.13));
  } catch (e) { /* noop */ }
}

const DEFAULT_SETTINGS = {
  furiganaMode: "grade",   // always | grade | none
  clockMode: "both",       // analog | digital | both
  challengeEnabled: true,
  passcode: "0000",
  childGrade: 1,
  cheerMessages: [
    "今日もよくがんばったね",
    "今日はいっぱい遊ぼう♪",
    "その調子、その調子！",
    "えらい！じぶんのペースでOK",
    "また明日もよろしくね",
  ],
};

const DEFAULT_TEMPLATES = [
  { name: "はみがき", furigana: "はみがき", maxGrade: 1, category: "do", groups: ["よく使う"], dailyFlag: true, defaultStart: "", defaultEnd: "", order: 1 },
  { name: "きがえ", furigana: "きがえ", maxGrade: 1, category: "do", groups: ["よく使う"], dailyFlag: true, defaultStart: "", defaultEnd: "", order: 2 },
  { name: "しゅくだい", furigana: "しゅくだい", maxGrade: 3, category: "do", groups: ["よく使う"], dailyFlag: false, defaultStart: "", defaultEnd: "", order: 3 },
  { name: "本を読む", furigana: "ほんをよむ", maxGrade: 3, category: "want", groups: ["よく使う"], dailyFlag: false, defaultStart: "", defaultEnd: "", order: 4 },
  { name: "おてつだい", furigana: "おてつだい", maxGrade: 4, category: "challenge", groups: ["チャレンジ"], dailyFlag: false, defaultStart: "", defaultEnd: "", order: 5 },
];
// 古いデータ（group: 文字列 単数）との互換用。groups配列があればそれを使い、なければgroup単数から補う
function templateGroups(t) {
  if (Array.isArray(t.groups) && t.groups.length) return t.groups;
  if (t.group) return [t.group];
  return [];
}
function allGroupNames() {
  const set = new Set();
  state.templates.forEach((t) => templateGroups(t).forEach((g) => { if (g) set.add(g); }));
  const list = [...set];
  const idx = list.indexOf("よく使う");
  if (idx > 0) { list.splice(idx, 1); list.unshift("よく使う"); }
  return list;
}

/* ============================================================================
   3. ユーティリティ関数
   ============================================================================ */
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = (n) => String(n).padStart(2, "0");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 朝4時を1日の切り替わりとする「アプリ上の今日」の日付文字列 (YYYY-MM-DD)
function getAppDate(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftDate(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function formatDateJP(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${m}月${d}日（${days[dt.getDay()]}）`;
}
// YYYY-MM-DD 形式は文字列比較でそのまま前後判定できる
function dateIsToday(d) { return d === state.today; }
function dateIsPast(d) { return d < state.today; }
function dateIsFuture(d) { return d > state.today; }

function emptyDaily(date) {
  return {
    date, created: false, items: [], mood: null, note: "",
    stamp: null, completeShown: false,               // 「やること」完了のスタンプ
    challengeStamp: null, challengeCompleteShown: false, // 「チャレンジ」完了のスタンプ（初回のみ）
    parentNote: "", parentChecked: false,             // おかあさんチェック
  };
}

// テンプレート1件 → デイリープラン項目1件 へコピー（テンプレとデイリーは以後は独立データ）
function templateToItem(t, orderOverride) {
  return {
    id: uid(), name: t.name, furigana: t.furigana || "", maxGrade: t.maxGrade || 6,
    category: t.category, start: t.defaultStart || "", end: t.defaultEnd || "",
    memo: "", checked: false, order: orderOverride ?? 0,
  };
}

/* ============================================================================
   4. 合言葉（パスワード）認証
   ここで認証されるまでは他の画面は一切表示しません。
   認証OKの合言葉はそのまま Firestore のパス（plans/{合言葉}/...）に使うので、
   同じ合言葉を入れた端末同士だけでデータが同期されます。
   ============================================================================ */
const AUTH_STORAGE_KEY = "kyounoyotei_auth_password";

// 正解の合言葉は平文でソースに残さず、SHA-256ハッシュで比較します（ブラウザ標準のWeb Crypto APIを使用）。
// 合言葉を決めたら、ブラウザの開発者コンソールで下のコードを実行し、
// 出てきた文字列を CORRECT_PASSWORD_HASH に貼り付けてください。
//   async function h(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}
//   h("決めた合言葉").then(console.log)
// ※ crypto.subtle は https:// （または localhost）でのみ使えます。
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const CORRECT_PASSWORD_HASH = "bd984cda4f8f9f5cfdf1774598e28f10ef0f3249bd0e70a1a498ce5b88820267"; // ← 必ず書き換えてください

let SPACE_KEY = null; // 認証後にセットされる合言葉（Firestoreパスに使用）

function showPasswordScreen(withError) {
  document.getElementById("loading-screen").classList.add("hidden");
  document.getElementById("password-screen").classList.remove("hidden");
  document.getElementById("password-error").classList.toggle("hidden", !withError);
  document.getElementById("password-input").focus();
}
function hidePasswordScreen() {
  document.getElementById("password-screen").classList.add("hidden");
}

async function submitPassword() {
  const raw = document.getElementById("password-input").value.trim();
  if (!raw) return;
  if ((await sha256Hex(raw)) !== CORRECT_PASSWORD_HASH) { showPasswordScreen(true); return; }
  SPACE_KEY = raw;
  localStorage.setItem(AUTH_STORAGE_KEY, raw);
  hidePasswordScreen();
  await boot();
}

document.getElementById("password-submit-btn").addEventListener("click", submitPassword);
document.getElementById("password-input").addEventListener("keydown", (e) => { if (e.key === "Enter") submitPassword(); });

async function initAuth() {
  const saved = localStorage.getItem(AUTH_STORAGE_KEY);
  if (saved && (await sha256Hex(saved)) === CORRECT_PASSWORD_HASH) {
    SPACE_KEY = saved;
    await boot();
  } else {
    if (saved) localStorage.removeItem(AUTH_STORAGE_KEY); // 改ざん・不一致は破棄して聞き直す
    showPasswordScreen(false);
  }
}

/* ============================================================================
   5. Firestore データ層
   すべて plans/{合言葉}/... 配下に保存する（合言葉が異なれば別データ）
   ============================================================================ */
const templatesCol = () => collection(db, "plans", SPACE_KEY, "templates");
const settingsDocRef = () => doc(db, "plans", SPACE_KEY, "settings", "app");
const dailyPlansCol = () => collection(db, "plans", SPACE_KEY, "dailyPlans");
const dailyPlanDocRef = (dateStr) => doc(db, "plans", SPACE_KEY, "dailyPlans", dateStr);

async function fsGetSettings() {
  const snap = await getDoc(settingsDocRef());
  if (snap.exists()) return { ...DEFAULT_SETTINGS, ...snap.data() };
  await setDoc(settingsDocRef(), DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}
async function fsSaveSettings(settings) {
  await setDoc(settingsDocRef(), settings, { merge: true });
}

async function fsGetTemplates() {
  const snap = await getDocs(templatesCol());
  if (snap.empty) {
    const created = [];
    for (const t of DEFAULT_TEMPLATES) {
      const ref = await addDoc(templatesCol(), t);
      created.push({ id: ref.id, ...t });
    }
    return created;
  }
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function fsAddTemplate(template) {
  const ref = await addDoc(templatesCol(), template);
  return ref.id;
}
async function fsUpdateTemplate(id, patch) {
  await updateDoc(doc(db, "plans", SPACE_KEY, "templates", id), patch);
}
async function fsDeleteTemplate(id) {
  await deleteDoc(doc(db, "plans", SPACE_KEY, "templates", id));
}

async function fsGetDailyPlan(dateStr) {
  const snap = await getDoc(dailyPlanDocRef(dateStr));
  return snap.exists() ? snap.data() : null;
}
async function fsSaveDailyPlan(dateStr, plan) {
  await setDoc(dailyPlanDocRef(dateStr), plan, { merge: false });
}
async function fsGetAllDailyPlans() {
  const snap = await getDocs(dailyPlansCol());
  const out = {};
  snap.forEach((d) => { out[d.id] = d.data(); });
  return out;
}

/* ============================================================================
   6. アプリ状態（メモリ上のキャッシュ。Firestoreへは各アクションで書き込む）
   ============================================================================ */
const state = {
  templates: [],
  settings: { ...DEFAULT_SETTINGS },
  today: getAppDate(),     // 「アプリ上の今日」（朝4時切り替え）
  viewDate: getAppDate(),  // 今、画面に表示している日付
  daily: null,
  yesterdayItems: null,
  editMode: false,
  showSettings: false,
  settingsTab: "templates",
  parentUnlocked: false,
  dragFromId: null,
  openGroups: new Set(),   // トグルで開いているテンプレートグループ名。明示的に閉じるまで開いたまま保持
  freeAddOpen: false,      // 「＋新しく入力」フォームを表示中か
};

/* ============================================================================
   7. 描画（レンダリング）関数群
   ============================================================================ */
const appRoot = document.getElementById("app");
const loadingScreen = document.getElementById("loading-screen");

function render() {
  if (!state.daily) return;
  let html;
  if (dateIsPast(state.viewDate)) html = renderReadOnlyScreen();
  else if (!state.daily.created) html = renderCreateScreen();
  else html = renderHomeScreen();
  appRoot.innerHTML = html;
  renderClock();
  renderSettingsPanel();
}

/* ---- 7-1. 日付ナビゲーション（＜ 日付 ＞） ---- */
function renderDateNav() {
  const badge = dateIsFuture(state.viewDate) ? `<span class="date-badge future">未来</span>`
    : dateIsPast(state.viewDate) ? `<span class="date-badge past">過去</span>` : "";
  return `
    <div class="date-nav">
      <button class="date-nav-btn" data-action="prev-date" aria-label="前の日">＜</button>
      <span class="home-date">${formatDateJP(state.viewDate)}${badge}</span>
      <button class="date-nav-btn" data-action="next-date" aria-label="次の日">＞</button>
    </div>`;
}

/* ---- 7-2. 時計（右カラムに表示。文字盤つき。列幅の90%まで拡大表示） ---- */
function renderClock() {
  const els = document.querySelectorAll("[data-clock]");
  if (!els.length) return;
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const hDeg = (h % 12) * 30 + m * 0.5;
  const mDeg = m * 6;
  const mode = state.settings.clockMode;
  let html = "";
  if (mode === "analog" || mode === "both") {
    const numbers = [...Array(12)].map((_, i) => {
      const num = i === 0 ? 12 : i;
      const angle = (i * 30 - 90) * (Math.PI / 180);
      const radius = 37; // %
      const x = 50 + radius * Math.cos(angle);
      const y = 50 + radius * Math.sin(angle);
      return `<div class="clock-number" style="left:${x}%; top:${y}%;">${num}</div>`;
    }).join("");
    html += `
      <div class="clock-analog">
        ${[...Array(12)].map((_, i) => `<div class="clock-tick ${i % 3 === 0 ? "major" : ""}" style="transform:rotate(${i * 30}deg) translateX(-50%);"></div>`).join("")}
        ${numbers}
        <div class="clock-hand hour" style="transform:translate(-50%,-100%) rotate(${hDeg}deg);"></div>
        <div class="clock-hand minute" style="transform:translate(-50%,-100%) rotate(${mDeg}deg);"></div>
        <div class="clock-center"></div>
      </div>`;
  }
  if (mode === "digital" || mode === "both") {
    html += `<div class="clock-digital">${pad(h)}:${pad(m)}</div>`;
  }
  els.forEach((el) => { el.innerHTML = `<div class="clock-wrap">${html}</div>`; });
}
setInterval(renderClock, 10000);

/* ---- 7-3. 項目カード
   interactive=false のときはチェック操作もできない完全な読み取り専用表示（過去ログ用） ---- */
function renderItemCard(item, editMode, draggable, interactive = true) {
  const color = CATEGORY_COLOR_VAR[item.category];
  const timeBadge = item.start
    ? `<span class="item-time-badge">${esc(item.start)}${item.end ? `〜${esc(item.end)}` : ""}</span>` : "";
  const showFurigana =
    (state.settings.furiganaMode === "always" && item.furigana) ||
    (state.settings.furiganaMode === "grade" && item.furigana && state.settings.childGrade <= (item.maxGrade || 6));
  const nameHtml = showFurigana
    ? `<ruby>${esc(item.name)}<rt>${esc(item.furigana)}</rt></ruby>`
    : esc(item.name);
  const editRow = editMode ? `
    <div class="item-edit-row">
      <div class="time-field">
        <span class="time-field-label">開始</span>
        <input type="time" value="${esc(item.start || "")}" data-item-field="start" data-item-id="${item.id}" />
      </div>
      <div class="time-field">
        <span class="time-field-label">終了（任意）</span>
        <input type="time" value="${esc(item.end || "")}" data-item-field="end" data-item-id="${item.id}" />
      </div>
      <input type="text" placeholder="メモ" value="${esc(item.memo || "")}" data-item-field="memo" data-item-id="${item.id}" />
    </div>` : "";
  const deleteBtn = editMode
    ? `<button class="item-delete-btn" data-action="delete-item" data-item-id="${item.id}">✕</button>` : "";
  const checkAction = interactive ? `data-action="toggle-item"` : "";

  return `
    <div class="item-card" style="border-left-color:${color};" data-item-id="${item.id}" ${draggable ? 'draggable="true"' : ""}>
      <button class="item-check" ${checkAction} data-item-id="${item.id}"
        style="background:${item.checked ? color : "var(--surface-soft)"}; border-color:${color}; ${interactive ? "" : "cursor:default;"}">
        ${item.checked ? "✓" : ""}
      </button>
      <div class="item-body">
        <div class="item-name-row">
          <span class="item-name ${item.checked ? "checked" : ""}">${nameHtml}</span>
          ${item.checked ? `<span class="done-badge">できた！</span>` : ""}
          ${timeBadge}
        </div>
        ${item.memo ? `<div class="item-memo">${esc(item.memo)}</div>` : ""}
        ${editRow}
      </div>
      ${deleteBtn}
    </div>`;
}

/* ---- 7-4. テンプレート入力エリア（トグル式ボタン群 + 自由入力） ---- */
function renderTemplatePicker() {
  if (state.freeAddOpen) {
    return `<div class="input-area input-area-form">${renderFreeAddForm()}</div>`;
  }
  const groups = allGroupNames();

  const groupHtml = groups.map((g) => {
    const isOpen = state.openGroups.has(g);
    return `
    <div class="template-group">
      <button class="template-group-header" data-action="toggle-group" data-group="${esc(g)}">
        <span>${esc(g)}</span><span data-group-arrow="${esc(g)}">${isOpen ? "▴" : "▾"}</span>
      </button>
      <div class="template-chip-row ${isOpen ? "" : "hidden"}" data-group-body="${esc(g)}">
        ${state.templates.filter((t) => templateGroups(t).includes(g)).sort((a, b) => a.order - b.order).map((t) => `
          <button class="template-chip" style="border-color:${CATEGORY_COLOR_VAR[t.category]};" data-action="add-template" data-template-id="${t.id}">
            ${esc(t.name)}
          </button>`).join("")}
      </div>
    </div>`;
  }).join("");

  return `
    <div class="input-area">
      <div class="template-picker-groups">${groupHtml}</div>
      <button class="template-picker-add-btn" data-action="open-free-add">＋<br>新しく<br>入力</button>
    </div>`;
}

function renderFreeAddForm() {
  const catBtns = ["do", "want", "challenge"]
    .filter((c) => c !== "challenge" || state.settings.challengeEnabled)
    .map((c) => `<button class="free-cat-btn" data-action="pick-free-cat" data-cat="${c}" style="background:${CATEGORY_COLOR_VAR[c]}; opacity:.35;">${CATEGORY_LABEL[c]}</button>`)
    .join("");
  return `
    <div class="free-add-form">
      <input type="text" id="free-add-name" placeholder="やること・やりたいこと" />
      <div class="free-cat-row" id="free-cat-row">${catBtns}</div>
      <div class="free-add-actions">
        <button class="free-cancel-btn" data-action="close-free-add">やめる</button>
        <button class="free-confirm-btn" data-action="confirm-free-add">ついか</button>
      </div>
    </div>`;
}
let freeAddCategory = "do";

/* ---- 7-5. 「予定を作る」画面（今日／未来日どちらも使う） ---- */
let createDraftItems = null; // この画面内だけで使う一時的な下書き

function renderCreateScreen() {
  if (createDraftItems === null) {
    createDraftItems = state.templates.filter((t) => t.dailyFlag).map((t) => templateToItem(t));
  }
  const sorted = [...createDraftItems].sort((a, b) => (a.start || "99:99").localeCompare(b.start || "99:99"));
  const listHtml = sorted.length
    ? sorted.map((it) => renderItemCard(it, true, false)).join("")
    : `<div class="empty-hint">まだ予定がありません。下から追加してね</div>`;
  const copyBtn = state.yesterdayItems && state.yesterdayItems.length
    ? `<button class="copy-yesterday-btn" data-action="copy-yesterday">前日の予定をコピーする</button>` : "";
  const titleLabel = dateIsToday(state.viewDate) ? "今日の予定を作る" : `${formatDateJP(state.viewDate)}の予定を作る`;

  return `
    <div class="create-screen">
      <div class="create-header">
        ${renderDateNav()}
        <div class="subtitle" style="margin-top:10px;">${titleLabel}</div>
      </div>
      <div class="create-list" id="create-list">${listHtml}${copyBtn}</div>
      ${renderTemplatePicker()}
      <div class="create-confirm-bar">
        <button class="confirm-create-btn" data-action="confirm-create">この予定ではじめる</button>
      </div>
    </div>`;
}

/* ---- 7-6. ホーム画面（閲覧／編集モード）：2カラム表示
   左カラム = やること・時間設定がある項目
   右カラム = 時計（大きく表示）+ チャレンジ・やりたいこと
---- */
function orderAllItems(visibleItems) {
  const timed = visibleItems.filter((it) => it.start).sort((a, b) => a.start.localeCompare(b.start));
  const untimedDo = visibleItems.filter((it) => !it.start && it.category === "do").sort((a, b) => a.order - b.order);
  const untimedWant = visibleItems.filter((it) => !it.start && it.category === "want").sort((a, b) => a.order - b.order);
  const untimedChallenge = visibleItems.filter((it) => !it.start && it.category === "challenge").sort((a, b) => a.order - b.order);
  return { timed, untimedDo, untimedWant, untimedChallenge };
}

// おかあさんチェック（一言メッセージ／確認スタンプ）。おうちの人パスコードで保護する
function renderMomCheckArea() {
  const d = state.daily;
  const hasNote = !!(d.parentNote && d.parentNote.trim());
  return `
    <div class="mom-check-area">
      <div class="mom-check-title">おかあさんチェック</div>
      <div class="mom-note ${hasNote ? "" : "mom-note-empty"}">${hasNote ? esc(d.parentNote) : "ひとことメッセージ未設定"}</div>
      <div class="mom-check-actions">
        <button class="mom-edit-btn" data-action="edit-mom-note">✏️ 編集</button>
        <button class="mom-check-btn ${d.parentChecked ? "checked" : ""}" data-action="toggle-mom-check">見ました💮</button>
      </div>
    </div>`;
}

function renderHomeScreen() {
  const doItems = state.daily.items.filter((it) => it.category === "do");
  const challengeUnlocked = state.settings.challengeEnabled && doItems.length > 0 && doItems.every((it) => it.checked);
  // 編集モード中はチャレンジ項目も常に見えるようにする（閲覧モードのみ「やること」完了まで隠す）
  const visibleItems = state.editMode
    ? state.daily.items
    : state.daily.items.filter((it) => it.category !== "challenge" || challengeUnlocked);
  const { timed, untimedDo, untimedWant, untimedChallenge } = orderAllItems(visibleItems);

  const challengeHint = !state.editMode && state.settings.challengeEnabled && !challengeUnlocked && state.daily.items.some((it) => it.category === "challenge")
    ? `<div class="challenge-hint">「やること」が終わったら チャレンジ が出てくるよ</div>` : "";

  // 表示順：時間指定 → やること → やりたいこと → チャレンジ
  const cardsHtml = timed.map((it) => renderItemCard(it, state.editMode, false)).join("")
    + untimedDo.map((it) => renderItemCard(it, state.editMode, state.editMode)).join("")
    + untimedWant.map((it) => renderItemCard(it, state.editMode, state.editMode)).join("")
    + untimedChallenge.map((it) => renderItemCard(it, state.editMode, state.editMode)).join("")
    + challengeHint;
  const totalCount = timed.length + untimedDo.length + untimedWant.length + untimedChallenge.length;
  const listHtml = (totalCount === 0 && !challengeHint) ? `<div class="empty-hint">予定なし</div>` : cardsHtml;

  const bottom = state.editMode
    ? `${renderTemplatePicker()}<div class="bottom-bar"><button class="edit-done-btn" data-action="finish-edit">編集をおわる</button></div>`
    : `<div class="bottom-bar"><button class="edit-toggle-btn" data-action="start-edit">✎ 編集する</button></div>`;

  return `
    <div class="home-header">
      <div>
        ${renderDateNav()}
        <div class="home-title">きょうのよてい</div>
        ${state.daily.stamp ? `<div class="home-stamp">${state.daily.stamp}</div>` : ""}
        ${state.daily.challengeStamp ? `<div class="home-stamp">${state.daily.challengeStamp}</div>` : ""}
      </div>
    </div>
    <div class="item-list ${state.editMode ? "editing" : ""}">
      <div class="home-col-left">
        ${listHtml}
      </div>
      <div class="home-col-right">
        <div data-clock></div>
        ${renderMomCheckArea()}
      </div>
    </div>
    ${bottom}`;
}

/* ---- 7-7. 過去ログ（読み取り専用） ---- */
function renderReadOnlyScreen() {
  if (!state.daily.created) {
    return `
      <div class="home-header"><div>${renderDateNav()}<div class="home-title">きろく</div></div></div>
      <div class="item-list"><div class="home-col-left"><div class="empty-hint">この日の記録はありません</div></div></div>`;
  }
  const doItems = state.daily.items.filter((it) => it.category === "do");
  const challengeUnlocked = state.settings.challengeEnabled && doItems.length > 0 && doItems.every((it) => it.checked);
  const visibleItems = state.daily.items.filter((it) => it.category !== "challenge" || challengeUnlocked);
  const { timed, untimedDo, untimedWant, untimedChallenge } = orderAllItems(visibleItems);
  const cardsHtml = timed.concat(untimedDo, untimedWant, untimedChallenge).map((it) => renderItemCard(it, false, false, false)).join("");
  const listHtml = cardsHtml || `<div class="empty-hint">記録なし</div>`;

  return `
    <div class="home-header">
      <div>
        ${renderDateNav()}
        <div class="home-title">きろく</div>
        ${state.daily.stamp ? `<div class="home-stamp">${state.daily.stamp}</div>` : ""}
        ${state.daily.challengeStamp ? `<div class="home-stamp">${state.daily.challengeStamp}</div>` : ""}
      </div>
    </div>
    <div class="readonly-hint">過去の記録です（編集はできません）</div>
    <div class="item-list">
      <div class="home-col-left">
        ${listHtml}
      </div>
    </div>`;
}

/* ---- 7-8. Complete演出 / スタンプ選択モーダル ---- */
let pendingCompletionKind = null; // "do" | "challenge"

function showConfettiAndComplete(kind) {
  pendingCompletionKind = kind;
  playCompleteFanfare();
  const layer = document.getElementById("confetti-layer");
  layer.classList.remove("hidden");
  layer.innerHTML = "";
  const colors = ["var(--accent)", "var(--do-color)", "var(--want-color)", "#7EC8E3", "#FFFFFF"];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    const size = 6 + Math.random() * 8;
    p.style.left = `${Math.random() * 100}%`;
    p.style.width = `${size}px`;
    p.style.height = `${size * 0.6}px`;
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
  }
  setTimeout(() => {
    layer.classList.add("hidden");
    layer.innerHTML = "";
    openStampModal(kind);
  }, 1800);
}

function openStampModal(kind) {
  const messages = state.settings.cheerMessages;
  const msg = messages.length ? messages[Math.floor(Math.random() * messages.length)] : "今日もよくがんばったね";
  document.getElementById("cheer-message").textContent = kind === "challenge" ? `チャレンジクリア！ ${msg}` : msg;
  const grid = document.getElementById("stamp-grid");
  grid.innerHTML = STAMPS.map((s) => `<button class="stamp-option" data-action="pick-stamp" data-stamp="${s}">${s}</button>`).join("");
  document.getElementById("stamp-modal").classList.remove("hidden");
}

// スタンプモーダルは #app の外にある独立した要素なので、専用のリスナーを一度だけ登録する
// （以前はここが appRoot にしか付いていなかったため、選択してもモーダルが閉じないバグがあった）
document.getElementById("stamp-modal").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action='pick-stamp']");
  if (!btn) return;
  if (pendingCompletionKind === "challenge") {
    state.daily.challengeStamp = btn.dataset.stamp;
    state.daily.challengeCompleteShown = true;
  } else {
    state.daily.stamp = btn.dataset.stamp;
    state.daily.completeShown = true;
  }
  pendingCompletionKind = null;
  await fsSaveDailyPlan(state.viewDate, state.daily);
  document.getElementById("stamp-modal").classList.add("hidden");
  render();
  checkCompletion(); // 同時にもう一方（チャレンジなど）も完了していれば続けて表示する
});


/* ---- 7-9. 設定画面（テンプレート／おうちの人設定） ---- */
function renderSettingsPanel() {
  const panel = document.getElementById("settings-screen");
  panel.classList.toggle("hidden", !state.showSettings);
  if (!state.showSettings) return;

  document.getElementById("tab-templates-btn").classList.toggle("active", state.settingsTab === "templates");
  document.getElementById("tab-parent-btn").classList.toggle("active", state.settingsTab === "parent");

  const body = document.getElementById("settings-body");
  body.innerHTML = state.settingsTab === "templates" ? renderTemplateSettings() : renderParentSettings();
}

function renderTemplateSettings() {
  const cards = [...state.templates].sort((a, b) => a.order - b.order).map((t) => `
    <div class="template-edit-card" data-template-id="${t.id}">
      <div class="template-edit-row">
        <input type="text" value="${esc(t.name)}" data-tfield="name" placeholder="項目名" />
        <button class="template-edit-remove" data-action="remove-template" data-template-id="${t.id}">✕</button>
      </div>
      <div class="template-edit-row two-col">
        <input type="text" value="${esc(t.furigana || "")}" data-tfield="furigana" placeholder="読み仮名" />
        <select data-tfield="maxGrade">
          ${[1, 2, 3, 4, 5, 6].map((g) => `<option value="${g}" ${t.maxGrade === g ? "selected" : ""}>${g}年生まで表示</option>`).join("")}
        </select>
      </div>
      <div class="template-edit-row two-col">
        <input type="text" value="${esc(templateGroups(t).join("、"))}" data-tfield="groups" placeholder="グループ（複数は「、」区切り）" />
        <input type="number" value="${t.order}" data-tfield="order" placeholder="表示順" />
      </div>
      <div class="template-cat-row">
        ${["do", "want", "challenge"].map((c) => `
          <button class="template-cat-btn ${t.category === c ? "active" : ""}" data-action="set-template-cat" data-template-id="${t.id}" data-cat="${c}"
            style="${t.category === c ? `background:${CATEGORY_COLOR_VAR[c]};` : ""}">${CATEGORY_LABEL[c]}</button>`).join("")}
        <label class="template-daily-label">
          <input type="checkbox" data-tfield="dailyFlag" ${t.dailyFlag ? "checked" : ""} /> 毎日追加
        </label>
      </div>
    </div>`).join("");

  return `<div class="template-grid">${cards}</div><button class="add-template-btn" data-action="add-template-def">＋ テンプレートを追加</button>`;
}

function renderParentSettings() {
  if (!state.parentUnlocked) {
    return `
      <div class="parent-lock">
        <div class="lock-icon">🔒</div>
        <div class="lock-hint">おうちの人用のパスコードを入力してください</div>
        <input type="password" inputmode="numeric" id="passcode-input" />
        <div><button class="unlock-btn" data-action="unlock-parent">開ける</button></div>
      </div>`;
  }
  const s = state.settings;
  return `
    <div class="parent-section">
      <div class="parent-section-title">お子さんの学年</div>
      <select id="setting-childGrade">
        ${[1, 2, 3, 4, 5, 6].map((g) => `<option value="${g}" ${s.childGrade === g ? "selected" : ""}>${g}年生</option>`).join("")}
      </select>
    </div>
    <div class="parent-section">
      <div class="parent-section-title">チャレンジ機能</div>
      <label class="parent-checkbox-row"><input type="checkbox" id="setting-challengeEnabled" ${s.challengeEnabled ? "checked" : ""} /> 有効にする</label>
    </div>
    <div class="parent-section">
      <div class="parent-section-title">読み仮名の表示</div>
      <div class="parent-option-row">
        ${[["always", "常に表示"], ["grade", "学年に合わせる"], ["none", "表示しない"]].map(([v, l]) => `
          <button class="parent-option-btn ${s.furiganaMode === v ? "active" : ""}" data-action="set-furigana-mode" data-value="${v}">${l}</button>`).join("")}
      </div>
    </div>
    <div class="parent-section">
      <div class="parent-section-title">時計の表示</div>
      <div class="parent-option-row">
        ${[["analog", "アナログのみ"], ["digital", "デジタルのみ"], ["both", "両方"]].map(([v, l]) => `
          <button class="parent-option-btn ${s.clockMode === v ? "active" : ""}" data-action="set-clock-mode" data-value="${v}">${l}</button>`).join("")}
      </div>
    </div>
    <div class="parent-section">
      <div class="parent-section-title">応援メッセージ（1行＝1件）</div>
      <textarea id="setting-cheerMessages" rows="6">${esc(s.cheerMessages.join("\n"))}</textarea>
      <button class="save-msg-btn" data-action="save-cheer-messages">メッセージを保存</button>
    </div>
    <div class="parent-section">
      <div class="parent-section-title">パスコード変更</div>
      <input type="text" id="setting-passcode" value="${esc(s.passcode)}" />
    </div>
    <div class="parent-section">
      <div class="parent-section-title">データのバックアップ</div>
      <div class="data-io-row">
        <button class="data-io-btn" data-action="export-data">JSONエクスポート</button>
        <button class="data-io-btn" data-action="import-data">JSONインポート</button>
      </div>
      <div class="data-io-hint">端末にJSONファイルとして保存／読み込みできます（インポートは現在のデータを上書きします）</div>
    </div>
    <div class="parent-section">
      <button class="logout-btn" data-action="change-space">合言葉を入力しなおす</button>
    </div>`;
}

/* ============================================================================
   8. イベントハンドラ / アクション関数
   appRoot・settings-body へのイベント登録は init() で一度だけ行う
   （毎回 render() のたびに addEventListener すると多重発火するため）
   ============================================================================ */
function currentItemsRef() {
  return state.daily.created ? state.daily.items : createDraftItems;
}
function persistDailyIfCreated() {
  if (state.daily.created) fsSaveDailyPlan(state.viewDate, state.daily);
}

async function loadViewDate(dateStr) {
  state.viewDate = dateStr;
  state.editMode = false;
  createDraftItems = null;
  const plan = await fsGetDailyPlan(dateStr);
  state.daily = plan || emptyDaily(dateStr);
  const y = await fsGetDailyPlan(shiftDate(dateStr, -1));
  state.yesterdayItems = y && y.items ? y.items : null;
  render();
}

async function onAppClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "prev-date") { await loadViewDate(shiftDate(state.viewDate, -1)); return; }
  if (action === "next-date") { await loadViewDate(shiftDate(state.viewDate, 1)); return; }

  if (action === "toggle-item") {
    const items = currentItemsRef();
    const it = items.find((x) => x.id === btn.dataset.itemId);
    if (it) {
      it.checked = !it.checked;
      if (it.checked) playCheckOnSound(); else playCheckOffSound();
    }
    persistDailyIfCreated();
    checkCompletion();
    render();
  }

  if (action === "delete-item") {
    if (state.daily.created) {
      state.daily.items = state.daily.items.filter((x) => x.id !== btn.dataset.itemId);
      persistDailyIfCreated();
    } else {
      createDraftItems = createDraftItems.filter((x) => x.id !== btn.dataset.itemId);
    }
    render();
  }

  if (action === "toggle-group") {
    const g = btn.dataset.group;
    if (state.openGroups.has(g)) state.openGroups.delete(g); else state.openGroups.add(g);
    // 全体re-renderせず該当グループだけ切り替える（入力中のフォーム等を消さないため）
    const body = document.querySelector(`[data-group-body="${CSS.escape(g)}"]`);
    const arrow = document.querySelector(`[data-group-arrow="${CSS.escape(g)}"]`);
    if (body) body.classList.toggle("hidden", !state.openGroups.has(g));
    if (arrow) arrow.textContent = state.openGroups.has(g) ? "▴" : "▾";
  }

  if (action === "add-template") {
    const t = state.templates.find((x) => x.id === btn.dataset.templateId);
    if (!t) return;
    const items = currentItemsRef();
    items.push(templateToItem(t, items.length + 1));
    persistDailyIfCreated();
    render();
  }

  if (action === "open-free-add") {
    state.freeAddOpen = true;
    freeAddCategory = "do";
    render();
    highlightFreeCat();
  }
  if (action === "close-free-add") {
    state.freeAddOpen = false;
    render();
  }
  if (action === "pick-free-cat") {
    freeAddCategory = btn.dataset.cat;
    highlightFreeCat();
  }
  if (action === "confirm-free-add") {
    const nameInput = document.getElementById("free-add-name");
    const name = nameInput.value.trim();
    if (!name) return;
    const items = currentItemsRef();
    items.push({ id: uid(), name, furigana: "", maxGrade: 6, category: freeAddCategory, start: "", end: "", memo: "", checked: false, order: items.length + 1 });
    persistDailyIfCreated();
    state.freeAddOpen = false;
    render();
  }

  if (action === "copy-yesterday") {
    createDraftItems = state.yesterdayItems.map((it) => ({ ...it, id: uid(), checked: false }));
    render();
  }

  if (action === "confirm-create") {
    const withOrder = createDraftItems.map((it, i) => ({ ...it, order: i + 1 }));
    state.daily = { ...state.daily, created: true, items: withOrder };
    await fsSaveDailyPlan(state.viewDate, state.daily);
    createDraftItems = null;
    render();
  }

  if (action === "start-edit") { state.editMode = true; render(); }
  if (action === "finish-edit") { state.editMode = false; render(); }

  if (action === "edit-mom-note") {
    const pass = prompt("おうちの人用パスコードを入力してください");
    if (pass === null) return;
    if (pass !== state.settings.passcode) { alert("パスコードが違います"); return; }
    const note = prompt("ひとことメッセージ", state.daily.parentNote || "");
    if (note === null) return;
    state.daily.parentNote = note.trim();
    persistDailyIfCreated();
    render();
  }
  if (action === "toggle-mom-check") {
    const pass = prompt("おうちの人用パスコードを入力してください");
    if (pass === null) return;
    if (pass !== state.settings.passcode) { alert("パスコードが違います"); return; }
    state.daily.parentChecked = !state.daily.parentChecked;
    persistDailyIfCreated();
    render();
  }
}

function highlightFreeCat() {
  document.querySelectorAll("#free-cat-row .free-cat-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.cat === freeAddCategory);
    b.style.opacity = b.dataset.cat === freeAddCategory ? "1" : ".35";
  });
}

function onAppInput(e) {
  const el = e.target;
  const field = el.dataset.itemField;
  if (!field) return;
  const items = currentItemsRef();
  const it = items.find((x) => x.id === el.dataset.itemId);
  if (!it) return;
  it[field] = el.value;
  persistDailyIfCreated();
}

/* ---- 8-1. 時間なし項目のドラッグ並び替え（左右カラムをまたがない） ---- */
function onDragStart(e) {
  const card = e.target.closest(".item-card[draggable='true']");
  if (!card) return;
  state.dragFromId = card.dataset.itemId;
}
function onDragOver(e) {
  const card = e.target.closest(".item-card[draggable='true']");
  if (card) e.preventDefault();
}
function itemColumnGroup(it) {
  return it.category; // do / want / challenge のブロック内でのみ並び替えられる
}
function onDrop(e) {
  const card = e.target.closest(".item-card[draggable='true']");
  if (!card || !state.dragFromId) return;
  e.preventDefault();
  const toId = card.dataset.itemId;
  if (toId === state.dragFromId) return;

  const items = state.daily.items;
  const fromItem = items.find((it) => it.id === state.dragFromId);
  const toItem = items.find((it) => it.id === toId);
  if (!fromItem || !toItem || itemColumnGroup(fromItem) !== itemColumnGroup(toItem)) { state.dragFromId = null; return; }

  const groupIds = items
    .filter((it) => !it.start && itemColumnGroup(it) === itemColumnGroup(fromItem))
    .sort((a, b) => a.order - b.order)
    .map((it) => it.id);
  const fromIdx = groupIds.indexOf(state.dragFromId);
  const toIdx = groupIds.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) { state.dragFromId = null; return; }
  const reordered = [...groupIds];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);
  reordered.forEach((id, idx) => {
    const item = items.find((it) => it.id === id);
    if (item) item.order = idx + 1;
  });
  state.dragFromId = null;
  persistDailyIfCreated();
  render();
}

/* ---- 8-2. Complete判定（今日のぶんの「やること」が全てチェックされたか） ---- */
function checkCompletion() {
  if (!state.daily.created) return;
  const isToday = dateIsToday(state.viewDate);

  // 「やること」完了判定（チェックを外して未完了に戻したらスタンプも取り消す）
  const doItems = state.daily.items.filter((it) => it.category === "do");
  const doAllChecked = doItems.length > 0 && doItems.every((it) => it.checked);
  if (doAllChecked && !state.daily.completeShown) {
    if (isToday) { showConfettiAndComplete("do"); persistDailyIfCreated(); return; }
    state.daily.completeShown = true;
    persistDailyIfCreated();
  } else if (!doAllChecked && state.daily.completeShown) {
    state.daily.completeShown = false;
    state.daily.stamp = null;
    persistDailyIfCreated();
  }

  // 「チャレンジ」完了判定（初回のみスタンプ。チェックを外したら取り消し、再度全完了でまた表示）
  if (!state.settings.challengeEnabled) return;
  const challengeItems = state.daily.items.filter((it) => it.category === "challenge");
  const challengeAllChecked = challengeItems.length > 0 && challengeItems.every((it) => it.checked);
  if (challengeAllChecked && !state.daily.challengeCompleteShown) {
    if (isToday) { showConfettiAndComplete("challenge"); persistDailyIfCreated(); return; }
    state.daily.challengeCompleteShown = true;
    persistDailyIfCreated();
  } else if (!challengeAllChecked && state.daily.challengeCompleteShown) {
    state.daily.challengeCompleteShown = false;
    state.daily.challengeStamp = null;
    persistDailyIfCreated();
  }
}

/* ---- 8-3. 設定画面のイベント ---- */
async function onSettingsClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "remove-template") {
    await fsDeleteTemplate(btn.dataset.templateId);
    state.templates = state.templates.filter((t) => t.id !== btn.dataset.templateId);
    renderSettingsPanel();
  }
  if (action === "set-template-cat") {
    const t = state.templates.find((x) => x.id === btn.dataset.templateId);
    if (!t) return;
    t.category = btn.dataset.cat;
    await fsUpdateTemplate(t.id, { category: t.category });
    renderSettingsPanel();
  }
  if (action === "add-template-def") {
    const newTemplate = {
      name: "あたらしい項目", furigana: "", maxGrade: 6, category: "do", groups: ["よく使う"],
      dailyFlag: false, defaultStart: "", defaultEnd: "", order: state.templates.length + 1,
    };
    const id = await fsAddTemplate(newTemplate);
    state.templates.push({ id, ...newTemplate });
    renderSettingsPanel();
  }
  if (action === "unlock-parent") {
    const val = document.getElementById("passcode-input").value;
    if (val === state.settings.passcode) { state.parentUnlocked = true; renderSettingsPanel(); }
    else alert("パスコードが違います");
  }
  if (action === "set-furigana-mode") {
    state.settings.furiganaMode = btn.dataset.value;
    await fsSaveSettings(state.settings);
    renderSettingsPanel();
  }
  if (action === "set-clock-mode") {
    state.settings.clockMode = btn.dataset.value;
    await fsSaveSettings(state.settings);
    renderSettingsPanel();
  }
  if (action === "save-cheer-messages") {
    const text = document.getElementById("setting-cheerMessages").value;
    state.settings.cheerMessages = text.split("\n").map((s) => s.trim()).filter(Boolean);
    await fsSaveSettings(state.settings);
  }
  if (action === "export-data") {
    btn.disabled = true;
    await exportAllData();
    btn.disabled = false;
  }
  if (action === "import-data") {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = () => { if (inp.files[0]) importAllData(inp.files[0]); };
    inp.click();
  }
  if (action === "change-space") {
    if (confirm("合言葉の入力からやり直します。よろしいですか？")) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      location.reload();
    }
  }
}

// テンプレートカードのテキスト系入力（デバウンスして保存）
const templateSaveTimers = {};
function onSettingsInput(e) {
  const el = e.target;
  const field = el.dataset.tfield;
  const card = el.closest(".template-edit-card");
  if (field && card) {
    const id = card.dataset.templateId;
    const t = state.templates.find((x) => x.id === id);
    if (!t) return;
    let value = el.value;
    if (field === "maxGrade" || field === "order") value = Number(value);
    if (field === "dailyFlag") value = el.checked;
    if (field === "groups") value = value.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    t[field] = value;
    clearTimeout(templateSaveTimers[id]);
    templateSaveTimers[id] = setTimeout(() => fsUpdateTemplate(id, { [field]: value }), 500);
  }
  if (el.id === "setting-passcode") {
    state.settings.passcode = el.value;
    clearTimeout(templateSaveTimers["__passcode"]);
    templateSaveTimers["__passcode"] = setTimeout(() => fsSaveSettings(state.settings), 500);
  }
}

async function onSettingsChange(e) {
  const el = e.target;
  if (el.id === "setting-childGrade") {
    state.settings.childGrade = Number(el.value);
    await fsSaveSettings(state.settings);
  }
  if (el.id === "setting-challengeEnabled") {
    state.settings.challengeEnabled = el.checked;
    await fsSaveSettings(state.settings);
  }
  const field = el.dataset.tfield;
  const card = el.closest(".template-edit-card");
  if (field === "maxGrade" && card) {
    const t = state.templates.find((x) => x.id === card.dataset.templateId);
    if (t) { t.maxGrade = Number(el.value); await fsUpdateTemplate(t.id, { maxGrade: t.maxGrade }); }
  }
  if (field === "dailyFlag" && card) {
    const t = state.templates.find((x) => x.id === card.dataset.templateId);
    if (t) { t.dailyFlag = el.checked; await fsUpdateTemplate(t.id, { dailyFlag: t.dailyFlag }); }
  }
}

/* ============================================================================
   9. データのエクスポート／インポート（JSONバックアップ）
   ============================================================================ */
async function exportAllData() {
  const dailyPlans = await fsGetAllDailyPlans();
  const payload = {
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    templates: state.templates,
    dailyPlans,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kyounoyotei-backup-${state.today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importAllData(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (err) {
    alert("JSONファイルの読み込みに失敗しました");
    return;
  }
  if (!confirm("現在のデータを上書きしてインポートします。よろしいですか？")) return;

  if (payload.settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...payload.settings };
    await fsSaveSettings(state.settings);
  }
  if (Array.isArray(payload.templates)) {
    const existing = await getDocs(templatesCol());
    for (const d of existing.docs) await deleteDoc(d.ref);
    const newTemplates = [];
    for (const t of payload.templates) {
      const { id, ...rest } = t;
      const ref = await addDoc(templatesCol(), rest);
      newTemplates.push({ id: ref.id, ...rest });
    }
    state.templates = newTemplates;
  }
  if (payload.dailyPlans) {
    for (const [dateStr, plan] of Object.entries(payload.dailyPlans)) {
      await setDoc(dailyPlanDocRef(dateStr), plan);
    }
  }
  alert("インポートが完了しました");
  await loadViewDate(state.viewDate);
  renderSettingsPanel();
}

/* ============================================================================
   10. 初期化
   ============================================================================ */
document.getElementById("home-nav-btn").addEventListener("click", async () => {
  state.showSettings = false;
  renderSettingsPanel();
  if (state.viewDate !== state.today) await loadViewDate(state.today);
  else { state.editMode = false; render(); }
});
document.getElementById("global-settings-btn").addEventListener("click", () => {
  state.showSettings = true;
  renderSettingsPanel();
});
document.getElementById("settings-close-btn").addEventListener("click", () => {
  state.showSettings = false;
  renderSettingsPanel();
});
document.getElementById("tab-templates-btn").addEventListener("click", () => { state.settingsTab = "templates"; renderSettingsPanel(); });
document.getElementById("tab-parent-btn").addEventListener("click", () => { state.settingsTab = "parent"; renderSettingsPanel(); });

// #app と #settings-body へのイベント登録は一度だけ（render() のたびに登録すると多重発火する）
appRoot.addEventListener("click", onAppClick);
appRoot.addEventListener("input", onAppInput);
appRoot.addEventListener("dragstart", onDragStart);
appRoot.addEventListener("dragover", onDragOver);
appRoot.addEventListener("drop", onDrop);
const settingsBody = document.getElementById("settings-body");
settingsBody.addEventListener("click", onSettingsClick);
settingsBody.addEventListener("input", onSettingsInput);
settingsBody.addEventListener("change", onSettingsChange);

async function boot() {
  state.settings = await fsGetSettings();
  state.templates = await fsGetTemplates();

  state.today = getAppDate();
  state.viewDate = state.today;
  const daily = await fsGetDailyPlan(state.today);
  state.daily = daily || emptyDaily(state.today);
  const yesterday = await fsGetDailyPlan(shiftDate(state.today, -1));
  state.yesterdayItems = yesterday && yesterday.items ? yesterday.items : null;

  loadingScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  document.getElementById("top-right-nav").classList.remove("hidden");
  render();

  // 日付が4時をまたいだら「今日」を再計算（表示中の過去日ブラウズは邪魔しない）
  setInterval(() => {
    const nowToday = getAppDate();
    if (nowToday !== state.today) {
      const wasOnToday = state.viewDate === state.today;
      state.today = nowToday;
      if (wasOnToday) loadViewDate(nowToday);
    }
  }, 60000);
}

initAuth();
