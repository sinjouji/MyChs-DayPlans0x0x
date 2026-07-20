/* ============================================================================
   きょうのよてい — app.js
   React版から HTML / CSS / JavaScript + Firebase Firestore へ移植した版です。
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

// コレクション名
const COL_TEMPLATES = "templates";
const COL_SETTINGS = "settings";
const COL_DAILY_PLANS = "dailyPlans";
const SETTINGS_DOC_ID = "app"; // settings は単一ドキュメントで管理

/* ============================================================================
   2. デザイントークン・定数
   ============================================================================ */
const CATEGORY_LABEL = { do: "やること", want: "やりたいこと", challenge: "チャレンジ" };
const CATEGORY_COLOR_VAR = { do: "var(--do-color)", want: "var(--want-color)", challenge: "var(--challenge-color)" };

const STAMPS = ["⭐️", "🌈", "🍀", "🐣", "🎈", "🍓", "🐬", "🌻", "🦋", "🍩"];

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
  { name: "はみがき", furigana: "はみがき", maxGrade: 1, category: "do", group: "よく使う", dailyFlag: true, defaultStart: "", defaultEnd: "", order: 1 },
  { name: "きがえ", furigana: "きがえ", maxGrade: 1, category: "do", group: "よく使う", dailyFlag: true, defaultStart: "", defaultEnd: "", order: 2 },
  { name: "しゅくだい", furigana: "しゅくだい", maxGrade: 3, category: "do", group: "よく使う", dailyFlag: false, defaultStart: "", defaultEnd: "", order: 3 },
  { name: "本を読む", furigana: "ほんをよむ", maxGrade: 3, category: "want", group: "よく使う", dailyFlag: false, defaultStart: "", defaultEnd: "", order: 4 },
  { name: "おてつだい", furigana: "おてつだい", maxGrade: 4, category: "challenge", group: "チャレンジ", dailyFlag: false, defaultStart: "", defaultEnd: "", order: 5 },
];

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

function emptyDaily(date) {
  return { date, created: false, items: [], stamp: null, mood: null, note: "", completeShown: false };
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
   4. Firestore データ層
   ============================================================================ */
async function fsGetSettings() {
  const ref = doc(db, COL_SETTINGS, SETTINGS_DOC_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) return { ...DEFAULT_SETTINGS, ...snap.data() };
  await setDoc(ref, DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS };
}
async function fsSaveSettings(settings) {
  await setDoc(doc(db, COL_SETTINGS, SETTINGS_DOC_ID), settings, { merge: true });
}

async function fsGetTemplates() {
  const snap = await getDocs(collection(db, COL_TEMPLATES));
  if (snap.empty) {
    // 初回起動時はデフォルトテンプレートを書き込む
    const created = [];
    for (const t of DEFAULT_TEMPLATES) {
      const ref = await addDoc(collection(db, COL_TEMPLATES), t);
      created.push({ id: ref.id, ...t });
    }
    return created;
  }
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function fsAddTemplate(template) {
  const ref = await addDoc(collection(db, COL_TEMPLATES), template);
  return ref.id;
}
async function fsUpdateTemplate(id, patch) {
  await updateDoc(doc(db, COL_TEMPLATES, id), patch);
}
async function fsDeleteTemplate(id) {
  await deleteDoc(doc(db, COL_TEMPLATES, id));
}

async function fsGetDailyPlan(date) {
  const snap = await getDoc(doc(db, COL_DAILY_PLANS, date));
  return snap.exists() ? snap.data() : null;
}
async function fsSaveDailyPlan(date, plan) {
  await setDoc(doc(db, COL_DAILY_PLANS, date), plan, { merge: false });
}

/* ============================================================================
   5. アプリ状態（メモリ上のキャッシュ。Firestoreへは各アクションで書き込む）
   ============================================================================ */
const state = {
  templates: [],
  settings: { ...DEFAULT_SETTINGS },
  date: getAppDate(),
  daily: null,
  yesterdayItems: null,
  editMode: false,
  showSettings: false,
  settingsTab: "templates",
  parentUnlocked: false,
  dragFromId: null,
};

/* ============================================================================
   6. 描画（レンダリング）関数群
   ============================================================================ */
const appRoot = document.getElementById("app");
const loadingScreen = document.getElementById("loading-screen");

function render() {
  if (!state.daily) return;
  appRoot.innerHTML = state.daily.created ? renderHomeScreen() : renderCreateScreen();
  attachHomeOrCreateEvents();
  renderClock();
  renderSettingsPanel();
}

/* ---- 6-1. 時計（列幅の90%まで拡大表示。% 指定なのでJS側はサイズ計算不要） ---- */
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
    html += `
      <div class="clock-analog">
        ${[...Array(12)].map((_, i) => `<div class="clock-tick ${i % 3 === 0 ? "major" : ""}" style="transform:rotate(${i * 30}deg) translateX(-50%);"></div>`).join("")}
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

/* ---- 6-2. 項目カード ---- */
function renderItemCard(item, editMode, draggable) {
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
      <input type="time" value="${esc(item.start || "")}" data-item-field="start" data-item-id="${item.id}" />
      <input type="time" value="${esc(item.end || "")}" data-item-field="end" data-item-id="${item.id}" />
      <input type="text" placeholder="メモ" value="${esc(item.memo || "")}" data-item-field="memo" data-item-id="${item.id}" />
    </div>` : "";
  const deleteBtn = editMode
    ? `<button class="item-delete-btn" data-action="delete-item" data-item-id="${item.id}">✕</button>` : "";

  return `
    <div class="item-card" style="border-left-color:${color};" data-item-id="${item.id}" ${draggable ? 'draggable="true"' : ""}>
      <button class="item-check" data-action="toggle-item" data-item-id="${item.id}"
        style="background:${item.checked ? color : "var(--surface-soft)"}; border-color:${color};">
        ${item.checked ? "✓" : ""}
      </button>
      <div class="item-body">
        <div class="item-name-row">
          <span class="item-name ${item.checked ? "checked" : ""}">${nameHtml}</span>
          ${timeBadge}
        </div>
        ${item.memo ? `<div class="item-memo">${esc(item.memo)}</div>` : ""}
        ${editRow}
      </div>
      ${deleteBtn}
    </div>`;
}

/* ---- 6-3. テンプレート入力エリア（トグル式ボタン群 + 自由入力） ---- */
function renderTemplatePicker() {
  const groups = ["よく使う", ...new Set(state.templates.filter((t) => t.group !== "よく使う").map((t) => t.group))]
    .filter((g) => state.templates.some((t) => t.group === g));

  const groupHtml = groups.map((g) => `
    <div class="template-group">
      <button class="template-group-header" data-action="toggle-group" data-group="${esc(g)}">
        <span>${esc(g)}</span><span data-group-arrow="${esc(g)}">▾</span>
      </button>
      <div class="template-chip-row hidden" data-group-body="${esc(g)}">
        ${state.templates.filter((t) => t.group === g).sort((a, b) => a.order - b.order).map((t) => `
          <button class="template-chip" style="border-color:${CATEGORY_COLOR_VAR[t.category]};" data-action="add-template" data-template-id="${t.id}">
            ${esc(t.name)}
          </button>`).join("")}
      </div>
    </div>`).join("");

  return `
    <div class="input-area">
      ${groupHtml}
      <div id="free-add-slot">
        <button class="free-add-btn" data-action="open-free-add">＋ 新しく入力</button>
      </div>
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

/* ---- 6-4. 「今日の予定を作る」画面 ---- */
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
    ? `<button class="copy-yesterday-btn" data-action="copy-yesterday">きのうの予定をコピーする</button>` : "";

  return `
    <div class="create-screen">
      <div class="create-header">
        <div class="subtitle">今日の予定を作る</div>
        <div class="date">${formatDateJP(state.date)}</div>
      </div>
      <div class="create-list" id="create-list">${listHtml}${copyBtn}</div>
      ${renderTemplatePicker()}
      <div class="create-confirm-bar">
        <button class="confirm-create-btn" data-action="confirm-create">この予定ではじめる</button>
      </div>
    </div>`;
}

/* ---- 6-5. ホーム画面（閲覧／編集モード）：2カラム表示
   左カラム = やること・時間設定がある項目 + 大きな時計
   右カラム = チャレンジ・やりたいこと（時間指定なし想定）
---- */
function splitColumns(visibleItems) {
  const leftAll = visibleItems.filter((it) => it.category === "do" || it.start);
  const rightAll = visibleItems.filter((it) => !(it.category === "do" || it.start));
  const leftTimed = leftAll.filter((it) => it.start).sort((a, b) => a.start.localeCompare(b.start));
  const leftUntimed = leftAll.filter((it) => !it.start).sort((a, b) => a.order - b.order);
  const rightSorted = [...rightAll].sort((a, b) => a.order - b.order);
  return { leftTimed, leftUntimed, rightSorted };
}

function renderHomeScreen() {
  const doItems = state.daily.items.filter((it) => it.category === "do");
  const challengeUnlocked = state.settings.challengeEnabled && doItems.length > 0 && doItems.every((it) => it.checked);
  const visibleItems = state.daily.items.filter((it) => it.category !== "challenge" || challengeUnlocked);
  const { leftTimed, leftUntimed, rightSorted } = splitColumns(visibleItems);

  const leftHtml = (leftTimed.length + leftUntimed.length) === 0
    ? `<div class="empty-hint">予定なし</div>`
    : leftTimed.map((it) => renderItemCard(it, state.editMode, false)).join("")
      + leftUntimed.map((it) => renderItemCard(it, state.editMode, state.editMode)).join("");

  const challengeHint = state.settings.challengeEnabled && !challengeUnlocked && state.daily.items.some((it) => it.category === "challenge")
    ? `<div class="challenge-hint">「やること」が終わったら チャレンジ が出てくるよ</div>` : "";
  const rightHtml = (rightSorted.length === 0 && !challengeHint)
    ? `<div class="empty-hint">予定なし</div>`
    : rightSorted.map((it) => renderItemCard(it, state.editMode, state.editMode)).join("") + challengeHint;

  const bottom = state.editMode
    ? `${renderTemplatePicker()}<div class="bottom-bar"><button class="edit-done-btn" data-action="finish-edit">編集をおわる</button></div>`
    : `<div class="bottom-bar"><button class="edit-toggle-btn" data-action="start-edit">✎ 編集する</button></div>`;

  return `
    <div class="home-header">
      <div>
        <div class="home-date">${formatDateJP(state.date)}</div>
        <div class="home-title">きょうのよてい</div>
        ${state.daily.stamp ? `<div class="home-stamp">${state.daily.stamp}</div>` : ""}
      </div>
    </div>
    <div class="item-list ${state.editMode ? "editing" : ""}">
      <div class="home-col home-col-left">
        <div data-clock></div>
        <div class="home-col-title">やること</div>
        ${leftHtml}
      </div>
      <div class="home-col home-col-right">
        <div class="home-col-title">チャレンジ・やりたいこと</div>
        ${rightHtml}
      </div>
    </div>
    ${bottom}`;
}

/* ---- 6-6. Complete演出 / スタンプ選択モーダル ---- */
function showConfettiAndComplete() {
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
    openStampModal();
  }, 1800);
}

function openStampModal() {
  const messages = state.settings.cheerMessages;
  const msg = messages.length ? messages[Math.floor(Math.random() * messages.length)] : "今日もよくがんばったね";
  document.getElementById("cheer-message").textContent = msg;
  const grid = document.getElementById("stamp-grid");
  grid.innerHTML = STAMPS.map((s) => `<button class="stamp-option" data-action="pick-stamp" data-stamp="${s}">${s}</button>`).join("");
  document.getElementById("stamp-modal").classList.remove("hidden");
}

/* ---- 6-7. 設定画面（テンプレート／おうちの人設定） ---- */
function renderSettingsPanel() {
  const panel = document.getElementById("settings-screen");
  panel.classList.toggle("hidden", !state.showSettings);
  if (!state.showSettings) return;

  document.getElementById("tab-templates-btn").classList.toggle("active", state.settingsTab === "templates");
  document.getElementById("tab-parent-btn").classList.toggle("active", state.settingsTab === "parent");

  const body = document.getElementById("settings-body");
  body.innerHTML = state.settingsTab === "templates" ? renderTemplateSettings() : renderParentSettings();
  attachSettingsEvents();
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
        <input type="text" value="${esc(t.group || "")}" data-tfield="group" placeholder="グループ" />
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

  return `${cards}<button class="add-template-btn" data-action="add-template-def">＋ テンプレートを追加</button>`;
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
    </div>`;
}

/* ============================================================================
   7. イベントハンドラ / アクション関数
   ============================================================================ */

/* ---- 7-1. ホーム／作成画面 共通：委譲イベント ---- */
function attachHomeOrCreateEvents() {
  appRoot.addEventListener("click", onAppClick);
  appRoot.addEventListener("input", onAppInput);
  appRoot.addEventListener("dragstart", onDragStart);
  appRoot.addEventListener("dragover", onDragOver);
  appRoot.addEventListener("drop", onDrop);
}

function currentItemsRef() {
  // 作成前画面なら下書き配列、作成後ならデイリープランの items を返す
  return state.daily.created ? state.daily.items : createDraftItems;
}
function persistDailyIfCreated() {
  if (state.daily.created) fsSaveDailyPlan(state.date, state.daily);
}

async function onAppClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "toggle-item") {
    const items = currentItemsRef();
    const it = items.find((x) => x.id === btn.dataset.itemId);
    if (it) it.checked = !it.checked;
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
    const body = document.querySelector(`[data-group-body="${CSS.escape(g)}"]`);
    const arrow = document.querySelector(`[data-group-arrow="${CSS.escape(g)}"]`);
    if (body) {
      const willOpen = body.classList.contains("hidden");
      body.classList.toggle("hidden");
      if (arrow) arrow.textContent = willOpen ? "▴" : "▾";
    }
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
    document.getElementById("free-add-slot").innerHTML = renderFreeAddForm();
    freeAddCategory = "do";
    highlightFreeCat();
  }
  if (action === "close-free-add") {
    document.getElementById("free-add-slot").innerHTML = `<button class="free-add-btn" data-action="open-free-add">＋ 新しく入力</button>`;
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
    render();
  }

  if (action === "copy-yesterday") {
    createDraftItems = state.yesterdayItems.map((it) => ({ ...it, id: uid(), checked: false }));
    render();
  }

  if (action === "confirm-create") {
    const withOrder = createDraftItems.map((it, i) => ({ ...it, order: i + 1 }));
    state.daily = { ...state.daily, created: true, items: withOrder };
    await fsSaveDailyPlan(state.date, state.daily);
    createDraftItems = null;
    render();
  }

  if (action === "start-edit") { state.editMode = true; render(); }
  if (action === "finish-edit") { state.editMode = false; render(); }

  if (action === "open-settings") { state.showSettings = true; renderSettingsPanel(); }

  if (action === "pick-stamp") {
    state.daily.stamp = btn.dataset.stamp;
    state.daily.completeShown = true;
    await fsSaveDailyPlan(state.date, state.daily);
    document.getElementById("stamp-modal").classList.add("hidden");
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

/* ---- 7-2. 時間なし項目のドラッグ並び替え ---- */
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
  // 左カラム = やること（時間なし）／ 右カラム = チャレンジ・やりたいこと
  return it.category === "do" ? "left" : "right";
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

/* ---- 7-3. Complete判定（「やること」が全てチェックされたか） ---- */
function checkCompletion() {
  if (!state.daily.created || state.daily.completeShown) return;
  const doItems = state.daily.items.filter((it) => it.category === "do");
  if (doItems.length > 0 && doItems.every((it) => it.checked)) {
    showConfettiAndComplete();
  }
}

/* ---- 7-4. 設定画面のイベント ---- */
function attachSettingsEvents() {
  const body = document.getElementById("settings-body");
  body.onclick = onSettingsClick;
  body.oninput = onSettingsInput;
  body.onchange = onSettingsChange;
}

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
      name: "あたらしい項目", furigana: "", maxGrade: 6, category: "do", group: "よく使う",
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

/* ============================================================================
   8. 初期化
   ============================================================================ */
async function init() {
  state.settings = await fsGetSettings();
  state.templates = await fsGetTemplates();

  const today = getAppDate();
  state.date = today;
  const daily = await fsGetDailyPlan(today);
  state.daily = daily || emptyDaily(today);

  const yesterday = await fsGetDailyPlan(shiftDate(today, -1));
  state.yesterdayItems = yesterday && yesterday.items ? yesterday.items : null;

  loadingScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  document.getElementById("global-settings-btn").classList.remove("hidden");
  render();

  // 日付が4時をまたいだら自動でチェック（1分ごと）
  setInterval(() => {
    const now = getAppDate();
    if (now !== state.date) location.reload();
  }, 60000);
}

init();
