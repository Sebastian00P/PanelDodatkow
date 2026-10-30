
(function() {
    'use strict';

    const PANEL_VERSION = '4.6';
    const ADDON_ID = 'darksad-addon-menu';
    const STORAGE_KEY = 'darksad-addon-settings-v3';

    // okno strony (Engine, _g itd.) – przez loader dostajemy unsafeWindow
    const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

    const state = {
        menuOpen: false,
        menuSearch: '',
        openSettings: {},
        notifierEnabled: false,
        notifierPosition: null,
        timersCollectorEnabled: false,
        pilnowaczEnabled: false,
        pilnowaczInterval: null,
        hugeMessageEnabled: false,
        hugeMessagePosition: null,
        hugeMyNick: '',
        hugeBgColor: '#0B1224',
        hugeBorderColor: 'rgba(255,77,90,.28)',
        hugeBoxShadow: '0 10px 40px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,77,90,.12)',
        hugeTextColor: '#FFD84D',
        hugeAutoCloseSeconds: 0,
        titanEnabled: false,
        titanTooltips: true,
        titanWindow: true,
        titanHighlightOwn: true,
        titanPosition: null,
        // --- nowe ---
        berserkEnabled: false,
        berserkFreePos: null,         // pozycja, gdy brak „Rozwiń”
        berserkRozwinOffset: null,    // {left, top} względem przycisku „Rozwiń”
        whoResizeEnabled: false,
        whoSize: null,                // {w, h}
        buildsEnabled: false,
        buildsPosition: null,
        buildsBox: null,
        buildsHeroCfg: {},            // heroId -> { prof: {idZestawu: 'mt'}, ai }
        buildsProf: {},               // (stare, wspólne – przenoszone na postać)
        buildsAI: false,
        buildsAIRange: 12,
        buildsAIEnemiesOnly: false,              // {w, h} – rozmiar okienka zestawów
        buildsCompact: false,
        buildsCache: {},              // heroId -> {list:[{id,name}], currentId}
        mmEnabled: false,
        mmSize: 90,                   // % wysokości ekranu (30–100)
        mmOpacity: 100,
        mmHotkey: '',
        mmShowOthers: true,
        mmShowMobs: true,
        mmShowNpcs: true,
        mmShowSpawns: true,
        mmSpawnRange: 10,             // zasięg wykrywania herosa ze respu (kratki)
        mmChaseAttack: true,
        mmPos: null,
        themeAccent: '',              // '' = auto (z motywu gry)
        themeGlass: true,
    };

    const collapsedGroups = {
        t: false,
        h: false,
        e2: false,
    };

    let toastTimeout = null;
    let timersFinderObserver = null;
    let timersRenderLock = false;
    let hugeMessageObserver = null;
    const hugeSeenMessageIds = new Set();

    const SAVED_KEYS = [
        'notifierEnabled', 'notifierPosition', 'timersCollectorEnabled', 'pilnowaczEnabled',
        'hugeMessageEnabled', 'hugeMessagePosition', 'hugeMyNick', 'hugeBgColor', 'hugeBorderColor',
        'hugeBoxShadow', 'hugeTextColor', 'hugeAutoCloseSeconds',
        'titanEnabled', 'titanTooltips', 'titanWindow', 'titanHighlightOwn', 'titanPosition',
        'berserkEnabled', 'berserkRozwinOffset', 'berserkFreePos', 'whoResizeEnabled', 'whoSize',
        'buildsEnabled', 'buildsPosition', 'buildsBox', 'buildsCompact', 'buildsHeroCfg', 'buildsProf', 'buildsAI', 'buildsAIRange', 'buildsAIEnemiesOnly', 'buildsCache',
        'mmEnabled', 'mmSize', 'mmOpacity', 'mmHotkey', 'mmShowOthers', 'mmShowMobs', 'mmShowNpcs', 'mmShowSpawns', 'mmSpawnRange', 'mmChaseAttack', 'mmPos',
        'themeAccent', 'themeGlass',
    ];

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            SAVED_KEYS.forEach((key) => {
                if (saved[key] !== undefined && saved[key] !== null) state[key] = saved[key];
            });
            // wartości domyślne / typy
            state.titanTooltips = saved.titanTooltips !== false;
            state.titanWindow = saved.titanWindow !== false;
            state.titanHighlightOwn = saved.titanHighlightOwn !== false;
            state.themeGlass = saved.themeGlass !== false;
            state.mmShowOthers = saved.mmShowOthers !== false;
            state.mmShowMobs = saved.mmShowMobs !== false;
            state.mmShowNpcs = saved.mmShowNpcs !== false;
            state.mmShowSpawns = saved.mmShowSpawns !== false;
            // jednorazowo: respy herosów stały się domyślnie włączone – włącz też u osób, które miały stary domyślny „wyłączony”
            try {
                if (!localStorage.getItem('pa_mm_spawns_default_v2')) {
                    localStorage.setItem('pa_mm_spawns_default_v2', '1');
                    if (saved.mmShowSpawns === false) {
                        state.mmShowSpawns = true;
                        setTimeout(saveSettings, 0);
                    }
                }
            } catch (_) {}
            state.mmChaseAttack = saved.mmChaseAttack !== false;
            state.hugeAutoCloseSeconds = Number(state.hugeAutoCloseSeconds || 0);
            if (!state.buildsCache || typeof state.buildsCache !== 'object') state.buildsCache = {};
            if (!state.buildsProf || typeof state.buildsProf !== 'object') state.buildsProf = {};
            if (!state.buildsHeroCfg || typeof state.buildsHeroCfg !== 'object') state.buildsHeroCfg = {};

            if (saved.collapsedGroups) {
                collapsedGroups.t = Boolean(saved.collapsedGroups.t);
                collapsedGroups.h = Boolean(saved.collapsedGroups.h);
                collapsedGroups.e2 = Boolean(saved.collapsedGroups.e2);
            }
        } catch (_) {}
    }

    function saveSettings() {
        const out = { collapsedGroups };
        SAVED_KEYS.forEach((key) => { out[key] = state[key]; });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
        } catch (error) {
            console.warn('[darksad-addon] Nie udało się zapisać ustawień', error);
        }
    }

    // CSS starszych modułów (timery, huge message, titan helper)
    const OLD_CSS_TAIL = `
    .tc-header {
      grid-column: 1 / -1;
      width: 100%;
      margin: 4px 0 2px;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(250,204,21,0.14);
      border: 1px solid rgba(250,204,21,0.35);
      color: #facc15;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .3px;
      cursor: pointer;
      user-select: none;
      box-sizing: border-box;
    }

    .tc-header:hover {
      background: rgba(250,204,21,0.22);
    }

.pa-huge-message.pa-visible {
  display: block;
}


.pa-huge-text {
  color: #FFD84D;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-shadow: 0 0 8px rgba(255,216,77,.35);
}

.pa-huge-message {
  position: fixed !important;
  left: 50%;
  top: 120px;
  width: min(520px, calc(100vw - 24px));
  display: none;
  z-index: 2147483647 !important;
  color: #E8ECFF;
  user-select: text;

  background: linear-gradient(180deg, rgba(11,18,36,.96), rgba(11,18,36,.90)) !important;
  border: 1px solid rgba(255,77,90,.28) !important;
  border-radius: 14px !important;
  overflow: visible;
}

.pa-huge-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pa-huge-gear {
  width: 22px;
  height: 22px;
  border: 1px solid rgba(255,77,90,.28);
  border-radius: 7px;
  background: linear-gradient(180deg, #101B34, #0B1224);
  color: #FFD84D;
  cursor: pointer;
  font-size: 12px;
  box-shadow: 0 0 10px rgba(110,140,255,.18);
}

.pa-huge-settings {
  display: none;
  margin-top: 6px;
  padding: 8px;
  border: 1px solid rgba(255,77,90,.28);
  border-radius: 10px;
  background: rgba(7,11,22,.75);
  box-shadow: inset 0 0 10px rgba(0,0,0,.35);
}

.pa-huge-settings.pa-open {
  display: block;
}

.pa-huge-settings label {
  display: block;
  margin: 6px 0 3px;
  font-size: 10px;
  color: #B8C2E6;
}

.pa-huge-settings input {
  width: 100%;
  padding: 5px 6px;
  border: 1px solid rgba(255,77,90,.28);
  border-radius: 7px;
  background: rgba(7,11,22,.65);
  color: #FFD84D;
  font-size: 11px;
  outline: none;
}

.pa-huge-settings button {
  margin-top: 8px;
  width: 100%;
  padding: 6px;
  border: 1px solid rgba(255,77,90,.28);
  border-radius: 8px;
  background: linear-gradient(180deg, #101B34, #0B1224);
  color: #FFD84D;
  cursor: pointer;
  font-weight: 700;
}

.pa-huge-message {
  position: fixed !important;
  left: 50%;
  top: 120px;
  width: min(520px, calc(100vw - 24px));
  display: none;
  z-index: 2147483647 !important;
  color: #E8ECFF;
  user-select: text;
  background: linear-gradient(180deg, rgba(11,18,36,.96), rgba(11,18,36,.90));
  border: 1px solid rgba(255,77,90,.28);
  border-radius: 14px;
  box-shadow: 0 10px 40px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,77,90,.12);
  overflow: visible;
}

.pa-huge-message.pa-visible {
  display: block;
  background-clip: padding-box;
}

.pa-huge-title {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,77,90,.28);
  border-radius: 14px 14px 0 0;
  background: linear-gradient(180deg, rgba(193,18,31,.18), rgba(193,18,31,.05)), linear-gradient(180deg, #101B34, #0B1224);
  color: #E8ECFF;
  font-weight: 700;
  cursor: grab;
  user-select: none;
}

.pa-huge-title:active {
  cursor: grabbing;
}

.pa-huge-content {
  padding: 10px 12px;
  max-height: min(45vh, 360px);
  overflow: auto;
  background: linear-gradient(180deg, #101B34, #0B1224);
  color: #FFD84D;
}

.pa-huge-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(255,77,90,.28);
  background: linear-gradient(180deg, rgba(7,11,22,.35), rgba(0,0,0,0));
}

.pa-huge-ok {
  all: unset;
  cursor: pointer;
  padding: 7px 11px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 12.5px;
  border: 1px solid rgba(255,77,90,.28);
  box-shadow: 0 2px 10px rgba(0,0,0,.35);
  background: linear-gradient(180deg, #101B34, #0B1224);
  color: #FFD84D;
  text-shadow: 0 0 8px rgba(255,216,77,.35);
}

.pa-huge-ok:hover {
  box-shadow: 0 6px 18px rgba(0,0,0,.55), 0 0 18px rgba(110,140,255,.32);
}

/* === TITAN HELPER === */
.pa-thp-settings label.pa-thp-check {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0;
  font-size: 11px;
  color: #E8ECFF;
  cursor: pointer;
}

.pa-thp-settings label.pa-thp-check input {
  width: auto;
  margin: 0;
}

.pa-thp-window {
  position: fixed;
  right: 12px;
  top: 120px;
  width: 230px;
  height: 260px;
  min-width: 150px;
  min-height: 70px;
  max-width: 90vw;
  max-height: 90vh;
  display: none;
  flex-direction: column;
  resize: both;
  box-sizing: border-box;
  z-index: 2147483000;
  font-family: Arial, sans-serif;
  font-size: 11px;
  color: #E8ECFF;
  background: linear-gradient(180deg, rgba(11,18,36,.95), rgba(11,18,36,.88));
  border: 1px solid rgba(255,77,90,.28);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0,0,0,.55);
  overflow: hidden;
}

.pa-thp-window.pa-visible {
  display: flex;
}

.pa-thp-title {
  padding: 5px 8px;
  font-weight: 700;
  font-size: 11px;
  color: #FFD84D;
  text-transform: uppercase;
  background: rgba(255,255,255,.04);
  border-bottom: 1px solid rgba(255,255,255,.08);
  cursor: move;
  user-select: none;
}

.pa-thp-body {
  flex: 1;
  min-height: 0;
  padding: 6px 8px 14px;
  overflow-y: auto;
}

.pa-thp-section {
  margin-top: 6px;
}

.pa-thp-section strong {
  display: block;
  margin-bottom: 2px;
  color: #B8C2E6;
}

.pa-thp-positive { color: #7CFC7C; }
.pa-thp-negative { color: #ff8383; }
.pa-thp-own, .gargonem-thp-own-effect { color: #FFD84D; font-weight: 700; }
.pa-thp-alert { color: #ff4d5a; font-weight: 700; }
.pa-thp-empty { color: #8a93b5; }

.pa-thp-shout-highlight {
  filter: drop-shadow(0 0 4px #ff4d5a) !important;
}

.pa-thp-si-hp span {
  color: #FFD84D;
}

div[data-chat-message-id],
div[data-chat-message-id] * {
  user-select: text !important;
  -webkit-user-select: text !important;
}

div[data-chat-message-id] a {
  pointer-events: auto !important;
}
`;

    // ------------------------------------------------------------------
    //  MOTYW – kolory wspólne dla wszystkich okienek panelu.
    //  --pa-accent można ustawić ręcznie albo pobrać automatycznie z motywu gry.
    // ------------------------------------------------------------------
    function detectGameAccent() {
        const probes = [
            '.border-window .header-label .text',
            '.c-window .header-label .text',
            '.interface-layer .header-label .text',
        ];
        for (const sel of probes) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const color = getComputedStyle(el).color;
            const m = color && color.match(/\d+(\.\d+)?/g);
            if (!m) continue;
            const [r, g, b] = m.map(Number);
            // pomijamy biały/szary – nic nie mówi o motywie
            if (Math.max(r, g, b) - Math.min(r, g, b) < 25) continue;
            return `rgb(${r}, ${g}, ${b})`;
        }
        return '#e8b04a';
    }

    function applyTheme() {
        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--pa-accent', detectGameAccent());
    }

    function injectStyles() {
        if (document.getElementById(`${ADDON_ID}-styles`)) return;

        const style = document.createElement('style');
        style.id = `${ADDON_ID}-styles`;
        style.textContent = `
    :root {
      --pa-accent: #e8b04a;
      --pa-bg: rgba(17, 19, 27, .86);
      --pa-bg-solid: #12141c;
      --pa-surface: rgba(255, 255, 255, .045);
      --pa-surface-2: rgba(255, 255, 255, .08);
      --pa-border: rgba(255, 255, 255, .10);
      --pa-border-strong: rgba(255, 255, 255, .18);
      --pa-text: #eceef4;
      --pa-muted: #9aa1b4;
      --pa-ok: #3ecf8e;
      --pa-danger: #ff5d6c;
      --pa-radius: 12px;
      --pa-shadow: 0 18px 50px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.35);
      --pa-font: "Segoe UI", "Inter", Arial, sans-serif;
      --pa-blur: blur(10px) saturate(1.2);
    }
    :root.pa-no-glass { --pa-bg: #12141c; --pa-blur: none; }

    #${ADDON_ID} {
      position: fixed;
      left: 12px;
      bottom: 12px;
      z-index: 10;
      font-family: var(--pa-font);
      color: var(--pa-text);
      user-select: none;
    }

    #${ADDON_ID} *, .pa-modal *, .pa-win *, .pa-berserk-icon { box-sizing: border-box; }

    /* ---------- główny przycisk ---------- */
    .pa-main-button {
      width: 38px;
      height: 38px;
      border: 1px solid var(--pa-border-strong);
      border-radius: 50%;
      background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.14), transparent 60%), var(--pa-bg-solid);
      box-shadow: 0 6px 18px rgba(0,0,0,.45), 0 0 0 2px color-mix(in srgb, var(--pa-accent) 35%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--pa-accent);
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .pa-main-button:hover {
      transform: rotate(30deg);
      box-shadow: 0 6px 18px rgba(0,0,0,.45), 0 0 0 2px var(--pa-accent), 0 0 18px color-mix(in srgb, var(--pa-accent) 45%, transparent);
    }
    .pa-main-button svg { width: 20px; height: 20px; }

    /* ---------- switch ---------- */
    .pa-switch {
      position: relative;
      flex: 0 0 auto;
      width: 40px;
      height: 22px;
      border: 1px solid var(--pa-border);
      border-radius: 999px;
      background: rgba(255,255,255,.08);
      cursor: pointer;
      transition: background .18s ease, border-color .18s ease;
      padding: 0;
    }
    .pa-switch::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #d7dae3;
      box-shadow: 0 1px 3px rgba(0,0,0,.5);
      transition: transform .18s ease, background .18s ease;
    }
    .pa-switch.pa-active {
      background: color-mix(in srgb, var(--pa-accent) 70%, transparent);
      border-color: var(--pa-accent);
    }
    .pa-switch.pa-active::after { transform: translateX(18px); background: #fff; }

    /* ---------- modal z dodatkami ---------- */
    .pa-modal {
      position: fixed;
      inset: 0;
      z-index: 2147483500;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(5, 6, 10, .55);
      backdrop-filter: blur(2px);
      font-family: var(--pa-font);
      color: var(--pa-text);
      user-select: none;
    }
    .pa-modal.pa-open { display: flex; animation: pa-fade .16s ease-out; }
    @keyframes pa-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pa-pop { from { transform: translateY(8px) scale(.985); opacity: 0; } to { transform: none; opacity: 1; } }

    .pa-dialog {
      width: min(820px, 100%);
      max-height: min(86vh, 900px);
      display: flex;
      flex-direction: column;
      border: 1px solid var(--pa-border-strong);
      border-radius: 16px;
      background: var(--pa-bg);
      backdrop-filter: var(--pa-blur);
      box-shadow: var(--pa-shadow), inset 0 1px 0 rgba(255,255,255,.06);
      overflow: hidden;
      animation: pa-pop .18s ease-out;
    }
    .pa-dialog-head {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--pa-border);
      background: linear-gradient(180deg, color-mix(in srgb, var(--pa-accent) 14%, transparent), transparent);
    }
    .pa-dialog-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .pa-dialog-title b { font-size: 15px; letter-spacing: .2px; }
    .pa-dialog-title small { font-size: 11px; color: var(--pa-muted); }
    .pa-dialog-head .pa-search {
      margin-left: auto;
      width: min(240px, 40%);
      padding: 7px 10px;
      border: 1px solid var(--pa-border);
      border-radius: 9px;
      background: rgba(0,0,0,.25);
      color: var(--pa-text);
      font: 12px var(--pa-font);
      outline: none;
    }
    .pa-dialog-head .pa-search:focus { border-color: var(--pa-accent); }
    .pa-icon-btn {
      width: 30px;
      height: 30px;
      flex: 0 0 auto;
      border: 1px solid var(--pa-border);
      border-radius: 9px;
      background: var(--pa-surface);
      color: var(--pa-text);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .pa-icon-btn:hover { background: var(--pa-surface-2); border-color: var(--pa-border-strong); }
    .pa-icon-btn.pa-on { color: var(--pa-accent); border-color: var(--pa-accent); }

    .pa-dialog-body {
      padding: 14px 16px 16px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.2) transparent;
    }
    .pa-section-title {
      margin: 6px 2px 8px;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--pa-muted);
    }
    .pa-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .pa-card {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--pa-border);
      border-radius: var(--pa-radius);
      background: var(--pa-surface);
      transition: border-color .15s ease, background .15s ease;
    }
    .pa-card:hover { border-color: var(--pa-border-strong); }
    .pa-card.pa-enabled { border-color: color-mix(in srgb, var(--pa-accent) 45%, transparent); background: color-mix(in srgb, var(--pa-accent) 6%, var(--pa-surface)); }
    .pa-card.pa-hidden { display: none; }
    .pa-card-main { display: flex; gap: 11px; padding: 12px; align-items: flex-start; }
    .pa-card-icon {
      width: 34px;
      height: 34px;
      flex: 0 0 auto;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
      background: rgba(0,0,0,.28);
      border: 1px solid var(--pa-border);
    }
    .pa-card.pa-enabled .pa-card-icon { border-color: color-mix(in srgb, var(--pa-accent) 55%, transparent); }
    .pa-card-text { flex: 1; min-width: 0; }
    .pa-card-name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
    .pa-tag {
      font-size: 9.5px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 999px;
      color: var(--pa-muted);
      border: 1px solid var(--pa-border);
      text-transform: uppercase;
      letter-spacing: .4px;
    }
    .pa-tag.pa-new { color: var(--pa-accent); border-color: color-mix(in srgb, var(--pa-accent) 55%, transparent); }
    .pa-card-desc { margin: 4px 0 0; font-size: 11.5px; line-height: 1.45; color: var(--pa-muted); user-select: text; }
    .pa-card-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .pa-gear {
      border: 0;
      background: none;
      color: var(--pa-muted);
      font: 600 11px var(--pa-font);
      cursor: pointer;
      padding: 2px 0;
    }
    .pa-gear:hover, .pa-gear.pa-on { color: var(--pa-accent); }
    .pa-card-settings {
      display: none;
      padding: 10px 12px 12px;
      border-top: 1px dashed var(--pa-border);
      font-size: 11.5px;
    }
    .pa-card-settings.pa-open { display: block; }
    .pa-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
    .pa-field > span, .pa-field-label { font-size: 10.5px; color: var(--pa-muted); }
    .pa-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pa-row > .pa-field { flex: 1 1 120px; }
    .pa-input, .pa-card-settings input[type="text"], .pa-card-settings input[type="number"], .pa-card-settings select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--pa-border);
      border-radius: 8px;
      background: rgba(0,0,0,.28);
      color: var(--pa-text);
      font: 12px var(--pa-font);
      outline: none;
    }
    .pa-card-settings input:focus, .pa-card-settings select:focus { border-color: var(--pa-accent); }
    .pa-check { display: flex; align-items: center; gap: 7px; margin: 5px 0; cursor: pointer; color: var(--pa-text); }
    .pa-check input { accent-color: var(--pa-accent); margin: 0; }
    .pa-btn {
      padding: 6px 12px;
      border: 1px solid var(--pa-border-strong);
      border-radius: 8px;
      background: var(--pa-surface-2);
      color: var(--pa-text);
      font: 600 11.5px var(--pa-font);
      cursor: pointer;
    }
    .pa-btn:hover { border-color: var(--pa-accent); color: var(--pa-accent); }
    .pa-btn.pa-primary { background: color-mix(in srgb, var(--pa-accent) 80%, #000); border-color: var(--pa-accent); color: #fff; }
    .pa-btn.pa-primary:hover { filter: brightness(1.1); color: #fff; }
    .pa-sub { margin: 10px 0 4px; font-size: 11px; font-weight: 700; color: var(--pa-text); }
    .pa-hint { margin: 4px 0 0; font-size: 10.5px; color: var(--pa-muted); line-height: 1.4; }
    .pa-split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 520px) { .pa-split { grid-template-columns: 1fr; } .pa-grid { grid-template-columns: 1fr; } }
    .pa-empty-search { display: none; padding: 30px 0; text-align: center; color: var(--pa-muted); font-size: 12px; }
    .pa-coffee-footer { display: flex; justify-content: center; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--pa-border); }
    .pa-coffee-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; border-radius: 999px; background: var(--pa-accent); color: #1a1408 !important; font: 600 12px var(--pa-font); text-decoration: none !important; box-shadow: 0 2px 8px rgba(0,0,0,.35); transition: transform .15s, filter .15s; }
    .pa-coffee-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }

    /* ---------- toast ---------- */
    .pa-toast {
      position: fixed;
      left: 50%;
      bottom: 64px;
      transform: translateX(-50%) translateY(10px);
      max-width: min(420px, calc(100vw - 32px));
      padding: 9px 14px;
      border-radius: 10px;
      background: var(--pa-bg);
      backdrop-filter: var(--pa-blur);
      border: 1px solid var(--pa-border-strong);
      border-left: 3px solid var(--pa-accent);
      color: var(--pa-text);
      font: 12px var(--pa-font);
      box-shadow: var(--pa-shadow);
      opacity: 0;
      pointer-events: none;
      transition: opacity .18s ease, transform .18s ease;
      z-index: 2147483600;
    }
    .pa-toast.pa-visible { opacity: 1; transform: translateX(-50%); }

    /* ---------- notyfikator ---------- */
    .pa-notifier {
      position: fixed;
      left: 60px;
      bottom: 12px;
      padding: 6px;
      border: 1px solid var(--pa-border-strong);
      border-radius: 12px;
      background: var(--pa-bg);
      backdrop-filter: var(--pa-blur);
      box-shadow: var(--pa-shadow);
      display: none;
      gap: 6px;
      cursor: move;
      z-index: 1;
    }
    .pa-notifier.pa-visible { display: flex; }
    .pa-notify-button {
      min-width: 58px;
      height: 32px;
      padding: 0 10px;
      border: 1px solid var(--pa-border);
      border-radius: 8px;
      background: var(--pa-surface);
      color: #fff;
      cursor: pointer;
      font: 700 11.5px var(--pa-font);
      transition: background .15s ease, border-color .15s ease;
    }
    .pa-notify-button.pa-go { color: #86efac; }
    .pa-notify-button.pa-go:hover { background: rgba(62,207,142,.16); border-color: rgba(62,207,142,.55); }
    .pa-notify-button.pa-no-go { color: #fca5a5; }
    .pa-notify-button.pa-no-go:hover { background: rgba(255,93,108,.14); border-color: rgba(255,93,108,.5); }

    /* ---------- wspólne okienko (.pa-win) ---------- */
    .pa-win {
      position: fixed;
      display: none;
      flex-direction: column;
      min-width: 150px;
      border: 1px solid var(--pa-border-strong);
      border-radius: 12px;
      background: var(--pa-bg);
      backdrop-filter: var(--pa-blur);
      box-shadow: var(--pa-shadow);
      font: 12px var(--pa-font);
      color: var(--pa-text);
      z-index: 400;
      overflow: hidden;
    }
    .pa-win.pa-visible { display: flex; }
    .pa-win-head {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px 6px 10px;
      border-bottom: 1px solid var(--pa-border);
      background: linear-gradient(180deg, color-mix(in srgb, var(--pa-accent) 16%, transparent), transparent);
      cursor: move;
      user-select: none;
    }
    .pa-win-head b { flex: 1; font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--pa-accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pa-win-head .pa-icon-btn { width: 22px; height: 22px; border-radius: 6px; font-size: 11px; }
    .pa-win-body { flex: 1; min-height: 0; padding: 8px 8px 12px; overflow: auto; scrollbar-width: thin; }
    .pa-win .pa-win-grip { border-bottom-right-radius: 11px; }

    /* ---------- zmieniacz zestawów ---------- */
    .pa-builds-win { min-width: 0; }
    .pa-builds-win .pa-win-head { padding: 2px 3px 2px 7px; gap: 3px; }
    .pa-builds-win .pa-win-head b { font-size: 9.5px; letter-spacing: .5px; }
    .pa-builds-win .pa-win-head .pa-icon-btn { width: 16px; height: 16px; font-size: 9px; border-radius: 4px; }
    .pa-builds-win .pa-win-body { padding: 6px; display: flex; flex-direction: column; }
    .pa-builds-grid { display: grid; gap: 4px; --pa-bfs: 10px; }
    .pa-build {
      position: relative;
      display: flex;
      align-items: center;
      gap: .45em;
      min-width: 0;
      height: 100%;
      padding: 0 .5em 0 .25em;
      border: 1px solid var(--pa-border);
      border-radius: 6px;
      background: var(--pa-surface);
      color: var(--pa-text);
      font: 600 var(--pa-bfs) var(--pa-font);
      text-align: left;
      cursor: pointer;
      overflow: hidden;
      transition: border-color .15s ease, background .15s ease;
    }
    .pa-build:hover { border-color: var(--pa-border-strong); background: var(--pa-surface-2); }
    .pa-build .pa-build-no {
      flex: 0 0 auto;
      min-width: 1.45em;
      height: 1.45em;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: .9em;
      background: rgba(0,0,0,.35);
      color: var(--pa-muted);
    }
    .pa-build .pa-build-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pa-build.pa-current { border-color: var(--pa-accent); background: color-mix(in srgb, var(--pa-accent) 16%, transparent); }
    .pa-build.pa-current .pa-build-no { background: var(--pa-accent); color: #111; }
    .pa-build.pa-pending { border-color: #f5c451; animation: pa-pulse 1.1s ease-in-out infinite; }
    @keyframes pa-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(245,196,81,.0); } 50% { box-shadow: 0 0 0 2px rgba(245,196,81,.35); } }
    .pa-builds-compact .pa-build { padding: 0; justify-content: center; }
    .pa-builds-compact .pa-build .pa-build-no { background: none; min-width: 0; }
    .pa-builds-compact .pa-build.pa-current .pa-build-no { background: none; color: var(--pa-accent); }
    .pa-builds-compact .pa-build .pa-build-name { display: none; }
    .pa-builds-status { margin-top: 4px; font-size: 9.5px; color: var(--pa-muted); }
    .pa-builds-status:empty { display: none; }
    .pa-builds-status { white-space: pre-line; }
    .pa-build .pa-build-prof {
      flex: 0 0 auto;
      padding: 0 .3em;
      border-radius: 3px;
      font-size: .8em;
      background: rgba(255,255,255,.12);
      color: var(--pa-text);
    }
    .pa-builds-compact .pa-build .pa-build-prof { display: none; }
    .pa-builds-win .pa-win-head .pa-b-ai { width: auto; padding: 0 4px; font-weight: 700; font-size: 8.5px; }
    .pa-bprof-grid { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }
    .pa-bprof-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 6px 5px 9px;
      border: 1px solid var(--pa-border);
      border-radius: 8px;
      background: rgba(0,0,0,.28);
    }
    .pa-bprof-name { flex: 1; min-width: 0; font-size: 11.5px; font-weight: 600; color: var(--pa-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pa-bprof-chips { display: flex; flex-wrap: wrap; gap: 3px; justify-content: flex-end; }
    .pa-chip {
      min-width: 34px;
      padding: 3px 6px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 6px;
      background: #1a1c25;
      color: #c9cdd8;
      font: 600 10.5px var(--pa-font);
      cursor: pointer;
    }
    .pa-chip:hover { border-color: var(--pa-border-strong); color: #fff; }
    .pa-chip.pa-on { background: color-mix(in srgb, var(--pa-accent) 75%, #000); border-color: var(--pa-accent); color: #fff; }
    .pa-builds-status.pa-warn { color: #f5c451; }
    .pa-builds-empty { padding: 4px 2px; color: var(--pa-muted); font-size: 10.5px; line-height: 1.4; max-width: 200px; }

    /* ---------- Nowa mapa ---------- */
    .pa-mm {
      position: absolute;
      display: none;
      z-index: 13;
      font-family: var(--pa-font);
      color: var(--pa-text);
      user-select: none;
    }
    .pa-mm.pa-mm-fixed { position: fixed; z-index: 2147483400; }
    /* mapa + lista graczy w jednym panelu, z rozmyciem tła */
    .pa-mm.pa-visible {
      display: flex;
      align-items: stretch;
      animation: pa-pop .16s ease-out;
      border: 1px solid var(--pa-border-strong);
      border-radius: 14px;
      background: rgba(14, 16, 23, .72);
      backdrop-filter: blur(14px) saturate(1.25);
      -webkit-backdrop-filter: blur(14px) saturate(1.25);
      box-shadow: var(--pa-shadow), inset 0 1px 0 rgba(255,255,255,.06);
      overflow: hidden;
    }
    .pa-mm-col { flex: 0 0 auto; padding: 6px; align-self: flex-start; }
    .pa-mm-side { align-self: flex-start; box-sizing: border-box; }
    .pa-mm-side {
      display: none;
      flex-direction: column;
      gap: 6px;
      width: 240px;
      padding: 10px;
      overflow-y: auto;
      scrollbar-width: thin;
      border-left: 1px solid var(--pa-border);
      background: rgba(255,255,255,.02);
    }
    .pa-mm-side.pa-visible { display: flex; }
    .pa-mm-side-title { font: 700 10.5px var(--pa-font); letter-spacing: .6px; text-transform: uppercase; color: var(--pa-accent); padding: 0 2px 6px; border-bottom: 1px solid var(--pa-border); margin-bottom: 2px; }
    .pa-mm-row {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 6px 6px 6px 8px;
      border: 1px solid var(--pa-border);
      border-radius: 9px;
      background: var(--pa-surface);
      cursor: pointer;
    }
    .pa-mm-row:hover { border-color: var(--pa-border-strong); background: var(--pa-surface-2); }
    .pa-mm-row-dot { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 1px #000, 0 0 6px currentColor; }
    .pa-mm-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .pa-mm-row-text b { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pa-mm-row-text small { font-size: 10px; color: var(--pa-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pa-mm-go {
      flex: 0 0 auto;
      padding: 4px 8px;
      border: 1px solid var(--pa-accent);
      border-radius: 7px;
      background: color-mix(in srgb, var(--pa-accent) 22%, transparent);
      color: var(--pa-text);
      font: 700 10.5px var(--pa-font);
      cursor: pointer;
    }
    .pa-mm-go:hover { background: var(--pa-accent); color: #111; }
    .pa-mm-row-text b em { font-style: normal; font-weight: 600; color: var(--pa-muted); font-size: .92em; }
    /* dużo graczy – ciaśniej */
    .pa-mm-side.pa-mm-dense { gap: 3px; }
    .pa-mm-dense .pa-mm-row { padding: 3px 5px 3px 7px; border-radius: 7px; gap: 6px; }
    .pa-mm-dense .pa-mm-row-text b { font-size: 11px; }
    .pa-mm-dense .pa-mm-row-text small { font-size: 9.5px; }
    .pa-mm-dense .pa-mm-go { padding: 2px 7px; font-size: 10px; }
    .pa-mm-xdense .pa-mm-row { padding: 2px 4px 2px 6px; }
    .pa-mm-xdense .pa-mm-row-text { flex-direction: row; align-items: baseline; gap: 6px; }
    .pa-mm-xdense .pa-mm-row-text b { flex: 1 1 auto; min-width: 0; }
    .pa-mm-xdense .pa-mm-kind, .pa-mm-xdense .pa-mm-xy { display: none; }
    .pa-mm-xdense .pa-mm-row-text small { flex: 0 0 auto; }
    .pa-mm-xdense .pa-mm-row-dot { width: 8px; height: 8px; }
    .pa-mm-xdense .pa-mm-go { padding: 1px 6px; }
    .pa-mm-go.pa-mm-stop { border-color: var(--pa-danger); background: rgba(255,93,108,.25); }
    .pa-mm-go.pa-mm-stop:hover { background: var(--pa-danger); color: #fff; }
    .pa-mm-row.pa-mm-chasing { border-color: var(--pa-danger); box-shadow: 0 0 0 1px rgba(255,93,108,.35); }
    .pa-mm-side-title + .pa-mm-row ~ .pa-mm-side-title { margin-top: 6px; }
    .pa-mm-map {
      position: relative;
      overflow: hidden;
      border-radius: 9px;
      background-color: #1b1d26;
      background-repeat: no-repeat;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.6);
      cursor: crosshair;
    }
    .pa-mm-objects { position: absolute; inset: 0; pointer-events: none; }
    .pa-mm-obj {
      position: absolute;
      left: 0;
      top: 0;
      will-change: transform;
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,.55);
      pointer-events: none;
    }
    .pa-mm-obj.pa-mm-anim { transition: transform .45s linear; }
    .pa-mm-obj.pa-mm-gw { border-radius: 3px; box-shadow: 0 0 0 1px rgba(255,255,255,.35); }
    .pa-mm-obj.pa-mm-player { box-shadow: 0 0 0 1px rgba(0,0,0,.8); }
    .pa-mm-obj.pa-mm-pulse {
      overflow: visible;
      box-shadow: 0 0 0 2px #000, 0 0 10px 2px currentColor;
      animation: pa-mm-glow .9s ease-in-out infinite;
    }
    .pa-mm-obj.pa-mm-pulse::before, .pa-mm-obj.pa-mm-pulse::after {
      content: '';
      position: absolute;
      inset: -2px;
      border: 2px solid currentColor;
      border-radius: 50%;
      animation: pa-mm-ring 1.6s ease-out infinite;
      pointer-events: none;
    }
    .pa-mm-obj.pa-mm-pulse::after { animation-delay: .8s; }
    @keyframes pa-mm-ring { 0% { transform: scale(1); opacity: .95; } 100% { transform: scale(3.4); opacity: 0; } }
    .pa-mm-obj.pa-mm-resp, .pa-mm-obj.pa-mm-respEvent { background: transparent !important; border: 2px solid #c6ba35; box-shadow: none; }
    .pa-mm-obj.pa-mm-respEvent { border-color: #00bfff; }
    .pa-mm-obj.pa-mm-resp.pa-mm-near {
      border: 3px solid #fff36b;
      background: rgba(255, 236, 80, .45) !important;
      box-shadow: 0 0 0 1px #000, 0 0 10px 3px rgba(255, 236, 80, .8);
      z-index: 150 !important;
    }
    .pa-mm-obj.pa-mm-marker { animation: pa-mm-flash .5s steps(2) infinite; border-radius: 3px; }
    @keyframes pa-mm-flash { 50% { filter: invert(1); } }
    @keyframes pa-mm-glow { 50% { box-shadow: 0 0 0 2px #fff, 0 0 18px 6px currentColor; filter: brightness(1.2); } }
    .pa-mm-hero {
      position: absolute;
      z-index: 300;
      left: 0;
      top: 0;
      border-radius: 3px;
      background: #ff2a2a;
      box-shadow: 0 0 0 1.5px #fff, 0 0 8px rgba(255,42,42,.9);
      pointer-events: none;
      will-change: transform;
    }
    .pa-mm-view {
      position: absolute;
      z-index: 250;
      left: 0;
      top: 0;
      border: 1px solid rgba(255,230,90,.9);
      border-radius: 3px;
      background: rgba(255,230,90,.06);
      box-sizing: border-box;
      pointer-events: none;
      will-change: transform;
    }
    .pa-mm-coords {
      position: absolute;
      left: 6px;
      bottom: 6px;
      z-index: 400;
      padding: 2px 7px;
      border-radius: 999px;
      font: 700 11px var(--pa-font);
      color: #fff;
      background: rgba(10,11,16,.72);
      border: 1px solid rgba(255,255,255,.14);
      pointer-events: none;
    }
    .pa-mm-msg { display: none; position: absolute; inset: 0; padding: 30px 16px; text-align: center; color: var(--pa-muted); font-size: 12px; }
    .pa-mm-col { box-sizing: border-box; }
    .pa-mm-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 8px;
      padding: 6px 2px 0 4px;
      font: 11px var(--pa-font);
      white-space: nowrap;
      min-width: 0;
    }
    .pa-mm-bar label { flex: 1 1 110px; min-width: 0; }
    .pa-mm-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 1px 4px 6px 2px;
      cursor: move;
      user-select: none;
      white-space: nowrap;
      overflow: hidden;
    }
    .pa-mm-head:active { cursor: grabbing; }
    .pa-mm-grip { color: var(--pa-muted); font-size: 11px; letter-spacing: -2px; opacity: .7; }
    .pa-mm-head .pa-mm-name { font-size: 11px; }
    .pa-mm-tools { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; margin-left: auto; }
    .pa-mm-brand { font-weight: 700; font-size: 10.5px; letter-spacing: .6px; text-transform: uppercase; color: var(--pa-accent); }
    .pa-mm-sep { display: none; }
    .pa-mm-name { flex: 1 1 60px; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--pa-muted); }
    .pa-mm-bar label { display: flex; align-items: center; gap: 4px; color: transparent; font-size: 0; }
    .pa-mm-bar input {
      width: 100%;
      min-width: 0;
      height: 22px;
      padding: 0 9px;
      border: 1px solid var(--pa-border);
      border-radius: 7px;
      background: rgba(0,0,0,.3);
      color: var(--pa-text);
      font: 11.5px var(--pa-font);
      outline: none;
    }
    .pa-mm-bar input:focus { border-color: var(--pa-accent); }
    .pa-mm-bar input::placeholder { color: var(--pa-muted); }
    .pa-mm-gear {
      width: 22px;
      height: 22px;
      padding: 0;
      border: 1px solid var(--pa-border);
      border-radius: 7px;
      background: var(--pa-surface);
      color: var(--pa-muted);
      font-size: 12px;
      line-height: 20px;
      cursor: pointer;
    }
    .pa-mm-gear:hover { color: var(--pa-accent); border-color: var(--pa-accent); }
    .pa-mm-close:hover { color: var(--pa-danger); border-color: var(--pa-danger); }
    .pa-mm-zoom { display: inline-flex; align-items: center; gap: 4px; }
    .pa-mm-zoom [data-mm-zoom-val] { min-width: 30px; text-align: center; font: 600 10.5px var(--pa-font); color: var(--pa-muted); }
    .pa-mm-zoom .pa-mm-gear { font-size: 14px; line-height: 19px; }

    html.pa-mm-replace .c-window.handheld-window {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* ---------- berserker ---------- */
    .pa-berserk-icon {
      position: absolute;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: 1px solid rgba(255,93,108,.7);
      background: radial-gradient(circle at 50% 40%, rgba(255,93,108,.4), rgba(20,8,10,.95) 75%);
      box-shadow: 0 0 7px rgba(255,60,60,.5);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 50;
      color: #ffd1d1;
      transition: filter .15s ease, box-shadow .15s ease, transform .1s ease;
      touch-action: none;
    }
    .pa-berserk-icon svg { width: 16px; height: 16px; pointer-events: none; }
    .pa-berserk-icon:hover { transform: scale(1.12); }
    .pa-berserk-icon.pa-off {
      border-color: rgba(255,255,255,.2);
      background: rgba(18,19,26,.92);
      box-shadow: none;
      color: #8d93a5;
    }
    .pa-berserk-icon.pa-off::after {
      content: '';
      position: absolute;
      width: 20px;
      height: 2px;
      background: rgba(255,93,108,.85);
      transform: rotate(-45deg);
      border-radius: 2px;
    }
    .pa-berserk-icon .pa-berserk-badge {
      position: absolute;
      right: -5px;
      bottom: -5px;
      padding: 0 2px;
      border-radius: 4px;
      background: #111;
      border: 1px solid var(--pa-border-strong);
      font: 700 8px/1.2 var(--pa-font);
      color: var(--pa-muted);
      pointer-events: none;
    }
    .pa-berserk-icon.pa-fixed { position: fixed; }
    .pa-tip {
      position: fixed;
      z-index: 2147483600;
      padding: 6px 9px;
      border-radius: 8px;
      background: var(--pa-bg-solid);
      border: 1px solid var(--pa-border-strong);
      color: var(--pa-text);
      font: 11.5px/1.4 var(--pa-font);
      pointer-events: none;
      box-shadow: var(--pa-shadow);
      display: none;
      max-width: 260px;
    }

    /* ---------- gracze na mapie: rozmiar ---------- */
    .pa-who-grip {
      position: absolute;
      right: 1px;
      bottom: 1px;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      z-index: 30;
      touch-action: none;
      background:
        linear-gradient(135deg, transparent 0 50%, color-mix(in srgb, var(--pa-accent) 85%, transparent) 50% 58%, transparent 58% 68%, color-mix(in srgb, var(--pa-accent) 85%, transparent) 68% 76%, transparent 76%);
      opacity: .65;
      border-bottom-right-radius: 6px;
    }
    .pa-who-grip:hover { opacity: 1; }
    .whoishere-window.pa-who-resizable .who-is-here { width: 100% !important; }
    .whoishere-window.pa-who-resizable .scroll-wrapper { max-height: none !important; }
    .whoishere-window.pa-who-resizing { user-select: none; }
    .whoishere-window .player-list { width: auto !important; max-width: 100% !important; box-sizing: border-box; }
    .whoishere-window .player-list > * { min-width: 0; max-width: 100% !important; box-sizing: border-box !important; }
    .whoishere-window .player-list > .pa-who-row { padding-right: 4px !important; overflow: hidden; }
    .whoishere-window .pa-who-nickwrap { display: flex !important; align-items: baseline; white-space: nowrap; }
    .whoishere-window .pa-who-nickwrap { width: 100%; }
    .whoishere-window .pa-who-nk { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }
    .whoishere-window .pa-who-lv { flex: 0 0 auto; min-width: 46px; margin-left: 6px; text-align: right; white-space: nowrap; pointer-events: none; opacity: .95; }

`;

        style.textContent += OLD_CSS_TAIL + `

    /* ---------- odświeżone okienka (Titan Helper) / Hide and seek ---------- */
    .pa-thp-window {
      background: var(--pa-bg) !important;
      backdrop-filter: var(--pa-blur);
      border: 1px solid var(--pa-border-strong) !important;
      border-radius: 12px !important;
      box-shadow: var(--pa-shadow) !important;
      font-family: var(--pa-font) !important;
    }
    .pa-thp-title {
      color: var(--pa-accent) !important;
      letter-spacing: .6px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--pa-accent) 16%, transparent), transparent) !important;
      border-bottom: 1px solid var(--pa-border) !important;
      padding: 7px 10px !important;
    }
    #pilnowacz-box {
      padding-top: 6px !important;
      padding-bottom: 6px !important;
    }
  `;

        document.head.appendChild(style);
    }

    // ------------------------------------------------------------------
    //  KATALOG DODATKÓW (karty w modalu)
    // ------------------------------------------------------------------
    const ADDONS = [
        {
            key: 'minimap',
            stateKey: 'mmEnabled',
            icon: '🗺️',
            name: 'Nowa mapa',
            tag: 'Interfejs',
            isNew: true,
            desc: 'Nowa mapa podręczna zamiast tej z gry: cała lokacja z zaznaczonymi mobami, elitami, herosami, NPC, graczami (sojusznicy, wrogowie) i przejściami, prostokąt widoku, współrzędne pod kursorem i wyszukiwarka (nazwa albo „x,y”). Kliknięcie na mapie = idź tam. Otwiera się zamiast mapy podręcznej z gry.',
            settings: () => `
              <div class="pa-row">
                <label class="pa-field"><span>Rozmiar (% ekranu, 30–100)</span><input type="number" min="30" max="100" step="5" data-pa-opt-num="mmSize"></label>
                <label class="pa-field"><span>Krycie (%)</span><input type="number" min="30" max="100" step="5" data-pa-opt-num="mmOpacity"></label>
                <label class="pa-field"><span>Własny klawisz (opcjonalnie)</span><input type="text" maxlength="1" placeholder="np. n" data-pa-mm-hotkey></label>
              </div>
              <label class="pa-check"><input type="checkbox" data-pa-opt="mmShowMobs"> Pokazuj zwykłe moby</label>
              <label class="pa-check"><input type="checkbox" data-pa-opt="mmShowNpcs"> Pokazuj NPC</label>
              <label class="pa-check"><input type="checkbox" data-pa-opt="mmShowOthers"> Pokazuj innych graczy</label>
              <label class="pa-check"><input type="checkbox" data-pa-opt="mmChaseAttack"> Przycisk przy graczu: goń i atakuj (wyłączone = tylko goń)</label>
              <label class="pa-check"><input type="checkbox" data-pa-opt="mmShowSpawns"> Pokazuj respy herosów (kółka z obwódką)</label>
              <div class="pa-row"><label class="pa-field"><span>Zasięg wykrywania respu (kratki) – sprawdzony resp zostaje podświetlony</span><input type="number" min="1" max="60" step="1" data-pa-opt-num="mmSpawnRange"></label></div>
              <p class="pa-hint">Kolory: <b style="color:#ff2a2a">■</b> ty · <b style="color:#4d6bff">●</b> moby · <b style="color:#00ffe9">●</b> elity · <b style="color:#039689">●</b> elity II · <b style="color:#ff9f1a">●</b> elity III (tytani, herosi i E3 pulsują) · <b style="color:#ffd23f">●</b> herosi · <b style="color:#ff4dd2">●</b> herosi eventowi · <b style="color:#b6ff1a">●</b> tytani · <b style="color:#ddff00">●</b> NPC · <b style="color:#fff">●</b> gracze · <b style="color:#08ad00">●</b> klan/znajomi · <b style="color:#ff3b3b">●</b> wrogowie · <b style="color:#2b3cff">■</b> przejścia</p>
              <div class="pa-row"><button type="button" class="pa-btn" data-pa-action="mm-open">Otwórz Nową mapę</button><button type="button" class="pa-btn" data-pa-action="mm-reset-pos">Przywróć pozycję mapy</button></div>
              <p class="pa-hint">Mapę przesuwasz, łapiąc za jej górny pasek z nazwą.</p>`,
        },
        {
            key: 'builds',
            stateKey: 'buildsEnabled',
            icon: '🎽',
            name: 'Zmieniacz zestawów',
            tag: 'Ekwipunek',
            isNew: true,
            desc: 'Okienko z zestawami ekwipunku – nazwy pobierane prosto z gry. Kliknięcie zakłada zestaw. Jeśli trwa walka, zmiana jest kolejkowana i wykonywana od razu po jej zakończeniu (ponowne kliknięcie anuluje). PPM na zestawie – zmiana nazwy. Tryb AI sam zakłada zestaw przypisany do profesji najbliższego wroga. Okienko można przesuwać i rozciągać za prawy dolny róg.',
            settings: () => `
              <p class="pa-hint" data-pa-b-hero style="color:var(--pa-accent)"></p>
              <div class="pa-sub">Profesje zestawów (dla AI) – można zaznaczyć kilka</div>
              <div class="pa-bprof-grid" data-pa-b-profs></div>
              <div class="pa-sub">AI zestawów</div>
              <label class="pa-check"><input type="checkbox" data-pa-b-aiopt> Włącz AI – zakładaj zestaw pod profesję najbliższego wroga</label>
              <label class="pa-check"><input type="checkbox" data-pa-opt="buildsAIEnemiesOnly"> Tylko gracze oznaczeni jako wrogowie (bez neutralnych)</label>
              <div class="pa-row"><label class="pa-field"><span>Zasięg wykrywania (kratki)</span><input type="number" min="3" max="80" step="1" data-pa-opt-num="buildsAIRange"></label></div>
              <p class="pa-hint">Klan, sojusznicy i znajomi są pomijani. W walce zmiana czeka do jej końca. AI możesz też przełączać przyciskiem „AI” w okienku zestawów.</p>
              <label class="pa-check"><input type="checkbox" data-pa-opt="buildsCompact"> Tryb kompaktowy (same numery)</label>
              <div class="pa-row"><button type="button" class="pa-btn" data-pa-action="builds-reset-pos">Przywróć pozycję i rozmiar okienka</button></div>`,
        },
        {
            key: 'berserk',
            stateKey: 'berserkEnabled',
            icon: '⚔️',
            name: 'Berserker',
            tag: 'Walka',
            isNew: true,
            desc: 'Mała ikonka między tarczą a przyciskiem „Rozwiń” przy ekwipunku, która jednym kliknięciem włącza lub wyłącza automatyczne atakowanie mobów (berserk z ustawień gry). W grupie przełącza berserk drużynowy. Ikonkę można przeciągnąć w inne miejsce.',
            settings: () => `
              <div class="pa-split">
                <div data-pa-bers-side="solo"></div>
                <div data-pa-bers-side="group"></div>
              </div>
              <p class="pa-hint">Ustawienia zapisują się w grze (te same co w opcjach Margonem). Poziomy są względne do twojego poziomu.</p>
              <div class="pa-row"><button type="button" class="pa-btn" data-pa-action="berserk-reset-pos">Przywróć pozycję ikonki</button></div>`,
        },
        {
            key: 'who',
            stateKey: 'whoResizeEnabled',
            icon: '↔️',
            name: 'Gracze na mapie – rozmiar',
            tag: 'Interfejs',
            isNew: true,
            desc: 'Pozwala dowolnie zmieniać szerokość i wysokość okna „Gracze na mapie” – złap uchwyt w prawym dolnym rogu okna. Rozmiar jest zapamiętywany.',
            settings: () => `
              <p class="pa-hint" data-pa-who-size></p>
              <div class="pa-row"><button type="button" class="pa-btn" data-pa-action="who-reset">Przywróć domyślny rozmiar</button></div>`,
        },
        {
            key: 'titan',
            stateKey: 'titanEnabled',
            icon: '🛡️',
            name: 'Titan Helper',
            tag: 'Walka',
            desc: 'Podczas walki pokazuje aktywne efekty i aury na postaciach, punkty kombinacji, szał, użycia leków itp. – w osobnym okienku i/lub w dymkach postaci.',
            settings: () => `
              <label class="pa-check"><input type="checkbox" data-pa-opt="titanWindow"> Okno z efektami podczas walki</label>
              <label class="pa-check"><input type="checkbox" data-pa-opt="titanTooltips"> Efekty w dymkach postaci</label>
              <label class="pa-check"><input type="checkbox" data-pa-opt="titanHighlightOwn"> Podświetlaj moje efekty</label>`,
        },
        {
            key: 'notifier',
            stateKey: 'notifierEnabled',
            icon: '📣',
            name: 'Notificator',
            tag: 'Klan',
            desc: 'Przesuwany panel z przyciskami „idę” / „nie idę”, które od razu wysyłają wiadomość na czat. Dodaje też przycisk „idę” przy powiadomieniach lootloga (z nazwą moba).',
        },
        {
            key: 'timers',
            stateKey: 'timersCollectorEnabled',
            icon: '⏱️',
            name: 'Timers-Collector',
            tag: 'Klan',
            desc: 'Grupuje timery w oknie timerów na zwijane sekcje: Tytani, Herosi i E2. Kliknij nagłówek grupy, by ją zwinąć lub rozwinąć.',
        },
        {
            key: 'pilnowacz',
            stateKey: 'pilnowaczEnabled',
            icon: '👁️',
            name: 'Hide and seek',
            tag: 'Klan',
            desc: 'Okienko z liczbą graczy online spoza sojuszniczych klanów w przedziałach poziomów pod konkretne tytany. Najedź na liczbę, by zobaczyć nicki. Odświeża się co 5 s.',
        },
        {
            key: 'huge',
            stateKey: 'hugeMessageEnabled',
            icon: '💬',
            name: 'Huge message',
            tag: 'Czat',
            desc: 'Nowe wiadomości od innych graczy z czatu lootloga wyskakują w dużym, przesuwanym oknie, żeby niczego nie przegapić.',
            settings: () => `
              <div class="pa-row">
                <label class="pa-field"><span>Twój nick (twoje wiadomości są pomijane)</span><input type="text" data-pa-huge-nick placeholder="nick z DC / lootloga"></label>
              </div>
              <div class="pa-row">
                <label class="pa-field"><span>Kolor tła</span><input type="text" data-pa-huge-bg placeholder="#0B1224"></label>
                <label class="pa-field"><span>Kolor wiadomości</span><input type="text" data-pa-huge-text-color placeholder="#FFD84D"></label>
              </div>
              <div class="pa-row">
                <label class="pa-field"><span>Obramówka</span><input type="text" data-pa-huge-border placeholder="rgba(255,77,90,.28)"></label>
                <label class="pa-field"><span>Znikanie po (s, 0 = nigdy)</span><input type="number" min="0" data-pa-huge-auto-close placeholder="0"></label>
              </div>
              <label class="pa-field"><span>Box shadow okna</span><input type="text" data-pa-huge-box-shadow placeholder="0 10px 40px rgba(0,0,0,.55)"></label>
              <div class="pa-row"><button type="button" class="pa-btn pa-primary" data-pa-huge-save>Zapisz</button></div>`,
        },
    ];

    const GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

    function renderAddonCard(addon) {
        const tag = `<span class="pa-tag${addon.isNew ? ' pa-new' : ''}">${addon.isNew ? 'Nowy' : addon.tag}</span>`;
        const gear = addon.settings ? `<button type="button" class="pa-gear" data-pa-gear="${addon.key}">Ustawienia ▾</button>` : '';
        const settings = addon.settings
            ? `<div class="pa-card-settings" data-pa-settings="${addon.key}">${addon.settings()}</div>`
            : '';
        const search = `${addon.name} ${addon.tag} ${addon.desc}`.toLowerCase().replace(/"/g, '');
        return `
          <div class="pa-card" data-pa-card="${addon.key}" data-pa-search="${search}">
            <div class="pa-card-main">
              <div class="pa-card-icon">${addon.icon}</div>
              <div class="pa-card-text">
                <div class="pa-card-name">${addon.name} ${tag}</div>
                <p class="pa-card-desc">${addon.desc}</p>
              </div>
              <div class="pa-card-side">
                <button class="pa-switch" type="button" data-pa-toggle="${addon.key}" title="Włącz / wyłącz"></button>
                ${gear}
              </div>
            </div>
            ${settings}
          </div>`;
    }

    function createRoot() {
        const existing = document.getElementById(ADDON_ID);
        if (existing) existing.remove();

        const root = document.createElement('div');
        root.id = ADDON_ID;
        root.innerHTML = `
    <div class="pa-toast" data-pa-toast></div>

    <div class="pa-notifier" data-pa-notifier>
      <button class="pa-notify-button pa-go" type="button" data-pa-send="ide">idę</button>
      <button class="pa-notify-button pa-no-go" type="button" data-pa-send="nie ide">nie idę</button>
    </div>

    <div class="pa-huge-message" data-pa-huge-message>
      <div class="pa-huge-title" data-pa-huge-drag>Nowa wiadomość</div>
      <div class="pa-huge-content">
        <div class="pa-huge-meta" data-pa-huge-meta></div>
        <div class="pa-huge-text" data-pa-huge-text></div>
      </div>
      <div class="pa-huge-buttons">
        <button class="pa-huge-ok" type="button" data-pa-huge-ok>OK</button>
        <button class="pa-huge-ok" type="button" data-pa-huge-close-all>Zamknij wszystkie</button>
      </div>
    </div>

    <button class="pa-main-button" type="button" data-pa-main title="Panel dodatków">${GEAR_SVG}</button>
  `;
        document.body.appendChild(root);

        // modal – osobno w <body>, żeby był nad oknami gry
        document.getElementById(`${ADDON_ID}-modal`)?.remove();
        const modal = document.createElement('div');
        modal.id = `${ADDON_ID}-modal`;
        modal.className = 'pa-modal';
        modal.setAttribute('data-pa-menu', '');
        modal.innerHTML = `
      <div class="pa-dialog" role="dialog" aria-label="Panel dodatków">
        <div class="pa-dialog-head">
          <div class="pa-card-icon" style="color:var(--pa-accent)">${GEAR_SVG.replace('<svg ', '<svg width="18" height="18" ')}</div>
          <div class="pa-dialog-title">
            <b>Panel dodatków</b>
            <small>Dark-Sad · v${PANEL_VERSION} · <span data-pa-count></span></small>
          </div>
          <input class="pa-search" type="text" placeholder="Szukaj dodatku…" data-pa-search-input>
          <button type="button" class="pa-icon-btn" data-pa-close title="Zamknij (Esc)">✕</button>
        </div>
        <div class="pa-dialog-body">
          <div class="pa-section-title">Dodatki</div>
          <div class="pa-grid">${ADDONS.map(renderAddonCard).join('')}</div>
          <div class="pa-empty-search" data-pa-empty>Brak dodatków pasujących do wyszukiwania.</div>
          <div class="pa-coffee-footer">
            <a class="pa-coffee-btn" href="https://buycoffee.to/darksad" target="_blank" rel="noopener noreferrer">☕ Postaw kawę</a>
          </div>

        </div>
      </div>`;
        document.body.appendChild(modal);

        return root;
    }

    function getModal() {
        return document.getElementById(`${ADDON_ID}-modal`);
    }

    function showToast(message) {
        const toast = document.querySelector(`#${ADDON_ID} [data-pa-toast]`);
        if (!toast) return;

        toast.textContent = message;
        toast.classList.add('pa-visible');

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('pa-visible');
        }, 2200);
    }

    function getChatInput() {
        return document.querySelector('[data-slot="chat-input"][contenteditable="true"]');
    }

    function selectChatContent(input) {
        const selection = window.getSelection();
        const range = document.createRange();

        range.selectNodeContents(input);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function typeIntoChat(input, text) {
        input.focus();
        input.click();
        selectChatContent(input);

        const ok = document.execCommand('insertText', false, text);

        if (!ok) {
            input.textContent = text;
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                composed: true,
                inputType: 'insertText',
                data: null,
            }));
        }
    }

    function pressEnter(input) {
        const options = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
        };

        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', options));
        input.dispatchEvent(new KeyboardEvent('keypress', options));
        input.dispatchEvent(new KeyboardEvent('keyup', options));
    }

    function forceEmptyChatInput(input, expectedText) {
        const currentText = input.textContent.trim();
        if (currentText !== expectedText.trim()) return;

        input.textContent = '';
        input.innerHTML = '';

        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: 'deleteContentBackward',
            data: null,
        }));

        input.dispatchEvent(new Event('change', {
            bubbles: true,
            cancelable: true,
            composed: true,
        }));

        input.blur();
    }

    function cleanupStuckCommand(input, message) {
        [150, 350, 700].forEach((delay) => {
            setTimeout(() => forceEmptyChatInput(input, message), delay);
        });
    }

    function sendChatMessage(message) {
        try {
            const input = getChatInput();

            if (!input) {
                showToast('Nie znaleziono pola chatu.');
                return;
            }

            typeIntoChat(input, message);

            setTimeout(() => {
                pressEnter(input);
                cleanupStuckCommand(input, message);
            }, 60);

            showToast(`Próba wysłania: ${message}`);
        } catch (error) {
            console.error('[darksad-addon] Błąd wysyłania wiadomości:', error);
            showToast('Błąd wysyłania.');
        }
    }

    function applyNotifierPosition(notifier) {
        if (!state.notifierPosition) return;

        notifier.style.left = `${state.notifierPosition.left}px`;
        notifier.style.top = `${state.notifierPosition.top}px`;
        notifier.style.bottom = 'auto';
    }

    function syncUi(root) {
        root = root || document.getElementById(ADDON_ID);
        const modal = getModal();
        if (!root || !modal) return;

        modal.classList.toggle('pa-open', state.menuOpen);

        let activeCount = 0;
        ADDONS.forEach((addon) => {
            const on = Boolean(state[addon.stateKey]);
            if (on) activeCount++;
            const card = modal.querySelector(`[data-pa-card="${addon.key}"]`);
            if (!card) return;
            card.classList.toggle('pa-enabled', on);
            card.querySelector(`[data-pa-toggle="${addon.key}"]`)?.classList.toggle('pa-active', on);
            const open = Boolean(state.openSettings[addon.key]);
            card.querySelector(`[data-pa-settings="${addon.key}"]`)?.classList.toggle('pa-open', open);
            const gear = card.querySelector(`[data-pa-gear="${addon.key}"]`);
            if (gear) {
                gear.classList.toggle('pa-on', open);
                gear.textContent = open ? 'Ustawienia ▴' : 'Ustawienia ▾';
            }
        });
        const count = modal.querySelector('[data-pa-count]');
        if (count) count.textContent = `aktywne: ${activeCount}/${ADDONS.length}`;

        // ustawienia proste (checkboxy / liczby)
        modal.querySelectorAll('[data-pa-opt]').forEach((input) => {
            input.checked = Boolean(state[input.getAttribute('data-pa-opt')]);
        });
        modal.querySelectorAll('[data-pa-opt-num]').forEach((input) => {
            if (document.activeElement !== input) input.value = state[input.getAttribute('data-pa-opt-num')];
        });

        // huge message
        const setVal = (sel, val) => {
            const el = modal.querySelector(sel);
            if (el && document.activeElement !== el) el.value = val;
        };
        setVal('[data-pa-huge-auto-close]', state.hugeAutoCloseSeconds);
        setVal('[data-pa-huge-nick]', state.hugeMyNick);
        setVal('[data-pa-huge-bg]', state.hugeBgColor);
        setVal('[data-pa-huge-border]', state.hugeBorderColor);
        setVal('[data-pa-huge-box-shadow]', state.hugeBoxShadow);
        setVal('[data-pa-huge-text-color]', state.hugeTextColor);
        applyHugeMessagePosition(root.querySelector('[data-pa-huge-message]'));

        const mmKey = modal.querySelector('[data-pa-mm-hotkey]');
        if (mmKey && document.activeElement !== mmKey) mmKey.value = state.mmHotkey || '';

        // sekcje nowych dodatków
        berserk.renderSettings(modal);
        builds.renderSettings(modal);
        whoResize.renderSettings(modal);

        // notyfikator
        const notifier = root.querySelector('[data-pa-notifier]');
        notifier.classList.toggle('pa-visible', state.notifierEnabled);
        applyNotifierPosition(notifier);
    }

    function toHexColor(color) {
        const c = String(color || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(c)) return c;
        if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((x) => x + x).join('');
        const m = c.match(/\d+/g);
        if (m && m.length >= 3) return '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
        return '#e8b04a';
    }

    function makeNotifierDraggable(root) {
        const notifier = root.querySelector('[data-pa-notifier]');

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        notifier.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (event.target.closest('button')) return;

            const rect = notifier.getBoundingClientRect();

            isDragging = true;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            notifier.style.left = `${rect.left}px`;
            notifier.style.top = `${rect.top}px`;
            notifier.style.bottom = 'auto';

            event.preventDefault();
        });

        window.addEventListener('mousemove', (event) => {
            if (!isDragging) return;

            const nextLeft = Math.max(0, Math.min(window.innerWidth - notifier.offsetWidth, startLeft + event.clientX - startX));
            const nextTop = Math.max(0, Math.min(window.innerHeight - notifier.offsetHeight, startTop + event.clientY - startY));

            notifier.style.left = `${nextLeft}px`;
            notifier.style.top = `${nextTop}px`;
            notifier.style.bottom = 'auto';
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;

            isDragging = false;

            const rect = notifier.getBoundingClientRect();

            state.notifierPosition = {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
            };

            saveSettings();
        });
    }

    function getMobType(text) {
        if (text.includes('[T]')) return 't';
        if (text.includes('[H]')) return 'h';
        if (text.includes('[E2]')) return 'e2';
        return null;
    }

    function getTimersGrid() {
        const timersWindow = document.querySelector('#ll-timers');
        if (!timersWindow) return null;

        const candidates = [...timersWindow.querySelectorAll('span')];

        let best = null;
        let bestCount = 0;

        candidates.forEach((el) => {
            const className = String(el.className || '');
            if (!className.includes('grid')) return;

            const children = [...el.children];
            const count = children.filter((child) => getMobType(child.textContent || '')).length;

            if (count > bestCount) {
                best = el;
                bestCount = count;
            }
        });

        return best;
    }

    function createTimerHeader(type, title) {
        const header = document.createElement('div');
        header.className = 'tc-header';
        header.dataset.tcHeader = '1';
        header.dataset.tcGroup = type;

        if (type === 't') header.style.order = '0';
        if (type === 'h') header.style.order = '1000';
        if (type === 'e2') header.style.order = '2000';

        header.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            collapsedGroups[type] = !collapsedGroups[type];
            saveSettings();
            updateTimerVisibility();
        });

        return header;
    }

    function updateTimerVisibility() {
        const grid = getTimersGrid();
        if (!grid) return;

        const counts = {
            t: 0,
            h: 0,
            e2: 0,
        };

        [...grid.children].forEach((el) => {
            if (el.dataset.tcHeader) return;

            const type = getMobType(el.textContent || '');
            if (!type) return;

            counts[type]++;

            el.dataset.tcMobType = type;

            if (type === 't') el.style.order = '10';
            else if (type === 'h') el.style.order = '1010';
            else if (type === 'e2') el.style.order = '2010';
            else el.style.order = '9999';

            el.style.display = collapsedGroups[type] ? 'none' : '';
        });

        const headers = {
            t: grid.querySelector('[data-tc-group="t"]'),
            h: grid.querySelector('[data-tc-group="h"]'),
            e2: grid.querySelector('[data-tc-group="e2"]'),
        };

        if (headers.t) {
            headers.t.textContent = `${collapsedGroups.t ? '▶' : '▼'} Tytani (${counts.t})`;
            headers.t.style.display = counts.t ? '' : 'none';
        }

        if (headers.h) {
            headers.h.textContent = `${collapsedGroups.h ? '▶' : '▼'} Herosi (${counts.h})`;
            headers.h.style.display = counts.h ? '' : 'none';
        }

        if (headers.e2) {
            headers.e2.textContent = `${collapsedGroups.e2 ? '▶' : '▼'} E2 (${counts.e2})`;
            headers.e2.style.display = counts.e2 ? '' : 'none';
        }
    }

    function ensureHeaders(grid) {
        if (grid.querySelector('[data-tc-header="1"]')) return;

        const tHeader = createTimerHeader('t', 'Tytani');
        const hHeader = createTimerHeader('h', 'Herosi');
        const e2Header = createTimerHeader('e2', 'E2');

        tHeader.style.order = '0';
        hHeader.style.order = '1000';
        e2Header.style.order = '2000';

        grid.appendChild(tHeader);
        grid.appendChild(hHeader);
        grid.appendChild(e2Header);
    }
    const TC_TIMER_COL_WIDTH = 145;
    const TC_MIN_TIMERS_HEIGHT = 120;

    function fixTimersGridWidth() {
        const grid = getTimersGrid();
        if (!grid) return;
    }

    function applyTimersWindowSize(win) {
        if (!win) return;

        const savedWidth = Number(localStorage.getItem('tc_timers_width'));
        const savedHeight = Number(localStorage.getItem('tc_timers_height'));

        if (savedWidth) win.style.width = `${savedWidth}px`;
        if (savedHeight) win.style.height = `${Math.max(TC_MIN_TIMERS_HEIGHT, savedHeight)}px`;

        //win.style.setProperty('min-width', `${TC_MIN_TIMERS_WIDTH}px`, 'important');

        fixTimersGridWidth();
    }

    function restoreTimersWindowSize() {
        const win = document.querySelector('#ll-timers[data-ll-draggable-window="timers"]');
        if (!win || win.dataset.tcSizeRestored) return;

        applyTimersWindowSize(win);
        win.dataset.tcSizeRestored = '1';
    }

    function patchTimersResizeHandle() {
        const win = document.querySelector('#ll-timers[data-ll-draggable-window="timers"]');
        if (!win || win.dataset.tcResizePatched) return;

        const handle = win.querySelector('[data-ll-window-resize-handle]');
        if (!handle) return;

        win.dataset.tcResizePatched = '1';
        applyTimersWindowSize(win);

        const grid = getTimersGrid();

        handle.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const startX = event.clientX;
            const startY = event.clientY;
            const startWidth = win.offsetWidth;
            const startHeight = win.offsetHeight;

            function onMove(moveEvent) {
                const nextWidth = startWidth + moveEvent.clientX - startX;
                const nextHeight = Math.max(TC_MIN_TIMERS_HEIGHT, startHeight + moveEvent.clientY - startY);

                win.style.width = `${nextWidth}px`;
                win.style.height = `${nextHeight}px`;

                localStorage.setItem('tc_timers_width', String(nextWidth));
                localStorage.setItem('tc_timers_height', String(nextHeight));

                fixTimersGridWidth();
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup', onUp, true);
            }

            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup', onUp, true);
        }, true);
    }

    function renderTimersGroups() {
        if (!state.timersCollectorEnabled) return;
        if (timersRenderLock) return;

        const grid = getTimersGrid();
        if (!grid) return;

        restoreTimersWindowSize();
        patchTimersResizeHandle();
        fixTimersGridWidth();
        timersRenderLock = true;

        ensureHeaders(grid);
        updateTimerVisibility();

        timersRenderLock = false;
    }

    let timersGridObserver = null;
    let timersRenderQueued = false;

    function scheduleTimersRender() {
        if (!state.timersCollectorEnabled) return;
        if (timersRenderQueued) return;

        timersRenderQueued = true;

        requestAnimationFrame(() => {
            timersRenderQueued = false;

            const grid = getTimersGrid();

            if (grid && observedTimersGrid !== grid) {
                observedTimersGrid = grid;

                if (timersGridObserver) {
                    timersGridObserver.disconnect();
                }

                const timersWindow = document.querySelector('#ll-timers');
                if (timersWindow) {
                    restoreTimersWindowSize();
                }

                timersGridObserver = new MutationObserver(() => {
                    scheduleTimersRender();
                });

                timersGridObserver.observe(grid, {
                    childList: true,
                });
            }

            renderTimersGroups();
        });
    }

    let observedTimersGrid = null;

    function observeTimersWindow() {
        if (timersFinderObserver) return;

        timersFinderObserver = new MutationObserver(() => {
            if (!state.timersCollectorEnabled) return;
            const win = document.querySelector('#ll-timers[data-ll-draggable-window="timers"]');

            if (win && !win.dataset.tcSizeApplied) {
                applyTimersWindowSize(win);
                win.dataset.tcSizeApplied = '1';
            }
            const grid = getTimersGrid();
            if (!grid) return;

            if (observedTimersGrid !== grid) {
                observedTimersGrid = grid;

                if (timersGridObserver) {
                    timersGridObserver.disconnect();
                }

                timersGridObserver = new MutationObserver(() => {
                    scheduleTimersRender();
                });

                timersGridObserver.observe(grid, {
                    childList: true,
                });
            }

            scheduleTimersRender();
        });

        timersFinderObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });

        scheduleTimersRender();
    }

    function removeTimerHeaders() {
        const grid = getTimersGrid();
        if (!grid) return;

        [...grid.children].forEach((el) => {
            if (el.dataset.tcHeader) {
                el.remove();
                return;
            }

            el.style.order = '';
            el.style.display = '';
            delete el.dataset.tcMobType;
        });
    }

    // co się dzieje po włączeniu / wyłączeniu dodatku
    const TOGGLE_HANDLERS = {
        notifier(on) {
            if (on) scanNotifications();
            showToast(on ? 'Notyfikator włączony' : 'Notyfikator wyłączony');
        },
        timers(on) {
            if (on) {
                scheduleTimersRender();
                showToast('Timers-Collector włączony');
            } else {
                removeTimerHeaders();
                showToast('Timers-Collector wyłączony');
            }
        },
        async pilnowacz(on) {
            if (on) {
                showToast('Hide and seek włączony');
                await startPilnowacz();
            } else {
                stopPilnowacz();
                showToast('Hide and seek wyłączony');
            }
        },
        huge(on, root) {
            if (on) markExistingHugeMessagesSeen();
            else hideHugeMessage(root);
            showToast(on ? 'Huge message włączony' : 'Huge message wyłączony');
        },
        titan(on) {
            if (on) titanHelper.enable();
            else titanHelper.disable();
            showToast(on ? 'Titan Helper włączony' : 'Titan Helper wyłączony');
        },
        berserk(on) {
            berserk.setEnabled(on);
            showToast(on ? 'Berserker: ikonka dodana obok ekwipunku' : 'Berserker wyłączony');
        },
        who(on) {
            whoResize.setEnabled(on);
            showToast(on ? 'Złap prawy dolny róg okna „Gracze na mapie”' : 'Zmiana rozmiaru okna graczy wyłączona');
        },
        minimap(on) {
            miniMap.setEnabled(on);
            showToast(on ? 'Nowa mapa włączona – otwórz podręczną mapę w grze' : 'Nowa mapa wyłączona');
        },
        builds(on) {
            builds.setEnabled(on);
            showToast(on ? 'Zmieniacz zestawów włączony' : 'Zmieniacz zestawów wyłączony');
        },
    };

    function setMenuOpen(open, focusKey) {
        state.menuOpen = open;
        if (open && focusKey) state.openSettings[focusKey] = true;
        syncUi();
        const modal = getModal();
        if (open && modal) {
            applyTheme();
            if (focusKey) {
                setTimeout(() => modal.querySelector(`[data-pa-card="${focusKey}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
            }
        }
    }

    function filterAddonCards(modal, query) {
        const q = query.trim().toLowerCase();
        let visible = 0;
        modal.querySelectorAll('.pa-grid [data-pa-card]').forEach((card) => {
            const hit = !q || card.getAttribute('data-pa-search').includes(q);
            card.classList.toggle('pa-hidden', !hit);
            if (hit) visible++;
        });
        modal.querySelector('[data-pa-empty]').style.display = visible ? 'none' : 'block';
    }

    function bindEvents(root) {
        const modal = getModal();

        root.querySelector('[data-pa-main]').addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen(!state.menuOpen);
        });

        // --- modal: zamykanie ---
        modal.addEventListener('mousedown', (event) => {
            if (event.target === modal) setMenuOpen(false);
        });
        modal.querySelector('[data-pa-close]').addEventListener('click', () => setMenuOpen(false));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.menuOpen) {
                event.stopPropagation();
                setMenuOpen(false);
            }
        }, true);

        // klawisze wpisywane w polach modala nie trafiają do gry
        ['keydown', 'keyup', 'keypress'].forEach((type) => {
            modal.addEventListener(type, (event) => {
                if (event.key === 'Escape') return;
                if (event.target.matches('input, textarea, select')) event.stopPropagation();
            });
        });

        modal.querySelector('[data-pa-search-input]').addEventListener('input', (event) => {
            filterAddonCards(modal, event.target.value);
        });

        // --- przełączniki i przyciski (delegacja) ---
        modal.addEventListener('click', async (event) => {
            const toggle = event.target.closest('[data-pa-toggle]');
            if (toggle) {
                event.preventDefault();
                const key = toggle.getAttribute('data-pa-toggle');
                const addon = ADDONS.find((a) => a.key === key);
                if (!addon) return;
                state[addon.stateKey] = !state[addon.stateKey];
                saveSettings();
                syncUi(root);
                try {
                    await TOGGLE_HANDLERS[key]?.(state[addon.stateKey], root);
                } catch (error) {
                    console.error(`[darksad-addon] Błąd dodatku ${key}:`, error);
                }
                return;
            }

            const gear = event.target.closest('[data-pa-gear]');
            if (gear) {
                event.preventDefault();
                const key = gear.getAttribute('data-pa-gear');
                state.openSettings[key] = !state.openSettings[key];
                syncUi(root);
                return;
            }

            const chip = event.target.closest('[data-pa-bprof-id]');
            if (chip) {
                event.preventDefault();
                builds.toggleProf(chip.getAttribute('data-pa-bprof-id'), chip.getAttribute('data-pa-bprof-p'));
                builds.renderSettings(modal, true);
                return;
            }

            const action = event.target.closest('[data-pa-action]');
            if (action) {
                event.preventDefault();
                const name = action.getAttribute('data-pa-action');
                if (name === 'builds-reset-pos') builds.resetPosition();
                if (name === 'berserk-reset-pos') berserk.resetPosition();
                if (name === 'who-reset') whoResize.reset();
                if (name === 'mm-reset-pos') miniMap.resetPosition();
                if (name === 'mm-open') {
                    setMenuOpen(false);
                    miniMap.toggle(true);
                }
                syncUi(root);
                return;
            }

            if (event.target.closest('[data-pa-huge-save]')) {
                event.preventDefault();
                state.hugeMyNick = modal.querySelector('[data-pa-huge-nick]').value.trim();
                state.hugeBgColor = modal.querySelector('[data-pa-huge-bg]').value.trim() || '#0B1224';
                state.hugeBorderColor = modal.querySelector('[data-pa-huge-border]').value.trim() || 'rgba(255,77,90,.28)';
                state.hugeBoxShadow = modal.querySelector('[data-pa-huge-box-shadow]').value.trim() ||
                    '0 10px 40px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,77,90,.12)';
                state.hugeTextColor = modal.querySelector('[data-pa-huge-text-color]').value.trim() || '#FFD84D';
                state.hugeAutoCloseSeconds = Math.max(0, Number(modal.querySelector('[data-pa-huge-auto-close]').value || 0));
                saveSettings();
                showToast('Ustawienia Huge message zapisane');
            }
        });

        // --- proste opcje ---
        modal.addEventListener('change', (event) => {
            const input = event.target;

            if (input.matches('[data-pa-opt]')) {
                const key = input.getAttribute('data-pa-opt');
                state[key] = input.checked;
                saveSettings();
                if (key.startsWith('titan')) titanHelper.setOptions(getTitanOptions());
                if (key.startsWith('builds')) builds.render();
                if (key.startsWith('mm')) miniMap.refresh();
                return;
            }

            if (input.matches('[data-pa-opt-num]')) {
                const key = input.getAttribute('data-pa-opt-num');
                const min = Number(input.min || 0);
                const max = Number(input.max || 9999);
                state[key] = Math.min(max, Math.max(min, Number(input.value) || min));
                input.value = state[key];
                saveSettings();
                if (key.startsWith('builds')) builds.render();
                if (key.startsWith('mm')) miniMap.refresh();
                return;
            }

            if (input.matches('[data-pa-b-aiopt]')) {
                builds.setAI(input.checked);
                return;
            }

            if (input.matches('[data-pa-bprof]')) {
                const id = input.getAttribute('data-pa-bprof');
                if (!state.buildsProf) state.buildsProf = {};
                if (input.value) state.buildsProf[id] = input.value;
                else delete state.buildsProf[id];
                saveSettings();
                builds.render();
                return;
            }

            if (input.matches('[data-pa-mm-hotkey]')) {
                state.mmHotkey = (input.value || '').trim().slice(0, 1).toLowerCase();
                input.value = state.mmHotkey;
                saveSettings();
                return;
            }

            if (input.matches('[data-pa-bers]')) {
                berserk.onSettingsInput(input);
            }
        });

        // --- notyfikator ---
        root.querySelectorAll('[data-pa-send]').forEach((button) => {
            button.addEventListener('mousedown', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });

            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                sendChatMessage(button.getAttribute('data-pa-send'));
            });
        });

        root.querySelector('[data-pa-huge-ok]').addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            hideHugeMessage(root);
        });
    }

    function getNotificationMobName(notificationRow) {
        // nowy layout: kolumna info -> [autor · czas · mapa], [nazwa moba (lvl)], [lokacja (x,y)]
        const info = notificationRow.querySelector('.ll\\:flex-col');
        const nameEl = info?.children?.[1]?.querySelector('.ll\\:font-semibold');
        if (nameEl) return nameEl.textContent.trim();

        // fallback: stary sposób
        const names = [...notificationRow.querySelectorAll('.ll\\:font-semibold')];
        return names[1] ? names[1].textContent.trim() : '';
    }

    function addGoButtonToNotification(notificationRow) {
        if (notificationRow.querySelector('[data-pa-notification-go]')) return;

        const actions =
            notificationRow.querySelector('[aria-label="Opcje wyciszenia"]')?.parentElement ||
            notificationRow.querySelector('div.ll\\:flex.ll\\:shrink-0.ll\\:items-center.ll\\:gap-1') ||
            notificationRow.querySelector('div.ll\\:relative.ll\\:flex.ll\\:shrink-0.ll\\:items-center');

        if (!actions) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'idę';
        button.dataset.paNotificationGo = '1';
        button.className = 'll:text-[11px] ll:border ll:rounded-sm ll:transition-colors ll:flex ll:items-center ll:justify-center ll:border-gray-400/50 ll:bg-transparent ll:hover:bg-white/8 ll:px-0 ll-custom-cursor-pointer';
        button.style.color = 'white';
        button.style.width = '28px';
        button.style.height = '24px';
        button.style.marginRight = '2px';
        button.style.fontSize = '11px';
        button.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const mobName = getNotificationMobName(notificationRow);

            if (!mobName) {
                sendChatMessage(`ide`);
            } else {
                sendChatMessage(`ide ${mobName}`);
            }
        });

        actions.prepend(button);
    }

    function scanNotifications() {
        if (!state.notifierEnabled) return;

        // nowy layout: każdy wiersz ma data-lootlog-notification-id
        let rows = document.querySelectorAll('[data-lootlog-notification-id]');

        if (!rows.length) {
            const notificationsWindow = document.querySelector('#ll-notifications');
            if (!notificationsWindow) return;
            rows = notificationsWindow.querySelectorAll('.ll\\:relative.ll\\:flex.ll\\:items-center.ll\\:gap-2');
        }

        if (state.notifierEnabled) {
            rows.forEach(addGoButtonToNotification);
        }
    }

    function observeNotificationsWindow() {
        const observer = new MutationObserver(() => {
            scanNotifications();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        scanNotifications();
    }

    async function startPilnowacz() {
        if (document.getElementById('pilnowacz-box')) return;

        createTooltip();
        setupTooltipEvents();

        const box = createUI();

        await fetchGuildCharIds();
        await loop(box);

        state.pilnowaczInterval = setInterval(() => loop(box), 5000);
    }

    function stopPilnowacz() {
        clearInterval(state.pilnowaczInterval);
        state.pilnowaczInterval = null;

        document.getElementById('pilnowacz-box')?.remove();
        document.getElementById('pilnowacz-tooltip')?.remove();
    }

    const LEVEL_RANGES = [{
            min: 141,
            max: 144,
            label: "Arcy"
        },
        {
            min: 163,
            max: 167,
            label: "Zoons"
        },
        {
            min: 173,
            max: 190,
            label: "Ruda"
        },
        {
            min: 204,
            max: 217,
            label: "Przyzyw"
        },
        {
            min: 227,
            max: 244,
            label: "Magua"
        },
        {
            min: 258,
            max: 271,
            label: "Tezica"
        },
        {
            min: 300,
            max: Infinity,
            label: "Tanro"
        }
    ];

    const GUILD_IDS = [1458, 14683, 4109, 3352, 16552];

    let guildCharIds = [];

    async function fetchGuildCharIds() {
        let ids = [];

        const requests = GUILD_IDS.map(id => {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `https://www.margonem.pl/guilds/view,lelwani,${id}`,
                    onload: function(response) {
                        const text = response.responseText;

                        const regex = /char_(\d+)/g;
                        let match;

                        while ((match = regex.exec(text)) !== null) {
                            ids.push(match[1]);
                        }

                        resolve();
                    },
                    onerror: function() {
                        console.error("Guild fetch error:", id);
                        resolve();
                    }
                });
            });
        });

        await Promise.all(requests);
        guildCharIds = [...new Set(ids)];
    }

    async function fetchOnlinePlayers() {
        const res = await fetch("https://public-api.margonem.pl/info/online/lelwani.json");
        let players = await res.json();

        return players.filter(p => !guildCharIds.includes(String(p.c)));
    }

    function countPlayers(players) {
        const result = {};

        LEVEL_RANGES.forEach(range => {
            const filtered = players.filter(p => {
                const lvl = parseInt(p.l);
                return lvl >= range.min && lvl <= range.max;
            });

            result[range.label] = {
                count: filtered.length,
                players: filtered
            };
        });

        return result;
    }

    function createTooltip() {
        const tooltip = document.createElement("div");
        tooltip.id = "pilnowacz-tooltip";

        tooltip.style.position = "fixed";
        tooltip.style.background = "rgba(38,18,52,0.95)";
        tooltip.style.color = "#e9dbff";
        tooltip.style.padding = "8px";
        tooltip.style.border = "1px solid #9a59ff";
        tooltip.style.borderRadius = "8px";
        tooltip.style.fontSize = "11px";
        tooltip.style.pointerEvents = "none";
        tooltip.style.zIndex = 10000;
        tooltip.style.display = "none";
        tooltip.style.whiteSpace = "pre-line";
        tooltip.style.boxShadow = "0 0 10px rgba(154,89,255,.45)";

        document.body.appendChild(tooltip);
    }

    function createUI() {
        const box = document.createElement("div");
        box.id = "pilnowacz-box";

        const savedX = localStorage.getItem("pilnowacz_x");
        const savedY = localStorage.getItem("pilnowacz_y");

        box.style.position = "fixed";
        box.style.top = savedY ? savedY + "px" : "100px";
        box.style.left = savedX ? savedX + "px" : "20px";
        box.style.background = "rgba(27,15,36,0.2)";
        box.style.backdropFilter = "blur(2px)";
        box.style.color = "#e9dbff";
        box.style.padding = "10px";
        box.style.border = "1px solid rgba(192,140,255,.25)";
        box.style.borderRadius = "10px";
        box.style.zIndex = 10;
        box.style.fontSize = "12px";
        box.style.minWidth = "80px";
        box.style.cursor = "move";
        box.style.boxShadow = "0 0 15px rgba(154,89,255,.45)";

        box.innerHTML = "Ładowanie...";

        document.body.appendChild(box);

        let isDragging = false,
            offsetX, offsetY;

        box.addEventListener("mousedown", (e) => {
            isDragging = true;
            offsetX = e.clientX - box.offsetLeft;
            offsetY = e.clientY - box.offsetTop;
        });

        document.addEventListener("mousemove", (e) => {
            if (isDragging) {
                const newX = Math.max(0, Math.min(window.innerWidth - box.offsetWidth, e.clientX - offsetX));
                const newY = Math.max(0, Math.min(window.innerHeight - box.offsetHeight, e.clientY - offsetY));

                box.style.left = newX + "px";
                box.style.top = newY + "px";
            }
        });

        document.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                localStorage.setItem("pilnowacz_x", box.offsetLeft);
                localStorage.setItem("pilnowacz_y", box.offsetTop);
            }
        });

        return box;
    }

    function updateUI(box, data) {
        let html = "";

        for (const [label, obj] of Object.entries(data)) {
            const {
                count,
                players
            } = obj;

            let color = "#e9dbff";

            if (count >= 5 && count <= 8) {
                color = "#ffd966";
            } else if (count > 8) {
                color = "#ff4d4d";
            }

            const tooltipData = players.map(p =>
                `${p.n} (${p.l}${p.p})`
            ).join("|");

            html += `
            <div>
                🔹 ${label}:
                <b class="pilnowacz-count"
                   data-tooltip="${tooltipData}"
                   style="color:${color}; cursor:pointer;">
                   ${count}
                </b>
            </div>
        `;
        }

        box.innerHTML = html;
    }

    function setupTooltipEvents() {
        document.addEventListener("mouseover", (e) => {
            const target = e.target;

            if (target.classList.contains("pilnowacz-count")) {
                const tooltip = document.getElementById("pilnowacz-tooltip");
                const data = target.getAttribute("data-tooltip");

                tooltip.innerText = data.split("|").join("\n");

                tooltip.style.visibility = "hidden";
                tooltip.style.display = "block";

                positionTooltip(e, tooltip);

                tooltip.style.visibility = "visible";
            }
        });

        document.addEventListener("mousemove", (e) => {
            const tooltip = document.getElementById("pilnowacz-tooltip");

            if (tooltip.style.display === "block") {
                positionTooltip(e, tooltip);
            }
        });

        document.addEventListener("mouseout", (e) => {
            if (e.target.classList.contains("pilnowacz-count")) {
                const tooltip = document.getElementById("pilnowacz-tooltip");
                tooltip.style.display = "none";
            }
        });
    }

    function positionTooltip(e, tooltip) {
        const padding = 15;

        const tooltipWidth = tooltip.offsetWidth;
        const tooltipHeight = tooltip.offsetHeight;

        let x = e.clientX + padding;
        let y = e.clientY + padding;

        if (x + tooltipWidth > window.innerWidth) {
            x = e.clientX - tooltipWidth - padding;
        }

        if (y + tooltipHeight > window.innerHeight) {
            y = e.clientY - tooltipHeight - padding;
        }

        if (x < 0) x = 5;
        if (y < 0) y = 5;

        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";
    }

    async function loop(box) {
        try {
            const players = await fetchOnlinePlayers();
            const counts = countPlayers(players);
            updateUI(box, counts);
        } catch (e) {
            box.innerHTML = "❌ Błąd pobierania";
            console.error(e);
        }
    }


    // === HUGE MESSAGE START ===

    function applyHugeMessagePosition(box) {
        if (!box || !state.hugeMessagePosition) return;

        box.style.left = `${state.hugeMessagePosition.left}px`;
        box.style.top = `${state.hugeMessagePosition.top}px`;
        box.style.transform = 'none';
    }

    function makeHugeMessageDraggable(root) {
        const box = root.querySelector('[data-pa-huge-message]');
        const handle = root.querySelector('[data-pa-huge-drag]');
        if (!box || !handle) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        handle.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;

            const rect = box.getBoundingClientRect();

            isDragging = true;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            box.style.left = `${rect.left}px`;
            box.style.top = `${rect.top}px`;
            box.style.transform = 'none';

            event.preventDefault();
            event.stopPropagation();
        });

        window.addEventListener('mousemove', (event) => {
            if (!isDragging) return;

            const nextLeft = Math.max(0, Math.min(window.innerWidth - box.offsetWidth, startLeft + event.clientX - startX));
            const nextTop = Math.max(0, Math.min(window.innerHeight - box.offsetHeight, startTop + event.clientY - startY));

            box.style.left = `${nextLeft}px`;
            box.style.top = `${nextTop}px`;
            box.style.transform = 'none';
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;

            isDragging = false;

            const rect = box.getBoundingClientRect();

            state.hugeMessagePosition = {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
            };

            saveSettings();
        });
    }

    function hideHugeMessage(root) {
        root.querySelector('[data-pa-huge-message]')?.classList.remove('pa-visible');
        document.querySelectorAll('[data-pa-huge-message-instance]').forEach((box) => box.remove());
    }

    function showHugeMessage(root, data) {
        const template = root.querySelector('[data-pa-huge-message]');
        if (!template) return;

        const box = template.cloneNode(true);
        box.removeAttribute('data-pa-huge-message');
        box.dataset.paHugeMessageInstance = '1';

        const meta = box.querySelector('[data-pa-huge-meta]');
        const text = box.querySelector('[data-pa-huge-text]');
        const ok = box.querySelector('[data-pa-huge-ok]');
        const closeAll = box.querySelector('[data-pa-huge-close-all]');
        const drag = box.querySelector('[data-pa-huge-drag]');

        if (!meta || !text || !ok || !closeAll || !drag) return;

        meta.innerHTML = '';
        text.textContent = data.message;

        const time = document.createElement('span');
        time.className = 'll:text-[11px] ll:select-text';
        time.textContent = data.time ? `[${data.time}] ` : '';

        const author = document.createElement('span');
        author.className = 'pa-huge-author ll:font-bold ll:select-text';
        author.textContent = data.author ? `${data.author}:` : 'Wiadomość:';
        if (data.authorColor) author.style.color = data.authorColor;

        meta.appendChild(time);
        meta.appendChild(author);

        const offset = document.querySelectorAll('[data-pa-huge-message-instance]').length * 22;
        const saved = state.hugeMessagePosition;

        box.style.background = `linear-gradient(180deg, ${state.hugeBgColor}, ${state.hugeBgColor})`;
        box.style.borderColor = state.hugeBorderColor;
        text.style.color = state.hugeTextColor;

        box.style.left = `${saved?.left ?? 420 + offset}px`;
        box.style.top = `${saved?.top ?? 120 + offset}px`;
        box.style.transform = 'none';

        box.classList.add('pa-visible');
        document.body.appendChild(box);

        requestAnimationFrame(() => {
            box.style.setProperty('box-shadow', state.hugeBoxShadow, 'important');
        });

        ok.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            box.remove();
        });

        closeAll.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            document.querySelectorAll('[data-pa-huge-message-instance]').forEach((win) => win.remove());
        });

        makeHugeSingleWindowDraggable(box, drag);

        if (state.hugeAutoCloseSeconds > 0) {
            setTimeout(() => {
                box.remove();
            }, state.hugeAutoCloseSeconds * 1000);
        }
    }

    function makeHugeSingleWindowDraggable(box, handle) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        handle.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;

            const rect = box.getBoundingClientRect();

            isDragging = true;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            box.style.left = `${rect.left}px`;
            box.style.top = `${rect.top}px`;
            box.style.transform = 'none';

            event.preventDefault();
            event.stopPropagation();
        });

        window.addEventListener('mousemove', (event) => {
            if (!isDragging) return;

            const nextLeft = Math.max(0, Math.min(window.innerWidth - box.offsetWidth, startLeft + event.clientX - startX));
            const nextTop = Math.max(0, Math.min(window.innerHeight - box.offsetHeight, startTop + event.clientY - startY));

            box.style.left = `${nextLeft}px`;
            box.style.top = `${nextTop}px`;
            box.style.transform = 'none';
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;

            isDragging = false;

            const rect = box.getBoundingClientRect();

            state.hugeMessagePosition = {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
            };

            saveSettings();
        });
    }

    function isHugeChatMessageRow(row) {
        if (!row || !(row instanceof HTMLElement)) return false;
        if (!row.matches('div[data-chat-message-id]')) return false;

        const messageText = getHugeBubble(row);
        const authorEl = getHugeAuthorEl(row);
        const author = (authorEl?.textContent || '').replace(/:$/, '').trim();

        if (state.hugeMyNick && author === state.hugeMyNick) return false;
        if (!authorEl || !messageText) return false;

        // ignoruje E2/info z obrazkiem/badge
        if (row.closest('[data-chat-row-key^="npc-group"]')) return false;
        if (row.querySelector('img')) return false;
        if (row.querySelector('.ll\\:bg-red-600')) return false;
        if (row.querySelector('.ll\\:bg-gray-700\\/80')) return false;

        return true;
    }

    function getHugeBubble(row) {
        return row.querySelector(':scope > [data-slot="bubble"]') ||
            row.querySelector(':scope > .ll\\:whitespace-pre-wrap');
    }

    function getHugeAuthorEl(row) {
        // autor to pierwszy tooltip-trigger poza cytatem odpowiedzi i poza bąbelkiem
        return [...row.querySelectorAll('[data-slot="tooltip-trigger"], .ll\\:font-bold')]
            .find((el) => !el.closest('button') && !el.closest('[data-slot="bubble"]')) || null;
    }

    function parseHugeChatMessage(row) {
        const timeEl = [...row.querySelectorAll('span')]
            .find((el) => !el.closest('[data-slot="bubble"]') && /^\[\d{1,2}:\d{2}\]$/.test(el.textContent.trim()));
        const authorEl = getHugeAuthorEl(row);
        const textEl = getHugeBubble(row);

        return {
            time: (timeEl?.textContent || '').replace(/^\[|\]$/g, '').trim(),
            author: (authorEl?.textContent || '').replace(/:$/, '').trim(),
            authorColor: authorEl?.style?.color || '',
            message: (textEl?.textContent || '').trim(),
        };
    }

    function markExistingHugeMessagesSeen() {
        document.querySelectorAll('div[data-chat-message-id]').forEach((row) => {
            const id = row.getAttribute('data-chat-message-id');
            if (id) hugeSeenMessageIds.add(id);
            row.dataset.paHugeSeen = '1';
        });
    }

    function observeHugeMessages(root) {
        if (hugeMessageObserver) hugeMessageObserver.disconnect();

        markExistingHugeMessagesSeen();

        hugeMessageObserver = new MutationObserver((mutations) => {
            if (!state.hugeMessageEnabled) return;

            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;

                    const rows = [];

                    if (node.matches?.('div[data-chat-message-id]')) {
                        rows.push(node);
                    }

                    node.querySelectorAll?.('div[data-chat-message-id]').forEach((row) => {
                        rows.push(row);
                    });

                    rows.forEach((row) => {
                        const id = row.getAttribute('data-chat-message-id');
                        if (!id) return;
                        if (hugeSeenMessageIds.has(id)) return;

                        hugeSeenMessageIds.add(id);
                        row.dataset.paHugeSeen = '1';

                        if (!isHugeChatMessageRow(row)) return;

                        const data = parseHugeChatMessage(row);
                        if (!data.message) return;

                        showHugeMessage(root, data);
                    });
                });
            });
        });

        hugeMessageObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    function getHugeChatRows() {
        return [...document.querySelectorAll('div[data-chat-message-id]')];
    }

    function waitForHugeChatReady(root) {
        const interval = setInterval(() => {
            const rows = getHugeChatRows();

            if (!rows.length) return;

            clearInterval(interval);

            markExistingHugeMessagesSeen();

            setTimeout(() => {
                markExistingHugeMessagesSeen();
                observeHugeMessages(root);
            }, 100);
        }, 500);
    }

    function linkifyChatMessages() {
    document.querySelectorAll('div[data-chat-message-id]').forEach((row) => {
        if (row.dataset.paLinkified === '1') return;

        row.style.userSelect = 'text';
        row.style.cursor = 'text';

        row.querySelectorAll('*').forEach((el) => {
            el.style.userSelect = 'text';
            el.style.webkitUserSelect = 'text';
        });

        const textWrap = row.querySelector(':scope > [data-slot="bubble"]') ||
            row.querySelector('.ll\\:whitespace-pre-wrap');
        if (!textWrap) return;

        const urlRegex = /(https?:\/\/[^\s<]+)/g;

        [...textWrap.childNodes].forEach((node) => {
            if (node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.ELEMENT_NODE) return;

            const text = node.textContent || '';
            if (!urlRegex.test(text)) return;

            const frag = document.createDocumentFragment();
            text.split(urlRegex).forEach((part) => {
                if (/^https?:\/\//.test(part)) {
                    const a = document.createElement('a');
                    a.href = part;
                    a.textContent = part;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.style.color = '#7dd3fc';
                    a.style.textDecoration = 'underline';
                    a.style.userSelect = 'text';
                    a.addEventListener('mousedown', (e) => e.stopPropagation());
                    a.addEventListener('click', (e) => e.stopPropagation());
                    frag.appendChild(a);
                } else {
                    frag.appendChild(document.createTextNode(part));
                }
            });

            node.replaceWith(frag);
        });

        row.dataset.paLinkified = '1';
    });
}

function observeChatLinks() {
    linkifyChatMessages();

    const observer = new MutationObserver(() => {
        linkifyChatMessages();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

    // === HUGE MESSAGE END ===

    // === TITAN HELPER START ===
    // Silnik titanHelper+ (autor: Priw8, zestaw Gargonem) wbudowany lokalnie,
    // bez pobierania kodu z gargonem.margoworld.pl. Pokazuje w walce aktywne
    // efekty/aury, punkty kombinacji, szał, użycia leków itd.
    const titanHelper = (function () {
        const window = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : globalThis.window;
        const document = window.document;

        // ---------- shimy zależności z Gargonem ----------
        const a0 = {
            get isNew() { return typeof window.Engine !== 'undefined'; },
            get isOld() { return typeof window.Engine === 'undefined' && typeof window.g !== 'undefined'; },
        };
        const noop = () => {};
        const ez = { child: () => ({ debug: noop, log: noop, info: noop, warn: noop, error: (...a) => console.warn('[TitanHelper]', ...a) }) };
        const oe = (msg) => console.warn('[TitanHelper]', msg);
        const rm = (e) => Object.assign({}, e);
        const rf = (e) => JSON.parse(JSON.stringify(e));
        // martwy kod (pobieranie listy umiejętności z API) – nie jest wywoływany
        const lI = () => false, lO = /<(![a-zA-Z\s]+)>/, lA = () => [], n6 = (x) => x, o9 = () => [], th = {};

        const eZ = {
            get() {
                if (a0.isNew) return window.Engine?.hero?.d || {};
                return window.hero || {};
            },
        };

        // prosty odpowiednik oS z Gargonem – zdarzenia "przed" i "po" przetworzeniu pakietu przez grę
        const oS = {
            handlers: {},
            add(key, fn) { (this.handlers[key] ||= []).push(fn); },
            addBefore(key, fn) { this.add(`before-${key}`, fn); },
            remove(key, fn) { const l = this.handlers[key]; if (l) { const i = l.indexOf(fn); if (i > -1) l.splice(i, 1); } },
            fire(key, data) {
                const l = this.handlers[key];
                if (!l) return;
                for (const fn of l.slice()) {
                    try { fn(data); } catch (err) { console.warn(`[TitanHelper] błąd w '${key}':`, err); }
                }
            },
            update(packet, before) {
                if (!packet || typeof packet !== 'object') return;
                for (const key in packet) this.fire(`${before ? 'before-' : ''}${key}`, packet[key]);
            },
        };

        // stan walki (odpowiednik eQ z Gargonem)
        const eQ = (function () {
            let n = null;
            const fix = (e) => { for (const t in e.w) e.w[t].id = parseInt(t); };
            oS.addBefore('f', (e) => {
                if (e.init == '1' && e.close) { n = null; }
                else if (e.init == '1') { n = rf(e); fix(n); }
                else if (n || e.close) {
                    if (e.close) n = null;
                    else {
                        for (const i in e.w) {
                            if (n.w[i]) Object.assign(n.w[i], rf(e.w[i]));
                        }
                        for (const t in e) if (t != 'w') n[t] = e[t];
                    }
                }
            });
            const isActive = () => n != null;
            const getOwnTeam = () => (n ? n.myteam : 0);
            return {
                get: () => n,
                isActive,
                getWarriorByID: (id) => (isActive() ? n.w[id] : null),
                getOwnTeam,
                getEnemyTeam: () => (getOwnTeam() == 1 ? 2 : 1),
            };
        })();

        const thpSettings = { highlightOwnEffects: true, siShowExactHealth: true };
        let tf, tm, tg, ty, tv, tw, tb, tk;
        const tE = { storage: { get: (k) => thpSettings[k] } };

        // ---------- dane umiejętności + silnik (wycięte 1:1 z Gargonem) ----------
        let lN={w:[[23,72,204,234,263,271],[22,29,39,168,188,205],[61,73,130,206,207,208],[20,24,31,36,106,184],[27,30,109,120,183,203],[32,34,42,43,110,119],[37,268,269,270,278,300]],b:[[82,84,94,209,213,263],[129,168,210,216,222,236],[61,125,127,214,219,223],[65,106,111,211,237,259],[66,120,212,225,229,230],[100,119,221,224,227,272],[228,267,268,269,270,279]],h:[[71,85,97,232,245,263],[96,168,218,235,241,264],[61,62,64,88,113,220],[81,106,173,178,179,253],[41,87,98,120,181,265],[67,75,119,180,217,256],[8,238,268,269,270,304]],m:[[11,12,21,58,70,263],[69,78,79,168,246,247],[61,107,123,167,258,277],[7,9,59,106,131,182],[46,49,54,120,262,302],[47,50,53,55,119,166],[56,101,266,268,269,270]],p:[[38,86,99,112,185,263],[25,108,168,186,187,198],[44,61,76,191,200,249],[18,106,199,250,251,252],[33,120,189,196,197,202],[45,92,119,201,273,276],[77,190,268,269,270,301]],t:[[14,26,68,239,243,263],[89,95,168,215,231,255],[61,90,105,192,240,248],[15,106,193,194,195,226],[120,233,244,254,257,274],[102,103,119,174,260,261],[242,268,269,270,275,303]]},l_=[25,35,50,80,120,170,230],lR={};for(let e in lN)for(let t=0;t<l_.length;++t){let n=l_[t];for(let i of lN[e][t])lR[i]=n}let lC=[{id:7,attrs:0,name:"Potęga błyskawic",desc:"Wyspecjalizowanie magii błyskawic prowadzi do zwiększenia twoich obrażeń krytycznych oraz wzmocnieniu bariery ochronnej, która szybciej się odnawia i zwiększa twoją odporność na ogłuszenie.",stats:{critmval_l:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],absagain_per:[{value:1.1,duration:1},{value:1.2,duration:1},{value:1.3,duration:1},{value:1.4,duration:1},{value:1.5,duration:1},{value:1.6,duration:1},{value:1.7,duration:1},{value:1.8,duration:1},{value:1.9,duration:1},{value:2,duration:1}],redstun:[{value:7,duration:1},{value:9,duration:1},{value:11,duration:1},{value:13,duration:1},{value:15,duration:1},{value:17,duration:1},{value:19,duration:1},{value:21,duration:1},{value:23,duration:1},{value:25,duration:1}],lightbon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"m",reqw:"light"}},{id:8,attrs:5,name:"Zdradziecki grot",desc:"Jeżeli przeciwnik zbytnio się do ciebie zbliży, atakujesz go z zaskoczenia niszcząc tym samym jego manę i energię.",stats:{manaendest:[{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1},{value:80,duration:1},{value:85,duration:1}],"dmg-target_absolute":[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:16,duration:1}]},reqs:{reqp:"h"}},{id:9,attrs:0,name:"Potęga zimna",desc:"Wyspecjalizowanie magii zimna prowadzi do zadawania obrażeń krytycznych częściej i o większej mocy oraz szybszego odnawiania twojej bariery ochronnej. Dodatkowo umożliwia niszczenie odporności przeciwnika wraz z każdym ciosem.",stats:{critmval_c:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],absagain_per:[{value:1.1,duration:1},{value:1.2,duration:1},{value:1.3,duration:1},{value:1.4,duration:1},{value:1.5,duration:1},{value:1.6,duration:1},{value:1.7,duration:1},{value:1.8,duration:1},{value:1.9,duration:1},{value:2,duration:1}],frostbon:[{value:.06,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.1,duration:1},{value:.11,duration:1},{value:.12,duration:1},{value:.13,duration:1},{value:.14,duration:1},{value:.15,duration:1}]},reqs:{reqp:"m",reqw:"frost"}},{id:11,attrs:0,name:"Koncentracja many",desc:"Umiejętność pozyskiwania i cyklicznego przywracania magicznej energii, która pozwala rzucać czary.",stats:{manabon:[{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1},{value:80,duration:1},{value:85,duration:1},{value:90,duration:1},{value:95,duration:1},{value:100,duration:1}],manastr:[{value:.05,duration:1},{value:.08,duration:1},{value:.1,duration:1},{value:.12,duration:1},{value:.14,duration:1},{value:.16,duration:1},{value:.18,duration:1},{value:.2,duration:1},{value:.22,duration:1},{value:.24,duration:1}],managain:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}]},reqs:{reqp:"m"}},{id:12,attrs:0,name:"Zwiększenie absorpcji",desc:"Potrafisz skutecznie skupiać moc magiczną, której nadmiarowe zasoby poświęcasz na wzmocnienie swojej bariery ochronnej. Każdy zadany cios przywraca ci część absorpcji oraz absorpcji magicznej.",stats:{absorbm_per:[{value:37,duration:1},{value:44,duration:1},{value:51,duration:1},{value:58,duration:1},{value:65,duration:1},{value:72,duration:1},{value:79,duration:1},{value:86,duration:1},{value:93,duration:1},{value:100,duration:1}],absorb_per:[{value:37,duration:1},{value:44,duration:1},{value:51,duration:1},{value:58,duration:1},{value:65,duration:1},{value:72,duration:1},{value:79,duration:1},{value:86,duration:1},{value:93,duration:1},{value:100,duration:1}],absagain_per:[{value:1.3,duration:1},{value:1.6,duration:1},{value:1.9,duration:1},{value:2.2,duration:1},{value:2.5,duration:1},{value:2.8,duration:1},{value:3.1,duration:1},{value:3.4,duration:1},{value:3.7,duration:1},{value:4,duration:1}]},reqs:{reqp:"m"}},{id:14,attrs:3,name:"Lodowa strzała",desc:"Za pomocą magii zaklinasz strzałę żywiołem zimna, która spowalnia wroga oraz ma szansę go zamrozić. Dodatkowe spowolnienie, jakie oferuje ta umiejętność, nie jest redukowane przez odporności.",stats:{slowfreeze_per:[{value:45,duration:2},{value:50,duration:2},{value:55,duration:2},{value:60,duration:2},{value:65,duration:2},{value:70,duration:2},{value:75,duration:2},{value:80,duration:2},{value:85,duration:2},{value:90,duration:2}],freeze:[{value:10,duration:1},{value:11,duration:1},{value:11,duration:1},{value:12,duration:1},{value:12,duration:1},{value:13,duration:1},{value:13,duration:1},{value:14,duration:1},{value:14,duration:1},{value:15,duration:1}],frostbon:[{value:.3,duration:1}],"combo-skill":[{value:1,duration:1}],mana:[{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1}]},reqs:{reqp:"t",reqw:"dis,frost"}},{id:15,attrs:0,name:"Krytyczne trafienie",desc:"Odpowiednie wyszkolenie w używaniu broni dystansowej daje ci zwiększone obrażenia krytyczne oraz 25% szansy na przyspieszenie się po krytycznym uderzeniu w przeciwnika.",stats:{critval:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}],critsa_per:[{value:1,duration:1},{value:1.5,duration:1},{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1}],agi:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"t",reqw:"dis"}},{id:18,attrs:0,name:"Krytyczne uderzenie",desc:"Wieloletni trening uskutecznił obrażenia fizyczne zadawane podczas ciosów krytycznych oraz wszelkie obrażenia zadawane potworom.",stats:{critval:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}],dmg_to_npc_per:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"p",reqw:"sw"}},{id:20,attrs:0,name:"Kontratak",desc:"Po przyjęciu ciosu krytycznego zwiększasz swoje obrażenia fizyczne o 10% oraz masz szansę wykonać skuteczną kontrę wymierzoną w atakującego cię przeciwnika. Nauka tej umiejętności zapewnia premię do odporności na żywioły.",stats:{contra:[{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1}],rage:[{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:1,duration:1}],resfire:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],resfrost:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],reslight:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],str2h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"w",reqw:"2h"}},{id:21,attrs:3,name:"Kula ognia",desc:"Atak magiczny z broni zaklętej żywiołem ognia, skupiony w niszczycielskiej kuli, podpalającej przy zetknięciu z celem.",stats:{"adddmg_fire-perw":[{value:15,duration:1},{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:39,duration:1},{value:43,duration:1},{value:47,duration:1},{value:51,duration:1},{value:55,duration:1}],"dmg-target_fire-perw":[{value:15,duration:2},{value:16,duration:2},{value:17,duration:2},{value:18,duration:2},{value:19,duration:2},{value:20,duration:3},{value:21,duration:3},{value:22,duration:3},{value:23,duration:4},{value:24,duration:4}],"combo-skill":[{value:1,duration:1}],mana:[{value:27,duration:1},{value:34,duration:1},{value:41,duration:1},{value:48,duration:1},{value:55,duration:1},{value:62,duration:1},{value:69,duration:1},{value:76,duration:1},{value:83,duration:1},{value:90,duration:1}],cooldown:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1}],firebon:[{value:.2,duration:1}]},reqs:{reqp:"m",reqw:"fire"}},{id:22,attrs:7,name:"Ogłuszający cios",desc:"Zadajesz atak w głowę, który zmniejsza obrażenia przeciwnika i ma szanse go ogłuszyć. Odpowiednia kombinacja pozwoli na zadanie dodatkowych nieuchronnych obrażeń.",stats:{stun:[{value:30,duration:1},{value:35,duration:1},{value:35,duration:1},{value:40,duration:1},{value:40,duration:1},{value:45,duration:1},{value:45,duration:1},{value:50,duration:1},{value:50,duration:1},{value:55,duration:1}],active_decblock_per:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:7,duration:1},{value:9,duration:1},{value:11,duration:1},{value:13,duration:1},{value:15,duration:1}],"adddmg_physical-perw":[{value:14,duration:1},{value:18,duration:1},{value:22,duration:1},{value:26,duration:1},{value:30,duration:1},{value:34,duration:1},{value:38,duration:1},{value:42,duration:1},{value:46,duration:1},{value:50,duration:1}],"combo_dmg_hpp-target":[{value:3.8,duration:1},{value:4,duration:1},{value:4.2,duration:1},{value:4.4,duration:1},{value:4.6,duration:1},{value:4.7,duration:1},{value:4.8,duration:1},{value:4.9,duration:1},{value:5,duration:1},{value:5.1,duration:1}],"combo-max":[{value:3,duration:1}],str2h:[{value:.1,duration:1}],cooldown:[{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1}],energy:[{value:18,duration:1},{value:22,duration:1},{value:26,duration:1},{value:30,duration:1},{value:34,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1}]},reqs:{reqp:"w",reqw:"2h"}},{id:23,attrs:7,name:"Niszczycielski cios",desc:"Skupiasz swoje uderzenie na pancerzu przeciwnika, starając się skruszyć jego pancerz. Celny cios chwilowo dekoncentruje przeciwnika sprawiając, że jego następny cios zada mniej obrażeń.",stats:{"active_acdmg_physical-perw":[{value:2.2,duration:1},{value:2.4,duration:1},{value:2.6,duration:1},{value:2.8,duration:1},{value:3,duration:1},{value:3.2,duration:1},{value:3.4,duration:1},{value:3.6,duration:1},{value:3.8,duration:1},{value:4,duration:1}],active_acdmg_per:[{value:2.1,duration:1},{value:2.2,duration:1},{value:2.3,duration:1},{value:2.4,duration:1},{value:2.5,duration:1},{value:2.6,duration:1},{value:2.7,duration:1},{value:2.8,duration:1},{value:2.9,duration:1},{value:3,duration:1}],lowdmg_enemy:[{value:10,duration:1},{value:11,duration:1},{value:11,duration:1},{value:12,duration:1},{value:12,duration:1},{value:13,duration:1},{value:13,duration:1},{value:14,duration:1},{value:14,duration:1},{value:15,duration:1}],"combo-skill":[{value:1,duration:1}],energy:[{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1}],str2h:[{value:.2,duration:1}]},reqs:{reqp:"w",reqw:"2h"}},{id:24,attrs:0,name:"Wytrzymałość",desc:"Dzięki ciężkiemu treningowi zwiększasz swoją ilość punktów życia, w zależności od ilości siły.",stats:{hpbon:[{value:1.2,duration:1},{value:1.4,duration:1},{value:1.6,duration:1},{value:1.8,duration:1},{value:2,duration:1},{value:2.2,duration:1},{value:2.4,duration:1},{value:2.6,duration:1},{value:2.8,duration:1},{value:3,duration:1}]},reqs:{reqp:"w"}},{id:25,attrs:1,name:"Prowokujący okrzyk",desc:"Wykonujesz zawołanie bitewne, które prowokuje przeciwników do atakowania tylko ciebie przez najbliższe tury. Podczas okrzyku zyskujesz większy pancerz ze swojej tarczy i odporność na ogłuszenie, a twoi kompani z pierwszej linii uzyskują większe obrażenia od broni białej.\n# shout to ilość przeciwników (randomowych) których zmusza się do ataku na siebie",stats:{shout:[{value:6,duration:3},{value:7,duration:3},{value:7,duration:3},{value:8,duration:3},{value:8,duration:3},{value:9,duration:3},{value:9,duration:3},{value:10,duration:3},{value:10,duration:3},{value:10,duration:3}],acshield_per:[{value:105,duration:1},{value:110,duration:1},{value:115,duration:1},{value:120,duration:1},{value:125,duration:1},{value:130,duration:1},{value:135,duration:1},{value:140,duration:1},{value:145,duration:1},{value:150,duration:1}],active_redstun:[{value:23,duration:2},{value:26,duration:2},{value:29,duration:2},{value:32,duration:2},{value:35,duration:2},{value:38,duration:2},{value:41,duration:2},{value:44,duration:2},{value:47,duration:2},{value:50,duration:2}],"aura-adddmg2_per-meele_physical":[{value:5,duration:2}],energy:[{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1}]},reqs:{reqp:"p",reqw:"sh"}},{id:26,attrs:3,name:"Płonąca strzała",desc:"Podpalasz strzałę i wysyłasz ją w stronę wroga, siejąc spustoszenie. Dodatkowo przeciwnik będzie otrzymywał obrażenia od ognia przez kilka tur. Efektu podpalenia nie można uniknąć.",stats:{"adddmg_fire-perw":[{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:49,duration:1},{value:53,duration:1},{value:57,duration:1},{value:61,duration:1}],"dmg-target_fire-perw":[{value:25,duration:2},{value:29,duration:2},{value:33,duration:2},{value:37,duration:2},{value:41,duration:2},{value:45,duration:2},{value:49,duration:2},{value:53,duration:2},{value:57,duration:2},{value:61,duration:2}],active_decevade_per:[{value:10,duration:1},{value:11,duration:1},{value:11,duration:1},{value:12,duration:1},{value:12,duration:1},{value:13,duration:1},{value:13,duration:1},{value:14,duration:1},{value:14,duration:1},{value:15,duration:1}],doublecastcost_per:[{value:100,duration:1}],firebon:[{value:.3,duration:1}],"combo-skill":[{value:1,duration:1}],mana:[{value:30,duration:1},{value:40,duration:1},{value:50,duration:1},{value:60,duration:1},{value:70,duration:1},{value:80,duration:1},{value:90,duration:1},{value:100,duration:1},{value:110,duration:1},{value:120,duration:1}]},reqs:{reqp:"t",reqw:"fire,dis"}},{id:27,attrs:12,name:"Odbicie ciosu",desc:"Potrafisz sparować ciosy przeciwników walczących w zwarciu bronią białą, przez co nie zadają ci one obrażeń.\n# parowanie to 100% obrony, jak unik",stats:{parry:[{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"w",reqw:"1h"}},{id:29,attrs:0,name:"Twarda głowa",desc:"Dzięki swojej wyjątkowej wytrwałości, lepiej wykorzystujesz ochronę, jaką oferuje zgromadzony przez ciebie pancerz, zarazem skracając czas, w którym pozostajesz w stanie obezwładnienia. Spowolnienia z przedmiotów przeciwnika oraz trucizny i magii zimna zostają zmniejszone.\n#redstun procentowa redukcja ogłuszeń (nawet tych od e2: poparzenia, porażenia, itp.); redslow procentowa redukcja slowa, nie redukuje slow'ów z UM",stats:{redstun:[{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1}],redslow:[{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1}],ac2_per:[{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:24.5,duration:1},{value:25,duration:1},{value:25.5,duration:1},{value:26,duration:1}]},reqs:{reqp:"w"}},{id:30,attrs:0,name:"Berserk",desc:"Skoncentrowanie gniewu na przeciwniku powoduje obniżenie jego szybkości ataku. Przyjęcie ciosu krytycznego podczas niskiego poziomu zdrowia, zwiększa obrażenia fizyczne twojej broni.",stats:{critrage_perw:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],slow:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],str2h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"w",reqw:"2h"}},{id:31,attrs:0,name:"Krwawa jatka",desc:"Wzmacnia obrażenia zadawane od głębokiej rany oraz niszczenie pancerza podczas ataku.",stats:{wounddmgbon_perw:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:6,duration:1},{value:9,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],acdmg:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"w",reqw:"wound"}},{id:32,attrs:0,name:"Ciężka rana",desc:"Uderzając krytycznie w szale walki masz szansę na zadanie przeciwnikowi obrażeń o sile 10% wykonanego ataku, które będą trwały 3 tury.\n# 3 tury, 10% obrażeń, przynajmniej 30% obrażeń musi wejść",stats:{critwound:[{value:26,duration:1},{value:32,duration:1},{value:38,duration:1},{value:44,duration:1},{value:50,duration:1},{value:56,duration:1},{value:62,duration:1},{value:68,duration:1},{value:74,duration:1},{value:80,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}],str2h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"w"}},{id:33,attrs:4,name:"Przeszywające uderzenie",desc:"Za każdym razem gdy zaatakujesz przeciwnika uderzeniem krytycznym, przeszywa go ból, który powoduje spowolnienie jego następnego ataku.",stats:{critslow_per:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"p",reqw:"1h"}},{id:34,attrs:9,name:"Kamienna skóra",desc:"Twoja skóra staje się twarda jak kamień wzmacniając początkową wartość pancerza postaci w zależności od utraconego życia. Dodatkowo wzmacniana jest twoja odporność na magię.\n# redukcja procentowa",stats:{resfire_per:[{value:30,duration:8}],resfrost_per:[{value:30,duration:8}],reslight_per:[{value:40,duration:8}],antidote:[{value:15,duration:8}],achpp_per:[{value:5.7,duration:8},{value:5.4,duration:8},{value:5.1,duration:8},{value:4.8,duration:8},{value:4.5,duration:8},{value:4.2,duration:8},{value:3.9,duration:8},{value:3.6,duration:8},{value:3.3,duration:8},{value:3,duration:8}],energy:[{value:27,duration:1},{value:28,duration:1},{value:29,duration:1},{value:30,duration:1},{value:31,duration:1},{value:32,duration:1},{value:33,duration:1},{value:34,duration:1},{value:35,duration:1},{value:36,duration:1}],"red-sa":[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"w",reqw:"1h"}},{id:36,attrs:4,name:"Celny cios",desc:"Doświadczenie przy władaniu bronią jednoręczną zwiększa szansę na trafienie w przeciwnika.",stats:{decevade_per:[{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"w",reqw:"1h"}},{id:37,attrs:4,name:"Wytrącenie z równowagi",desc:"Potrafisz wytrącić przeciwnika z równowagi przez co straci najbliższą turę. Wytrącenia mogą się sumować i działają kolejno jedno po drugim.",stats:{distract:[{value:7,duration:1},{value:9,duration:1},{value:11,duration:1},{value:13,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}]},reqs:{reqp:"w",reqw:"1h"}},{id:38,attrs:7,name:"Szybki atak",desc:"Uderzasz we wroga z niespotykaną dotąd siłą i szybkością kosztem utraty części energii.",stats:{sa_per:[{value:13,duration:1},{value:16,duration:1},{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1}],"adddmg_physical-perw":[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],energy:[{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1},{value:43,duration:1},{value:46,duration:1}],"combo-skill":[{value:1,duration:1}],str1h:[{value:.2,duration:1}]},reqs:{reqp:"p",reqw:"sw"}},{id:39,attrs:7,name:"Zdruzgotanie",desc:"Twoje następne ataki zostaną wykonane zarówno mieczem jak i tarczą, co spowoduje zadanie zwiększonych obrażeń. Wzmacniane są również ciosy krytyczne. Odpowiednia kombinacja pozwoli na zadanie podczas ataku inicjującego dodatkowych nieuchronnych obrażeń.",stats:{perdmg:[{value:5,duration:3},{value:6,duration:3},{value:7,duration:3},{value:8,duration:3},{value:9,duration:3},{value:10,duration:3},{value:11,duration:3},{value:12,duration:3},{value:13,duration:3},{value:14,duration:3}],"combo_dmg_hpp-target":[{value:2.1,duration:1},{value:2.2,duration:1},{value:2.3,duration:1},{value:2.4,duration:1},{value:2.5,duration:1},{value:2.6,duration:1},{value:2.7,duration:1},{value:2.8,duration:1},{value:2.9,duration:1},{value:3,duration:1}],"combo-max":[{value:3,duration:1}],energy:[{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],cooldown:[{value:3,duration:1}],str1h:[{value:.1,duration:1}]},reqs:{reqp:"w",reqw:"sh"}},{id:41,attrs:3,name:"Rozpraszająca strzała",desc:"Wyprowadzasz zaskakujący strzał, który obniża przeciwnikowi szanse na cios krytyczny i przebicie. Strzał nie wymaga celnego ataku do zadziałania.\n# obniżenie szansy na cios krytyczny, dla przebicia działa 2x mocniej",stats:{disturb_crit:[{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1},{value:7.5,duration:1},{value:8,duration:1},{value:8.5,duration:1},{value:9,duration:1},{value:9.5,duration:1},{value:10,duration:1}],disturb_pierce:[{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1},{value:7.5,duration:1},{value:8,duration:1},{value:8.5,duration:1},{value:9,duration:1},{value:9.5,duration:1},{value:10,duration:1}],energy:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:42,attrs:4,name:"Ostatnie uderzenie",desc:"Widok przegrywającego przeciwnika sprawia, że wstępują w ciebie nowe siły. Szansa na trafienie krytyczne wzrasta gdy przeciwnik posiada mniej niż 20% punktów życia. Efektu nie da się osłabić poprzez inne czary lub przewagę poziomową przeciwnika.",stats:{lastcrit:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}]},reqs:{reqp:"w"}},{id:43,attrs:7,name:"Krwiożerczy szał",desc:"Zatracasz się w krwiożerczym szale, co sprawia, że leczysz się za część zadanych obrażeń. Dodatkowo stajesz się bardziej odporny na magię żywiołów.",stats:{vamp_time_per:[{value:10.5,duration:8},{value:11,duration:8},{value:11.5,duration:8},{value:12,duration:8},{value:12.5,duration:8},{value:13,duration:8},{value:13.5,duration:8},{value:14,duration:8},{value:14.5,duration:8},{value:15,duration:8}],resfire_per:[{value:6,duration:8},{value:7,duration:8},{value:8,duration:8},{value:9,duration:8},{value:10,duration:8},{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8}],resfrost_per:[{value:6,duration:8},{value:7,duration:8},{value:8,duration:8},{value:9,duration:8},{value:10,duration:8},{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8}],reslight_per:[{value:6,duration:8},{value:7,duration:8},{value:8,duration:8},{value:9,duration:8},{value:10,duration:8},{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8}],energy:[{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"w",reqw:"2h"}},{id:44,attrs:0,name:"Strażnik boskich mocy",desc:"Twój miecz powoduje odzyskiwanie energii wraz z każdym wykonanym ciosem krytycznym, a twoja tarcza otrzymuje większą szansę na blok.",stats:{engback:[{value:7,duration:1},{value:9,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1}],blok_per:[{value:1,duration:1},{value:1.5,duration:1},{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1}]},reqs:{reqp:"p"}},{id:45,attrs:0,name:"Splot odporności",desc:"Znajomość magii pozwala ci lepiej zrozumieć naturę żywiołu. Otrzymywane obrażenia magiczne zostają zmniejszone.",stats:{resfire:[{value:3,duration:1},{value:6,duration:1},{value:9,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:21,duration:1},{value:24,duration:1},{value:27,duration:1},{value:30,duration:1}],resfrost:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],reslight:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}]},reqs:{reqp:"p"}},{id:46,attrs:0,name:"Stopiona skóra",desc:"Moc ognia uodparnia twoją skórę magmową ochroną, która potrafi zablokować nadciągające w twoją stronę pociski oraz zmniejsza zdolności przeciwnika do niszczenia twojej absorpcji.",stats:{arrowblock:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1}],redabdest_per:[{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1},{value:80,duration:1},{value:85,duration:1}],firebon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"m",reqw:"fire"}},{id:47,attrs:0,name:"Wytrwałość elementalisty",desc:"Liczne stoczone boje uodparniają cię na obrażenia od magii żywiołów.",stats:{resfire:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],firebon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}],resfrost:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],frostbon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}],reslight:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],lightbon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"m"}},{id:49,attrs:0,name:"Wyładowanie energii",desc:"Koncentrujesz wysoki ładunek magiczny, który może eksplodować jeżeli otrzymasz obrażenia krytyczne.",stats:{contra:[{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1}],manabon:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],lightbon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"m",reqw:"light"}},{id:50,attrs:25,name:"Lodowa bariera",desc:"W wyniku zaklęcia tworzy się lodowa bariera, która utrzymuje się przez kilka tur. Każdy atakujący, który trafi postać z nałożoną magiczną barierą, zostaje spowolniony na 1 turę oraz otrzymuje od 6% do 14% obrażeń zwrotnych od własnej broni. Posiadacz ma również zwiększoną odporność na ogłuszenia. Spowolnienie nie łączy się z Płonącą barierą, Elektryczną barierą i Porażającą tarczą i Szadzią.",stats:{lightshield_per:[{value:6,duration:8},{value:7,duration:8},{value:8,duration:8},{value:9,duration:8},{value:10,duration:8},{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8}],active_redstun:[{value:30,duration:8}],"red-sa":[{value:8,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"m",reqw:"frost"}},{id:53,attrs:25,name:"Elektryczna bariera",desc:"W wyniku zaklęcia tworzy się elektryczna bariera, która utrzymuje się przez kilka tur. Każdy atakujący, który trafi postać z nałożoną magiczną barierą, zostaje spowolniony na 1 turę oraz otrzymuje od 6% do 14% obrażeń zwrotnych od własnej broni. Posiadacz ma również zwiększony pancerz. Spowolnienie nie łączy się z Płonącą barierą, Lodową barierą i Porażającą tarczą i Szadzią.\n\n#Sprawność ruchowa przeciwnika zostaje zmniejszona, przez co na kilka tur maleje jego szansa na cios krytyczny i przebicie. Dodatkowo czas trwania rzucania czaru jest krótszy na jedną turę.\n#przebicie osłabiane jest o wartość x2",stats:{lightshield_per:[{value:6,duration:8},{value:7,duration:8},{value:8,duration:8},{value:9,duration:8},{value:10,duration:8},{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8}],ac_per:[{value:8,duration:8}],"red-sa":[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"m",reqw:"light"}},{id:54,attrs:0,name:"Apogeum",desc:"Widok przegrywającego przeciwnika sprawia, że wstępują w ciebie nowe siły. Szansa na trafienie krytyczne postaci wzrasta gdy przeciwnik posiada mniej niż 20% punktów życia. Umiejętności nie da się osłabić poprzez inne czary lub przewagę poziomową przeciwnika.\n\n#procent leczenia turowego przeciwników",stats:{lastcrit:[{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1}]},reqs:{reqp:"m"}},{id:55,attrs:25,name:"Płonąca bariera",desc:"W wyniku zaklęcia tworzy się płonąca bariera, która utrzymuje się przez kilka tur. Każdy atakujący, który trafi postać z nałożoną magiczną barierą, zostaje spowolniony na 1 turę oraz otrzymuje od 6% do 14% obrażeń zwrotnych od własnej broni. Posiadacz ma również zwiększoną odporność na truciznę. Spowolnienie nie łączy się z Lodową barierą, Elektryczną barierą i Porażającą tarczą i Szadzią.",stats:{lightshield_per:[{value:6,duration:8},{value:7,duration:8},{value:8,duration:8},{value:9,duration:8},{value:10,duration:8},{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8}],antidote:[{value:15,duration:8}],"red-sa":[{value:8,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"m",reqw:"fire"}},{id:56,attrs:3,name:"Klątwa",desc:"Kombinacja czarów powoduje nałożenie na przeciwnika klątwy, redukującej obrażenia jego następnego ataku oraz szansę na przebicie pancerza na następne tury. Zaklęcie zwiększa twoje obrażenia magiczne. Wzmacniane są również dodatkowe obrażenia krytyczne. Umiejętność aktywuje się z atakiem.",stats:{perdmg:[{value:8,duration:3},{value:8.5,duration:3},{value:9,duration:3},{value:9.5,duration:3},{value:10,duration:3},{value:11,duration:3},{value:12,duration:3},{value:13,duration:3},{value:14,duration:3},{value:15,duration:3}],disturb_pierce:[{value:10,duration:3},{value:11,duration:3},{value:11,duration:3},{value:12,duration:3},{value:12,duration:3},{value:13,duration:3},{value:13,duration:3},{value:14,duration:3},{value:14,duration:3},{value:15,duration:3}],combo_lowdmg_enemy:[{value:8,duration:1}],"combo-max":[{value:4,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:5,duration:1}]},reqs:{reqp:"m"}},{id:58,attrs:3,name:"Lodowy pocisk",desc:"Wzmocnienie kryształu energii zimna w broni wzmacnia magiczne spowolnienie i powoduje obniżenie absorpcji przeciwnika. Lodowy pocisk ma szansę zamrozić celu czaru. Dodatkowe spowolnienie, jakie oferuje ta umiejętność, nie jest redukowane przez odporności.",stats:{slowfreeze_per:[{value:45,duration:2},{value:50,duration:2},{value:55,duration:2},{value:60,duration:2},{value:65,duration:2},{value:70,duration:2},{value:75,duration:2},{value:80,duration:2},{value:85,duration:2},{value:90,duration:2}],freeze:[{value:10,duration:1},{value:11,duration:1},{value:11,duration:1},{value:12,duration:1},{value:12,duration:1},{value:13,duration:1},{value:13,duration:1},{value:14,duration:1},{value:14,duration:1},{value:15,duration:1}],active_absorbdest_per:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],mana:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],"combo-skill":[{value:1,duration:1}],frostbon:[{value:.15,duration:1}]},reqs:{reqp:"m",reqw:"frost"}},{id:59,attrs:0,name:"Potęga ognia",desc:"Wyspecjalizowanie magii ognia prowadzi do zwiększenia twoich obrażeń krytycznych oraz wzmocnieniu bariery ochronnej, która wzmacnia twój pancerz oraz redukuje obrażenia od pocisków.",stats:{critmval_f:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],absagain_per:[{value:1.1,duration:1},{value:1.2,duration:1},{value:1.3,duration:1},{value:1.4,duration:1},{value:1.5,duration:1},{value:1.6,duration:1},{value:1.7,duration:1},{value:1.8,duration:1},{value:1.9,duration:1},{value:2,duration:1}],absorbd:[{value:15,duration:1},{value:16,duration:1},{value:16,duration:1},{value:17,duration:1},{value:17,duration:1},{value:18,duration:1},{value:18,duration:1},{value:19,duration:1},{value:19,duration:1},{value:20,duration:1}],ac:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],firebon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"m",reqw:"fire"}},{id:61,attrs:0,name:"Wrodzona szybkość",desc:"Opanowanie techniki zwinności, umożliwia zadawanie większej ilości ciosów w walce.",stats:{sa1:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{}},{id:62,attrs:0,name:"Zwinność",desc:"Twoje unikalne umiejętności pozwalają ci osiągnąć większa szybkość ataków z bonusów posiadanych przedmiotów.\n# bonus dt. tylko zakładanych przedmiotów, których SA jest mnożone o dany procent",stats:{"sa-clothes":[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}]},reqs:{reqp:"h"}},{id:64,attrs:0,name:"Przebijanie pancerza",desc:"Groty twoich strzał stają się ostrzejsze niż kiedykolwiek. Pozwala to na przebicie pancerza z jeszcze większą efektywnością.",stats:{pierce:[{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1},{value:7.5,duration:1},{value:8,duration:1},{value:8.5,duration:1},{value:9,duration:1},{value:9.5,duration:1},{value:10,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:65,attrs:0,name:"Krytyczne cięcie",desc:"Broń pomocnicza staje się przedłużeniem twojej dłoni, dzięki czemu trafiasz krytycznie znacznie częściej i mocniej.",stats:{"of-crit":[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1}],"of-critval":[{value:5,duration:1},{value:10,duration:1},{value:15,duration:1},{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1}],"of-str":[{value:.15,duration:1},{value:.16,duration:1},{value:.16,duration:1},{value:.17,duration:1},{value:.17,duration:1},{value:.18,duration:1},{value:.18,duration:1},{value:.19,duration:1},{value:.19,duration:1},{value:.2,duration:1}]},reqs:{reqp:"b",reqw:"h"}},{id:66,attrs:0,name:"Bezlitosny arsenał",desc:"Potrafisz posługiwać się każdym typem ostrza, co zwiększa szansę na zadanie głębokiej, niezależnie w której ręce dzierżysz broń. Głębokie rany zaaplikowane przez broń główną zadają przeciwnikowi jeszcze więcej obrażeń.",stats:{woundchance:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1}],wounddmgbon_perw:[{value:47,duration:1},{value:49,duration:1},{value:51,duration:1},{value:53,duration:1},{value:55,duration:1},{value:57,duration:1},{value:59,duration:1},{value:61,duration:1},{value:63,duration:1},{value:65,duration:1}]},reqs:{reqp:"b",reqw:"wound"}},{id:67,attrs:0,name:"Łatwy cel",desc:"Widząc słaniającego się na nogach przeciwnika, zadajesz mu większe obrażenia fizyczne, jeżeli jego ilość punktów życia spadła poniżej 20%.",stats:{vulture_perw:[{value:3,duration:1},{value:6,duration:1},{value:9,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:21,duration:1},{value:24,duration:1},{value:27,duration:1},{value:30,duration:1}]},reqs:{reqp:"h",reqw:"poison"}},{id:68,attrs:3,name:"Porażająca strzała",desc:"Za pomocą magii zaklinasz strzałę żywiołem błyskawic, który niszczy pancerz przeciwnika oraz aplikuje porażenie na kilka tur.",stats:{active_acdmg_per:[{value:.9,duration:1},{value:1,duration:1},{value:1.1,duration:1},{value:1.2,duration:1},{value:1.3,duration:1},{value:1.4,duration:1},{value:1.5,duration:1},{value:1.6,duration:1},{value:1.7,duration:1},{value:1.8,duration:1}],"dmg_evade_hpp-target_light":[{value:1.3,duration:3},{value:1.5,duration:3},{value:1.7,duration:3},{value:1.9,duration:3},{value:2.1,duration:3},{value:2.3,duration:3},{value:2.5,duration:3},{value:2.7,duration:3},{value:2.9,duration:3},{value:3.1,duration:3}],"combo-skill":[{value:1,duration:1}],mana:[{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1}],doublecastcost_per:[{value:100,duration:1}],lightbon:[{value:.3,duration:1}]},reqs:{reqp:"t",reqw:"light,dis"}},{id:69,attrs:9,name:"Chwila skupienia",desc:"Chwila silnego skupienia pozwalająca przywrócić część punktów many. Każde kolejne użycie jest 10% słabsze od poprzedniego.",stats:{manarestore_per:[{value:24,duration:1},{value:28,duration:1},{value:32,duration:1},{value:36,duration:1},{value:40,duration:1},{value:44,duration:1},{value:48,duration:1},{value:52,duration:1},{value:56,duration:1},{value:60,duration:1}]},reqs:{reqp:"m"}},{id:70,attrs:3,name:"Porażenie",desc:"Czar porażenia pozwala lepiej kontrolować obrażenia broni zaklętej żywiołem błyskawic.",stats:{"dmg_evade_hpp-target_light":[{value:1.8,duration:3},{value:1.9,duration:3},{value:2,duration:3},{value:2.1,duration:3},{value:2.2,duration:3},{value:2.3,duration:3},{value:2.4,duration:3},{value:2.5,duration:3},{value:2.6,duration:3},{value:2.7,duration:3}],active_acdmg_per:[{value:2.1,duration:1},{value:2.2,duration:1},{value:2.3,duration:1},{value:2.4,duration:1},{value:2.5,duration:1},{value:2.6,duration:1},{value:2.7,duration:1},{value:2.8,duration:1},{value:2.9,duration:1},{value:3,duration:1}],"combo-skill":[{value:1,duration:1}],active_add_light_cumulaction:[{value:1,duration:1}],mana:[{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1},{value:43,duration:1},{value:46,duration:1},{value:49,duration:1},{value:52,duration:1}],doublecastcost_per:[{value:100,duration:1}],lightbon:[{value:.15,duration:1}]},reqs:{reqp:"m",reqw:"light"}},{id:71,attrs:0,name:"Wzmocnienie wigoru",desc:"Sprawność w działaniu pozwala ci zwiększyć ilość energii i przywracać co turę jej część.",stats:{energybon:[{value:24,duration:1},{value:28,duration:1},{value:32,duration:1},{value:36,duration:1},{value:40,duration:1},{value:44,duration:1},{value:48,duration:1},{value:52,duration:1},{value:56,duration:1},{value:60,duration:1}],energygain:[{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1}]},reqs:{reqp:"h"}},{id:72,attrs:0,name:"Okaleczenie",desc:"Umiejętność odczytywania ruchów przeciwnika sprawia, że rośnie szansa na zadanie mu głębokich obrażeń o jeszcze większej sile.",stats:{woundchance:[{value:15,duration:1},{value:16,duration:1},{value:16,duration:1},{value:17,duration:1},{value:17,duration:1},{value:18,duration:1},{value:18,duration:1},{value:19,duration:1},{value:19,duration:1},{value:20,duration:1}],wounddmgbon_perw:[{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1},{value:50,duration:1}]},reqs:{reqp:"w",reqw:"wound"}},{id:73,attrs:9,name:"Przemożenie zmęczenia",desc:"Hart ducha pozwala ci w krótkim czasie odzyskać część utraconej energii. Każde kolejne użycie jest 10% słabsze od poprzedniego.",stats:{energyrestore_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}]},reqs:{reqp:"w"}},{id:75,attrs:0,name:"Wilczy instynkt",desc:"W obawie przed utratą życia wzrasta szansa na wykonanie uniku.\n\n#adrenalin_evade_threshold_per to próg od jakiego działa adrenalina",stats:{adrenalin_evade_per:[{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1}],adrenalin_evade_threshold_per:[{value:30,duration:1}]},reqs:{reqp:"h"}},{id:76,attrs:25,name:"Aura ochrony",desc:"Boska energia wokół ciebie zwiększa na kilka tur obronę magiczną twoich kompanów. Sam uzyskujesz z niej tylko połowę mocy.",stats:{"aura-ac_per":[{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8},{value:16,duration:8},{value:17,duration:8},{value:18,duration:8},{value:19,duration:8},{value:20,duration:8}],"aura-resall":[{value:6,duration:8},{value:7,duration:8},{value:8,duration:8},{value:9,duration:8},{value:10,duration:8},{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"p"}},{id:77,attrs:0,name:"Płonąca przychylność",desc:"Błogosławisz swoją broń, która zapewnia dodatkową penetrację odporności, manę i obrażenia krytyczne.",stats:{critmval_f:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],manabon:[{value:10,duration:1},{value:20,duration:1},{value:30,duration:1},{value:40,duration:1},{value:50,duration:1},{value:60,duration:1},{value:70,duration:1},{value:80,duration:1},{value:90,duration:1},{value:100,duration:1}],resdmg:[{value:1,duration:1}]},reqs:{reqp:"p",reqw:"fire"}},{id:78,attrs:25,name:"Leczenie ran",desc:"Skupienie magicznej esencji pozwala ci na leczenie własnych ran lub ran wybranego sojusznika. Każde kolejne uleczenie jest słabsze, malejąc o 25% wartości początkowej.",stats:{heal_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"m"}},{id:79,attrs:25,name:"Zdrowa atmosfera",desc:"Skupienie many pod postacią życiodajnej energii leczącej wszystkich kompanów w drużynie. Każde kolejne uleczenie jest słabsze malejąc o 25% wartości początkowej. Użycie umiejętności podczas samotnej walki sprawia, że jest ona o połowę słabsza.",stats:{healall_per:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"m"}},{id:81,attrs:9,name:"Bandażowanie ran",desc:"Leczysz samego siebie poprzez zabandażowanie ran. Przez chwilę uodparnia cię to na działanie efektów obezwładnienia. Każde kolejne uleczenie jest słabsze malejąc o 25% wartości początkowej.",stats:{bandage_per:[{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1}],active_redstun:[{value:12,duration:2},{value:14,duration:2},{value:16,duration:2},{value:18,duration:2},{value:20,duration:2},{value:22,duration:2},{value:24,duration:2},{value:26,duration:2},{value:28,duration:2},{value:30,duration:2}],cooldown:[{value:6,duration:1}],energy:[{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1},{value:50,duration:1},{value:52,duration:1},{value:54,duration:1},{value:56,duration:1},{value:58,duration:1}]},reqs:{reqp:"h"}},{id:82,attrs:7,name:"Trujące pchnięcie",desc:"Wiedza o różnych rodzajach toksyn, pozwala zwiększyć obrażenia zadawane przez truciznę oraz osłabić siłę ciosu przeciwnika w następnej turze. Wzmocniona trucizna działa przez 5 tur. Efekt aplikuje się po trafieniu przeciwnika.",stats:{"poisonbon_poison-perw":[{value:90,duration:1},{value:95,duration:1},{value:100,duration:1},{value:105,duration:1},{value:110,duration:1},{value:115,duration:1},{value:120,duration:1},{value:125,duration:1},{value:130,duration:1},{value:135,duration:1}],sa_per:[{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1}],lowdmg_enemy:[{value:3,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:5,duration:1},{value:5,duration:1}],"combo-skill":[{value:1,duration:1}],energy:[{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:25,duration:1},{value:27,duration:1},{value:29,duration:1},{value:31,duration:1},{value:33,duration:1}]},reqs:{reqp:"b",reqw:"poison"}},{id:84,attrs:0,name:"Przenikliwa rana",desc:"Odpowiednie przygotowanie pozwala zwiększyć twoją skuteczność w aplikowaniu głębokich ran oraz zwiększa ich obrażenia jeżeli zostały zaaplikowane bronią pomocniczą.",stats:{"of-wounddmgbon_perw":[{value:74,duration:1},{value:78,duration:1},{value:82,duration:1},{value:86,duration:1},{value:90,duration:1},{value:94,duration:1},{value:98,duration:1},{value:102,duration:1},{value:106,duration:1},{value:110,duration:1}],woundchance:[{value:5,duration:1}]},reqs:{reqp:"b",reqw:"wound"}},{id:85,attrs:3,name:"Błyskawiczny strzał",desc:"Nie zważając na włożony w to wysiłek, natychmiast wystrzeliwujesz strzałę w swoich wrogów, której bardzo trudno uniknąć. Jeżeli wykonałeś kombinację, przywracasz sobie część energii.",stats:{"red-sa":[{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1}],active_decevade_per:[{value:100,duration:1}],combo_energyrestore_per:[{value:5,duration:1}],"combo-max":[{value:3,duration:1}],cooldown:[{value:5,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:86,attrs:7,name:"Pchnięcie mrozu",desc:"Po uderzeniu bronią mrozu, spowalniasz przeciwnika i masz szansę na to, żeby go zamrozić. Zaklęta broń dodatkowo kruszy absorpcję przeciwnika. Dodatkowe spowolnienie, jakie oferuje ta umiejętność, nie jest redukowane przez odporności.",stats:{slowfreeze_per:[{value:80,duration:2},{value:85,duration:2},{value:90,duration:2},{value:95,duration:2},{value:100,duration:2},{value:105,duration:2},{value:110,duration:2},{value:115,duration:2},{value:120,duration:2},{value:125,duration:2}],freeze:[{value:10,duration:1},{value:11,duration:1},{value:11,duration:1},{value:12,duration:1},{value:12,duration:1},{value:13,duration:1},{value:13,duration:1},{value:14,duration:1},{value:14,duration:1},{value:15,duration:1}],active_absorbdest_per:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],"combo-skill":[{value:1,duration:1}],mana:[{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1}],frostbon:[{value:.3,duration:1}]},reqs:{reqp:"p",reqw:"frost"}},{id:87,attrs:0,name:"Jadowy grot",desc:"Uderzenie w punkt witalny przeciwnika zmniejsza jego odporność na truciznę oraz ma 25% szansy na osłabienie najbliższego leczenia turowego przeciwnika.",stats:{critpoison_per:[{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1}],actdmg:[{value:1,duration:1}]},reqs:{reqp:"h",reqw:"dis,poison"}},{id:88,attrs:0,name:"Szybka strzała",desc:"Potrafisz wykonywać szybką strzałę, która skraca czas wykonywania twojej tury o 75%.",stats:{fastarrow:[{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1},{value:7.5,duration:1},{value:8,duration:1},{value:8.5,duration:1},{value:9,duration:1},{value:9.5,duration:1},{value:10,duration:1}]},reqs:{reqp:"h"}},{id:89,attrs:25,name:"Podwójny dech",desc:"Pozwala na zwiększenie szybkości całej drużyny na kilka tur. Sam uzyskujesz tylko połowę mocy.",stats:{"aura-sa_per":[{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8},{value:16,duration:8},{value:17,duration:8},{value:18,duration:8},{value:19,duration:8},{value:20,duration:8}],mana:[{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1}],cooldown:[{value:6,duration:1}]},reqs:{reqp:"t"}},{id:90,attrs:0,name:"Wzmocnienie absorpcji",desc:"Pozwala na zwiększenie absorpcji z posiadanych przedmiotów oraz odnowę jej zasobów przy każdym celnym ataku.",stats:{absorb_per:[{value:10,duration:1},{value:20,duration:1},{value:30,duration:1},{value:40,duration:1},{value:50,duration:1},{value:60,duration:1},{value:70,duration:1},{value:80,duration:1},{value:90,duration:1},{value:100,duration:1}],absorbm_per:[{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1}],absagain_per:[{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:6,duration:1}]},reqs:{reqp:"t"}},{id:92,attrs:9,name:"Tarcza słońca",desc:"Twoja tarcza emanuje świętą energią, która zwiększa obronę, szansę na cios krytyczny oraz przywracane życie przez 5 tur. Co każdą turę dodatkowy pancerz oraz przywracane życie maleją o 20%.",stats:{sunshield_per:[{value:30,duration:5},{value:32,duration:5},{value:34,duration:5},{value:36,duration:5},{value:38,duration:5},{value:40,duration:5},{value:42,duration:5},{value:44,duration:5},{value:46,duration:5},{value:48,duration:5}],active_crit:[{value:10,duration:5}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],"red-sa":[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],cooldown:[{value:16,duration:1}]},reqs:{reqp:"p"}},{id:94,attrs:0,name:"Potrójne uderzenie",desc:"Ogromna zręczność w używaniu broni głównej, pozwala uderzyć nią dwa razy podczas jednej tury. Bonusy nie są brane pod uwagę.",stats:{"of-thirdatt":[{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],"of-str":[{value:.2,duration:1}]},reqs:{reqp:"b",reqw:"h"}},{id:95,attrs:3,name:"Strzała z niespodzianką",desc:"Używanie głównych umiejętności danego żywiołu wzmacnia efekt strzały z niespodzianką, która w zależności od zebranych punktów kombinacji osłabia atak przeciwnika. Osłabienie nie łączy się z Emanującą strzałą.",stats:{perdmg:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],combo_lowdmg_enemy:[{value:10,duration:1}],"combo-max":[{value:3,duration:1}],mana:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],cooldown:[{value:3,duration:1}]},reqs:{reqp:"t"}},{id:96,attrs:3,name:"Wyniszczające rany",desc:"Wiedza o technice zadawania głębokich ran pozwala ci łatwiej aplikować ich pierwszą kumulację oraz dodatkowo ranić przeciwnika nieuchronnymi obrażeniami zależnymi od jego maksymalnego zdrowia.",stats:{active_wound_per:[{value:44,duration:1},{value:48,duration:1},{value:52,duration:1},{value:56,duration:1},{value:60,duration:1},{value:64,duration:1},{value:68,duration:1},{value:72,duration:1},{value:76,duration:1},{value:80,duration:1}],"combo_dmg_hpp-target":[{value:2.1,duration:1},{value:2.2,duration:1},{value:2.3,duration:1},{value:2.4,duration:1},{value:2.5,duration:1},{value:2.6,duration:1},{value:2.7,duration:1},{value:2.8,duration:1},{value:2.9,duration:1},{value:3,duration:1}],"combo-max":[{value:3,duration:1}],cooldown:[{value:5,duration:1}],energy:[{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1}]},reqs:{reqp:"h",reqw:"wound"}},{id:97,attrs:3,name:"Podwójny strzał",desc:"Wystrzeliwujesz dwie strzały, jednak ich siła ciosu jest mniejsza.",stats:{energy:[{value:23,duration:1},{value:24,duration:1},{value:25,duration:1},{value:26,duration:1},{value:27,duration:1},{value:28,duration:1},{value:29,duration:1},{value:30,duration:1},{value:31,duration:1},{value:32,duration:1}],lowdmg_self:[{value:25,duration:1},{value:24,duration:1},{value:23,duration:1},{value:22,duration:1},{value:21,duration:1},{value:20,duration:1},{value:18,duration:1},{value:16,duration:1},{value:14,duration:1},{value:12,duration:1}],add_attacks:[{value:1,duration:1}],"combo-skill":[{value:1,duration:1}],cooldown:[{value:3,duration:1}],agi:[{value:.2,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:98,attrs:0,name:"Bolesne uderzenie",desc:"Kiedy strzała trafi w czuły punkt przeciwnika powodując uderzenie krytyczne, następny cios przeciwnika będzie wolniejszy.\n# critslow=3 oznacza SA-0.3, SA nie może spaść poniżej 1.0",stats:{critslow_per:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1}],agi:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:99,attrs:7,name:"Gorące uderzenie",desc:"Błogosławieństwo Ermosa zaklina twoją broń żywiołem ognia, przez co zadaje ona dodatkowe obrażenia oraz zwiększa celność podczas tego ataku. Podmuch płomieni sprawia, że przeciwnik zostaje podpalony. Efektu podpalenia nie można uniknąć.",stats:{"adddmg_fire-perw":[{value:10,duration:1},{value:20,duration:1},{value:30,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1}],"dmg-target_fire-perw":[{value:32,duration:2},{value:34,duration:2},{value:36,duration:2},{value:38,duration:2},{value:40,duration:2},{value:42,duration:2},{value:44,duration:2},{value:46,duration:2},{value:48,duration:2},{value:50,duration:2}],active_decevade_per:[{value:10,duration:1}],"combo-skill":[{value:1,duration:1}],mana:[{value:30,duration:1},{value:36,duration:1},{value:42,duration:1},{value:48,duration:1},{value:54,duration:1},{value:61,duration:1},{value:68,duration:1},{value:75,duration:1},{value:82,duration:1},{value:89,duration:1}],doublecastcost_per:[{value:100,duration:1},{value:90,duration:1},{value:80,duration:1},{value:70,duration:1},{value:60,duration:1},{value:50,duration:1},{value:40,duration:1},{value:30,duration:1},{value:20,duration:1},{value:10,duration:1}],firebon:[{value:.3,duration:1}]},reqs:{reqp:"p",reqw:"fire"}},{id:100,attrs:4,name:"Riposta",desc:"Potrafisz parować oraz kontrować sparowane ataki przeciwnika. Sparować można jedynie ciosy wykonane bronią białą.",stats:{parry:[{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1},{value:7.5,duration:1},{value:8,duration:1}],pcontra:[{value:28,duration:1},{value:36,duration:1},{value:44,duration:1},{value:52,duration:1},{value:60,duration:1},{value:68,duration:1},{value:76,duration:1},{value:84,duration:1},{value:92,duration:1},{value:100,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:101,attrs:0,name:"Magiczna osłona",desc:"Magiczny pancerz staje się trudniejszy w penetracji.",stats:{pierceb:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}]},reqs:{reqp:"m"}},{id:102,attrs:1,name:"Śmierdzący ładunek",desc:"Rzucasz w przeciwnika taktycznym ładunkiem, przez co na kilka tur maleje jego szansa na cios krytyczny i przebicie. Przeciwnik staje się znacznie bardziej podatny na obrażenia, wobec czego ty oraz twoi sojusznicy atakujecie go z większą siłą. Dodatkowe obrażenia są nieuchronne.",stats:{stinkbomb_crit:[{value:6.5,duration:8},{value:7,duration:8},{value:7.5,duration:8},{value:8,duration:8},{value:8.5,duration:8},{value:9,duration:8},{value:9.5,duration:8},{value:10,duration:8},{value:10.5,duration:8},{value:11,duration:8}],stinkbomb_pierce:[{value:6.5,duration:8},{value:7,duration:8},{value:7.5,duration:8},{value:8,duration:8},{value:8.5,duration:8},{value:9,duration:8},{value:9.5,duration:8},{value:10,duration:8},{value:10.5,duration:8},{value:11,duration:8}],taken_dmg_per:[{value:5,duration:8},{value:5,duration:8},{value:5,duration:8},{value:5,duration:8},{value:6,duration:8},{value:6,duration:8},{value:6,duration:8},{value:6,duration:8},{value:6,duration:8},{value:7,duration:8}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:16,duration:1}]},reqs:{reqp:"t"}},{id:103,attrs:0,name:"Energetyzujący wstrząs",desc:"Twoja szansa na unik zwiększa się, gdy poziom życia spadnie poniżej progu adrenalinowego.\n\n#adrenalin_evade_threshold_per to próg od jakiego działa adrenalina",stats:{adrenalin_evade_per:[{value:33,duration:1},{value:36,duration:1},{value:39,duration:1},{value:42,duration:1},{value:45,duration:1},{value:48,duration:1},{value:51,duration:1},{value:54,duration:1},{value:57,duration:1},{value:60,duration:1}],adrenalin_evade_threshold_per:[{value:30,duration:1}],agi:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"t"}},{id:105,attrs:3,name:"Zaklęty grot",desc:"Wystrzeliwane przez ciebie pociski zostają zaklęte magią, kierując się same w stronę przeciwnika przez co mają większą szansę na trafienie krytyczne.",stats:{active_crit:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],active_decevade_per:[{value:16,duration:1},{value:22,duration:1},{value:28,duration:1},{value:34,duration:1},{value:40,duration:1},{value:46,duration:1},{value:52,duration:1},{value:58,duration:1},{value:64,duration:1},{value:70,duration:1}],mana:[{value:13,duration:1},{value:15,duration:1},{value:17,duration:1},{value:19,duration:1},{value:21,duration:1},{value:23,duration:1},{value:25,duration:1},{value:27,duration:1},{value:29,duration:1},{value:31,duration:1}],cooldown:[{value:4,duration:1}]},reqs:{reqp:"t",reqw:"dis"}},{id:106,attrs:0,name:"Przetrwanie",desc:"Obrażenia wyprowadzane przez przeciwników stają się mniejsze.",stats:{dmg_from_npc_per:[{value:-5.5,duration:1},{value:-6,duration:1},{value:-6.5,duration:1},{value:-7,duration:1},{value:-7.5,duration:1},{value:-8,duration:1},{value:-8.5,duration:1},{value:-9,duration:1},{value:-9.5,duration:1},{value:-10,duration:1}],dmg_from_player_per:[{value:-1,duration:1}]},reqs:{}},{id:107,attrs:0,name:"Moc leczenia",desc:"Nauka o tworzeniu przedmiotów magicznych pozwala uzyskać większą moc przywracanego życia z twojego ekwipunku.",stats:{heal1_per:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}]},reqs:{reqp:"m"}},{id:108,attrs:7,name:"Gniew bogów",desc:"Potrafisz kumulować siłę swojego ciosu poprzez blokowanie ataków przeciwnika. W zależności od ilości posiadanych punktów kombinacji potrafisz ściągnąć gniew bogów w stronę wroga, zadając im nieuchronne obrażenia oraz zmniejszając ich zdolność do blokowania ciosów.",stats:{"combo_dmg_hpp-target":[{value:1.6,duration:1},{value:1.7,duration:1},{value:1.8,duration:1},{value:1.9,duration:1},{value:2,duration:1},{value:2.2,duration:1},{value:2.4,duration:1},{value:2.6,duration:1},{value:2.8,duration:1},{value:3,duration:1}],sa_per:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}],active_decblock_per:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],"combo-max":[{value:3,duration:1}],"combo-block":[{value:1,duration:1}],str1h:[{value:.1,duration:1}],energy:[{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1},{value:26,duration:1},{value:27,duration:1}],cooldown:[{value:2,duration:1}]},reqs:{reqp:"p",reqw:"sw"}},{id:109,attrs:4,name:"Bolesny uraz",desc:"Twoje ostrze ma szansę zranić przeciwnika obrażeniami o wartości 15% przyjętych przez niego obrażeń przez 3 tury.",stats:{injure:[{value:7,duration:1},{value:9,duration:1},{value:11,duration:1},{value:13,duration:1},{value:15,duration:1},{value:17,duration:1},{value:19,duration:1},{value:21,duration:1},{value:23,duration:1},{value:25,duration:1}]},reqs:{reqp:"w"}},{id:110,attrs:7,name:"Paraliżujący cios",desc:"Błyskawiczne uderzenie w konkretne miejsce na ciele przeciwnika obniża jego zdolności bojowe w postaci zadawanych obrażeń, ciosów krytycznych oraz przebić. Obniżenie szansy na cios krytyczny i przebicie nie wymaga celnego ataku.\n#przebicie to 2x wartość, zm. krytyka to 1x",stats:{disturb_crit:[{value:5,duration:3}],disturb_pierce:[{value:5,duration:3},{value:6,duration:3},{value:6,duration:3},{value:7,duration:3},{value:7,duration:3},{value:8,duration:3},{value:8,duration:3},{value:9,duration:3},{value:9,duration:3},{value:10,duration:3}],lowdmg_enemy:[{value:9,duration:3},{value:9,duration:3},{value:10,duration:3},{value:10,duration:3},{value:11,duration:3},{value:11,duration:3},{value:12,duration:3},{value:12,duration:3},{value:13,duration:3},{value:13,duration:3}],"red-sa":[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],energy:[{value:25,duration:1},{value:27,duration:1},{value:29,duration:1},{value:31,duration:1},{value:33,duration:1},{value:35,duration:1},{value:37,duration:1},{value:39,duration:1},{value:41,duration:1},{value:43,duration:1}],cooldown:[{value:3,duration:1}]},reqs:{reqp:"w",reqw:"sw"}},{id:111,attrs:9,name:"Odetchnięcie",desc:"Poświęcasz chwilę na odzyskanie swoich zasobów energii. Każde kolejne użycie jest 10% słabsze od poprzedniego.",stats:{energyrestore_per:[{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1},{value:50,duration:1}]},reqs:{reqp:"b"}},{id:112,attrs:7,name:"Porażający cios",desc:"Używasz broni zaklętej żywiołem błyskawic, przez co niszczysz pancerz przeciwnika oraz porażasz go na kilka tur. Trafienie przeciwnika zmniejsza jego szansę na zablokowanie ataku.",stats:{active_acdmg_per:[{value:1.4,duration:1},{value:1.7,duration:1},{value:2,duration:1},{value:2.3,duration:1},{value:2.6,duration:1},{value:2.9,duration:1},{value:3.2,duration:1},{value:3.5,duration:1},{value:3.8,duration:1},{value:4.1,duration:1}],"dmg_evade_hpp-target_light":[{value:1.5,duration:3},{value:1.65,duration:3},{value:1.8,duration:3},{value:1.95,duration:3},{value:2.1,duration:3},{value:2.25,duration:3},{value:2.4,duration:3},{value:2.55,duration:3},{value:2.7,duration:3},{value:2.85,duration:3}],active_decblock_per:[{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1}],"combo-skill":[{value:1,duration:1}],active_add_light_cumulaction:[{value:1,duration:1}],mana:[{value:30,duration:1},{value:34,duration:1},{value:38,duration:1},{value:42,duration:1},{value:46,duration:1},{value:50,duration:1},{value:54,duration:1},{value:58,duration:1},{value:62,duration:1},{value:66,duration:1}],doublecastcost_per:[{value:100,duration:1},{value:90,duration:1},{value:80,duration:1},{value:70,duration:1},{value:60,duration:1},{value:50,duration:1},{value:40,duration:1},{value:30,duration:1},{value:20,duration:1},{value:10,duration:1}],lightbon:[{value:.3,duration:1}]},reqs:{reqp:"p",reqw:"light"}},{id:113,attrs:3,name:"Krytyczne wzmocnienie",desc:"Dzięki skupieniu się na celu, zwiększasz szanse na zadanie ciosu krytycznego.",stats:{active_crit:[{value:6,duration:2},{value:7,duration:2},{value:8,duration:2},{value:9,duration:2},{value:10,duration:2},{value:11,duration:2},{value:12,duration:2},{value:13,duration:2},{value:14,duration:2},{value:15,duration:2}],energy:[{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:33,duration:1},{value:37,duration:1},{value:41,duration:1},{value:45,duration:1}],"combo-crit":[{value:1,duration:1}],cooldown:[{value:2,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:119,attrs:0,name:"Trwałość mocy",desc:"Trwałość energii i many zostaje wzmożona, przez co zwiększa się jej odporność na zniszczenie.",stats:{reddest_per:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}],dmg_from_player_per:[{value:-3,duration:1}]},reqs:{}},{id:120,attrs:0,name:"Wzmocniony pancerz",desc:"Nauka płatnerstwa pozwala udoskonalić swój pancerz, dzięki czemu staje się on bardziej odporny na zniszczenie.",stats:{redacdmg_per:[{value:-3,duration:1},{value:-6,duration:1},{value:-9,duration:1},{value:-12,duration:1},{value:-15,duration:1},{value:-18,duration:1},{value:-21,duration:1},{value:-24,duration:1},{value:-27,duration:1},{value:-30,duration:1}],dmg_from_player_per:[{value:-2,duration:1}]},reqs:{}},{id:123,attrs:1,name:"Szadź",desc:"Wykonujesz zaklęcie przyzwania magicznego mrozu, który spowalnia twoich przeciwników.\n#obniżanie % bazowego SA każdego z przeciwników",stats:{allslow_per:[{value:9.5,duration:8},{value:10,duration:8},{value:10.5,duration:8},{value:11,duration:8},{value:11.5,duration:8},{value:12,duration:8},{value:12.5,duration:8},{value:13,duration:8},{value:13.5,duration:8},{value:14,duration:8}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"m"}},{id:125,attrs:0,name:"Krytyczne przyspieszenie",desc:"Trafienie krytyczne pozwala pokonać swoje ograniczenia, przez co masz 25% szans na przyspieszenie ruchów na 3 tury.",stats:{critsa_per:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],"of-str":[{value:.1,duration:1}]},reqs:{reqp:"b",reqw:"h"}},{id:127,attrs:7,name:"Wirujące ostrze",desc:'Rozpoczynasz wirujący taniec ostrzy, podczas którego wykonujesz atak na przeciwnika oraz ranisz do 3 losowych przeciwników w obrębie linii atakowanego i atakującego. Pasywnie, twoje ataki podstawowe mają szansę na zranienie stojących przy sobie przeciwników jednym ciosem. Dodatkowo potwory zadają przeciw tobie zmniejszone obrażenia.\n\n#dotyczy linii na której stoi gracz oraz na której stoi atakowany; działa na wybranym przeciwniku oraz dwóch innych losowych; UM jest podobna jak u wojownika "Szeroki zamach" z tym, że tutaj będzie aktywna i kosztować energię dotyczy linii na której stoi gracz oraz na której stoi atakowany, udana akcja to atak z siłą 90, 80 i 70% na losowo wybrane osoby',stats:{"dmg-swing_absolute-perw":[{value:72,duration:1},{value:74,duration:1},{value:76,duration:1},{value:78,duration:1},{value:80,duration:1},{value:82,duration:1},{value:84,duration:1},{value:86,duration:1},{value:88,duration:1},{value:90,duration:1}],swing:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],dmg_from_npc_per:[{value:-1,duration:1},{value:-2,duration:1},{value:-3,duration:1},{value:-4,duration:1},{value:-5,duration:1},{value:-6,duration:1},{value:-7,duration:1},{value:-8,duration:1},{value:-9,duration:1},{value:-10,duration:1}],energy:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],cooldown:[{value:2,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:129,attrs:7,name:"Podstępne uderzenie",desc:"Wykonanie prawidłowej kombinacji powoduje zadanie dodatkowych nieuchronnych obrażeń. Umiejętność ułatwia aplikację pierwszej kumulacji głębokiej rany, a wytrenowanie jej w stopniu mistrzowskim sprawia, że chybienie nią będzie niemożliwe.",stats:{energy:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],cooldown:[{value:4,duration:1}],"combo-max":[{value:3,duration:1}],active_decevade_per:[{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:0,duration:1},{value:100,duration:1}],"combo_dmg_hpp-target":[{value:2.4,duration:1},{value:2.6,duration:1},{value:2.8,duration:1},{value:3,duration:1},{value:3.2,duration:1},{value:3.4,duration:1},{value:3.6,duration:1},{value:3.8,duration:1},{value:4,duration:1},{value:4.2,duration:1}],active_wound_per:[{value:44,duration:1},{value:48,duration:1},{value:52,duration:1},{value:56,duration:1},{value:60,duration:1},{value:64,duration:1},{value:68,duration:1},{value:72,duration:1},{value:76,duration:1},{value:80,duration:1}]},reqs:{reqp:"b",reqw:"wound"}},{id:130,attrs:7,name:"Szarża",desc:"Dokonujesz widowiskowej szarży zwiększając swoją szybkość podczas kilku następnych ataków.",stats:{sa2_per:[{value:9.5,duration:8},{value:10,duration:8},{value:10.5,duration:8},{value:11,duration:8},{value:11.5,duration:8},{value:12,duration:8},{value:12.5,duration:8},{value:13,duration:8},{value:13.5,duration:8},{value:14,duration:8}],cooldown:[{value:8,duration:1}],energy:[{value:null,duration:1}]},reqs:{reqp:"w"}},{id:131,attrs:0,name:"Determinacja",desc:"Szybka nauka pozwala ci zgłębić znacznie wiele dziedzin, dzięki czemu poznajesz w jaki sposób wrogowie mogą wyrządzać ci szkodę przy użyciu trucizn i głębokich ran.",stats:{act:[{value:8,duration:1},{value:11,duration:1},{value:14,duration:1},{value:17,duration:1},{value:20,duration:1},{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1}],woundred:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}]},reqs:{reqp:"m"}},{id:166,attrs:0,name:"Osłabienie",desc:"Ledwie wyczuwalna fala magicznego zaburzenia zakłóca przepływ przywracania zdrowia przeciwników.",stats:{"heal_per-enemies":[{value:-6,duration:1},{value:-7,duration:1},{value:-8,duration:1},{value:-9,duration:1},{value:-10,duration:1},{value:-11,duration:1},{value:-12,duration:1},{value:-13,duration:1},{value:-14,duration:1},{value:-15,duration:1}]},reqs:{reqp:"m"}},{id:167,attrs:0,name:"Spowalniające uderzenie",desc:"Twoje uderzenia krytyczne spowalniają kolejny atak przeciwnika.",stats:{critslow_per:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}]},reqs:{reqp:"m"}},{id:168,attrs:0,name:"Cios krytyczny",desc:"Rozwija umiejętność celowania w punkty witalne przeciwnika, przez co zwiększa szanse na zadanie krytycznych obrażeń.",stats:{crit:[{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1},{value:7.5,duration:1},{value:8,duration:1},{value:8.5,duration:1}]},reqs:{}},{id:173,attrs:0,name:"Zranienie",desc:"Zwiększasz szansę na powstawanie dodatkowych ran u przeciwnika. Umiejętność ta przez 3 tury zabiera przeciwnikowi życie o wartości 15% przyjętych przez niego obrażeń.",stats:{injure:[{value:3,duration:1},{value:6,duration:1},{value:9,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:21,duration:1},{value:24,duration:1},{value:27,duration:1},{value:30,duration:1}]},reqs:{reqp:"h"}},{id:174,attrs:0,name:"Niewrażliwość na zimno",desc:"Znajomość magii pozwala ci lepiej zrozumieć naturę żywiołu zimna. Obrażenia otrzymywane od tego żywiołu zostają zmniejszone, a zaklinane przez ciebie strzały przeszywają wrogów chłodem.",stats:{resfrost:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],pierce:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1}],frostbon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"t",reqw:"frost"}},{id:178,attrs:3,name:"Diamentowa strzała",desc:"Stosujesz strzały z bardzo twardym grotem, które zwiększają obrażenia ataku. Diamentowa strzała jest trudna do uniknięcia oraz zablokowania.",stats:{"adddmg_physical-perw":[{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1}],active_decevade_per:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],active_decblock_per:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],energy:[{value:24,duration:1},{value:25,duration:1},{value:26,duration:1},{value:27,duration:1},{value:28,duration:1},{value:29,duration:1},{value:30,duration:1},{value:31,duration:1},{value:32,duration:1},{value:33,duration:1}],"combo-skill":[{value:1,duration:1}],cooldown:[{value:4,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:179,attrs:0,name:"Remedium",desc:"Pozwala częściowo uodpornić się na obrażenia magiczne.",stats:{resfire:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],resfrost:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],reslight:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}]},reqs:{reqp:"h"}},{id:180,attrs:0,name:"Przypływ gniewu",desc:"Będąc zaatakowanym krytycznie, wzmacniasz siłę swojego następnego ataku o 10%. Dodatkowo jeżeli twoje zdrowie spadnie poniżej progu adrenaliny, wszelkie efekty niszczenia energii stają się przeciw tobie mniej skuteczne.",stats:{rage:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1}],adrenalin_reddest_threshold_per:[{value:50,duration:1}],adrenalin_reddest_per_sum:[{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1},{value:50,duration:1}]},reqs:{reqp:"h",reqw:"wound"}},{id:181,attrs:0,name:"Szkoła przetrwania",desc:"Dzięki temu szkoleniu uodparniasz się na trucizny i głębokie rany.",stats:{act:[{value:7,duration:1},{value:9,duration:1},{value:11,duration:1},{value:13,duration:1},{value:15,duration:1},{value:17,duration:1},{value:19,duration:1},{value:21,duration:1},{value:23,duration:1},{value:25,duration:1}],woundred:[{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1}]},reqs:{reqp:"h"}},{id:182,attrs:3,name:"Krytyczna potęga",desc:"Wykonujesz atak zwiększający twoje szanse na cios krytyczny w kilku najbliższych turach.",stats:{active_crit:[{value:10,duration:3},{value:11,duration:3},{value:12,duration:3},{value:13,duration:3},{value:14,duration:3},{value:15,duration:3},{value:16,duration:3},{value:17,duration:3},{value:18,duration:3},{value:19,duration:3}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:4,duration:1}]},reqs:{reqp:"m"}},{id:183,attrs:4,name:"Krytyczne spowolnienie",desc:"Mistrzostwo w trafianiu w punkty witalne, sprawia że uderzenia krytyczne spowalniają kolejny atak przeciwnika.\n#critslow_per obniżenie bazowego sa przeciwnika po otrzymaniu przez niego krytyka",stats:{critslow_per:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}]},reqs:{reqp:"w",reqw:"sw"}},{id:184,attrs:0,name:"Adaptacja",desc:"Wielokrotne zwalczanie trucizn i głębokich ran w swoim organizmie, pozwala uodpornić się na ich rodzaj obrażeń.",stats:{act:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],woundred:[{value:3,duration:1},{value:6,duration:1},{value:9,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:21,duration:1},{value:24,duration:1},{value:27,duration:1},{value:30,duration:1}]},reqs:{reqp:"w"}},{id:185,attrs:0,name:"Moc sprawiedliwych",desc:"Czujesz moc niebiańskiej siły, która pozwala ci zwiększyć ilość energii i many oraz ich turowe odnawianie.",stats:{energybon:[{value:5,duration:1},{value:10,duration:1},{value:15,duration:1},{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1}],energygain:[{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1}],manabon:[{value:15,duration:1},{value:30,duration:1},{value:45,duration:1},{value:55,duration:1},{value:65,duration:1},{value:75,duration:1},{value:85,duration:1},{value:90,duration:1},{value:95,duration:1},{value:100,duration:1}],manastr:[{value:.05,duration:1},{value:.08,duration:1},{value:.1,duration:1},{value:.12,duration:1},{value:.14,duration:1},{value:.16,duration:1},{value:.18,duration:1},{value:.2,duration:1},{value:.22,duration:1},{value:.24,duration:1}],managain:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1}]},reqs:{reqp:"p"}},{id:186,attrs:6,name:"Skupienie na celu",desc:"Twoja broń uderza przeciwnika z idealną celnością, dzięki czemu jego szansa na unik zostaje zmniejszona.",stats:{decevade_per:[{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1}]},reqs:{reqp:"p",reqw:"1h"}},{id:187,attrs:0,name:"Błogosławiona ochrona",desc:"Twoja zbroja zostaje pobłogosławiona w imię świętej sprawy, zwiększającym tym samym redukcję obrażeń od głębokich ran i trucizn.",stats:{act:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],woundred:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}]},reqs:{reqp:"p"}},{id:188,attrs:1,name:"Wyzywający okrzyk",desc:"Wydajesz prowokujący okrzyk, który ściąga na ciebie uwagę przeciwników na najbliższe tury. Sprowokowani przeciwnicy mają mniejszą skuteczność ataku oraz obrony.",stats:{shout:[{value:6,duration:3},{value:7,duration:3},{value:7,duration:3},{value:8,duration:3},{value:8,duration:3},{value:9,duration:3},{value:9,duration:3},{value:10,duration:3},{value:10,duration:3},{value:10,duration:3}],"active_decblock_per-enemies":[{value:5,duration:5},{value:6,duration:5},{value:6,duration:5},{value:7,duration:5},{value:7,duration:5},{value:8,duration:5},{value:8,duration:5},{value:9,duration:5},{value:9,duration:5},{value:10,duration:5}],alllowdmg:[{value:1,duration:5},{value:1,duration:5},{value:2,duration:5},{value:2,duration:5},{value:3,duration:5},{value:3,duration:5},{value:4,duration:5},{value:4,duration:5},{value:5,duration:5},{value:5,duration:5}],"red-sa":[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],energy:[{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1}]},reqs:{reqp:"w",reqw:"sh"}},{id:189,attrs:12,name:"Parowanie",desc:"Twoja obrona znacznie wzrasta dzięki umiejętności parowania ataków. Sparować można tylko ataki zadane przez broń białą.\n# parowanie to 100% obrony, jak unik",stats:{parry:[{value:.5,duration:1},{value:1,duration:1},{value:1.5,duration:1},{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1}]},reqs:{reqp:"p",reqw:"1h"}},{id:190,attrs:0,name:"Mroźna parada",desc:"Ataki mrozem pozwalają spowolnić przeciwnika do końca trwania walki.",stats:{critmval_c:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],slow:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"p",reqw:"frost"}},{id:191,attrs:9,name:"Srebrzysty blask",desc:"Uleczasz się za każdy zgromadzony punkt kombinacji. Magia czaru wywołuje chwilowy wzrost zadawanych obrażeń oraz przywracanie energii. Dodatkowe obrażenia wzmacniają również ciosy krytyczne.",stats:{perdmg:[{value:10,duration:8},{value:10,duration:8},{value:10,duration:8},{value:10,duration:8},{value:10,duration:8},{value:10,duration:8},{value:10,duration:8},{value:10,duration:8},{value:10,duration:8},{value:10,duration:8}],"en-regen":[{value:2,duration:8},{value:2,duration:8},{value:2,duration:8},{value:2,duration:8},{value:2,duration:8},{value:3,duration:8},{value:3,duration:8},{value:4,duration:8},{value:4,duration:8},{value:5,duration:8}],combo_heal_per:[{value:5,duration:1},{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1}],"combo-max":[{value:3,duration:1}],cooldown:[{value:8,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"p"}},{id:192,attrs:9,name:"Przywracanie mocy",desc:"Unikalna umiejętność regeneracyjna przywraca część utraconych punktów many i energii. Każde kolejne użycie jest 10% słabsze od poprzedniego.",stats:{manarestore_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],energyrestore_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}]},reqs:{reqp:"t"}},{id:193,attrs:0,name:"Strzelecka moc ognia",desc:"Tchnięcie magii w broń dystansową zwiększa obrażenia uderzenia krytycznego od ognia oraz zwiększa skuteczność absorbowania obrażeń dystansowych. Dodatkowo zwiększa obrażenia od żywiołu ognia w zależności od intelektu, a przywracane życie z twojego ekwipunku zostaje wzmocnione.",stats:{critmval_f:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],heal1_per:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],absorbd:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],firebon:[{value:.1,duration:1},{value:.12,duration:1},{value:.12,duration:1},{value:.14,duration:1},{value:.14,duration:1},{value:.16,duration:1},{value:.16,duration:1},{value:.18,duration:1},{value:.18,duration:1},{value:.2,duration:1}]},reqs:{reqw:"fire",reqp:"t"}},{id:194,attrs:0,name:"Strzelecka moc błyskawic",desc:"Tchnięcie magii w broń dystansową zwiększa obrażenia uderzenia krytycznego od błyskawic oraz zwiększa niszczony pancerz podczas wystąpienia ciosu krytycznego wraz z przebiciem. Dodatkowo zwiększa obrażenia od żywiołu błyskawic w zależności od intelektu.",stats:{critmval_l:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],critpierce_per:[{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1},{value:80,duration:1}],lightbon:[{value:.1,duration:1},{value:.12,duration:1},{value:.12,duration:1},{value:.14,duration:1},{value:.14,duration:1},{value:.16,duration:1},{value:.16,duration:1},{value:.18,duration:1},{value:.18,duration:1},{value:.2,duration:1}]},reqs:{reqp:"t",reqw:"light"}},{id:195,attrs:0,name:"Strzelecka moc zimna",desc:"Tchnięcie magii w broń dystansową zwiększa obrażenia uderzenia krytycznego od zimna oraz zwiększa ich częstotliwość występowania. Dodatkowo zwiększa obrażenia od żywiołu zimna w zależności od intelektu, a przywracane życie z twojego ekwipunku zostaje wzmocnione.",stats:{critmval_c:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],crit:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],heal1_per:[{value:5,duration:1}],frostbon:[{value:.1,duration:1},{value:.12,duration:1},{value:.12,duration:1},{value:.14,duration:1},{value:.14,duration:1},{value:.16,duration:1},{value:.16,duration:1},{value:.18,duration:1},{value:.18,duration:1},{value:.2,duration:1}]},reqs:{reqp:"t",reqw:"frost"}},{id:196,attrs:0,name:"Witalność",desc:"Rozwijanie swojej siły sprawia, że możesz przyjąć więcej obrażeń od przeciwników.",stats:{hpbon:[{value:.5,duration:1},{value:.8,duration:1},{value:1.1,duration:1},{value:1.4,duration:1},{value:1.7,duration:1},{value:2,duration:1},{value:2.3,duration:1},{value:2.6,duration:1},{value:2.9,duration:1},{value:3.2,duration:1}]},reqs:{reqp:"p"}},{id:197,attrs:7,name:"Rozpraszający cios",desc:"Uderzasz przeciwnika z niespotykaną dotąd siłą zmniejszając jego zdolności bojowe w postaci zadawanych obrażeń, ciosów krytycznych oraz przebić. Obniżenie szansy na cios krytyczny i przebicie nie wymaga celnego ataku.\n#przebicie to 2x wartość, zm. krytyka to 1x",stats:{disturb_crit:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],disturb_pierce:[{value:15,duration:1},{value:16,duration:1},{value:16,duration:1},{value:17,duration:1},{value:17,duration:1},{value:18,duration:1},{value:18,duration:1},{value:19,duration:1},{value:19,duration:1},{value:20,duration:1}],lowdmg_enemy:[{value:14,duration:2},{value:14,duration:2},{value:15,duration:2},{value:15,duration:2},{value:16,duration:2},{value:16,duration:2},{value:17,duration:2},{value:17,duration:2},{value:18,duration:2},{value:18,duration:2}],"adddmg_physical-perw":[{value:20,duration:1},{value:23,duration:1},{value:25,duration:1},{value:27,duration:1},{value:29,duration:1},{value:31,duration:1},{value:33,duration:1},{value:35,duration:1},{value:37,duration:1},{value:39,duration:1}],energy:[{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1}],"combo-skill":[{value:1,duration:1}]},reqs:{reqp:"p",reqw:"sw"}},{id:198,attrs:0,name:"Hart ducha",desc:"Stajesz się bardziej wytrwały, co pozwala ci redukować spowolnienia, których źródłem są przedmioty przeciwnika, magia zimna i trucizna oraz skraca czas przebywania w stanie obezwładnienia wywołanym ogłuszeniem lub zamrożeniem.",stats:{redslow:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],redstun:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],ac2_per:[{value:3,duration:1}]},reqs:{reqp:"p"}},{id:199,attrs:25,name:"Fala leczenia",desc:"Wysyłasz przed siebie falę świętego światła, która leczy sojuszników w drużynie. Każde kolejne uleczenie jest słabsze malejąc o 25% wartości początkowej. Użycie umiejętności podczas samotnej walki sprawia, że jest ona o połowę słabsza.",stats:{healall_per:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"p"}},{id:200,attrs:0,name:"Łaska Gerdeth",desc:"Błogosławieństwo bogini Gerdeth zwiększa przywracane życie z twojego ekwipunku i zmniejsza skuteczność wystrzeliwanych w ciebie pocisków.",stats:{heal1_per:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],arrowblock:[{value:3,duration:1}]},reqs:{reqp:"p"}},{id:201,attrs:0,name:"Niebiańska ochrona",desc:"Łaska niebios interweniuje podczas przyjmowanych przez ciebie ciosów krytycznych, zwiększając twoje obrażenia fizyczne na 3 tury.",stats:{rage_3turns:[{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1}],decevade_per:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"p"}},{id:202,attrs:25,name:"Porażająca tarcza",desc:"Osłaniasz się porażającą tarczą, odbijając część przyjętych obrażeń (od 6% do 14%) w kierunku wroga i spowalniając go na jedną turę. Spowolnienie nie łączy się z Płonącą barierą, Lodową barierą oraz Elektryczną barierą. Moc porażającej tarczy dodatkowo uodparnia na działanie trucizn.\n# spowolnienie SA jest parametrem",stats:{lightshield_per:[{value:6,duration:8},{value:6,duration:8},{value:7,duration:8},{value:7,duration:8},{value:8,duration:8},{value:8,duration:8},{value:9,duration:8},{value:9,duration:8},{value:10,duration:8},{value:10,duration:8}],antidote:[{value:5,duration:8},{value:6,duration:8},{value:6,duration:8},{value:7,duration:8},{value:7,duration:8},{value:8,duration:8},{value:8,duration:8},{value:9,duration:8},{value:9,duration:8},{value:10,duration:8}],energy:[{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"p"}},{id:203,attrs:7,name:"Agresywny atak",desc:"Wyprowadzasz bardzo silny cios wzmacniający zadawane obrażenia oraz powodujący nieuchronne obrażenia rozłożone w czasie.",stats:{"adddmg_physical-perw":[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],"dmg_evade_hpp-target":[{value:1.1,duration:8},{value:1.2,duration:8},{value:1.3,duration:8},{value:1.4,duration:8},{value:1.5,duration:8},{value:1.6,duration:8},{value:1.7,duration:8},{value:1.8,duration:8},{value:1.9,duration:8},{value:2,duration:8}],"combo-skill":[{value:1,duration:1}],cooldown:[{value:16,duration:1}],energy:[{value:15,duration:1},{value:17,duration:1},{value:19,duration:1},{value:21,duration:1},{value:23,duration:1},{value:25,duration:1},{value:27,duration:1},{value:29,duration:1},{value:31,duration:1},{value:33,duration:1}]},reqs:{reqp:"w"}},{id:204,attrs:7,name:"Błyskawiczny atak",desc:"Gnasz przed siebie, wykonując przy tym znacznie szybszy i mocniejszy atak.",stats:{sa_per:[{value:13,duration:1},{value:16,duration:1},{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1}],"adddmg_physical-perw":[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],energy:[{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1}],"combo-skill":[{value:1,duration:1}],str1h:[{value:.2,duration:1}]},reqs:{reqp:"w",reqw:"sw"}},{id:205,attrs:0,name:"Żądza krwi",desc:"Rzucasz się w wir walki, przez co z każdym uderzeniem krytycznym odzyskujesz część energii. \n#procentowo",stats:{engback:[{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1}]},reqs:{reqp:"w",reqw:"sw"}},{id:206,attrs:9,name:"Osłona tarczą",desc:"Szybkie schronienie się za tarczą pozwala uleczyć się w zależności od zgromadzonych punktów kombinacji, a pancerz i blok zyskiwany za pośrednictwem tarczy zostaje zwiększony na jedną turę. Zwiększasz również swoją odporność na zostanie ogłuszonym. Twoi sojusznicy stają się bardziej zmotywowani do twojej obrony i zyskują zwiększoną szansę na cios krytyczny. Efekt nie zwiększa szansy na cios krytyczny pomocniczy. Sam zyskujesz tylko połowę wzrostu szansy na cios krytyczny.",stats:{acshield_per:[{value:150,duration:1},{value:160,duration:1},{value:170,duration:1},{value:180,duration:1},{value:190,duration:1},{value:200,duration:1},{value:210,duration:1},{value:220,duration:1},{value:230,duration:1},{value:240,duration:1}],active_block_per:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],active_redstun:[{value:50,duration:2}],"active_crit-allies":[{value:7,duration:2}],combo_heal_per:[{value:1.2,duration:1},{value:1.2,duration:1},{value:1.3,duration:1},{value:1.3,duration:1},{value:1.4,duration:1},{value:1.4,duration:1},{value:1.5,duration:1},{value:1.5,duration:1},{value:1.6,duration:1},{value:1.6,duration:1}],"combo-max":[{value:5,duration:1}],energy:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}]},reqs:{reqp:"w",reqw:"sh"}},{id:207,attrs:0,name:"Potężne uderzenie",desc:"Wzmacnia krytyczne uderzenie bronią białą.",stats:{str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}],str2h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}],critval:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}]},reqs:{reqp:"w"}},{id:208,attrs:0,name:"Mocarna ochrona",desc:"Wyostrzone zmysły pozwalają ci zwiększyć szansę na trafienie, blok tarczą oraz blok strzały. Dodatkowo gromadzisz punkty kombinacji za każdy zablokowany cios.",stats:{blok_per:[{value:1,duration:1},{value:1.5,duration:1},{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1}],arrowblock:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],"combo-block":[{value:1,duration:1}],decevade_per:[{value:3,duration:1}]},reqs:{reqp:"w",reqw:"sh"}},{id:209,attrs:7,name:"Błyskawiczny cios",desc:"Kosztem energii zadajesz mocniejszy i szybszy cios.",stats:{sa_per:[{value:13,duration:1},{value:16,duration:1},{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1}],"adddmg_physical-perw":[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],energy:[{value:13,duration:1},{value:16,duration:1},{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1}],"combo-skill":[{value:1,duration:1}],str1h:[{value:.2,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:210,attrs:7,name:"Zadziorny atak",desc:"Wykonujesz szybki atak, który po trafieniu niszczy pancerz przeciwnika.",stats:{active_acdmg_per:[{value:4.2,duration:1},{value:4.4,duration:1},{value:4.6,duration:1},{value:4.8,duration:1},{value:5,duration:1},{value:5.2,duration:1},{value:5.4,duration:1},{value:5.6,duration:1},{value:5.8,duration:1},{value:6,duration:1}],sa_per:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],"combo-skill":[{value:1,duration:1}],energy:[{value:15,duration:1},{value:17,duration:1},{value:19,duration:1},{value:21,duration:1},{value:23,duration:1},{value:25,duration:1},{value:27,duration:1},{value:29,duration:1},{value:31,duration:1},{value:33,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:211,attrs:0,name:"Zdradzieckie cięcie",desc:"Dobrze wymierzony atak bronią główną skutkuje przyjęciem przez przeciwnika dotkliwych obrażeń od zranienia. Umiejętność ta przez 3 tury zabiera przeciwnikowi życie o wartości 15% przyjętych przez niego obrażeń.",stats:{injure:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:212,attrs:25,name:"Furia",desc:"W ferworze walki twój szał działa na wszystkich sojuszników, co zwiększa zadawane przez nich obrażenia oraz siłę ich ciosów krytycznych. Sam zyskujesz jedynie połowę wzmocnienia obrażeń.",stats:{"critval-allies":[{value:26,duration:8},{value:27,duration:8},{value:28,duration:8},{value:29,duration:8},{value:30,duration:8},{value:31,duration:8},{value:32,duration:8},{value:33,duration:8},{value:34,duration:8},{value:35,duration:8}],"critmval-allies":[{value:26,duration:8},{value:27,duration:8},{value:28,duration:8},{value:29,duration:8},{value:30,duration:8},{value:31,duration:8},{value:32,duration:8},{value:33,duration:8},{value:34,duration:8},{value:35,duration:8}],"perdmg-allies":[{value:5,duration:8},{value:6,duration:8},{value:6,duration:8},{value:7,duration:8},{value:7,duration:8},{value:8,duration:8},{value:8,duration:8},{value:9,duration:8},{value:9,duration:8},{value:10,duration:8}],energy:[{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"b"}},{id:213,attrs:0,name:"Poprawa kondycji",desc:"Dzięki wymagającemu treningowi jesteś w stanie zwiększyć swoją bazową ilość energii i co turę przywracać jej część.",stats:{energybon:[{value:24,duration:1},{value:28,duration:1},{value:32,duration:1},{value:36,duration:1},{value:40,duration:1},{value:44,duration:1},{value:48,duration:1},{value:52,duration:1},{value:56,duration:1},{value:60,duration:1}],energygain:[{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1}]},reqs:{reqp:"b"}},{id:214,attrs:0,name:"Płynność ruchów",desc:"Twoje ruchy stają się bardziej płynne, skutecznie niwelując efekty spowolnienia, których źródłem jest ekwipunek przeciwnika oraz obrażenia od magii i trucizny, co ułatwia unikanie wymierzonych w ciebie ataków.",stats:{redslow:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],evade_per:[{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1}]},reqs:{reqp:"b"}},{id:215,attrs:0,name:"Swobodny unik",desc:"Swoboda ruchów pozwala ci rozwinąć naturalną umiejętność unikania ciosów.",stats:{evade_per:[{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1}]},reqs:{reqp:"t"}},{id:216,attrs:0,name:"Zew krwi",desc:"Widząc siłę swoich krytycznych ataków, odnawiasz część energii.",stats:{engback:[{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1}],str1h:[{value:.1,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:217,attrs:3,name:"Dziki zapał",desc:"Gromadzisz zapał przyspieszając się na krótką chwilę, przez który naciągasz strzały z większą siłą i zwiększasz odporności na żywioły. Kolejne wystrzelone przez ciebie strzały zadadzą więcej obrażeń i będą wzmacniać również trafienia krytyczne.",stats:{sa_per:[{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1}],perdmg:[{value:3.5,duration:8},{value:4,duration:8},{value:4.5,duration:8},{value:5,duration:8},{value:5.5,duration:8},{value:6,duration:8},{value:6.5,duration:8},{value:7,duration:8},{value:7.5,duration:8},{value:8,duration:8}],resfire_per:[{value:10,duration:8}],resfrost_per:[{value:10,duration:8}],reslight_per:[{value:10,duration:8}],cooldown:[{value:8,duration:1}],energy:[{value:26,duration:1},{value:30,duration:1},{value:34,duration:1},{value:38,duration:1},{value:42,duration:1},{value:46,duration:1},{value:50,duration:1},{value:54,duration:1},{value:58,duration:1},{value:62,duration:1}]},reqs:{reqp:"h"}},{id:218,attrs:0,name:"Wyswobodzenie",desc:"Doświadczenie w boju pozwala ci instynktownie zmniejszyć poziom spowolnień (pochodzącego z przedmiotów przeciwnika, trucizny oraz magii zimna) oraz efektów obezwładnień.\n# wartość procentowa",stats:{redslow:[{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1},{value:50,duration:1}],agi:[{value:.1,duration:1}]},reqs:{reqp:"h"}},{id:219,attrs:1,name:"Jadowity podmuch",desc:"Wykorzystując wiedzę o toksynach potrafisz rozsiać na polu bitwy zatruty obłok powodujący osłabienie umiejętności leczących przeciwnika.",stats:{"lowheal_per-enemies":[{value:21,duration:8},{value:22,duration:8},{value:23,duration:8},{value:24,duration:8},{value:25,duration:8},{value:26,duration:8},{value:27,duration:8},{value:28,duration:8},{value:29,duration:8},{value:30,duration:8}],cooldown:[{value:8,duration:1}],energy:[{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1},{value:26,duration:1},{value:27,duration:1},{value:28,duration:1},{value:29,duration:1},{value:30,duration:1}]},reqs:{reqp:"b"}},{id:220,attrs:9,name:"Medytacja",desc:"Poświęcasz chwilę na odzyskanie swoich zasobów energii. Każde kolejne użycie jest 10% słabsze od poprzedniego.",stats:{energyrestore_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}]},reqs:{reqp:"h"}},{id:221,attrs:0,name:"Zabójcze uderzenie",desc:"Morderczy instynkt pozwala ci zadawać wyższe obrażenia podczas ciosów krytycznych zadanych bronią główną.",stats:{critval:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:222,attrs:7,name:"Stłamszenie",desc:"Wykonując kombinację szybkich ciosów możesz znacznie zredukować obrażenia nadciągającego ataku przeciwnika.",stats:{sa2_per:[{value:8,duration:2},{value:9,duration:2},{value:10,duration:2},{value:11,duration:2},{value:12,duration:2},{value:13,duration:2},{value:14,duration:2},{value:15,duration:2},{value:16,duration:2},{value:17,duration:2}],combo_lowdmg_enemy:[{value:10,duration:1}],"combo-max":[{value:3,duration:1}],energy:[{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1}],cooldown:[{value:2,duration:1}]},reqs:{reqp:"b"}},{id:223,attrs:7,name:"Rozpraszający atak",desc:"Podczas ataku wydajesz z siebie przerażający krzyk, który obniża szansę przeciwnika na cios krytyczny i przebicie oraz zmniejsza jego atak. Obniżenie szansy na cios krytyczny i przebicie nie wymaga celnego ataku.\n#przebicie to 2x wartość, zm. krytyka to 1x",stats:{disturb_crit:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],disturb_pierce:[{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],lowdmg_enemy:[{value:12,duration:2}],sa_per:[{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1}],"combo-skill":[{value:1,duration:1}],energy:[{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:224,attrs:7,name:"Zamroczenie",desc:"Wykonujesz zabójcze cięcie rozpraszające skupienie przeciwnika, pozbawiając go zasobów energii.",stats:{energyout:[{value:3,duration:5},{value:3,duration:5},{value:4,duration:5},{value:4,duration:5},{value:5,duration:5},{value:5,duration:5},{value:6,duration:5},{value:6,duration:5},{value:7,duration:5},{value:7,duration:5}],"dmg-target_absolute":[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],"combo-skill":[{value:1,duration:1}],cooldown:[{value:12,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:225,attrs:4,name:"Bolesny cios",desc:"Doskonale wiesz gdzie celować, dzięki czemu bez problemu spowalniasz kolejny atak przeciwnika przy każdym ciosie krytycznym.",stats:{critslow_per:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],str1h:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:226,attrs:0,name:"Znieczulica",desc:"Zwiększa naturalną odporność na truciznę i głębokie rany.",stats:{act:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:21,duration:1},{value:25,duration:1}],woundred:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}]},reqs:{reqp:"t"}},{id:227,attrs:0,name:"Adrenalina",desc:"W przypływie obaw o własne życie, szybkość twojego ataku drastycznie wzrasta. Warunkiem działania jest posiadanie życia poniżej progu adrenaliny.",stats:{adrenalin_sa_threshold_per:[{value:30,duration:1}],adrenalin_sa_per:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],"of-str":[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"b"}},{id:228,attrs:0,name:"Wściekłość",desc:"Po otrzymaniu obrażeń od ciosu krytycznego, twoje trzy kolejne ataki zadadzą większe obrażenia fizyczne.",stats:{rage_3turns:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}]},reqs:{reqp:"b"}},{id:229,attrs:0,name:"Czarna krew",desc:"Jeżeli na twoją broń została nałożona trucizna, masz 25% szans na osłabienie leczenia turowego przeciwnika po zadaniu ciosu krytycznego. Dodatkowo uderzając krytycznie przeciwnika, odsłaniasz jego podatność na truciznę.\n\n#osłabienie leczenia turowego przeciwnika 5% + critpoison_per",stats:{critpoison_per:[{value:5,duration:1},{value:10,duration:1},{value:15,duration:1},{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1}],actdmg:[{value:1,duration:1}]},reqs:{reqp:"b",reqw:"poison"}},{id:230,attrs:0,name:"Gruboskórność",desc:"Odporność na obrażenia magiczne zostaje nieznacznie zwiększona.",stats:{resfire:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],resfrost:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],reslight:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}]},reqs:{reqp:"b"}},{id:231,attrs:3,name:"Wycieńczająca strzała",desc:"Strzała zabierająca część maksymalnego zdrowia przeciwnika.",stats:{"combo_dmg_hpp-target":[{value:2.1,duration:1},{value:2.2,duration:1},{value:2.3,duration:1},{value:2.4,duration:1},{value:2.5,duration:1},{value:2.6,duration:1},{value:2.7,duration:1},{value:2.8,duration:1},{value:2.9,duration:1},{value:3,duration:1}],"combo-max":[{value:3,duration:1}],energy:[{value:22,duration:1},{value:24,duration:1},{value:25,duration:1},{value:27,duration:1},{value:28,duration:1},{value:30,duration:1},{value:31,duration:1},{value:33,duration:1},{value:34,duration:1},{value:36,duration:1}],cooldown:[{value:5,duration:1}]},reqs:{reqp:"t"}},{id:232,attrs:3,name:"Zatruta strzała",desc:"Wzmacniasz truciznę, którą nasączona jest twoja strzała, co wzmacnia zadawane przez nie obrażenia na 5 tur. Następny atak przeciwnika, na którego nałożona jest ta toksyna, zostaje osłabiony.",stats:{"poisonbon_poison-perw":[{value:134,duration:1},{value:138,duration:1},{value:142,duration:1},{value:146,duration:1},{value:150,duration:1},{value:154,duration:1},{value:158,duration:1},{value:162,duration:1},{value:166,duration:1},{value:170,duration:1}],energy:[{value:25,duration:1},{value:27,duration:1},{value:29,duration:1},{value:31,duration:1},{value:33,duration:1},{value:35,duration:1},{value:37,duration:1},{value:39,duration:1},{value:41,duration:1},{value:43,duration:1}],lowdmg_enemy:[{value:7,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8,duration:1},{value:8,duration:1},{value:9,duration:1},{value:9,duration:1},{value:9,duration:1},{value:10,duration:1}],"combo-skill":[{value:1,duration:1}]},reqs:{reqp:"h",reqw:"dis,poison"}},{id:233,attrs:0,name:"Rytuał ochrony żywiołów",desc:"Znajomość magii pozwala ci lepiej zrozumieć naturę żywiołu. Otrzymywane obrażenia magiczne zostają zmniejszone.",stats:{resfire:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],resfrost:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],reslight:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}]},reqs:{reqp:"t"}},{id:234,attrs:0,name:"Wzmocnienie energii",desc:"Trening siły woli pozwala ci zwiększyć maksymalną ilość posiadanej energii i przywracać jej część po każdej turze.",stats:{energybon:[{value:15,duration:1},{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1}],energygain:[{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1},{value:8,duration:1}]},reqs:{reqp:"w"}},{id:235,attrs:0,name:"Naturalny unik",desc:"Wyostrzone zmysły pozwalają ci zwiększyć posiadany unik. \n\n#zmienna evade to ta sama co u tancerza: zmiana ze stałej na pkt procentowe",stats:{evade_per:[{value:3,duration:1},{value:4,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:14,duration:1},{value:15,duration:1}]},reqs:{reqp:"h"}},{id:236,attrs:0,name:"Toksyczne opary",desc:"Do momentu utrzymywania się toksyny w ciele twoich przeciwników, moc wszelkich zadawanych przez nich obrażeń zostaje zmniejszona.",stats:{"poison_lowdmg_per-enemies":[{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8.5,duration:1},{value:9,duration:1},{value:9.5,duration:1},{value:10,duration:1}]},reqs:{reqp:"b",reqw:"poison"}},{id:237,attrs:9,name:"Opatrywanie ran",desc:"Instynkt przetrwania pozwala ci na natychmiastowe wyleczenie niegroźnych ran i chwilowe uodpornienie się na obrażenia magiczne. Każde kolejne uleczenie jest słabsze, malejąc o 25% wartości początkowej.",stats:{bandage_per:[{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1},{value:24,duration:1},{value:25,duration:1}],resfire_per:[{value:13,duration:2},{value:16,duration:2},{value:19,duration:2},{value:22,duration:2},{value:25,duration:2},{value:28,duration:2},{value:31,duration:2},{value:34,duration:2},{value:37,duration:2},{value:40,duration:2}],resfrost_per:[{value:13,duration:2},{value:16,duration:2},{value:19,duration:2},{value:22,duration:2},{value:25,duration:2},{value:28,duration:2},{value:31,duration:2},{value:34,duration:2},{value:37,duration:2},{value:40,duration:2}],reslight_per:[{value:13,duration:2},{value:16,duration:2},{value:19,duration:2},{value:22,duration:2},{value:25,duration:2},{value:28,duration:2},{value:31,duration:2},{value:34,duration:2},{value:37,duration:2},{value:40,duration:2}],cooldown:[{value:8,duration:1}],energy:[{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1},{value:50,duration:1},{value:52,duration:1},{value:54,duration:1},{value:56,duration:1},{value:58,duration:1}]},reqs:{reqp:"b"}},{id:238,attrs:17,name:"Oczyszczenie",desc:"Dmiesz w róg błyskawicznie oczyszczając swoich sojuszników z ogłuszeń oraz obrażeń rozłożonych w czasie.",stats:{"removestun-allies":[{value:1,duration:1}],"removedot-allies":[{value:1,duration:1}],"red-sa":[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}],energy:[{value:50,duration:1},{value:47,duration:1},{value:44,duration:1},{value:41,duration:1},{value:38,duration:1},{value:35,duration:1},{value:32,duration:1},{value:29,duration:1},{value:26,duration:1},{value:23,duration:1}]},reqs:{reqp:"h"}},{id:239,attrs:3,name:"Podwójne trafienie",desc:"Wystrzeliwujesz dwie strzały, jednak ich siła ciosu jest mniejsza.",stats:{energy:[{value:25,duration:1},{value:26,duration:1},{value:27,duration:1},{value:28,duration:1},{value:29,duration:1},{value:30,duration:1},{value:31,duration:1},{value:32,duration:1},{value:33,duration:1},{value:34,duration:1}],lowdmg_self:[{value:16,duration:1},{value:15,duration:1},{value:14,duration:1},{value:13,duration:1},{value:12,duration:1},{value:11,duration:1},{value:10,duration:1},{value:9,duration:1},{value:8,duration:1},{value:7,duration:1}],add_attacks:[{value:1,duration:1}],cooldown:[{value:3,duration:1}],"combo-skill":[{value:1,duration:1}],agi:[{value:.2,duration:1}]},reqs:{reqp:"t",reqw:"dis"}},{id:240,attrs:0,name:"Wygodne stroje",desc:"Dzięki unikalnej zdolności otrzymujesz więcej szybkości ataku z bonusów w przedmiotach i zyskujesz odporność na spowolnienie, którego źródłem są przedmioty przeciwnika, magia zimna i trucizna.\n# bonus dt. tylko zakładanych przedmiotów, których SA jest mnożone o dany procent",stats:{"sa-clothes":[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],redslow:[{value:18,duration:1},{value:21,duration:1},{value:24,duration:1},{value:27,duration:1},{value:30,duration:1},{value:33,duration:1},{value:36,duration:1},{value:39,duration:1},{value:42,duration:1},{value:45,duration:1}]},reqs:{reqp:"t"}},{id:241,attrs:0,name:"Toksyczny wstrząs",desc:"Wszyscy zatruci przeciwnicy zadają mniejsze obrażenia (działa również na ataki specjalne). Efekt dotyczy wszystkich członków drużyny posiadających atak od trucizn.",stats:{"poison_lowdmg_per-enemies":[{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8.5,duration:1},{value:9,duration:1},{value:9.5,duration:1},{value:10,duration:1}],"combo-pierce":[{value:1,duration:1}]},reqs:{reqp:"h",reqw:"dis,poison"}},{id:242,attrs:0,name:"Przeklinanie przedmiotów",desc:"Mroczne szepty i przeklęte symbole zakłócają magiczne atrybuty twoich przeciwników, osłabiając przywracane przez nich życie.",stats:{"heal_per-enemies":[{value:-1,duration:1},{value:-2,duration:1},{value:-3,duration:1},{value:-4,duration:1},{value:-5,duration:1},{value:-6,duration:1},{value:-7,duration:1},{value:-8,duration:1},{value:-9,duration:1},{value:-10,duration:1}]},reqs:{reqp:"t"}},{id:243,attrs:0,name:"Skupienie mocy",desc:"Ogromne skupienie woli pozwala ci na zwiększenie ilości many oraz energii i ich turowe przywracanie.",stats:{energybon:[{value:5,duration:1},{value:10,duration:1},{value:15,duration:1},{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1}],energygain:[{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1}],manabon:[{value:25,duration:1},{value:35,duration:1},{value:45,duration:1},{value:55,duration:1},{value:65,duration:1},{value:75,duration:1},{value:85,duration:1},{value:90,duration:1},{value:95,duration:1},{value:100,duration:1}],manastr:[{value:.05,duration:1},{value:.08,duration:1},{value:.1,duration:1},{value:.12,duration:1},{value:.14,duration:1},{value:.16,duration:1},{value:.18,duration:1},{value:.2,duration:1},{value:.22,duration:1},{value:.24,duration:1}],managain:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1}]},reqs:{reqp:"t"}},{id:244,attrs:1,name:"Emanujące strzały",desc:"Wystrzelenie pomiędzy przeciwników niewidzialnych strzał emanujących magią, które obniżają ataki krytyczne wszystkich przeciwników na kilka tur.",stats:{"critval-enemies":[{value:-12,duration:8},{value:-14,duration:8},{value:-16,duration:8},{value:-18,duration:8},{value:-20,duration:8},{value:-22,duration:8},{value:-24,duration:8},{value:-26,duration:8},{value:-28,duration:8},{value:-30,duration:8}],"critmval-enemies":[{value:-12,duration:8},{value:-14,duration:8},{value:-16,duration:8},{value:-18,duration:8},{value:-20,duration:8},{value:-22,duration:8},{value:-24,duration:8},{value:-26,duration:8},{value:-28,duration:8},{value:-30,duration:8}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"t",reqw:"dis"}},{id:245,attrs:0,name:"Rozdzierająca strzała",desc:"Strzały, które wystrzeliwujesz są kierowane w łączenia w zbroi przeciwnika. Zwiększa to posiadaną szansę na głęboką ranę i wzmacnia jej działanie.",stats:{wounddmgbon_perw:[{value:46,duration:1},{value:49,duration:1},{value:52,duration:1},{value:55,duration:1},{value:58,duration:1},{value:61,duration:1},{value:64,duration:1},{value:67,duration:1},{value:70,duration:1},{value:73,duration:1}],woundchance:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1},{value:6,duration:1},{value:6,duration:1},{value:7,duration:1},{value:7,duration:1}],"combo-wound":[{value:1,duration:1}]},reqs:{reqp:"h",reqw:"dis,wound"}},{id:246,attrs:3,name:"Fuzja żywiołów",desc:"Użycie odpowiedniej kombinacji zaklęć pozwala uwolnić moc pochodzącą z ich połączenia, aby zadać nieuchronne obrażenia przeciwnikowi.",stats:{"combo_dmg_hpp-target":[{value:2.1,duration:1},{value:2.2,duration:1},{value:2.3,duration:1},{value:2.4,duration:1},{value:2.5,duration:1},{value:2.6,duration:1},{value:2.7,duration:1},{value:2.8,duration:1},{value:2.9,duration:1},{value:3,duration:1}],"combo-max":[{value:4,duration:1}],mana:[{value:25,duration:1},{value:29,duration:1},{value:33,duration:1},{value:37,duration:1},{value:41,duration:1},{value:45,duration:1},{value:49,duration:1},{value:53,duration:1},{value:57,duration:1},{value:61,duration:1}]},reqs:{reqp:"m",reqw:"orb"}},{id:247,attrs:3,name:"Duszący pocisk",desc:"Koncentrując moc magiczną kierujesz w stronę przeciwnika pocisk zmniejszający siłę jego ataku.",stats:{lowdmg_enemy:[{value:5,duration:3},{value:5.5,duration:3},{value:6,duration:3},{value:6.5,duration:3},{value:7,duration:3},{value:7.5,duration:3},{value:8,duration:3},{value:8.5,duration:3},{value:9,duration:3},{value:9.5,duration:3}],"combo-skill":[{value:1,duration:1}],mana:[{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:33,duration:1},{value:37,duration:1},{value:41,duration:1},{value:47,duration:1},{value:53,duration:1},{value:60,duration:1}]},reqs:{reqp:"m"}},{id:248,attrs:25,name:"Kojące ochłodzenie",desc:"Podmuch magicznej energii leczy ciebie lub wybranego sojusznika. Każde kolejne uleczenie jest słabsze, malejąc o 25% wartości początkowej.",stats:{heal_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],cooldown:[{value:8,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"t"}},{id:249,attrs:9,name:"Odnowa mocy",desc:"Cicho recytujesz kanon, dzięki czemu przywracasz sobie część punktów many i energii. Każde kolejne użycie jest 10% słabsze od poprzedniego.",stats:{manarestore_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],energyrestore_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}]},reqs:{reqp:"p"}},{id:250,attrs:0,name:"Krytyczna moc ognia",desc:"Krytyczne obrażenia od magii ognia zadają więcej obrażeń i szansa na ich wystąpienie jest zwiększona, jeżeli trafią wroga posiadającego poniżej 20% zdrowia. Efektu wzrostu szansy na cios krytyczny nie da się osłabić poprzez inne czary lub przewagę poziomową przeciwnika.",stats:{critmval_f:[{value:3,duration:1},{value:6,duration:1},{value:9,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:21,duration:1},{value:24,duration:1},{value:27,duration:1},{value:30,duration:1}],lastcrit:[{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1}],parry:[{value:2,duration:1}],firebon:[{value:.15,duration:1},{value:.18,duration:1},{value:.18,duration:1},{value:.21,duration:1},{value:.21,duration:1},{value:.24,duration:1},{value:.24,duration:1},{value:.27,duration:1},{value:.27,duration:1},{value:.3,duration:1}]},reqs:{reqw:"fire",reqp:"p"}},{id:251,attrs:0,name:"Krytyczna moc błyskawic",desc:"Krytyczne obrażenia od magii błyskawic zadają więcej obrażeń. Dodatkowo potrafisz przebijać się przez pancerz przeciwnika, a czas przebywania w stanie ogłuszenia jest krótszy.",stats:{critmval_l:[{value:3,duration:1},{value:6,duration:1},{value:9,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:21,duration:1},{value:24,duration:1},{value:27,duration:1},{value:30,duration:1}],pierce:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],lightbon:[{value:.15,duration:1},{value:.18,duration:1},{value:.18,duration:1},{value:.21,duration:1},{value:.21,duration:1},{value:.24,duration:1},{value:.24,duration:1},{value:.27,duration:1},{value:.27,duration:1},{value:.3,duration:1}]},reqs:{reqp:"p",reqw:"light"}},{id:252,attrs:0,name:"Krytyczna moc zimna",desc:"Krytyczne obrażenia od magii zimna występują częściej, zadają więcej obrażeń i mają 25% szans na obniżenie u przeciwnika efektów leczenia, których źródłem jest ich ekwipunek.",stats:{critmval_c:[{value:3,duration:1},{value:6,duration:1},{value:9,duration:1},{value:12,duration:1},{value:15,duration:1},{value:18,duration:1},{value:21,duration:1},{value:24,duration:1},{value:27,duration:1},{value:30,duration:1}],critpoison_per:[{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1},{value:80,duration:1},{value:85,duration:1},{value:90,duration:1}],crit:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],frostbon:[{value:.15,duration:1},{value:.18,duration:1},{value:.18,duration:1},{value:.21,duration:1},{value:.21,duration:1},{value:.24,duration:1},{value:.24,duration:1},{value:.27,duration:1},{value:.27,duration:1},{value:.3,duration:1}]},reqs:{reqp:"p",reqw:"frost"}},{id:253,attrs:0,name:"Krytyczny strzał",desc:"Częste celowanie w punkty witalne pozwoliło ci rozwinąć umiejętność zadawania większych obrażeń krytycznych z broni dystansowej. Ataki zawsze powodują zmniejszenie szybkości przeciwnika.",stats:{slow:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],critval:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],agi:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:254,attrs:3,name:"Gwałtowny strzał",desc:"Twój pocisk zostanie wystrzelony w znacznie krótszym czasie, co wpływa na szybkość załadowania kolejnej amunicji.",stats:{"red-sa":[{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1},{value:21,duration:1},{value:22,duration:1},{value:23,duration:1}],energy:[{value:30,duration:1},{value:31,duration:1},{value:32,duration:1},{value:33,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1}],cooldown:[{value:5,duration:1}]},reqs:{reqp:"t",reqw:"dis"}},{id:255,attrs:0,name:"Kruszące groty",desc:"Technika udoskonalania grotów sprawia, że szansa na przebicie pancerza przeciwnika zostaje zwiększona. Dodatkowo potrafisz wykonywać szybką strzałę, która skraca czas wykonywania twojej tury o 75%. Zadane przez ciebie trafienia krytyczne prowadzą do kumulacji punktów kombinacji.",stats:{fastarrow:[{value:1,duration:1},{value:1.5,duration:1},{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1}],pierce:[{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:8.5,duration:1},{value:9,duration:1},{value:9.5,duration:1},{value:10,duration:1}],"combo-crit":[{value:1,duration:1}],agi:[{value:.1,duration:1}]},reqs:{reqp:"t",reqw:"dis"}},{id:256,attrs:0,name:"Sztuka koncentracji",desc:"Wyjątkowe skupienie zwiększa skuteczność trafień twoich strzał oraz pozwala szybciej wydostawać się z efektu obezwładnienia.",stats:{decevade_per:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],redstun:[{value:13,duration:1},{value:16,duration:1},{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1}],agi:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"h",reqw:"dis"}},{id:257,attrs:0,name:"Wzmożony ostrzał",desc:"Widząc słaniającego się na nogach przeciwnika, zadajesz mu większe obrażenia, jeżeli jego ilość punktów życia spadła poniżej 20%.",stats:{vulture_perw:[{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1}],agi:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"t",reqw:"dis"}},{id:258,attrs:0,name:"Rozładowujący pocisk",desc:"Poznajesz sztukę wyprowadzania rozładowujących pocisków, które są znacznie trudniejsze do zablokowania.",stats:{decblock_per:[{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1}]},reqs:{reqp:"m"}},{id:259,attrs:0,name:"Uporczywość",desc:"Przyjmowanie obrażeń oraz zwalczanie trucizn i głębokich ran w swoim organizmie, pozwala się na nie uodpornić i zwiększyć skuteczność unikania pocisków.",stats:{act:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],woundred:[{value:2,duration:1},{value:4,duration:1},{value:6,duration:1},{value:8,duration:1},{value:10,duration:1},{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1}],evade_per:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1}]},reqs:{reqp:"b"}},{id:260,attrs:0,name:"Niewrażliwość na ogień",desc:"Znajomość magii pozwala ci lepiej zrozumieć naturę żywiołu ognia. Obrażenia otrzymywane od tego żywiołu oraz obrażenia fizyczne zostają zmniejszone, a posiadana przez ciebie absorpcja jest mniej podatna na zniszczenie.",stats:{resfire:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],redabdest_per:[{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1},{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1}],firebon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"t",reqw:"fire"}},{id:261,attrs:0,name:"Niewrażliwość na błyskawice",desc:"Znajomość magii pozwala ci lepiej zrozumieć naturę żywiołu błyskawic. Obrażenia otrzymywane od tego żywiołu zostają zmniejszone, a zadawane obrażenia w przeciwników zostają zwiększone jeżeli nie zostaną zredukowane.",stats:{reslight:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],crush_dmg_physical:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],lightbon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"t",reqw:"light"}},{id:262,attrs:0,name:"Mroźne sople",desc:"Śmiertelnie ostre pociski z lodu jakie wytwarzasz, potrafią przebić pancerz przeciwnika. Trafienia krytyczne magią lodu prowadzą do gromadzenia punktów kombinacji.",stats:{pierce:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}],"combo-crit":[{value:1,duration:1}],frostbon:[{value:.05,duration:1},{value:.06,duration:1},{value:.06,duration:1},{value:.07,duration:1},{value:.07,duration:1},{value:.08,duration:1},{value:.08,duration:1},{value:.09,duration:1},{value:.09,duration:1},{value:.1,duration:1}]},reqs:{reqp:"m",reqw:"frost"}},{id:263,attrs:0,name:"Sprawność fizyczna",desc:"Zwiększona ilość punktów życia sprawia, że jesteś w stanie dłużej przyjmować ataki wroga. \n\n#hp bonus do życia; cplvl - poziom gracza do max 300",stats:{hp:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{}},{id:264,attrs:1,name:"Piętno bestii",desc:"Naznaczasz wszystkich twoich przeciwników, co powoduje zwiększenie przyjmowanych przez nich obrażeń. Rzucanie tej umiejętności wymaga jednak więcej czasu.",stats:{"taken_dmg_per-all":[{value:6,duration:8},{value:7,duration:8},{value:8,duration:8},{value:9,duration:8},{value:10,duration:8},{value:11,duration:8},{value:12,duration:8},{value:13,duration:8},{value:14,duration:8},{value:15,duration:8}],"red-sa":[{value:-35,duration:1}],energy:[{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"h"}},{id:265,attrs:0,name:"Destrukcyjne strzały",desc:"Ciosy krytyczne, które przebiły pancerz przeciwnika wzmacniają posiadane niszczenie pancerza. Masz również większą szansę zadać głęboką ranę.",stats:{critpierce_per:[{value:55,duration:1},{value:60,duration:1},{value:65,duration:1},{value:70,duration:1},{value:75,duration:1},{value:80,duration:1},{value:85,duration:1},{value:90,duration:1},{value:95,duration:1},{value:100,duration:1}],woundchance:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:3,duration:1},{value:3,duration:1}]},reqs:{reqp:"h",reqw:"wound"}},{id:266,attrs:9,name:"Wewnętrzny spokój",desc:"Tworzysz wokół siebie osłonę absorbującą wszystkie otrzymywane obrażenia.",stats:{immunity_to_dmg:[{value:1,duration:2}],cooldown:[{value:12,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"m",reqw:"orb"}},{id:267,attrs:0,name:"Zasadzka",desc:"Odpowiednie przygotowanie ataku sprawia, że trafienie w przeciwnika staje się prostsze.",stats:{decevade_per:[{value:.5,duration:1},{value:1,duration:1},{value:1.5,duration:1},{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1}]},reqs:{reqp:"b"}},{id:268,attrs:0,name:"Końskie zdrowie",desc:"Odpowiedni trening umożliwia zwiększenie maksymalnego zdrowia, odporności przed obrażeniami oraz zwiększenie przywracania punktów życia przez przedmioty leczące. Wzmocnienie nie działa na procentowe oraz pełne leczenie.",stats:{hp:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],healpower:[{value:5,duration:1},{value:10,duration:1},{value:15,duration:1},{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:40,duration:1},{value:45,duration:1},{value:50,duration:1}],dmg_from_player_per:[{value:-1,duration:1},{value:-1,duration:1},{value:-1,duration:1},{value:-2,duration:1},{value:-2,duration:1},{value:-2,duration:1},{value:-3,duration:1},{value:-3,duration:1},{value:-3,duration:1},{value:-4,duration:1}]},reqs:{}},{id:269,attrs:0,name:"Płatnerstwo",desc:"Nauka płatnerstwa pozwalająca zwiększać swój pancerz.",stats:{ac:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{}},{id:270,attrs:0,name:"Źródło potęgi",desc:"Nauka pozwalająca odnaleźć w sobie moc stanowiącą o własnej potędze.",stats:{dmg_to_npc_per:[{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1},{value:7.5,duration:1},{value:8,duration:1},{value:8.5,duration:1},{value:9,duration:1},{value:9.5,duration:1},{value:10,duration:1}]},reqs:{}},{id:271,attrs:7,name:"Okrzyk bojowy",desc:"Podczas nagłego ataku wydajesz z siebie niekontrolowany krzyk, co zwiększa szanse na zadanie ciosu krytycznego.",stats:{active_crit:[{value:9,duration:2},{value:10,duration:2},{value:11,duration:2},{value:12,duration:2},{value:13,duration:2},{value:14,duration:2},{value:15,duration:2},{value:16,duration:2},{value:17,duration:2},{value:18,duration:2}],sa_per:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],"combo-skill":[{value:1,duration:1}],cooldown:[{value:9,duration:1}]},reqs:{reqp:"w"}},{id:272,attrs:7,name:"Amok",desc:"Wpadasz w amok, sprawiając, że twoje ataki częściej trafiają krytycznie i leczą cię za część zadanych obrażeń.",stats:{vamp_time_per:[{value:10,duration:8},{value:11,duration:8},{value:11,duration:8},{value:12,duration:8},{value:12,duration:8},{value:13,duration:8},{value:13,duration:8},{value:14,duration:8},{value:14,duration:8},{value:15,duration:8}],active_crit:[{value:1,duration:8},{value:1,duration:8},{value:2,duration:8},{value:2,duration:8},{value:3,duration:8},{value:3,duration:8},{value:4,duration:8},{value:4,duration:8},{value:5,duration:8},{value:5,duration:8}],energy:[{value:32,duration:1},{value:34,duration:1},{value:36,duration:1},{value:38,duration:1},{value:40,duration:1},{value:42,duration:1},{value:44,duration:1},{value:46,duration:1},{value:48,duration:1},{value:50,duration:1}],cooldown:[{value:16,duration:1}]},reqs:{reqp:"b"}},{id:273,attrs:1,name:"Kula światłości",desc:"Dzięki boskiej światłości potrafisz przyzwać kulę, która zada przeciwnikowi obrażenia oraz wykradnie część jego many. Umiejętność nie wymaga walki w zwarciu.",stats:{"dmg-target_absolute":[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],stealmana_per:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{reqp:"p"}},{id:274,attrs:0,name:"Łaknienie magii",desc:"Każde wystrzelone trafienie krytyczne sprawia, że odzyskujesz część swoich zasobów.",stats:{engback:[{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1}]},reqs:{reqp:"t"}},{id:275,attrs:0,name:"Zaklinanie przedmiotów",desc:"Magiczne słowa i pradawne gesty nasycają ciebie i twoją drużynę tajemną mocą, zwiększając przywracane przez was życie.",stats:{"heal_per-allies":[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}]},reqs:{reqp:"t"}},{id:276,attrs:0,name:"Aura życia",desc:"Pod wpływem zdrowotnej aury, ty oraz wszyscy w drużynie, posiadacie większą pulę życia.",stats:{"hp_per-allies":[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}]},reqs:{reqp:"p"}},{id:277,attrs:0,name:"Rytualne szaty",desc:"Odpowiednie szaty chronią przed utratą skupienia podczas rzucania zaklęć oraz potrafią odbijać nadlatujące pociski. Spowolnienia z przedmiotów przeciwnika oraz trucizny i magii zimna zostają zmniejszone.",stats:{redslow:[{value:12,duration:1},{value:14,duration:1},{value:16,duration:1},{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1}],arrowblock:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1}],frostbon:[{value:.1,duration:1}],lightbon:[{value:.1,duration:1}],firebon:[{value:.1,duration:1}]},reqs:{reqp:"m"}},{id:278,attrs:0,name:"Zmiażdżenie",desc:"Jeśli duża część ataku przedostanie się przez pancerz przeciwnika, zadajesz dodatkowe obrażenia nieuchronne. Pasywnie umiejętność zapewnia dodatkową siłę ciosów krytycznych oraz szansę na osłabienie przywracania zdrowia przeciwnika trafionego krytycznie.",stats:{crush_dmg_physical:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],critpoison_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],critval:[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}]},reqs:{reqp:"w",reqw:"2h"}},{id:279,attrs:0,name:"Poszarpane ostrze",desc:"Drobne wypustki na broni pozwalają niszczyć i przebijać pancerz przeciwnika.",stats:{pierce:[{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1},{value:5.5,duration:1},{value:6,duration:1},{value:6.5,duration:1},{value:7,duration:1}],acdmg:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"b",reqw:"1h"}},{id:283,attrs:3,name:"Demoniczne cięcie",desc:"Atakujesz trzykrotnie.\n# Umiejętność potwora.\n# Umiejętność wykorzystywana w: Wyznawca Ciemnych Mocy",stats:{add_attacks:[{value:2,duration:1}],energy:[{value:36,duration:1}]},reqs:{reqp:"b"}},{id:284,attrs:0,name:"Testowa 1",desc:"Inwestuj w nią punkty tylko jeśli zostałeś poproszony o jej przetestowanie.",stats:{pierceb:[{value:0,duration:1},{value:1,duration:1},{value:2,duration:1},{value:10,duration:1},{value:20,duration:1}]},reqs:{}},{id:285,attrs:1,name:"Krzyk Morskiej Furii",desc:"# Umiejętność potwora: kolos 50w Wakacje 2025 r.",stats:{"active_decblock_per-enemies":[{value:100,duration:40}]},reqs:{reqp:"w"}},{id:286,attrs:7,name:"Morski pakt",desc:"# Umiejętność potwora: kolos 170b Wakacje 2025 r.",stats:{vamp_time_per:[{value:75,duration:50}]},reqs:{reqp:"b"}},{id:287,attrs:1,name:"Opętanie",desc:"Umiejętność potwora powodująca zabicie gracza.\n# Umiejętność potwora.\n# Umiejętność wykorzystywana w: Kopalnia Krwawego Opętania",stats:{"dmg-target_physical":[{value:2e5,duration:1}],cooldown:[{value:1,duration:1}]},reqs:{reqp:"w"}},{id:288,attrs:1,name:"Wola sztormu",desc:"# Umiejętność potwora: kolos 130p Wakacje 2025 r.",stats:{active_add_light_cumulaction:[{value:5,duration:1}],"dmg-force-4_light-perw":[{value:150,duration:1}],mana:[{value:10,duration:1}]},reqs:{}},{id:289,attrs:3,name:"Uścisk wody",desc:"# Umiejętność potwora: kolos 210m Wakacje 2025 r.",stats:{slowfreeze_per:[{value:90,duration:2}],freeze:[{value:15,duration:1}],active_absorbdest_per:[{value:10,duration:1}],mana:[{value:50,duration:1}]},reqs:{reqp:"m"}},{id:290,attrs:9,name:"Morski pancerz",desc:"# Umiejętność potwora: kolos 210m Wakacje 2025 r.",stats:{lightshield_per:[{value:15,duration:14}],mana:[{value:219,duration:1}],cooldown:[{value:12,duration:1}]},reqs:{reqp:"m"}},{id:291,attrs:0,name:"Testowa 2",desc:"Inwestuj w nią punkty tylko jeśli zostałeś poproszony o jej przetestowanie.",stats:{redabdest_per:[{value:50,duration:1},{value:100,duration:1},{value:99,duration:1}]},reqs:{}},{id:292,attrs:9,name:"Burzowa ochrona",desc:"# Umiejętność dla potworów",stats:{immunity_to_dmg:[{value:1,duration:5}]},reqs:{}},{id:293,attrs:3,name:"Porażenie",desc:"Vonaros",stats:{"dmg_evade_hpp-target_light":[{value:1.8,duration:3},{value:1.9,duration:3},{value:2,duration:3},{value:2.1,duration:3},{value:2.2,duration:3},{value:2.3,duration:3},{value:2.4,duration:3},{value:2.5,duration:3},{value:2.6,duration:3},{value:2.7,duration:3}],active_acdmg_per:[{value:2.1,duration:1},{value:2.2,duration:1},{value:2.3,duration:1},{value:2.4,duration:1},{value:2.5,duration:1},{value:2.6,duration:1},{value:2.7,duration:1},{value:2.8,duration:1},{value:2.9,duration:1},{value:3,duration:1}],"combo-skill":[{value:1,duration:1}],active_add_light_cumulaction:[{value:1,duration:1}],mana:[{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1},{value:43,duration:1},{value:46,duration:1},{value:49,duration:1},{value:52,duration:1}],doublecastcost_per:[{value:100,duration:1}],lightbon:[{value:.15,duration:1}]},reqs:{}},{id:294,attrs:9,name:"Leczenie ran",desc:"Vonaros",stats:{heal_per:[{value:23,duration:1},{value:26,duration:1},{value:29,duration:1},{value:32,duration:1},{value:35,duration:1},{value:38,duration:1},{value:41,duration:1},{value:44,duration:1},{value:47,duration:1},{value:50,duration:1}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}],cooldown:[{value:8,duration:1}]},reqs:{}},{id:295,attrs:7,name:"Błyskawiczny cios",desc:"Wyznawca Ciemnych Mocy",stats:{sa_per:[{value:13,duration:1},{value:16,duration:1},{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1}],"adddmg_physical-perw":[{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1},{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1}],energy:[{value:13,duration:1},{value:16,duration:1},{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1}],"combo-skill":[{value:1,duration:1}]},reqs:{}},{id:296,attrs:7,name:"Zadziorny atak",desc:"Wyznawca Ciemnych Mocy",stats:{active_acdmg_per:[{value:4.2,duration:1},{value:4.4,duration:1},{value:4.6,duration:1},{value:4.8,duration:1},{value:5,duration:1},{value:5.2,duration:1},{value:5.4,duration:1},{value:5.6,duration:1},{value:5.8,duration:1},{value:6,duration:1}],sa_per:[{value:11,duration:1},{value:12,duration:1},{value:13,duration:1},{value:14,duration:1},{value:15,duration:1},{value:16,duration:1},{value:17,duration:1},{value:18,duration:1},{value:19,duration:1},{value:20,duration:1}],"combo-skill":[{value:1,duration:1}],energy:[{value:15,duration:1},{value:17,duration:1},{value:19,duration:1},{value:21,duration:1},{value:23,duration:1},{value:25,duration:1},{value:27,duration:1},{value:29,duration:1},{value:31,duration:1},{value:33,duration:1}]},reqs:{}},{id:297,attrs:7,name:"Stłamszenie",desc:"Wyznawca Ciemnych Mocy",stats:{sa2_per:[{value:8,duration:2},{value:9,duration:2},{value:10,duration:2},{value:11,duration:2},{value:12,duration:2},{value:13,duration:2},{value:14,duration:2},{value:15,duration:2},{value:16,duration:2},{value:17,duration:2}],combo_lowdmg_enemy:[{value:10,duration:1}],"combo-max":[{value:3,duration:1}],energy:[{value:18,duration:1},{value:20,duration:1},{value:22,duration:1},{value:24,duration:1},{value:26,duration:1},{value:28,duration:1},{value:30,duration:1},{value:32,duration:1},{value:34,duration:1},{value:36,duration:1}],cooldown:[{value:2,duration:1}]},reqs:{}},{id:298,attrs:1,name:"Szadź",desc:"Szkielet Władcy Żywiołów",stats:{allslow_per:[{value:9.5,duration:8},{value:10,duration:8},{value:10.5,duration:8},{value:11,duration:8},{value:11.5,duration:8},{value:12,duration:8},{value:12.5,duration:8},{value:13,duration:8},{value:13.5,duration:8},{value:14,duration:8}],mana:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{}},{id:299,attrs:3,name:"Kula ognia",desc:"Szkielet Władcy Żywiołów",stats:{"adddmg_fire-perw":[{value:15,duration:1},{value:20,duration:1},{value:25,duration:1},{value:30,duration:1},{value:35,duration:1},{value:39,duration:1},{value:43,duration:1},{value:47,duration:1},{value:51,duration:1},{value:55,duration:1}],"dmg-target_fire-perw":[{value:15,duration:2},{value:16,duration:2},{value:17,duration:2},{value:18,duration:2},{value:19,duration:2},{value:20,duration:3},{value:21,duration:3},{value:22,duration:3},{value:23,duration:4},{value:24,duration:4}],"combo-skill":[{value:1,duration:1}],mana:[{value:27,duration:1},{value:34,duration:1},{value:41,duration:1},{value:48,duration:1},{value:55,duration:1},{value:62,duration:1},{value:69,duration:1},{value:76,duration:1},{value:83,duration:1},{value:90,duration:1}],cooldown:[{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1},{value:2,duration:1}]},reqs:{}},{id:300,attrs:0,name:"Niezwyciężoność",desc:"Opanowujesz sztukę zadawania obrażeń nieuchronnych.",stats:{dmgmulabsolute:[{value:.5,duration:1},{value:1,duration:1},{value:1.5,duration:1},{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1}]},reqs:{reqp:"w"}},{id:301,attrs:0,name:"Napięcie bojowe",desc:"Obrażenia od elektryczności łatwiej przechodzą przez opancerzenie przeciwnika.",stats:{critmval_l:[{value:1,duration:1},{value:2,duration:1},{value:3,duration:1},{value:4,duration:1},{value:5,duration:1},{value:6,duration:1},{value:7,duration:1},{value:8,duration:1},{value:9,duration:1},{value:10,duration:1}],acdmg:[{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1},{value:null,duration:1}]},reqs:{reqp:"p",reqw:"light"}},{id:302,attrs:0,name:"Nieuleczalne zaklęcia",desc:"Krytyczne pociski stają się trudniejsze do wyleczenia.",stats:{critpoison_per:[{value:7,duration:1},{value:9,duration:1},{value:11,duration:1},{value:13,duration:1},{value:15,duration:1},{value:17,duration:1},{value:19,duration:1},{value:21,duration:1},{value:23,duration:1},{value:25,duration:1}]},reqs:{reqp:"m"}},{id:303,attrs:0,name:"Mistrzowska kondycja",desc:"Wieloletnie treningi zapewniają dodatkowe pokłady energii i koncentracji podczas walki, co ułatwia unikanie ataków.",stats:{energybon:[{value:13,duration:1},{value:16,duration:1},{value:19,duration:1},{value:22,duration:1},{value:25,duration:1},{value:28,duration:1},{value:31,duration:1},{value:34,duration:1},{value:37,duration:1},{value:40,duration:1}],evade_per:[{value:1,duration:1},{value:1,duration:1},{value:2,duration:1},{value:2,duration:1},{value:3,duration:1},{value:3,duration:1},{value:4,duration:1},{value:4,duration:1},{value:5,duration:1},{value:5,duration:1}]},reqs:{reqp:"t"}},{id:304,attrs:0,name:"Przewaga w terenie",desc:"Wykorzystując otoczenie, celniej uderzasz w odsłonięte punkty przeciwnika. Wszelkie niezredukowane obrażenia stają się bardziej niebezpieczne.",stats:{dmgmulabsolute:[{value:.5,duration:1},{value:1,duration:1},{value:1.5,duration:1},{value:2,duration:1},{value:2.5,duration:1},{value:3,duration:1},{value:3.5,duration:1},{value:4,duration:1},{value:4.5,duration:1},{value:5,duration:1}]},reqs:{reqp:"h"}}],lx=["combo-wound","combo-pierce","combo-crit","combo-block","combo-evade"],lj={w:{},p:{},b:{},m:{},t:{},h:{}};for(let e of lC)for(let t of lx)if(e.stats[t]){let n=lR[e.id];for(let i of e.reqs.reqp)lj[i]&&(lj[i][t]=n)}

        function lL(e,t){return lj[e]?.[t]??1/0}!function(e){var t;let n=ez.child("VSkills"),i=!1;(t=e.Flag||(e.Flag={}))[t.NONE=0]="NONE",t[t.SPELL=1]="SPELL",t[t.SUM=2]="SUM",t[t.MELEE=4]="MELEE",t[t.SELF=8]="SELF",t[t.FRIEND=16]="FRIEND";let a={spl:1,sum:2,melee:4,self:8,friend:16};async function r(){let e=await fetch("https://public-api.margonem.pl/we_get/skills/"),t=(function(e){if("string"!=typeof e)throw TypeError("First argument must be a string");if(""===e)return[];var t,n=e.match(lO);return n&&n[1]&&(t=n[1]),lA(/*@__PURE__*/n6(o9)(e),null,t)})((await e.text()).split("</head>")[1]).find(e=>lI(e)&&"table"==e.name),i=t?.children.find(e=>lI(e)&&"tbody"==e.name);if(!i){n.error("fetchSkillList: did not find table in parsed HTML");return}let r=[];for(let e of i.children.filter(e=>lI(e)&&"tr"==e.name)){let[t,i,o,l,s,u,d,c]=e.children.filter(e=>lI(e)&&"td"==e.name).map(e=>e.children.filter(e=>e.type===th.Text).map(e=>e.data.trim()).join("")),p={id:parseInt(t),attrs:function(e){let t=0;for(let i of e.trim().split(" ").filter(e=>e.trim().length)){let e=a[i];void 0===e?n.warn(`invalid skill flag: ${i}`):t|=e}return t}(i),name:o,desc:l,stats:function(e){let t={};for(let n of e.split(";")){if(""==n)continue;let[e,i]=n.split("=");t[e]=i.split(",").map(e=>{let t={value:0,duration:1},n=e.split("@");return t.value=Number(n[0]),t.duration=n.length>1?Number(n[1]):1,t})}return t}(d),reqs:function(e){let t={};for(let n of e.split(";")){if(""==n)continue;let[e,i]=n.split("=");t[e]=i}return t}(c)};r.push(p)}return r}let o=!1,l=null,s=[];async function u(e){if(o){s.push(e);return}if(null!=l){e();return}for(let t of(o=!0,l=i?await r():lC,o=!1,e(),s))t()}e.onReady=u,e.getList=function(){return l};let d=null;e.getByID=function(e){if(!l.length)return null;if(!d)for(let e of(d={},l))d[e.id]=e;return d[e]??null},e.checkFlag=function(e,t){return(e.attrs&t)==t}}(tf||(tf={})),function(e){let t=ez.child("VSkillEffect");e.EffectData=[{name:"absagain_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"absorb_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"absorbd",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"absorbm_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"ac",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"ac_per",friendlyName:"Wzmocnienie pancerza",active:!0,appliesEffect:!0,targetAll:!1},{name:"acdmg",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"achpp_per",friendlyName:"Kamienna skóra",active:!0,appliesEffect:!0,targetAll:!1},{name:"acshield_per",friendlyName:"Osłona tarczą",active:!0,appliesEffect:!0,targetAll:!1,targetSelf:!0},{name:"act",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"actdmg",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"active_acdmg_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"active_acdmg_physical-perw",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"active_crit",friendlyName:"Zwiększenie szansy na krytyk",elapsesImmidiately:!0,active:!0,appliesEffect:!0,targetSelf:!0,targetAll:!1},{name:"active_crit-allies",stackName:"active_crit",friendlyName:"Zwiększenie szansy na krytyk",active:!0,appliesEffect:!0,targetAll:!0,targetSelf:!0},{name:"active_decevade_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"active_redstun",friendlyName:"Redukcja ogłuszenia",active:!0,appliesEffect:!0,targetAll:!1,targetSelf:!0},{name:"add_attacks",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"adddmg_fire-perw",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"adddmg_physical-perw",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"adrenalin_evade_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"adrenalin_evade_threshold_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"adrenalin_reddest_per_sum",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"adrenalin_reddest_threshold_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"adrenalin_sa_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"adrenalin_sa_threshold_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"agi",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"alllowdmg",friendlyName:"Redukcja zadawanych obrażeń",active:!0,appliesEffect:!0,targetAll:!0,targetEnemy:!0},{name:"allslow_per",friendlyName:"Spowolnienie",active:!0,appliesEffect:!0,targetAll:!0},{name:"antidote",friendlyName:"Odporność na truciznę",active:!0,appliesEffect:!0,targetAll:!1},{name:"arrowblock",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"aura-ac_per",stackName:"ac_per",friendlyName:"Wzmocnienie pancerza",active:!0,appliesEffect:!0,targetAll:!0},{name:"aura-adddmg2_per-meele",friendlyName:"Błogosławieństwo mieczy",active:!0,appliesEffect:!0,targetAll:!0,targetSelf:!0},{name:"aura-resall",friendlyName:"Wzmocnienie odporności",active:!0,appliesEffect:!0,targetAll:!0},{name:"aura-sa_per",friendlyName:"Aura SA",active:!0,appliesEffect:!0,targetAll:!0},{name:"bandage_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"blok_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"combo-block",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"combo-crit",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"combo-max",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"combo-pierce",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"combo-skill",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"combo-wound",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"combo_dmg_hpp-target",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"combo_energyrestore_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"combo_heal_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"combo_lowdmg_enemy",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"contra",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"cooldown",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"crit",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critmval-allies",friendlyName:"Siła krytyka magicznego",active:!0,appliesEffect:!0,targetAll:!0},{name:"critmval-enemies",friendlyName:"Siła krytyka magicznego",active:!0,appliesEffect:!0,targetAll:!0},{name:"critmval_c",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critmval_f",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critmval_l",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critpierce_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critpoison_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critrage_perw",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critsa_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critslow_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critval",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"critval-allies",friendlyName:"Siła krytyka fizycznego",active:!0,appliesEffect:!0,targetAll:!0},{name:"critval-enemies",friendlyName:"Siła krytyka fizycznego",active:!0,appliesEffect:!0,targetAll:!0},{name:"critwound",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"crush_dmg_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"crush_threshold_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"decevade_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"distract",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"disturb",friendlyName:"Rozproszenie",active:!0,appliesEffect:!0,targetAll:!1},{name:"disturb_crit",friendlyName:"Redukcja szansy na krytyka",active:!0,appliesEffect:!0,targetAll:!1},{name:"disturb_pierce",friendlyName:"Redukcja szansy na przebicie",active:!0,appliesEffect:!0,targetAll:!1},{name:"dmg-swing_physical-perw",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"dmg-target_fire-perw",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"dmg-target_physical",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"dmg_evade-target_fire-perw",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"dmg_evade_hpp-target_light",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"dmg_from_npc_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"dmg_from_player_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"dmg_to_npc_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"doublecastcost_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"en-regen",friendlyName:"Dodatkowa regeneracja energii",active:!0,appliesEffect:!0,targetAll:!1},{name:"energy",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"energybon",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"energygain",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"energyout",friendlyName:"Zamroczenie",active:!0,appliesEffect:!0,targetAll:!1,targetSelf:!0,elapsesImmidiately:!0},{name:"energyrestore_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"engback",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"evade_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"fastarrow",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"firebon",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"freeze",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"frostbon",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"heal1_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"heal_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"heal_per-allies",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"heal_per-enemies",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"healall_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"healpower",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"hp",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"hp_per-allies",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"hpbon",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"immunity_to_dmg",friendlyName:"Nieśmiertelność",active:!0,appliesEffect:!0,targetAll:!1},{name:"injure",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"lastcrit",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"lightbon",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"lightshield_per",friendlyName:"Porażająca tarcza",active:!0,appliesEffect:!0,targetAll:!1},{name:"lowdmg_enemy",friendlyName:"Redukcja zadawanych obrażeń",active:!0,appliesEffect:!0,targetAll:!1},{name:"lowdmg_self",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"lowheal_per-enemies",friendlyName:"Jadowity podmuch",active:!0,appliesEffect:!0,targetAll:!0,targetEnemy:!0},{name:"mana",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"manabon",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"manaendest",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"managain",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"manarestore_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"manastr",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"of-crit",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"of-critval",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"of-str",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"of-thirdatt",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"of-wounddmgbon_perw",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"parry",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"pcontra",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"perdmg",friendlyName:"Zwiększenie zadawanych obrażeń",active:!0,appliesEffect:!0,targetAll:!1,targetSelf:!0},{name:"perdmg-allies",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"pierce",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"poison_lowdmg_per-enemies",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"poisonbon_poison-perw",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"rage",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"rage_3turns",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"red-sa",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"redabdest_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"redacdmg_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"reddest_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"redslow",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"redstun",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"removeslow-allies",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"removestun-allies",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"resdmg",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"resfire",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"resfire_per",friendlyName:"Odporność na ogień",active:!0,appliesEffect:!0,targetAll:!1},{name:"resfrost",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"resfrost_per",friendlyName:"Odporność na zimno",active:!0,appliesEffect:!0,targetAll:!1},{name:"reslight",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"reslight_per",friendlyName:"Odporność na błyskawice",active:!0,appliesEffect:!0,targetAll:!1},{name:"sa-clothes",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"sa1",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"sa2_per",friendlyName:"Przyspieszenie",active:!0,appliesEffect:!0,targetAll:!1,targetSelf:!0},{name:"sa_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"shout",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"slowfreeze_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"stealmana_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"stinkbomb",friendlyName:"Śmierdzący pocisk",active:!0,appliesEffect:!0,targetAll:!1},{name:"stinkbomb_crit",friendlyName:"Redukcja szansy na krytyka",active:!0,appliesEffect:!0,targetAll:!1},{name:"stinkbomb_pierce",friendlyName:"Redukcja szansy na przebicie",active:!0,appliesEffect:!0,targetAll:!1},{name:"str1h",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"str2h",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"stun",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"sunshield_per",friendlyName:"Tarcza słońca",active:!0,appliesEffect:!0,targetAll:!1},{name:"swing",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"taken_dmg_per",friendlyName:"Piętno bestii",active:!0,appliesEffect:!0,targetAll:!1},{name:"taken_dmg_per-all",stackName:"taken_dmg_per",friendlyName:"Piętno bestii",active:!0,appliesEffect:!0,targetAll:!0},{name:"taken_dmg_per-row",stackName:"taken_dmg_per",friendlyName:"Piętno bestii",active:!0,appliesEffect:!0,targetRow:!0,targetAll:!1},{name:"vamp_time_per",friendlyName:"Krwiożerczy szał",elapsesImmidiately:!0,active:!0,appliesEffect:!0,targetSelf:!0,targetAll:!1},{name:"vulture_perw",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"woundchance",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"wounddmgbon_perw",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"woundred",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1},{name:"active_block_per",friendlyName:"Zwiększenie bloku",active:!0,appliesEffect:!0,targetAll:!1},{name:"active_decblock_per",friendlyName:"Redukcja bloku przeciwnika",active:!0,appliesEffect:!0,targetAll:!1,targetSelf:!0,elapsesImmidiately:!0},{name:"active_decblock_per-enemies",friendlyName:"Redukcja bloku",active:!0,appliesEffect:!0,targetAll:!0},{name:"active_absorbdest_per",friendlyName:"",active:!0,appliesEffect:!1,targetAll:!1},{name:"ac2_per",friendlyName:"",active:!1,appliesEffect:!1,targetAll:!1}];let n={};for(let t of e.EffectData)n[t.name]=t;function i(e,t){{let n=Number(e.get(t));return isNaN(n)?0:n}}e.getByName=function(e){return n[e]??null},e.getEffectValue=i;let a=0;function r(){return a++}e.getNextID=r,e.process=function(n,a,o,l){let s=e.getByName(a);if(!s){t.debug(`unregistered skill effect: ${a}`);return}let u=n.has("tcustom");if(s.active){switch(s.name){case"add_attacks":for(let e=0;e<l[0].value;++e)n.caster.addTempEffect(ty.TempEffect.STRIKE_IS_ADD_ATTACK);break;case"heal_per":u||n.caster.setUsedHeal();break;case"healall_per":u||n.caster.setUsedGroupHeal();break;case"bandage_per":u||n.caster.setUsedBandage();break;case"removestun-allies":for(let e of Object.values(n.battle.getWarriors()).filter(e=>e.getData().team==n.caster.getData().team))e.cleanseStun();break;case"removeslow-allies":for(let e of Object.values(n.battle.getWarriors()).filter(e=>e.getData().team==n.caster.getData().team))e.cleanseSlow();break;case"combo-skill":n.caster.addCombo();break;case"combo-max":n.caster.clearCombo()}if(s.appliesEffect){var d,c,p,h;let e=null;e=s.targetSelf?n.caster:s.targetEnemy?Object.values(n.battle.getWarriors()).find(e=>e.getData().team!=n.caster.getData().team):n.target;let t=s.targetRow?(d=n.battle,c=e,Object.values(d.getWarriors()).filter(e=>e.getData().y==c.getData().y)):s.targetAll?(p=n.battle,h=e,Object.values(p.getWarriors()).filter(e=>e.getData().team==h.getData().team)):[e],a=i(n,s.name),f={id:r(),name:s.stackName??s.name,friendlyName:s.friendlyName,value:a,elapsed:s.elapsesImmidiately&&o&&tf.checkFlag(o,tf.Flag.SUM)?1:0,minDuration:l[0].duration,maxDuration:l[l.length-1].duration,caster:n.caster};for(let e of t){let t=rm(f);e==n.caster&&s.targetAll&&!u&&(t.value=t.value/2),e.addEffect(t,u)}}}}}(tm||(tm={})),(tg||(tg={})).process=function(e,t,n){let i=void 0!==e.get("-evade"),a=parseInt(n);switch(t){case"-contra":e.target.addTempEffect(ty.TempEffect.STRIKE_IS_COUNTER);break;case"+legbon_curse":case"+mcurse":e.target.applyCurse();break;case"-legbon_glare":e.caster.applyGlare();break;case"+distract":i||e.target.applyDisturb();break;case"-legbon_cleanse":e.target.cleanseSlow(),e.target.cleanseStun(),e.target.cleanseDoT();break;case"+stun":case"+freeze":e.target.applyStun();break;case"+stun2":case"+stun2-f":case"+stun2-c":case"+stun2-l":case"+stun2-d":e.target.applyStun(2);break;case"+acdmg":e.target.destroyAc(a);break;case"+resdmg":e.target.destroyRes(a);break;case"+legbon_holytouch":e.caster.overwriteEffect({id:tm.getNextID(),name:"legbon_holytouch",friendlyName:"Dotyk anioła",minDuration:3,maxDuration:3,elapsed:0,caster:e.caster,value:0});break;case"+legbon_anguish":e.target.overwriteEffect({id:tm.getNextID(),name:"legbon_anguish",friendlyName:"Krwawa udręka",minDuration:5,maxDuration:5,elapsed:0,caster:e.caster,value:0});break;case"+legbon_frenzy_main":e.caster.setFrenzyMainHand(a);break;case"+legbon_frenzy_off":e.caster.setFrenzyOffHand(a);break;case"legbon_lastheal":{let t=n.split(",")[1].split("(")[0].trim(),i=e.battle.getWarriorByName(t);i?i.setUsedLastHeal():oe("VStrikeEffect: legbon_lastheal target not found");break}case"+superspell-dispel":e.caster.clearPreparedSupercast(),e.target.clearPreparedSupercast();break;case"shout":{let t=n.split(","),i=e.has("skillId")?Number(e.get("skillId")):-1,a=tf.getByID(i),r=a?.stats.shout?.[0]?.duration??2;for(let n of t){let t=e.battle.getWarriorByName(n.trim());t?t.applyShout(e.caster,r):oe(`VStrikeEffect: shout target not found: ${n}`)}break}case"+wound":lL(e.caster.getData().prof,"combo-wound")<=e.caster.getData().lvl&&e.caster.addCombo();break;case"+pierce":break;case"+crit":lL(e.caster.getData().prof,"combo-crit")<=e.caster.getData().lvl&&e.caster.addCombo();break;case"-blok":lL(e.target.getData().prof,"combo-block")<=e.target.getData().lvl&&e.target.addCombo();break;case"-evade":lL(e.target.getData().prof,"combo-evade")<=e.target.getData().lvl&&e.target.addCombo()}},function(e){var t;let n=ez.child("VWarrior");(t=e.TempEffect||(e.TempEffect={}))[t.STRIKE_IS_ADD_ATTACK=0]="STRIKE_IS_ADD_ATTACK",t[t.STRIKE_IS_COUNTER=1]="STRIKE_IS_COUNTER";let i={id:-1,name:"ErrorFallbackWarrior",npc:1,hpp:0,team:1,lvl:0,prof:"w",icon:"",y:0};e.Warrior=class{constructor(e,t){this.effects={},this.effectsDeduplicated=null,this.tempEffects=[],this.isDisabled=!1,this.disableSource="",this.isStunnedCount=0,this.destroyedAc=0,this.destroyedResFire=0,this.destroyedResLight=0,this.destroyedResFrost=0,this.destroyedAct=0,this.usedHealCount=0,this.usedBandageCount=0,this.usedGroupHealCount=0,this.usedLastHeal=!1,this.preparedSupercast="",this.shoutTarget=null,this.shoutTurns=0,this.frenzyMainHand=0,this.frenzyOffHand=0,this.combo=0,this.wrrTurn=0,this.remoteWrrTurn=-1,this.sa=0,this.at=0,this.dAt=0,this.d=e,this.battle=t}getId(){return this.d.id}getName(){return this.d.name}getData(){return this.d??i}getIsNpc(){return this.d.id<0}setUsedHeal(){this.usedHealCount+=1}setUsedBandage(){this.usedBandageCount+=1}setUsedGroupHeal(){this.usedGroupHealCount+=1}setUsedLastHeal(){this.usedLastHeal=!0}applyDisabled(e){this.isDisabled=!0,e?this.setDisableSource(e):this.setDisableSource("")}setDisableSource(e){this.disableSource=e}applyCurse(){this.applyDisabled("klątwa")}applyGlare(){this.applyDisabled("oślepienie")}applyDisturb(){this.applyDisabled("wytrącenie z równowagi")}applyStun(e=1){this.isStunnedCount=Math.max(this.isStunnedCount,e)}cleanseStun(){this.isStunnedCount=0}cleanseDoT(){this.removeEffect("legbon_anguish")}cleanseSlow(){this.removeEffect("allslow_per")}destroyAc(e){this.destroyedAc+=e}destroyRes(e){this.destroyedResFire+=e,this.destroyedResLight+=e,this.destroyedResFrost+=e}destroyResFire(e){this.destroyedResFire+=e}destroyResLight(e){this.destroyedResLight+=e}destroyResFrost(e){this.destroyedResFrost+=e}destroyAct(e){this.destroyedAct+=e}setPreparedSupercast(e){this.preparedSupercast=e}applyShout(e,t){this.shoutTarget=e,this.shoutTurns=t}clearPreparedSupercast(){this.setPreparedSupercast("")}addCombo(){this.combo+=1}clearCombo(){this.combo=0}setFrenzyMainHand(e){this.frenzyMainHand=e}setFrenzyOffHand(e){this.frenzyOffHand=e}getUsedHealCount(){return this.usedHealCount}getUsedBandageCount(){return this.usedBandageCount}getUsedGroupHealCount(){return this.usedGroupHealCount}getUsedLastHeal(){return this.usedLastHeal}getIsDisabled(){return this.isDisabled}getDisableSource(){return this.disableSource}getIsCursed(){return this.getIsDisabled()}getIsGlared(){return this.getIsDisabled()}getIsStunnedCount(){return this.isStunnedCount}getIsDisturbedCount(){return this.getIsDisabled()?1:0}getDestroyedAc(){return this.destroyedAc}getDestroyedResFire(){return this.destroyedResFire}getDestroyedResLight(){return this.destroyedResLight}getDestroyedResFrost(){return this.destroyedResFrost}getDestroyedAct(){return this.destroyedAct}getPreparedSupercast(){return this.preparedSupercast}getShoutTarget(){return this.shoutTurns>0?this.shoutTarget:null}getShoutTurns(){return this.shoutTurns}getCombo(){return this.combo}getFrenzyMainHand(){return this.frenzyMainHand}getFrenzyOffHand(){return this.frenzyOffHand}addTempEffect(e){this.tempEffects.push(e)}overwriteEffect(e){this.effectsDeduplicated=null,e.caster==this&&(e.elapsed-=1),this.effects[e.name]=[e]}removeEffect(e){this.effectsDeduplicated=null,delete this.effects[e]}addEffect(e,t){this.effectsDeduplicated=null,this.effects[e.name]||(this.effects[e.name]=[]);let n=this.effects[e.name];e.caster!=this||t||(e.elapsed-=1);let i=0;for(;i<n.length&&n[i].value>e.value;)++i;n.splice(i,0,e)}consumeTempEffect(e){let t=this.tempEffects.indexOf(e);return t>-1&&(this.tempEffects.splice(t,1),!0)}advanceEffects(){for(let e in this.effectsDeduplicated=null,this.shoutTurns>0&&(this.shoutTurns-=1),this.effects){let t=this.effects[e];for(let e=0;e<t.length;++e){let n=t[e];n.elapsed+=1,n.elapsed>=n.maxDuration&&(t.splice(e,1),--e)}}}updateDeduplicatedEffects(){for(let e in this.effectsDeduplicated={},this.effects){let t=this.effectsDeduplicated[e]=[],n=this.effects[e],i={};for(let e of n)i[e.caster.getId()]||(i[e.caster.getId()]=!0,t.push(e))}}getActiveEffects(){return this.effectsDeduplicated||this.updateDeduplicatedEffects(),this.effectsDeduplicated}advanceCooldowns(){}consumeDisabledLog(e){this.isDisabled=!1,this.consumeLostTurn(e)}consumeCurseLog(e){this.consumeLostTurn(e)}consumeGlareLog(e){this.consumeLostTurn(e)}consumeDisturbLog(e){this.consumeLostTurn(e)}consumeStunnedLog(e){this.isStunnedCount>0&&(this.isStunnedCount-=1),this.consumeLostTurn(e)}consumeTurnLossLog(e){this.getIsStunnedCount()>0?this.consumeStunnedLog(e):this.consumeDisabledLog(e)}consumeStepLog(e){this.consumeTurnAction(e)}consumeLostTurn(e){this.consumeTurnAction(e)}consumeTurnAction(e){if(!this.consumeTempEffect(0)){if(this.battle.getLastConsumedTSpellNpc()==this){n.debug(`${this.getName()}: deduplicating turn after tspell`),this.battle.setLastConsumedTSpellNpc(null);return}e.has("tspell")&&!e.has("skillId")?this.battle.setLastConsumedTSpellNpc(this):this.battle.setLastConsumedTSpellNpc(null),this.wrrTurn+=1,this.consumeTempEffect(1)||this.advanceCooldowns(),this.advanceEffects()}}consumeCasterLog(e){if(e.each((t,n)=>{tg.process(e,t,n)}),tb.logIsStrike(e)||this.getIsNpc()&&tb.logIsOthDmg(e))this.consumeTurnAction(e);else if(e.has("skillId")){let t=tf.getByID(parseInt(e.get("skillId")));for(let n in t.stats)tm.process(e,n,t,t.stats[n]);tf.checkFlag(t,tf.Flag.SUM)||this.consumeTurnAction(e)}else e.has("tspell")?(this.clearPreparedSupercast(),this.consumeTurnAction(e)):e.has("prepare")&&(""!=this.getPreparedSupercast()?this.consumeTurnAction(e):n.debug("skipped prepare turn action: "+e.get("prepare")),this.setPreparedSupercast(e.get("prepare")))}setRemoteWrrTurn(e){this.remoteWrrTurn=e}getRemoteWrrTurn(){return this.remoteWrrTurn}getWrrTurn(){return this.wrrTurn}setSa(e){this.sa=e}getSa(){return this.sa}getAt(){return this.at}setAt(e){this.at=e}getDeltaAt(){return this.dAt}setDeltaAt(e){this.dAt=e}}}(ty||(ty={})),function(e){var t;let n=/Turn:([0-9]+) \/ Time:(.*?) \/ WrrTurn:([0-9]+) \/ (.*) \//,i=/(.*?):(.*?),(.*)/;(t=e.InfoType||(e.InfoType={}))[t.Turn=0]="Turn",t[t.SA=1]="SA",e.tryParseLog=function(e){let t;if(!e.has("txt"))return null;let a=e.get("txt");if(t=a.match(n))return{type:0,globalTurn:Number(t[1]),globalTime:Number(t[2]),warriorName:t[4],warriorTurn:Number(t[3])};if(a.startsWith("SA, AT /")){let e={type:1,entries:[]};for(let n of a.split("/"))(t=n.match(i))&&e.entries.push({name:t[1].trim(),sa:Number(t[2]),at:Number(t[3])});return e}return null}}(tv||(tv={})),function(e){let t={"Plaga z Otchłani":{allslow_per:{value:25,duration:8}},"Świąteczna pieśń":{perdmg:{value:20,duration:8}},"Duch maszyny":{stun:{value:50,duration:8}},"Szanta z Latającego Holendra":{"critval-allies":{value:40,duration:12},"critmval-allies":{value:40,duration:12}},"Szanta samotnego rozbitka":{bandage_per:{value:75,duration:1},sa2_per:{value:40,duration:8}},"Krzyk z Otchłani":{"aura-ac_per":{value:10,duration:10},"aura-resall":{value:15,duration:10}},"Minieventowe zaklęte kastaniety":{"lowheal_per-enemies":{value:20,duration:8}},"Minieventowa fletnia opiekuna lasów":{bandage_per:{value:50,duration:1}},"Minieventowy rozkaz bojowy":{"aura-sa_per":{value:30,duration:6}},"Minieventowa elfia kołysanka":{healall_per:{value:10,duration:1}},"Minieventowe werble ochronne":{"aura-ac_per":{value:30,duration:10},"aura-resall":{value:20,duration:10}},"Minieventowe diabelskie struny":{"critval-allies":{value:25,duration:10},"critmval-allies":{value:25,duration:10}},"Minieventowa melodia wieków":{"removedot-allies":{value:1,duration:1}},"Minieventowa pieśń przebudzenia":{"removeslow-allies":{value:1,duration:1},"removestun-allies":{value:1,duration:1}},"Zaklęcie opętania":{mcurse:{value:500,duration:2}},"Przelotne zaklęte kastaniety":{"lowheal_per-enemies":{value:20,duration:8}},"Przelotna fletnia opiekuna lasów":{bandage_per:{value:50,duration:1}},"Przelotny rozkaz bojowy":{"aura-sa_per":{value:30,duration:6}},"Przelotna elfia kołysanka":{healall_per:{value:10,duration:1}},"Przelotne werble ochronne":{"aura-ac_per":{value:30,duration:10},"aura-resall":{value:20,duration:10}},"Przelotne diabelskie struny":{"critval-allies":{value:25,duration:10},"critmval-allies":{value:25,duration:10}},"Przelotna melodia wieków":{"removedot-allies":{value:1,duration:1}},"Przelotna pieśń przebudzenia":{"removeslow-allies":{value:1,duration:1},"removestun-allies":{value:1,duration:1}},"Czarna gitara":{active_crit:{value:10,duration:6},taken_dmg_per:{value:20,duration:6},sa2_per:{value:10,duration:6}},"Zaklęte kastaniety":{"lowheal_per-enemies":{value:20,duration:8}},"Fletnia opiekuna lasów":{bandage_per:{value:50,duration:1}},"Rozkaz bojowy":{"aura-sa_per":{value:30,duration:6}},"Elfia kołysanka":{healall_per:{value:10,duration:1}},"Werble ochronne":{"aura-ac_per":{value:30,duration:10},"aura-resall":{value:20,duration:10}},"Diabelskie struny":{"critval-allies":{value:25,duration:10},"critmval-allies":{value:25,duration:10}},"Melodia wieków":{"removedot-allies":{value:1,duration:1}},"Pieśń przebudzenia":{"removeslow-allies":{value:1,duration:1},"removestun-allies":{value:1,duration:1}},"Tytaniczne zdrowie":{bandage_per:{value:20,duration:1}}};e.getStatsByName=function(e){return t[e]??{}}}(tw||(tw={})),function(e){let t=ez.child("VBattle");class n{constructor(e){this.effects={},this.caster=e.caster,this.target=e.target,this.battle=e.battle}has(e){return this.getAll(e).length>0}get(e){return this.effects[e]?.[0]}getAll(e){return this.effects[e]??[]}add(e,t){let n=this.getAll(e);n.push(t),this.effects[e]=n}each(e){for(let t in this.effects)for(let n of this.effects[t])e(t,n)}}e.BattleLog=n;let i=["+dmg","-dmg","+dmgf","-dmgf","+dmgl","-dmgl","+dmgc","-dmgc","+dmgd","-dmgd"];e.logIsStrike=function(e){return i.some(t=>void 0!==e.get(t))},e.logIsOthDmg=function(e){return void 0!==e.get("+oth_dmg")};class a{getWarriorByName(e){for(let t in this.warriors)if(this.warriors[t].getName()==e)return this.warriors[t];return null}getWarriors(){return this.warriors}getWarriorFromTextLog(e){let n=e.get("txt").lastIndexOf("-"),i=e.get("txt").substring(0,n).trim();return this.getWarriorByName(i)||(t.error(`getWarriorFromTextLog failed for: ${e.get("txt")}`),oe(`getWarriorFromTextLog failed for: ${e.get("txt")}`),null)}parseLog(e){let t=new n({battle:this,caster:null,target:null});for(let n of e.split(";")){let e=n.split("=");1==e.length&&(e[1]="true");let[i,a]=e,r=parseInt(i);isNaN(r)?t.add(i,a):null==t.caster?t.caster=this.warriors[r]??null:null==t.target&&(t.target=this.warriors[r]??null)}return t.target||(t.target=t.caster),t}tryConsumeDebugLog(e){let t=tv.tryParseLog(e);t&&this.consumeDebugInfo(t)}consumeDebugInfo(e){if(this.battleDiagnosticsEnabled=!0,e.type==tv.InfoType.Turn){let t=this.getWarriorByName(e.warriorName);t?.setRemoteWrrTurn(e.warriorTurn),t?.setDeltaAt(e.globalTime),this.turn=e.globalTurn,this.time=e.globalTime}else if(e.type==tv.InfoType.SA)for(let t of e.entries){let e=this.getWarriorByName(t.name);e?.setAt(t.at),e?.setSa(t.sa)}}tryConsumeBattleStats(e){let t=e.get("tcustom").split(",")[0],n=tw.getStatsByName(t);for(let t in n)tm.process(e,t,null,[n[t]])}consumeLog(e){let t=this.parseLog(e);if(t.get("txt")?.match(/.* - utrata tury/)){let e=this.getWarriorFromTextLog(t);e?.consumeTurnLossLog(t)}else void 0!==t.get("step")?t.caster?.consumeStepLog(t):t.get("tcustom")?this.tryConsumeBattleStats(t):t.caster?t.caster.consumeCasterLog(t):t.get("txt")&&this.tryConsumeDebugLog(t)}getTurnQueue(){return Object.values(this.turnQueue).map(e=>this.warriors[e])}setLastConsumedTSpellNpc(e){this.lastConsumedTSpellNpc=e}getLastConsumedTSpellNpc(){return this.lastConsumedTSpellNpc}getBattleDiagnosticsEnabled(){return this.battleDiagnosticsEnabled}getTurn(){return this.turn}getTime(){return this.time}consume(e){for(let t in e.turns_warriors&&(this.turnQueue=e.turns_warriors),e.w){let e=parseInt(t);this.warriors[e]||(this.warriors[e]=new ty.Warrior(eQ.getWarriorByID(e),this))}if(e.m)for(let t of e.m)this.consumeLog(t)}constructor(){this.battleDiagnosticsEnabled=!1,this.warriors={},this.turnQueue={},this.turn=0,this.time=0,this.lastConsumedTSpellNpc=null}}e.Battle=a;let r=null;e.get=function(){return r},oS.addBefore("f",e=>{tf.onReady(()=>{"1"==e.init&&(r=new a),e.close&&(r=null),r?.consume(e)})})}(tb||(tb={})),function(e){function t(e){return`${e.cur}${0==e.bonus?"":"+"+e.bonus}`}e.get=function(e){let n="";if(void 0!==e.getData().ac?a0.isOld&&(n+=`<div>Pancerz: ${t(e.getData().ac)}</div>`):e.getDestroyedAc()>0&&(n+=`<div>Zniszcz. panc.: ${e.getDestroyedAc()}</div>`),void 0!==e.getData().resfire?a0.isOld&&(n+=`<div>Odp.: <span style='color:red'>${t(e.getData().resfire)}</span>/<span style='color:yellow'>${t(e.getData().reslight)}</span>/<span style='color:cyan'>${t(e.getData().resfrost)}</span>/<span style='color:lime'>${t(e.getData().act)}</span>
    </div>`):n+=0==e.getDestroyedResFire()&&0==e.getDestroyedResLight()&&0==e.getDestroyedResFrost()?"":`<div>Obni\u{17C}. odp.: <span style='color:red'>${e.getDestroyedResFire()}</span>/<span style='color:yellow'>${e.getDestroyedResLight()}</span>/<span style='color:cyan'>${e.getDestroyedResFrost()}</span>/<span style='color:lime'>${e.getDestroyedAct()}</span>
    </div>`,e.getUsedHealCount()>0&&(n+=`<div>U\u{17C}ycia lek poj.: ${e.getUsedHealCount()}</div>`),e.getUsedBandageCount()>0&&(n+=`<div>U\u{17C}ycia banda\u{17C}.: ${e.getUsedBandageCount()}</div>`),e.getUsedGroupHealCount()>0&&(n+=`<div>U\u{17C}ycia lek grp.: ${e.getUsedGroupHealCount()}</div>`),(e.getFrenzyMainHand()>0||e.getFrenzyOffHand()>0)&&(n+=`<div style='color:lime'>Sza\u{142}: ${e.getFrenzyMainHand()}/10`,e.getFrenzyOffHand()>0&&(n+=` | ${e.getFrenzyOffHand()}/10`),n+="</div>"),n+=function(e){let t="",n="",i=e.effects||e.getActiveEffects();for(let a in i){let r=i[a];if(r.length){let i=e.getData().team==r[0].caster.getData().team,a=0!=r[0].value,o="",l="";for(let e=0;e<Math.min(2,r.length);++e)e>0&&(o+="|",l+="|"),o+=tE.storage.get("highlightOwnEffects")&&r[e].caster.getData().id==eZ.get().id?`<span class="gargonem-thp-own-effect">${r[e].elapsed}</span>`:r[e].elapsed,l+=r[e].value;let s=a?` (${l})`:"",u=`<div>${r[0].friendlyName}: ${o}${s}</div>`;i?t+=u:n+=u}}return t.length||n.length?`<div style='color:lime'>${t}</div><div style='color:#ff8383'>${n}</div>`:""}(e),""!=e.getPreparedSupercast()&&(n+=`<div style='color:red'>${e.getPreparedSupercast()}</div>`),e.getIsDisabled()&&(n+=`<div style='color:#ff8383'>Utrata tury (${e.getDisableSource()})</div>`),e.getIsStunnedCount()>0&&(n+=`<div style='color:#ff8383'>Stun: ${e.getIsStunnedCount()}</div>`),e.getUsedLastHeal()&&(n+="<div style='color:#ff8383'>Ostatni ratunek wykorzystany</div>"),e.getShoutTarget()&&(n+=`<div style='margin-top: 5px; color:#ff8383'>Wyzyw: ${e.getShoutTarget().getName()} (${e.getShoutTurns()})</div>`),!e.getIsNpc()){let t=Math.min(5,e.getCombo());if(t>0){n+='<div class="combo-wrapper">';for(let e=0;e<t;++e){let i=1==t?"all":0==e?"left":e==t-1?"right":"middle",a="";1==t&&a0.isNew&&(a="background-position: -890px -975px"),n+=`<div style="${a}" class="combo-point ${i} active"></div>`}n+="</div>"}}let i=tb.get();return i?.getBattleDiagnosticsEnabled()&&(n+=function(e){let t='<div class="gargonem-thp-debug">',n=eQ.get()?.current==e.getId(),i=e.getWrrTurn()+(n?0:-1),a=e.getRemoteWrrTurn();return i==a?t+=`<div>WrrTurn: ${i}</div>`:t+=`<div style="color:red;">WrrTurn: ${i} / ${a} mismatch (local / remote)</div>`,t+=`<div>SA: ${e.getSa()}</div><div>AT: ${e.getAt()}</div><div>\u{394}AT: ${e.getDeltaAt()}</div><div>next \u{394}AT: ${e.getDeltaAt()+e.getAt()}</div></div>`}(e)),n}}(tk||(tk={}));


        // ---------- integracja z grą ----------
        let enabled = false;
        let opts = { tooltips: true, window: true, highlightOwn: true, position: null };
        let winEl = null;
        let hooked = false;
        const TAG_RE = /<titanHelperPlus>([\s\S]*?)<\/titanHelperPlus>/g;
        const HP_RE = /<i>Życie: [0-9\.%]+/;
        function escapeHtml(v) {
            return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        function hookCommunication() {
            if (hooked) return true;
            if (a0.isNew) {
                const comm = window.Engine?.communication;
                if (!comm || typeof comm.parseJSON !== 'function') return false;
                const original = comm.parseJSON;
                comm.parseJSON = function (data) {
                    oS.update(data, true);
                    let result;
                    try { result = original.apply(this, arguments); }
                    finally { oS.update(data, false); }
                    return result;
                };
                hooked = true;
                return true;
            }
            if (a0.isOld && typeof window.successData === 'function') {
                const original = window.successData;
                window.successData = function (raw) {
                    let data = null;
                    try { data = JSON.parse(raw); } catch (_) {}
                    if (data) oS.update(data, true);
                    let result;
                    try { result = original.apply(this, arguments); }
                    finally { if (data) oS.update(data, false); }
                    return result;
                };
                hooked = true;
                return true;
            }
            return false;
        }

        function waitForGameAndHook() {
            if (hookCommunication()) return;
            const timer = setInterval(() => {
                if (hookCommunication()) clearInterval(timer);
            }, 500);
        }

        function getWarriorEl(w) {
            if (a0.isOld) return document.querySelector(`#troop${w.getId()}`);
            if (a0.isNew) return document.querySelector(`.other-id-battle-${w.getId()} .canvas-warrior-icon`);
            return null;
        }

        function getTip(el) {
            if (!el) return '';
            if (a0.isNew) return window.$(el).getTipData?.() || '';
            return el.getAttribute('tip') || '';
        }

        function setTip(el, html) {
            if (!el) return;
            if (a0.isNew) window.$(el).tip(html);
            else window.$(el).tip(html);
        }

        function updateTooltips(battle) {
            if (!opts.tooltips) return;
            const warriors = battle.getWarriors();
            for (const id in warriors) {
                const w = warriors[id];
                const el = getWarriorEl(w);
                if (!el) continue;
                const extra = tk.get(w);
                if (extra === '') continue;
                const data = w.getData();
                let tip = getTip(el).replace(TAG_RE, '');
                if (a0.isOld && thpSettings.siShowExactHealth) {
                    tip = tip.replace(HP_RE, `<i class="pa-thp-si-hp"><span>${data.hp.cur} / ${data.hp.max}</span><br>Życie: ${data.hp.hpp}%`);
                }
                try { setTip(el, `${tip}<titanHelperPlus>${extra}</titanHelperPlus>`); } catch (_) {}
            }

            document.querySelector('.pa-thp-shout-highlight')?.classList.remove('pa-thp-shout-highlight');
            const me = warriors[eZ.get().id];
            const shoutTarget = me?.getShoutTarget?.();
            if (shoutTarget && shoutTarget.getData().hp.cur > 0) {
                getWarriorEl(shoutTarget)?.classList.add('pa-thp-shout-highlight');
            }
        }

        function clearTooltips() {
            const battle = tb?.get();
            if (!battle) return;
            const warriors = battle.getWarriors();
            for (const id in warriors) {
                const el = getWarriorEl(warriors[id]);
                const tip = getTip(el);
                if (tip && TAG_RE.test(tip)) {
                    TAG_RE.lastIndex = 0;
                    try { setTip(el, tip.replace(TAG_RE, '')); } catch (_) {}
                }
                TAG_RE.lastIndex = 0;
            }
        }

        // ----- okno z podsumowaniem efektów (odpowiednik okna titanHelper+) -----
        // odporności na ogień/zimno/błyskawice nie pokazujemy w oknie
        const HIDDEN_IN_WINDOW = new Set(['resfire_per', 'resfrost_per', 'reslight_per']);
        // efekty nakładane na jedną postać – zawsze pokazujemy, z nickiem celu (np. Krwawa udręka)
        const SHOW_TARGET = new Set(['legbon_anguish']);

        function renderTeamEffects(team) {
            const battle = tb.get();
            const effects = {};
            const heroId = eZ.get().id;
            const members = Object.values(battle.getWarriors()).filter((w) => w.getData().team == team);
            for (const w of members) {
                // surowa lista efektów (bez łączenia po rzucającym), żeby widać było
                // umiejętności nałożone 2 razy, np. 2|2
                const active = w.effects || w.getActiveEffects();
                for (const key in active) {
                    if (HIDDEN_IN_WINDOW.has(key)) continue;
                    for (const ef of active[key]) {
                        const entry = effects[ef.id];
                        if (entry) {
                            entry.count += 1;
                            if (w.getId() != heroId) entry.onlyHero = false;
                            entry.targets.push(w.getName());
                            if (ef.elapsed > entry.elapsed) entry.elapsed = ef.elapsed;
                        } else {
                            effects[ef.id] = {
                                type: ef.name,
                                count: 1,
                                onlyHero: w.getId() == heroId,
                                targets: [w.getName()],
                                elapsed: ef.elapsed,
                                maxDuration: ef.maxDuration,
                                friendlyName: ef.friendlyName,
                                casterTeam: ef.caster.getData().team,
                                castedByHero: opts.highlightOwn && ef.caster.getData().id == heroId,
                            };
                        }
                    }
                }
            }

            // jak w oryginale: pokazujemy efekty, które ma co najmniej 70% drużyny
            const byType = {};
            for (const id in effects) {
                const ef = effects[id];
                const targeted = SHOW_TARGET.has(ef.type);
                // efekty wyłącznie na mojej postaci pomijamy tylko w drużynie –
                // w walce solo (np. aury) jesteś całą drużyną, więc je pokazujemy
                if (ef.onlyHero && !targeted && members.length > 1) continue;
                if (!targeted && ef.count < Math.ceil(0.7 * members.length)) continue;
                (byType[ef.type] ||= []).push(ef);
            }

            const groups = Object.values(byType).sort((a, b) =>
                a[0].casterTeam == b[0].casterTeam ? 0 : a[0].casterTeam == team ? -1 : 1);

            const span = (ef) => `<span class="${ef.castedByHero ? 'pa-thp-own' : ''}">${ef.elapsed}</span>`;
            const rows = [];
            for (const list of groups) {
                list.sort((a, b) => a.elapsed - b.elapsed);
                // „Redukcja …” (bloku, obrażeń, kryta, przebicia) – nie pokazujemy
                if (/^\s*redukcja/i.test(String(list[0].friendlyName || ''))) continue;
                const cls = list[0].casterTeam == team ? 'pa-thp-positive' : 'pa-thp-negative';
                const name = escapeHtml(list[0].friendlyName);
                if (SHOW_TARGET.has(list[0].type)) {
                    for (const ef of list) {
                        const nick = escapeHtml([...new Set(ef.targets)].join(', '));
                        rows.push(`<div class="pa-thp-effect ${cls}">${name} (${nick}): ${span(ef)}</div>`);
                    }
                } else {
                    rows.push(`<div class="pa-thp-effect ${cls}">${name}: ${list.slice(0, 2).map(span).join('|')}</div>`);
                }
            }
            return rows.join('');
        }

        function renderCrucialInfo() {
            const battle = tb.get();
            const warriors = battle.getWarriors();
            const me = warriors[eZ.get().id];
            if (!me) return '';
            let html = '';
            let caster = null;
            for (const id in warriors) if (warriors[id].getPreparedSupercast() != '') caster = warriors[id];
            if (caster) html += `<div class="pa-thp-alert">${escapeHtml(caster.getPreparedSupercast())}</div>`;
            if (me.getIsDisabled()) html += `<div class="pa-thp-alert">Utrata tury (${escapeHtml(me.getDisableSource())})</div>`;
            if (me.getIsStunnedCount()) html += `<div class="pa-thp-alert">Stun: ${me.getIsStunnedCount()}</div>`;
            return html;
        }

        function renderWindow() {
            if (!winEl) return;
            const battle = tb?.get();
            const body = winEl.querySelector('[data-thp-body]');
            if (!battle) {
                body.innerHTML = '<div class="pa-thp-empty">Brak aktywnej walki.</div>';
                return;
            }
            const ownFx = renderTeamEffects(eQ.getOwnTeam());
            const enemyFx = renderTeamEffects(eQ.getEnemyTeam());
            body.innerHTML =
                renderCrucialInfo() +
                `<div class="pa-thp-section"><strong>Spelle na Twojej drużynie</strong>${ownFx || '<div>-</div>'}</div>` +
                `<div class="pa-thp-section"><strong>Spelle na przeciwnej drużynie</strong>${enemyFx || '<div>-</div>'}</div>`;
        }

        function applyWindowPosition() {
            if (!winEl || !opts.position) return;
            const pos = opts.position;
            if (pos.left != null && pos.top != null) {
                winEl.style.left = `${pos.left}px`;
                winEl.style.top = `${pos.top}px`;
                winEl.style.right = 'auto';
            }
            if (pos.width) winEl.style.width = `${pos.width}px`;
            if (pos.height) winEl.style.height = `${pos.height}px`;
        }

        function createWindow(onMove) {
            if (winEl) return;
            winEl = document.createElement('div');
            winEl.className = 'pa-thp-window';
            winEl.innerHTML = `
                <div class="pa-thp-title" data-thp-drag>Titan Helper</div>
                <div class="pa-thp-body" data-thp-body></div>`;
            document.body.appendChild(winEl);
            applyWindowPosition();

            const handle = winEl.querySelector('[data-thp-drag]');
            let drag = null;
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const r = winEl.getBoundingClientRect();
                drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            });
            window.addEventListener('mousemove', (e) => {
                if (!drag) return;
                winEl.style.left = `${Math.max(0, e.clientX - drag.dx)}px`;
                winEl.style.top = `${Math.max(0, e.clientY - drag.dy)}px`;
                winEl.style.right = 'auto';
            });
            window.addEventListener('mouseup', () => {
                if (!drag) return;
                drag = null;
                opts.position = { ...(opts.position || {}), left: winEl.offsetLeft, top: winEl.offsetTop };
                onMove?.(opts.position);
            });

            // zmiana rozmiaru (uchwyt w prawym dolnym rogu) – zapisujemy po puszczeniu myszy
            let resizeTimer = null;
            new ResizeObserver(() => {
                if (!winEl.classList.contains('pa-visible')) return;
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    const width = winEl.offsetWidth;
                    const height = winEl.offsetHeight;
                    const pos = opts.position || {};
                    if (pos.width === width && pos.height === height) return;
                    opts.position = { ...pos, width, height };
                    onMove?.(opts.position);
                }, 400);
            }).observe(winEl);
        }

        function updateWindowVisibility() {
            if (!winEl) return;
            winEl.classList.toggle('pa-visible', enabled && opts.window && Boolean(tb?.get()));
        }

        function onFight(f) {
            if (!enabled) return;
            const battle = tb.get();
            if (battle) {
                updateTooltips(battle);
            }
            renderWindow();
            updateWindowVisibility();
        }

        oS.add('f', onFight);

        return {
            init(options, onMove) {
                Object.assign(opts, options || {});
                thpSettings.highlightOwnEffects = opts.highlightOwn;
                createWindow(onMove);
                waitForGameAndHook();
            },
            setOptions(options) {
                const hadTooltips = opts.tooltips;
                Object.assign(opts, options || {});
                thpSettings.highlightOwnEffects = opts.highlightOwn;
                if (hadTooltips && !opts.tooltips) clearTooltips();
                renderWindow();
                updateWindowVisibility();
            },
            enable() {
                enabled = true;
                renderWindow();
                updateWindowVisibility();
            },
            disable() {
                enabled = false;
                clearTooltips();
                updateWindowVisibility();
            },
            // do testów / debugowania w konsoli
            _debug: { get battle() { return tb?.get(); }, oS },
        };
    })();
    // === TITAN HELPER END ===

    function getTitanOptions() {
        return {
            tooltips: state.titanTooltips,
            window: state.titanWindow,
            highlightOwn: state.titanHighlightOwn,
            position: state.titanPosition,
        };
    }

    function initTitanHelper() {
        try {
            titanHelper.init(getTitanOptions(), (position) => {
                state.titanPosition = position;
                saveSettings();
            });
            if (state.titanEnabled) titanHelper.enable();
        } catch (error) {
            console.error('[darksad-addon] Błąd startu Titan Helper:', error);
        }
    }

    // =================================================================
    //  KOMUNIKACJA Z GRĄ – podsłuch odpowiedzi serwera + wysyłanie zapytań
    //  (zamiast ładowania Gargonem z zewnętrznego URL)
    // =================================================================
    const net = (function () {
        const handlers = {};
        const anyHandlers = [];
        let hooked = false;

        function on(key, fn) {
            (handlers[key] = handlers[key] || []).push(fn);
        }

        function onAny(fn) {
            anyHandlers.push(fn);
        }

        function dispatch(data) {
            if (!data || typeof data !== 'object') return;
            for (const fn of anyHandlers) {
                try { fn(data); } catch (error) { console.warn('[darksad-addon] handler *', error); }
            }
            for (const key in handlers) {
                if (data[key] === undefined) continue;
                for (const fn of handlers[key]) {
                    try { fn(data[key], data); } catch (error) { console.warn('[darksad-addon] handler', key, error); }
                }
            }
        }

        function tryHook() {
            if (hooked) return true;
            const engine = PAGE.Engine;
            const comm = engine && engine.communication;
            if (comm && typeof comm.parseJSON === 'function') {
                const original = comm.parseJSON;
                comm.parseJSON = function (data) {
                    let result;
                    try {
                        result = original.apply(this, arguments);
                    } finally {
                        try { dispatch(typeof data === 'string' ? JSON.parse(data) : data); } catch (_) {}
                    }
                    return result;
                };
                hooked = true;
                return true;
            }
            // stary interfejs
            if (typeof engine === 'undefined' && typeof PAGE.successData === 'function' && typeof PAGE.g !== 'undefined') {
                const original = PAGE.successData;
                PAGE.successData = function (raw) {
                    let result;
                    try {
                        result = original.apply(this, arguments);
                    } finally {
                        try { dispatch(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch (_) {}
                    }
                    return result;
                };
                hooked = true;
                return true;
            }
            return false;
        }

        function start() {
            if (tryHook()) return;
            const iv = setInterval(() => { if (tryHook()) clearInterval(iv); }, 25);
            setTimeout(() => clearInterval(iv), 180000);
        }

        function send(query) {
            if (typeof PAGE._g === 'function') {
                PAGE._g(query);
                return true;
            }
            showToast('Gra nie jest jeszcze gotowa.');
            return false;
        }

        function heroId() {
            try {
                return String(PAGE.Engine?.hero?.d?.id || PAGE.hero?.id || 'default');
            } catch (_) {
                return 'default';
            }
        }

        function heroLvl() {
            try {
                const d = PAGE.Engine?.hero?.d || PAGE.hero || {};
                return Number(d.oplvl || d.lvl || 0);
            } catch (_) {
                return 0;
            }
        }

        return { on, onAny, start, send, heroId, heroLvl, isHooked: () => hooked };
    })();

    function escapeHtmlPa(v) {
        return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // przeciąganie okienek .pa-win za nagłówek
    function makeWinDraggable(win, handle, onDone) {
        let drag = null;
        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || event.target.closest('button')) return;
            const rect = win.getBoundingClientRect();
            drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove', (event) => {
            if (!drag) return;
            const left = Math.max(0, Math.min(window.innerWidth - win.offsetWidth, drag.left + event.clientX - drag.x));
            const top = Math.max(0, Math.min(window.innerHeight - win.offsetHeight, drag.top + event.clientY - drag.y));
            win.style.left = `${left}px`;
            win.style.top = `${top}px`;
            win.style.right = 'auto';
            win.style.bottom = 'auto';
        });
        const end = () => {
            if (!drag) return;
            drag = null;
            const rect = win.getBoundingClientRect();
            onDone?.({ left: Math.round(rect.left), top: Math.round(rect.top) });
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    function stopGameInput(el) {
        ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel', 'pointerdown'].forEach((type) => {
            el.addEventListener(type, (event) => event.stopPropagation());
        });
    }

    // uchwyt zmiany rozmiaru w prawym dolnym rogu okienka
    function addResizeGrip(win, limits, onResize, onDone) {
        const grip = document.createElement('div');
        grip.className = 'pa-who-grip pa-win-grip';
        grip.title = 'Przeciągnij, aby zmienić rozmiar';
        win.appendChild(grip);
        let drag = null;
        grip.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            drag = { x: event.clientX, y: event.clientY, w: win.offsetWidth, h: win.offsetHeight };
            grip.setPointerCapture(event.pointerId);
        });
        grip.addEventListener('pointermove', (event) => {
            if (!drag) return;
            const rect = win.getBoundingClientRect();
            const w = Math.round(Math.max(limits.minW, Math.min(window.innerWidth - rect.left - 2, drag.w + event.clientX - drag.x)));
            const h = Math.round(Math.max(limits.minH, Math.min(window.innerHeight - rect.top - 2, drag.h + event.clientY - drag.y)));
            onResize({ w, h });
        });
        const end = () => {
            if (!drag) return;
            drag = null;
            onDone?.();
        };
        grip.addEventListener('pointerup', end);
        grip.addEventListener('pointercancel', end);
        return grip;
    }

    // =================================================================
    //  BERSERKER – ikonka obok ekwipunku, przełącza auto-atak mobów
    //  Ustawienia gry: id 34 = berserk solo, id 35 = berserk w grupie
    // =================================================================
    const berserk = (function () {
        const ID_SOLO = 34;
        const ID_GROUP = 35;
        const CACHE_KEY = 'darksad-berserk-cache';

        const settings = {};
        let hasParty = null;
        let enabled = false;
        let icon = null;
        let tip = null;
        let posTimer = null;

        try {
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
            if (cached[ID_SOLO]) settings[ID_SOLO] = cached[ID_SOLO];
            if (cached[ID_GROUP]) settings[ID_GROUP] = cached[ID_GROUP];
        } catch (_) {}

        function deepMerge(target, src) {
            for (const k in src) {
                const v = src[k];
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, v);
                } else {
                    target[k] = v;
                }
            }
            return target;
        }

        net.on('settings', (data) => {
            let touched = false;
            for (const item of (data && data.list) || []) {
                for (const key in item) {
                    const id = Number(key);
                    if (id !== ID_SOLO && id !== ID_GROUP) continue;
                    settings[id] = deepMerge(settings[id] || {}, item[key]);
                    touched = true;
                }
            }
            if (!touched) return;
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch (_) {}
            update();
            const modal = getModal();
            if (modal && state.menuOpen) renderSettings(modal);
        });

        net.on('party', (party) => {
            hasParty = Boolean(party && typeof party === 'object' && Object.keys(party).length > 0);
            update();
        });

        function inParty() {
            if (hasParty !== null) return hasParty;
            try {
                const p = PAGE.Engine?.party;
                if (p && typeof p.getMembers === 'function') return Object.keys(p.getMembers() || {}).length > 0;
                return Boolean(p);
            } catch (_) {
                return false;
            }
        }

        function currentId() {
            return inParty() ? ID_GROUP : ID_SOLO;
        }

        function isOn(id) {
            return Boolean(Number(settings[id]?.v));
        }

        function toggle() {
            const id = currentId();
            const next = !isOn(id);
            if (!net.send(`settings&action=update&id=${id}&v=${next ? 1 : 0}`)) return;
            settings[id] = Object.assign(settings[id] || {}, { v: next ? 1 : 0 });
            update();
            showToast(`Berserk ${id === ID_GROUP ? '(drużyna) ' : ''}${next ? 'WŁĄCZONY – atakujesz moby' : 'wyłączony'}`);
        }

        function setKey(id, key, value) {
            const v = typeof value === 'boolean' ? (value ? 1 : 0) : value;
            if (!net.send(`settings&action=update&id=${id}&key=${key}&v=${v}`)) return;
            settings[id] = settings[id] || {};
            settings[id][key] = Object.assign(settings[id][key] || {}, { v });
        }

        const SIZE = 24;
        let rozwinEl = null;

        // przycisk „Rozwiń” w panelu statystyk (obok ekwipunku) – szukany w całej stronie
        let lastSearch = 0;
        function findRozwin() {
            if (rozwinEl && rozwinEl.isConnected && rozwinEl.getClientRects().length) return rozwinEl;
            rozwinEl = null;
            const now = Date.now();
            if (now - lastSearch < 1500) return null;
            lastSearch = now;
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    return /^\s*rozwi[nń]/i.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
                },
            });
            const candidates = [];
            let node;
            while ((node = walker.nextNode())) {
                const el = node.parentElement;
                if (!el || el.closest(`#${ADDON_ID}-modal, .pa-win, #${ADDON_ID}, .pa-tip`)) continue;
                if (!el.getClientRects().length) continue;
                // wspinamy się do „przycisku” (mały element), max 3 poziomy
                let target = el;
                for (let i = 0, cur = el; i < 3 && cur.parentElement; i++) {
                    cur = cur.parentElement;
                    const r = cur.getBoundingClientRect();
                    if (r.width > 160 || r.height > 44) break;
                    target = cur;
                }
                // czy w pobliżu jest nagłówek „Statystyki”
                let score = 0;
                for (let i = 0, cur = target; i < 6 && cur && cur !== document.body; i++, cur = cur.parentElement) {
                    const cr = cur.getBoundingClientRect();
                    if (cr.width > 450 || cr.height > 350) break;
                    if (/statystyk/i.test(cur.textContent || '')) {
                        score = 10 - i;
                        break;
                    }
                }
                candidates.push({ target, score });
            }
            candidates.sort((x, y) => y.score - x.score);
            rozwinEl = candidates[0]?.target || null;
            return rozwinEl;
        }

        // prawa krawędź ikonki tarczy (szukamy na lewo od „Rozwiń”)
        function findShieldRight(r) {
            const y = r.top + r.height / 2;
            for (let x = r.left - 3; x > r.left - 80; x -= 2) {
                const el = document.elementsFromPoint(x, y).find((e) => !icon || (e !== icon && !icon.contains(e)));
                if (!el) continue;
                const er = el.getBoundingClientRect();
                if (er.width >= 10 && er.width <= 48 && er.height >= 10 && er.height <= 48 && er.right <= r.left) return er.right;
            }
            return null;
        }

        function getAnchorRect() {
            const btn = findRozwin();
            return btn ? btn.getBoundingClientRect() : null;
        }

        function place() {
            if (!icon || icon.dataset.dragging === '1') return;
            const r = getAnchorRect();
            const off = state.berserkRozwinOffset;
            let left;
            let top;
            if (r && off) {
                left = r.left + off.left;
                top = r.top + off.top;
            } else if (r) {
                // domyślnie: pośrodku między tarczą a „Rozwiń”
                const shieldRight = findShieldRight(r);
                left = shieldRight !== null ? (shieldRight + r.left) / 2 - SIZE / 2 : r.left - SIZE - 4;
                top = r.top + r.height / 2 - SIZE / 2;
            } else if (state.berserkFreePos) {
                left = state.berserkFreePos.left;
                top = state.berserkFreePos.top;
            } else {
                // nie znaleziono „Rozwiń” – obok przycisku panelu (lewy dół)
                left = 56;
                top = window.innerHeight - 40;
            }
            left = Math.max(0, Math.min(window.innerWidth - SIZE, left));
            top = Math.max(0, Math.min(window.innerHeight - SIZE, top));
            icon.style.left = `${Math.round(left)}px`;
            icon.style.top = `${Math.round(top)}px`;
        }

        // diagnostyka w konsoli: paBerserkDebug()
        try {
            PAGE.paBerserkDebug = () => {
                rozwinEl = null;
                lastSearch = 0;
                const el = findRozwin();
                const info = el ? { tag: el.tagName, cls: el.className, text: el.textContent.trim(), rect: el.getBoundingClientRect().toJSON(), html: el.outerHTML.slice(0, 300), parent: el.parentElement?.outerHTML.slice(0, 600) } : 'Nie znaleziono przycisku „Rozwiń”';
                console.log('[darksad-addon] berserk anchor:', info);
                return info;
            };
        } catch (_) {}

        const SWORDS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4"/><path d="m7 17-3 3"/><path d="m3 19 2 2"/></svg>';

        function createIcon() {
            if (icon) return;
            icon = document.createElement('div');
            icon.className = 'pa-berserk-icon pa-fixed pa-off';
            icon.innerHTML = `${SWORDS}<span class="pa-berserk-badge" style="display:none">G</span>`;
            document.body.appendChild(icon);

            tip = document.createElement('div');
            tip.className = 'pa-tip';
            document.body.appendChild(tip);

            stopGameInput(icon);

            let drag = null;
            icon.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return;
                const r = icon.getBoundingClientRect();
                drag = { x: event.clientX, y: event.clientY, left: r.left, top: r.top, moved: false };
                icon.setPointerCapture(event.pointerId);
                event.preventDefault();
            });
            icon.addEventListener('pointermove', (event) => {
                if (!drag) {
                    showTip(event);
                    return;
                }
                const dx = event.clientX - drag.x;
                const dy = event.clientY - drag.y;
                if (!drag.moved && Math.hypot(dx, dy) < 5) return;
                drag.moved = true;
                icon.dataset.dragging = '1';
                tip.style.display = 'none';
                icon.style.left = `${Math.max(0, Math.min(window.innerWidth - SIZE, drag.left + dx))}px`;
                icon.style.top = `${Math.max(0, Math.min(window.innerHeight - SIZE, drag.top + dy))}px`;
            });
            icon.addEventListener('pointerup', () => {
                if (!drag) return;
                const wasMoved = drag.moved;
                drag = null;
                delete icon.dataset.dragging;
                if (wasMoved) {
                    const r = icon.getBoundingClientRect();
                    const a = getAnchorRect();
                    if (!a) {
                        state.berserkFreePos = { left: Math.round(r.left), top: Math.round(r.top) };
                        saveSettings();
                        return;
                    }
                    state.berserkRozwinOffset = { left: Math.round(r.left - a.left), top: Math.round(r.top - a.top) };
                    saveSettings();
                } else {
                    toggle();
                }
            });
            icon.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
            icon.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                tip.style.display = 'none';
                setMenuOpen(true, 'berserk');
            });
        }

        function showTip(event) {
            const id = currentId();
            const on = isOn(id);
            const known = Boolean(settings[id]);
            tip.innerHTML = `<b>Berserk ${id === ID_GROUP ? 'w drużynie' : 'solo'}: <span style="color:${on ? 'var(--pa-ok)' : 'var(--pa-danger)'}">${on ? 'włączony' : 'wyłączony'}</span></b>` +
                (known ? '' : '<br><span style="color:var(--pa-muted)">(stan z pamięci – czekam na dane z gry)</span>') +
                '<br>Kliknij – przełącz<br>PPM – ustawienia<br>Przeciągnij – przesuń ikonkę';
            tip.style.display = 'block';
            const x = Math.min(window.innerWidth - tip.offsetWidth - 8, event.clientX + 14);
            const y = Math.min(window.innerHeight - tip.offsetHeight - 8, event.clientY + 14);
            tip.style.left = `${Math.max(4, x)}px`;
            tip.style.top = `${Math.max(4, y)}px`;
        }

        function update() {
            if (!icon) return;
            const id = currentId();
            icon.classList.toggle('pa-off', !isOn(id));
            icon.querySelector('.pa-berserk-badge').style.display = id === ID_GROUP ? '' : 'none';
        }

        function setEnabled(on) {
            enabled = on;
            if (on) {
                createIcon();
                update();
                place();
                clearInterval(posTimer);
                posTimer = setInterval(place, 1000);
                window.addEventListener('resize', place);
            } else {
                clearInterval(posTimer);
                window.removeEventListener('resize', place);
                icon?.remove();
                tip?.remove();
                icon = null;
                tip = null;
            }
        }

        function resetPosition() {
            state.berserkRozwinOffset = null;
            state.berserkFreePos = null;
            saveSettings();
            place();
            showToast('Przywrócono pozycję ikonki berserka');
        }

        function renderSide(id, title) {
            const d = settings[id];
            if (!d) {
                return `<div class="pa-sub">${title}</div><p class="pa-hint">Brak danych z gry. Dane przychodzą przy wczytaniu gry – odśwież stronę (F5), gdy panel jest zainstalowany.</p>`;
            }
            const lvl = net.heroLvl();
            const chk = (key, label) => {
                const checked = key === 'v' ? Number(d.v) : Number(d[key]?.v);
                return `<label class="pa-check"><input type="checkbox" data-pa-bers="${id}" data-pa-bers-key="${key}" ${checked ? 'checked' : ''}> ${label}</label>`;
            };
            const num = (key, label) => {
                const o = d[key];
                if (!o) return '';
                const v = Number(o.v || 0);
                const range = (o.min !== undefined && o.max !== undefined) ? `min="${o.min}" max="${o.max}"` : '';
                const abs = lvl ? ` (lvl ${lvl + v})` : '';
                return `<label class="pa-field"><span>${label}${abs}</span><input type="number" ${range} value="${v}" data-pa-bers="${id}" data-pa-bers-key="${key}"></label>`;
            };
            return `<div class="pa-sub">${title}</div>
              ${chk('v', '<b>Włączony</b>')}
              ${chk('common', 'Zwykłe potwory')}
              ${chk('elite', 'Elity i ich obstawa')}
              ${chk('elite2', 'Elity II i ich obstawa')}
              <div class="pa-row">${num('lvlmin', 'Min. poziom')}${num('lvlmax', 'Maks. poziom')}</div>`;
        }

        function renderSettings(modal) {
            const solo = modal.querySelector('[data-pa-bers-side="solo"]');
            const group = modal.querySelector('[data-pa-bers-side="group"]');
            if (!solo || !group) return;
            if (solo.contains(document.activeElement) || group.contains(document.activeElement)) return;
            solo.innerHTML = renderSide(ID_SOLO, 'Samotnie');
            group.innerHTML = renderSide(ID_GROUP, 'W drużynie');
        }

        function onSettingsInput(input) {
            const id = Number(input.getAttribute('data-pa-bers'));
            const key = input.getAttribute('data-pa-bers-key');
            if (key === 'v') {
                if (!net.send(`settings&action=update&id=${id}&v=${input.checked ? 1 : 0}`)) return;
                settings[id] = Object.assign(settings[id] || {}, { v: input.checked ? 1 : 0 });
                update();
                return;
            }
            if (input.type === 'checkbox') {
                setKey(id, key, input.checked);
            } else {
                let v = Math.round(Number(input.value) || 0);
                if (input.min !== '') v = Math.max(Number(input.min), v);
                if (input.max !== '') v = Math.min(Number(input.max), v);
                input.value = v;
                setKey(id, key, v);
            }
        }

        function init() {
            if (state.berserkEnabled) setEnabled(true);
        }

        return { init, setEnabled, resetPosition, renderSettings, onSettingsInput, toggle };
    })();

    // =================================================================
    //  ZMIENIACZ ZESTAWÓW – nazwy zestawów z gry, kolejka po walce
    // =================================================================
    const builds = (function () {
        const list = {};
        let currentId = null;
        let pendingId = null;
        let pendingAttempts = 0;
        let lastPendingSendAt = 0;
        let fightActive = false;
        let fightEnded = false;
        let win = null;
        let pollTimer = null;

        function isDefaultName(name) {
            return !name || /\[SET\.[0-9]+\]/.test(name);
        }

        function friendlyName(id) {
            const b = list[id] || cachedList().find((x) => Number(x.id) === Number(id));
            return b && !isDefaultName(b.name) ? b.name : `Zestaw ${id}`;
        }

        function cachedList() {
            return state.buildsCache[net.heroId()]?.list || [];
        }

        function saveCache() {
            const ids = Object.keys(list);
            if (!ids.length) return;
            state.buildsCache[net.heroId()] = {
                list: ids.map((id) => ({ id: Number(id), name: list[id].name || '' })),
                currentId,
            };
            saveSettings();
        }

        function mergeList(items) {
            for (const b of items || []) {
                if (b && b.id !== undefined) list[b.id] = Object.assign(list[b.id] || {}, b);
            }
        }

        net.on('builds', (data) => {
            if (!data || typeof data !== 'object') return;
            if (data.action === 'INIT') {
                for (const id in list) delete list[id];
                mergeList(data.list);
            } else if (data.list) {
                mergeList(data.list);
            }
            if (data.currentId !== undefined && data.currentId !== null) {
                const next = Number(data.currentId);
                // zestaw zmieniony w grze ręcznie (nie przez panel) – wyłącz AI
                if (data.action !== 'INIT' && next !== currentId && currentId !== null &&
                    !(lastSent && lastSent.id === next && Date.now() - lastSent.t < 10000)) {
                    disableAI('AI zestawów wyłączone – zestaw zmieniony ręcznie');
                }
                currentId = next;
            }

            if (pendingId !== null && currentId === pendingId) {
                showToast(`Założono zestaw: ${friendlyName(pendingId)}`);
                pendingId = null;
                pendingAttempts = 0;
            }
            saveCache();
            render();
        });

        net.on('f', (f) => {
            if (!f || typeof f !== 'object') return;
            const init = String(f.init) === '1';
            if (init && f.close) {
                fightActive = false;
            } else if (init) {
                fightActive = true;
                fightEnded = false;
            }
            if (f.endBattle || f.end || f.battleEnd || String(f.move) === '-1') {
                fightEnded = true;
                onBattleOver();
            }
            if (f.close) {
                fightActive = false;
                fightEnded = false;
                onBattleOver();
            }
            renderStatus();
        });

        function isFighting() {
            if (fightActive && !fightEnded) {
                try {
                    if (PAGE.Engine?.battle?.endBattle === true) return false;
                } catch (_) {}
                return true;
            }
            try {
                const b = PAGE.Engine?.battle;
                if (b && b.endBattle === true) return false;
                if (b && b.show && b.endBattle === false) return true;
            } catch (_) {}
            return false;
        }

        let lastSent = null;
        let inParty = null;
        net.on('party', (party) => {
            inParty = Boolean(party && typeof party === 'object' && Object.keys(party).length > 0);
        });
        function hasParty() {
            if (inParty !== null) return inParty;
            try {
                const p = PAGE.Engine?.party;
                if (p && typeof p.getMembers === 'function') return Object.keys(p.getMembers() || {}).length > 0;
                return Boolean(p);
            } catch (_) {
                return false;
            }
        }

        function disableAI(reason) {
            if (!aiOn()) return;
            heroCfg().ai = false;
            aiInfo = '';
            saveSettings();
            showToast(reason);
            render();
            syncUi();
        }

        function sendSwitch(id) {
            lastSent = { id: Number(id), t: Date.now() };
            const skillShop = PAGE.Engine?.skills ? '&skillshop=1' : '';
            return net.send(`builds&action=updateCurrent&id=${id}${skillShop}`);
        }

        function onBattleOver() {
            if (pendingId === null) return;
            pendingAttempts = 0;
            lastPendingSendAt = 0;
            tryFlush();
            setTimeout(tryFlush, 0);
        }

        function tryFlush() {
            if (pendingId === null) {
                stopPoll();
                return;
            }
            if (isFighting()) return;
            if (pendingAttempts >= 4) return; // czekamy na zamknięcie walki
            if (Date.now() - lastPendingSendAt < 1500) return;
            pendingAttempts++;
            lastPendingSendAt = Date.now();
            sendSwitch(pendingId);
        }

        function startPoll() {
            if (pollTimer) return;
            pollTimer = setInterval(tryFlush, 150);
        }

        function stopPoll() {
            clearInterval(pollTimer);
            pollTimer = null;
        }

        function choose(id, fromAI = false) {
            id = Number(id);
            if (!fromAI) disableAI('AI zestawów wyłączone – wybrałeś zestaw ręcznie');
            if (pendingId === id) {
                pendingId = null;
                stopPoll();
                showToast('Anulowano zmianę zestawu po walce');
                render();
                return;
            }
            if (id === currentId && pendingId === null) {
                showToast(`Zestaw „${friendlyName(id)}” jest już założony`);
                return;
            }
            if (isFighting()) {
                pendingId = id;
                pendingAttempts = 0;
                startPoll();
                showToast(`Trwa walka – „${friendlyName(id)}” zostanie założony zaraz po niej`);
                render();
                return;
            }
            pendingId = null;
            if (sendSwitch(id)) showToast(`Zmieniam zestaw na: ${friendlyName(id)}`);
            render();
        }

        function rename(id) {
            const current = friendlyName(id);
            const name = prompt('Nowa nazwa zestawu:', current);
            if (name === null) return;
            const trimmed = name.trim();
            if (!trimmed || trimmed === current) return;
            if (net.send(`builds&action=update&id=${id}&name=${encodeURIComponent(trimmed)}`)) {
                showToast('Zmieniono nazwę zestawu');
            }
        }

        function createWindow() {
            if (win) return;
            win = document.createElement('div');
            win.className = 'pa-win pa-builds-win';
            win.innerHTML = `
              <div class="pa-win-head" data-pa-drag>
                <b>Zestawy</b>
                <button type="button" class="pa-icon-btn pa-b-ai" data-pa-b-ai title="AI: zakładaj zestaw pod profesję najbliższego wroga">AI</button>
                <button type="button" class="pa-icon-btn" data-pa-b-settings title="Ustawienia">⚙</button>
                <button type="button" class="pa-icon-btn" data-pa-b-close title="Ukryj (wyłącza dodatek)">✕</button>
              </div>
              <div class="pa-win-body">
                <div class="pa-builds-grid" data-pa-b-grid></div>
                <div class="pa-builds-status" data-pa-b-status></div>
              </div>`;
            document.body.appendChild(win);
            stopGameInput(win);
            applyPosition();

            makeWinDraggable(win, win.querySelector('[data-pa-drag]'), (pos) => {
                state.buildsPosition = pos;
                saveSettings();
            });

            addResizeGrip(win, { minW: 70, minH: 46 }, (size) => {
                state.buildsBox = size;
                win.style.width = `${size.w}px`;
                win.style.height = `${size.h}px`;
                layout();
            }, () => saveSettings());

            if (typeof ResizeObserver === 'function') {
                new ResizeObserver(() => layout()).observe(win.querySelector('.pa-win-body'));
            }

            win.querySelector('[data-pa-b-settings]').addEventListener('click', () => setMenuOpen(true, 'builds'));
            win.querySelector('[data-pa-b-ai]').addEventListener('click', () => {
                const cfg = heroCfg();
                cfg.ai = !cfg.ai;
                if (cfg.ai && !Object.values(cfg.prof).some(Boolean)) {
                    showToast('AI włączone – przypisz profesje do zestawów w ustawieniach (⚙)');
                    setMenuOpen(true, 'builds');
                } else {
                    showToast(cfg.ai ? 'AI zestawów włączone (dla tej postaci)' : 'AI zestawów wyłączone');
                }
                aiInfo = '';
                saveSettings();
                render();
                syncUi();
            });
            win.querySelector('[data-pa-b-close]').addEventListener('click', () => {
                state.buildsEnabled = false;
                saveSettings();
                setEnabled(false);
                syncUi();
                showToast('Zmieniacz zestawów wyłączony (włączysz go w panelu)');
            });

            const grid = win.querySelector('[data-pa-b-grid]');
            grid.addEventListener('click', (event) => {
                const btn = event.target.closest('[data-pa-build]');
                if (btn) choose(btn.getAttribute('data-pa-build'));
            });
            grid.addEventListener('contextmenu', (event) => {
                const btn = event.target.closest('[data-pa-build]');
                if (!btn) return;
                event.preventDefault();
                rename(btn.getAttribute('data-pa-build'));
            });
        }

        function applyPosition() {
            if (!win) return;
            const pos = state.buildsPosition;
            if (pos) {
                win.style.left = `${Math.min(window.innerWidth - 80, Math.max(0, pos.left))}px`;
                win.style.top = `${Math.min(window.innerHeight - 40, Math.max(0, pos.top))}px`;
                win.style.right = 'auto';
            } else {
                win.style.left = 'auto';
                win.style.right = '290px';
                win.style.top = '90px';
            }
        }

        function render() {
            if (!win) return;
            const live = Object.keys(list).map(Number).sort((a, b) => a - b);
            const ids = live.length ? live : cachedList().map((b) => Number(b.id)).sort((a, b) => a - b);
            const current = currentId ?? state.buildsCache[net.heroId()]?.currentId ?? null;
            const grid = win.querySelector('[data-pa-b-grid]');

            win.classList.toggle('pa-builds-compact', Boolean(state.buildsCompact));
            const box = state.buildsBox;
            if (box) {
                win.style.width = `${box.w}px`;
                win.style.height = `${box.h}px`;
            } else {
                win.style.height = '';
                win.style.width = state.buildsCompact ? '' : '170px';
            }

            if (!ids.length) {
                grid.style.gridTemplateColumns = '1fr';
                grid.innerHTML = '<div class="pa-builds-empty">Brak danych o zestawach. Gra wysyła je przy wczytaniu – odśwież stronę (F5), a lista pojawi się tutaj.</div>';
            } else {
                grid.innerHTML = ids.map((id) => {
                    const cls = ['pa-build'];
                    if (id === current) cls.push('pa-current');
                    if (id === pendingId) cls.push('pa-pending');
                    const name = escapeHtmlPa(friendlyName(id));
                    const profs = profsOf(id);
                    const profTag = profs.length ? `<span class="pa-build-prof">${profs.map((k) => k.toUpperCase()).join('')}</span>` : '';
                    return `<button type="button" class="${cls.join(' ')}" data-pa-build="${id}" title="${name}${id === current ? ' (założony)' : ''}${profs.length ? ` · pod: ${profs.map((k) => PROFS[k]).join(', ')}` : ''}\nLPM – załóż · PPM – zmień nazwę">
                      <span class="pa-build-no">${id}</span><span class="pa-build-name">${name}</span>${profTag}</button>`;
                }).join('');
            }
            renderStatus();
            layout();
        }

        // dopasowanie: szerzej = więcej kolumn, większe okno = większe przyciski
        function layout() {
            if (!win) return;
            const grid = win.querySelector('[data-pa-b-grid]');
            const body = win.querySelector('.pa-win-body');
            const n = grid.querySelectorAll('.pa-build').length;
            if (!n) {
                grid.style.gridTemplateColumns = '1fr';
                grid.style.gridAutoRows = '';
                return;
            }
            const compact = Boolean(state.buildsCompact);
            const gap = 4;
            const ratio = compact ? 1.15 : 4.2;   // min. szerokość przycisku / wysokość
            let cols;
            let itemH;
            if (state.buildsBox) {
                const status = win.querySelector('[data-pa-b-status]');
                const statusH = status.textContent ? status.offsetHeight + 4 : 0;
                const W = body.clientWidth - 12;
                const H = body.clientHeight - 12 - statusH;
                const MAX_H = 34;
                const sizes = [];
                let bestS = 0;
                for (let c = 1; c <= n; c++) {
                    const rows = Math.ceil(n / c);
                    const cellW = (W - gap * (c - 1)) / c;
                    const h = (H - gap * (rows - 1)) / rows;
                    sizes[c] = Math.min(h, cellW / ratio);
                    bestS = Math.max(bestS, sizes[c]);
                }
                // przyciski rosną do MAX_H, a nadmiar szerokości idzie w kolejne kolumny
                const target = Math.min(bestS, MAX_H) * 0.97;
                cols = 1;
                for (let c = n; c >= 1; c--) {
                    if (sizes[c] >= target) {
                        cols = c;
                        break;
                    }
                }
                itemH = Math.max(14, Math.min(MAX_H, Math.floor(sizes[cols])));
            } else {
                cols = compact ? Math.min(n, 5) : Math.min(n, 2);
                itemH = 20;
            }
            grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
            grid.style.gridAutoRows = `${itemH}px`;
            grid.style.setProperty('--pa-bfs', `${Math.max(9, Math.min(16, Math.round(itemH * 0.48)))}px`);
        }

        function renderStatus() {
            if (!win) return;
            win.querySelector('[data-pa-b-ai]')?.classList.toggle('pa-on', aiOn());
            const status = win.querySelector('[data-pa-b-status]');
            let text = '';
            if (pendingId !== null) {
                text = isFighting()
                    ? `⚔ Walka – po niej: ${friendlyName(pendingId)}`
                    : `⏳ Zakładam: ${friendlyName(pendingId)}…`;
                status.classList.add('pa-warn');
            } else {
                text = isFighting() ? '⚔ Trwa walka – kliknięcie zakolejkuje zmianę' : '';
                status.classList.toggle('pa-warn', isFighting());
            }
            if (aiOn() && aiInfo) text = text ? `${text}\n${aiInfo}` : aiInfo;
            if (status.textContent !== text) {
                status.textContent = text;
                layout();
            }
        }

        // ---------- AI: zestaw pod profesję najbliższego wroga ----------
        const PROFS = { w: 'Wojownik', p: 'Paladyn', b: 'Tancerz ostrzy', m: 'Mag', t: 'Tropiciel', h: 'Łowca' };
        let aiTimer = null;
        let aiInfo = '';
        let aiLastSwitch = 0;

        const PROF_SHORT = { w: 'Woj', p: 'Pal', b: 'Tan', m: 'Mag', t: 'Tro', h: 'Łow' };

        // ustawienia AI / profesji są osobne dla każdej postaci
        function heroCfg() {
            const hid = net.heroId();
            if (!state.buildsHeroCfg || typeof state.buildsHeroCfg !== 'object') state.buildsHeroCfg = {};
            let cfg = state.buildsHeroCfg[hid];
            if (!cfg) {
                cfg = { prof: {}, ai: false };
                // jednorazowo przenosimy stare (wspólne) ustawienia na pierwszą postać
                if (hid !== 'default' && state.buildsProf && Object.keys(state.buildsProf).length) {
                    cfg.prof = state.buildsProf;
                    cfg.ai = Boolean(state.buildsAI);
                    state.buildsProf = {};
                    state.buildsAI = false;
                }
                state.buildsHeroCfg[hid] = cfg;
            }
            if (!cfg.prof) cfg.prof = {};
            return cfg;
        }

        function aiOn() {
            return Boolean(heroCfg().ai);
        }

        // profesje zestawu zapisane jako ciąg liter, np. "mt" = mag + tropiciel
        function profsOf(id) {
            return String(heroCfg().prof[id] || '').split('').filter((k) => PROFS[k]);
        }

        function toggleProf(id, k) {
            const map = heroCfg().prof;
            const cur = profsOf(id);
            const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
            const ordered = Object.keys(PROFS).filter((x) => next.includes(x)).join('');
            if (ordered) map[id] = ordered;
            else delete map[id];
            saveSettings();
            render();
        }

        function buildForProf(prof) {
            const map = heroCfg().prof;
            const ids = Object.keys(map).filter((id) => profsOf(id).includes(prof)).map(Number).sort((a, b) => a - b);
            if (!ids.length) return null;
            // jeśli obecny zestaw pasuje – zostajemy przy nim
            if (ids.includes(currentId)) return currentId;
            return ids[0];
        }

        function aiStep() {
            if (!win || !aiOn()) {
                if (aiInfo) {
                    aiInfo = '';
                    renderStatus();
                }
                return;
            }
            if (hasParty()) {
                aiInfo = '🤖 AI wstrzymane – jesteś w grupie';
                renderStatus();
                return;
            }
            let players = [];
            try { players = miniMap.getPlayers(); } catch (_) {}
            const range = Number(state.buildsAIRange) || 12;
            const targets = players.filter((p) => (state.buildsAIEnemiesOnly ? p.kind === 'enemy' : p.hostile) && p.dist <= range && p.prof);
            const target = targets[0];
            if (!target) {
                aiInfo = `🤖 AI: brak wroga w zasięgu ${range} kratek`;
                renderStatus();
                return;
            }
            const profName = PROFS[target.prof] || target.prof;
            const id = buildForProf(target.prof);
            if (id === null) {
                aiInfo = `🤖 ${target.nick} (${profName}) – brak zestawu pod tę profesję`;
                renderStatus();
                return;
            }
            aiInfo = `🤖 ${target.nick} (${profName}, ${Math.round(target.dist)} kr.) → ${friendlyName(id)}`;
            renderStatus();
            if (id === currentId || id === pendingId) return;
            const now = Date.now();
            if (now - aiLastSwitch < 2500) return;
            aiLastSwitch = now;
            choose(id, true);
        }

        function setAI(on) {
            heroCfg().ai = Boolean(on);
            aiInfo = '';
            saveSettings();
            render();
        }

        function renderSettings(modal, force) {
            const aiBox = modal.querySelector('[data-pa-b-aiopt]');
            if (aiBox) aiBox.checked = aiOn();
            const who = modal.querySelector('[data-pa-b-hero]');
            if (who) {
                let nick = '';
                try { nick = PAGE.Engine?.hero?.d?.nick || PAGE.hero?.nick || ''; } catch (_) {}
                who.textContent = nick ? `Ustawienia poniżej dotyczą postaci: ${nick}` : 'Ustawienia poniżej dotyczą aktualnej postaci';
            }
            const box = modal.querySelector('[data-pa-b-profs]');
            if (!box || (!force && box.contains(document.activeElement))) return;
            const live = Object.keys(list).map(Number);
            const ids = (live.length ? live : cachedList().map((b) => Number(b.id))).sort((a, b) => a - b);
            if (!ids.length) {
                box.innerHTML = '<p class="pa-hint">Brak listy zestawów – odśwież grę (F5), gdy dodatek jest włączony.</p>';
                return;
            }
            box.innerHTML = ids.map((id) => {
                const profs = profsOf(id);
                return `
              <div class="pa-bprof-row">
                <span class="pa-bprof-name">${id}. ${escapeHtmlPa(friendlyName(id))}</span>
                <span class="pa-bprof-chips">
                  ${Object.entries(PROFS).map(([k, v]) => `<button type="button" class="pa-chip${profs.includes(k) ? ' pa-on' : ''}" data-pa-bprof-id="${id}" data-pa-bprof-p="${k}" title="${v}">${PROF_SHORT[k]}</button>`).join('')}
                </span>
              </div>`;
            }).join('');
        }

        function setEnabled(on) {
            if (on) {
                createWindow();
                win.classList.add('pa-visible');
                render();
                clearInterval(aiTimer);
                aiTimer = setInterval(aiStep, 700);
            } else {
                clearInterval(aiTimer);
                aiTimer = null;
                pendingId = null;
                stopPoll();
                win?.remove();
                win = null;
            }
        }

        function resetPosition() {
            state.buildsPosition = null;
            state.buildsBox = null;
            saveSettings();
            applyPosition();
            render();
        }

        function init() {
            if (state.buildsEnabled) setEnabled(true);
        }

        return { init, setEnabled, render, resetPosition, choose, renderSettings, toggleProf, setAI };
    })();

    // =================================================================
    //  GRACZE NA MAPIE – dowolny rozmiar okna (.whoishere-window)
    // =================================================================
    const whoResize = (function () {
        const MIN_W = 170;
        const MIN_H = 40;
        let enabled = false;
        let timer = null;

        function findWindow() {
            return document.querySelector('.whoishere-window');
        }

        function refreshScroll(win) {
            const $ = PAGE.$ || PAGE.jQuery;
            const wrapper = win.querySelector('.scroll-wrapper');
            if (!$ || !wrapper) return;
            try { $(wrapper).trigger('update'); } catch (_) {}
            try { $(wrapper).find('.scroll-pane').trigger('update'); } catch (_) {}
        }

        function applySize(win, size) {
            const wrapper = win.querySelector('.scroll-wrapper');
            const who = win.querySelector('.who-is-here');
            if (!size) return;
            win.style.width = `${size.w}px`;
            if (who) {
                who.style.width = '100%';
                who.style.height = 'auto';
                who.style.maxHeight = 'none';
            }
            if (wrapper) {
                wrapper.style.height = `${size.h}px`;
                wrapper.style.maxHeight = 'none';
                wrapper.style.width = '100%';
            }
            const pane = win.querySelector('.scroll-pane');
            if (pane) pane.style.maxHeight = 'none';
            refreshScroll(win);
            fixRows(win);
        }

        function clearSize(win) {
            win.style.width = '';
            ['.who-is-here', '.scroll-wrapper', '.scroll-pane'].forEach((sel) => {
                const el = win.querySelector(sel);
                if (!el) return;
                el.style.width = '';
                el.style.height = '';
                el.style.maxHeight = '';
            });
            refreshScroll(win);
        }

        // przy wąskim oknie skracamy nick („…”), a poziom zostaje zawsze widoczny
        const LVL_RE = /^\(?\s*\d+\s*[a-ząęółśżźćń]{0,3}\s*\)?$/i;
        const SPLIT_RE = /^([\s\S]*?\S)\s*(\(\s*\d+\s*[a-ząęółśżźćń]{0,3}\s*\))\s*$/i;

        // Każdy wiersz: nick skracany („musztardowy ty…”), poziom zawsze na końcu, w jednej równej kolumnie.
        function ownText(el) {
            let t = '';
            for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
            return t;
        }

        function fixRow(row) {
            if (row.dataset.paRowFix && row.dataset.paRowFix === row.textContent) return;
            const all = [row, ...row.querySelectorAll('*')].filter((e) => !e.closest('.pa-who-nk, .pa-who-lv'));
            // element z poziomem: jego własny tekst to „(123x)”
            const lvlEl = all.find((e) => e !== row && LVL_RE.test(ownText(e).trim()) && !e.querySelector('.pa-who-nk'));
            // gotowy wiersz – tylko odśwież poziom
            const done = row.querySelector('.pa-who-nickwrap');
            if (done) {
                if (lvlEl) {
                    const lv = done.querySelector('.pa-who-lv');
                    const t = ownText(lvlEl).trim();
                    if (lv && lv.textContent !== t) lv.textContent = t;
                    // gra mogła wstawić poziom na nowo – chowamy jej kopię, nasza jest przy nicku
                    if (lvlEl.style.display !== 'none') lvlEl.style.display = 'none';
                }
                row.dataset.paRowFix = row.textContent;
                return;
            }
            // element z nickiem: najdłuższy własny tekst (bez poziomu)
            let nickEl = null;
            let best = 0;
            for (const e of all) {
                if (e === lvlEl) continue;
                const len = ownText(e).trim().length;
                if (len > best) {
                    best = len;
                    nickEl = e;
                }
            }
            if (!nickEl || best < 2) {
                row.dataset.paRowFix = row.textContent;
                return;
            }
            let nickText = ownText(nickEl).trim().replace(/\s+/g, ' ');
            let lvlText = lvlEl ? ownText(lvlEl).trim() : '';
            if (!lvlEl) {
                const m = nickText.match(SPLIT_RE);
                if (!m) {
                    row.dataset.paRowFix = row.textContent;
                    return;
                }
                nickText = m[1];
                lvlText = m[2];
            }
            let lvlColor = '';
            if (lvlEl) {
                try { lvlColor = getComputedStyle(lvlEl).color; } catch (_) {}
                lvlEl.style.display = 'none';
            }

            const nk = document.createElement('span');
            nk.className = 'pa-who-nk';
            nk.textContent = nickText;
            const lv = document.createElement('span');
            lv.className = 'pa-who-lv';
            lv.textContent = lvlText;
            if (lvlColor) lv.style.color = lvlColor;
            // podmień własny tekst elementu nicka na nasze dwa kawałki
            const texts = [...nickEl.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue.trim());
            texts[0].replaceWith(nk);
            texts.slice(1).forEach((n) => n.remove());
            nk.after(lv);
            if (lvlEl && lvlEl.parentElement === nickEl) nickEl.appendChild(lvlEl);

            if (nickEl !== row) {
                nickEl.classList.add('pa-who-nickwrap');
                for (let a = nickEl; a && a !== row; a = a.parentElement) {
                    a.style.minWidth = '0';
                    a.style.maxWidth = '100%';
                    a.style.width = 'auto';
                    a.style.overflow = 'hidden';
                    a.style.flex = '1 1 auto';
                    a.style.textAlign = 'left';
                }
            } else {
                // tekst bezpośrednio w wierszu – owijamy go
                const wrap = document.createElement('span');
                wrap.className = 'pa-who-nickwrap';
                wrap.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden;pointer-events:none;';
                nk.before(wrap);
                wrap.append(nk, lv);
            }
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.minWidth = '0';
            row.classList.add('pa-who-row');
            row.dataset.paRowFix = row.textContent;
        }

        function fixRows(win) {
            const list = win.querySelector('.player-list');
            if (!list) return;
            for (const row of list.children) fixRow(row);
            // wiersze nie mogą wychodzić poza widoczną część okna (pasek przewijania ~12 px)
            const wrapper = win.querySelector('.scroll-wrapper') || list.parentElement;
            const visibleRight = Math.min(wrapper.getBoundingClientRect().right, win.getBoundingClientRect().right) - 12;
            for (const row of list.children) {
                const left = row.getBoundingClientRect().left;
                const w = Math.floor(visibleRight - left);
                if (w > 40 && row.style.width !== `${w}px`) {
                    row.style.setProperty('width', `${w}px`, 'important');
                    row.style.setProperty('max-width', `${w}px`, 'important');
                }
            }
        }

        // gra w czasie walki co chwilę przebudowuje wiersze (ikonka mieczy) – poprawiamy je od razu,
        // zanim przeglądarka je narysuje, inaczej miecze skaczą na środek i wiersz mruga
        let rowObserver = null;
        let observedList = null;
        function observeList(win) {
            const list = win.querySelector('.player-list');
            if (!list || list === observedList) return;
            rowObserver?.disconnect();
            observedList = list;
            rowObserver = new MutationObserver(() => {
                if (!enabled || !list.isConnected) return;
                fixRows(win);
            });
            rowObserver.observe(list, { childList: true, subtree: true, characterData: true });
        }

        function attach(win) {
            if (!win) return;
            observeList(win);
            fixRows(win);
            if (win.querySelector(':scope > .pa-who-grip')) {
                // okno istnieje – pilnujemy, by gra nie nadpisała rozmiaru
                if (state.whoSize && win.style.width !== `${state.whoSize.w}px`) applySize(win, state.whoSize);
                return;
            }
            win.classList.add('pa-who-resizable');
            const grip = document.createElement('div');
            grip.className = 'pa-who-grip';
            grip.title = 'Przeciągnij, aby zmienić rozmiar okna';
            win.appendChild(grip);

            let drag = null;
            grip.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const wrapper = win.querySelector('.scroll-wrapper');
                drag = {
                    x: event.clientX,
                    y: event.clientY,
                    w: win.offsetWidth,
                    h: wrapper ? wrapper.offsetHeight : 150,
                };
                win.classList.add('pa-who-resizing');
                grip.setPointerCapture(event.pointerId);
            });
            grip.addEventListener('pointermove', (event) => {
                if (!drag) return;
                event.stopPropagation();
                const rect = win.getBoundingClientRect();
                const w = Math.round(Math.max(MIN_W, Math.min(window.innerWidth - rect.left - 4, drag.w + event.clientX - drag.x)));
                const h = Math.round(Math.max(MIN_H, Math.min(window.innerHeight - 60, drag.h + event.clientY - drag.y)));
                state.whoSize = { w, h };
                applySize(win, state.whoSize);
            });
            const end = (event) => {
                if (!drag) return;
                event.stopPropagation();
                drag = null;
                win.classList.remove('pa-who-resizing');
                saveSettings();
                const modal = getModal();
                if (modal) renderSettings(modal);
            };
            grip.addEventListener('pointerup', end);
            grip.addEventListener('pointercancel', end);
            ['mousedown', 'touchstart', 'click'].forEach((type) => grip.addEventListener(type, (e) => e.stopPropagation()));

            if (state.whoSize) applySize(win, state.whoSize);
        }

        function detach() {
            rowObserver?.disconnect();
            rowObserver = null;
            observedList = null;
            const win = findWindow();
            if (!win) return;
            win.querySelector(':scope > .pa-who-grip')?.remove();
            win.classList.remove('pa-who-resizable');
            clearSize(win);
        }

        function setEnabled(on) {
            enabled = on;
            clearInterval(timer);
            if (on) {
                attach(findWindow());
                timer = setInterval(() => attach(findWindow()), 400);
            } else {
                detach();
            }
        }

        function reset() {
            state.whoSize = null;
            saveSettings();
            const win = findWindow();
            if (win) clearSize(win);
            showToast('Przywrócono domyślny rozmiar okna graczy');
        }

        function renderSettings(modal) {
            const el = modal.querySelector('[data-pa-who-size]');
            if (!el) return;
            el.textContent = state.whoSize
                ? `Zapisany rozmiar: ${state.whoSize.w} × ${state.whoSize.h} px (szerokość okna × wysokość listy).`
                : 'Rozmiar domyślny – zmień go, ciągnąc za prawy dolny róg okna.';
        }

        function init() {
            if (state.whoResizeEnabled) setEnabled(true);
        }

        return { init, setEnabled, reset, renderSettings };
    })();

    // =================================================================
    //  Nowa mapa – podręczna minimapa (zastępuje mapę podręczną z gry)
    //  Dane zbierane cały czas z pakietów serwera, rysowane gdy otwarta.
    // =================================================================
    const miniMap = (function () {
        const COLORS = {
            hero: '#ff2a2a', other: '#ffffff', friend: '#08ad00', clan: '#08ad00', ally: '#9eff91', enemy: '#ff3b3b',
            npc: '#ddff00', mob: '#4d6bff', elite: '#00ffe9', elite2: '#039689', elite3: '#ff9f1a',
            heros: '#ffd23f', herosEvent: '#ff4dd2', titan: '#b6ff1a', collosus: '#809912', item: '#f56bff', gw: '#2b3cff',
            resp: '#c6ba35', respEvent: '#00bfff', marker: '#ff00d4',
        };
        const LAYERS = {
            gw: 70, item: 80, resp: 90, respEvent: 90, npc: 110, mob: 110, elite: 120, elite2: 130, elite3: 130,
            other: 140, friend: 140, clan: 140, ally: 140, enemy: 145, titan: 150, collosus: 150, heros: 160, herosEvent: 160, marker: 200,
        };
        const TYPE_NAMES = {
            titan: 'tytan', collosus: 'kolos', heros: 'heros', herosEvent: 'heros eventowy', elite3: 'elita III', elite2: 'elita II', elite: 'elita',
            mob: 'potwór', npc: 'NPC', gw: 'przejście', item: 'przedmiot', resp: 'resp herosa', respEvent: 'resp (event)',
        };
        const GW_ICONS = ['mas/exit-ith.gif', 'mas/exit-ith1.gif', 'mas/exit.gif', 'mas/drzwi.gif', 'obj/drzwi.gif', 'mas/exit-h64c.gif'];
        const REL = { NONE: 1, FRIEND: 2, ENEMY: 3, CLAN: 4, CLAN_ALLY: 5, CLAN_ENEMY: 6, FRACTION_ALLY: 7, FRACTION_ENEMY: 8 };

        let town = null;
        const tpls = {};
        const icons = {};
        const npcs = {};
        const others = {};
        let gws = [];
        let spawns = [];

        let enabled = false;
        let isOpen = false;
        let el = null;
        let tip = null;
        let scale = 0;          // px na 1 kratkę
        let mapW = 0;
        let mapH = 0;
        let renderQueued = false;
        let tickTimer = null;
        let watchTimer = null;
        let hiddenGameWin = null;
        let search = { text: '', coords: null };
        let hoverTile = null;

        // ---------- zbieranie danych ----------
        function engineMapFile() {
            try {
                const d = PAGE.Engine?.map?.d;
                return d?.file || d?.img || '';
            } catch (_) {
                return '';
            }
        }

        // zmiana mapy wykryta po silniku (gdy pakiet nie przyszedł / był inny)
        let lastEngineMapId = null;
        function checkEngineMap() {
            let d;
            try { d = PAGE.Engine?.map?.d; } catch (_) { return; }
            if (!d || d.id === undefined) return;
            const id = String(d.id);
            if (lastEngineMapId === null) {
                lastEngineMapId = id;
                return;
            }
            if (id === lastEngineMapId) return;
            lastEngineMapId = id;
            if (town && String(town.id) === id) return;
            resetTown({ id: d.id, name: d.name, file: d.file || d.img || '', x: d.x || PAGE.Engine.map.size?.x, y: d.y || PAGE.Engine.map.size?.y, visibility: d.visibility, backgroundOffset: d.backgroundOffset });
            setTimeout(() => {
                bootstrapFromEngine();
                queueRender();
            }, 400);
        }

        function resetTown(t) {
            if (t.id !== undefined) lastEngineMapId = String(t.id);
            town = {
                id: t.id,
                name: t.name || '',
                file: t.file || '',
                w: Number(t.x) || 0,
                h: Number(t.y) || 0,
                offset: t.backgroundOffset || null,
                visibility: Number(t.visibility) || 0,
            };
            for (const k in npcs) delete npcs[k];
            for (const k in others) delete others[k];
            gws = [];
            spawns = [];
            if (isOpen) buildMap();
        }

        function npcLevel(tpl, n) {
            if (tpl && tpl.elasticLevelFactor !== undefined) {
                return Math.max(1, Math.min(300, net.heroLvl() + Number(tpl.elasticLevelFactor)));
            }
            return Number(tpl?.level ?? n.lvl ?? 0);
        }

        function assembleNpc(n) {
            const tpl = tpls[n.tpl] || null;
            const out = { id: String(n.id) };
            const set = (k, v) => { if (v !== undefined && v !== null) out[k] = v; };
            set('x', n.x);
            set('y', n.y);
            set('nick', n.nick ?? tpl?.nick);
            set('type', tpl?.type ?? n.type);
            set('wt', tpl?.warrior_type ?? n.wt);
            if (tpl || n.lvl !== undefined) out.lvl = npcLevel(tpl, n);
            set('grp', n.group ?? n.grp);
            let icon = '';
            if (n.icon && typeof n.icon === 'object') icon = n.icon.special ?? icons[n.icon.id]?.icon ?? '';
            else if (typeof n.icon === 'string') icon = n.icon;
            else if (tpl?.icon) icon = tpl.icon;
            if (icon) out.icon = icon;
            set('quest', n.hasOnetimeQuest || n.hasDailyQuest || undefined);
            if (tpl?.isIconInvisible || n.isIconInvisible) out.invisible = true;
            if (tpl?.isHeroFromEvent || n.isHeroFromEvent) out.event = true;
            return out;
        }

        net.onAny((data) => {
            let changed = false;
            if (data.town && typeof data.town === 'object') {
                const t = data.town;
                const newMap = t.file !== undefined ||
                    (t.id !== undefined && town && String(t.id) !== String(town.id)) ||
                    (t.name !== undefined && town && t.name !== town.name) ||
                    (t.x !== undefined && t.y !== undefined && (!town || Number(t.x) !== town.w || Number(t.y) !== town.h));
                if (newMap) {
                    resetTown(Object.assign({}, t, { file: t.file ?? engineMapFile() }));
                } else if (town && data.town.visibility !== undefined) {
                    town.visibility = Number(data.town.visibility) || 0;
                }
                changed = true;
            }
            if (Array.isArray(data.icons)) for (const i of data.icons) icons[i.id] = i;
            if (Array.isArray(data.npc_tpls)) for (const t of data.npc_tpls) tpls[t.id] = t;
            if (Array.isArray(data.npcs)) {
                for (const n of data.npcs) {
                    const a = assembleNpc(n);
                    npcs[a.id] = Object.assign(npcs[a.id] || {}, a);
                }
                changed = true;
            } else if (data.npcs && typeof data.npcs === 'object') {
                for (const id in data.npcs) {
                    const n = Object.assign({ id }, data.npcs[id]);
                    if (n.del) delete npcs[id];
                    else npcs[id] = Object.assign(npcs[id] || {}, assembleNpc(n));
                }
                changed = true;
            }
            if (Array.isArray(data.npcs_del)) {
                for (const n of data.npcs_del) delete npcs[String(n.id)];
                changed = true;
            }
            if (data.other && typeof data.other === 'object') {
                for (const id in data.other) {
                    const o = data.other[id];
                    if (!o) continue;
                    if (o.del) delete others[id];
                    else if (others[id]) Object.assign(others[id], o);
                    else if (o.nick !== undefined) others[id] = Object.assign({ id }, o);
                }
                changed = true;
            }
            if (Array.isArray(data.gw2) && data.townname) {
                gws = [];
                const g = data.gw2;
                for (let i = 0; i + 2 < g.length; i += 5) {
                    let name = data.townname[g[i]] || 'Przejście';
                    if (Number(g[i + 3]) === 2) name += ' (wymaga klucza)';
                    if (g[i + 4]) {
                        const v = parseInt(g[i + 4], 10);
                        const min = v & 65535;
                        const max = (v >> 16) & 65535;
                        name += ` (${min ? `od ${min}` : ''}${max && max < 1000 ? ` do ${max}` : ''} lvl)`;
                    }
                    gws.push({ id: `gw-${i}`, x: Number(g[i + 1]), y: Number(g[i + 2]), nick: name, kind: 'gw' });
                }
                gws = mergeGateways(gws);
                changed = true;
            }
            const hh = data.handheld_minimap;
            if (hh && hh.hero_localizations) {
                lastHeroLoc = hh.hero_localizations;
                spawns = parseSpawns(hh.hero_localizations);
                changed = true;
            }
            if (changed) queueRender();
        });

        // respy herosów – gra podaje je w różnych postaciach (tablica/obiekt, [x,y] albo {x,y}),
        // zwykłe herosy i eventowe bywają w innym formacie, więc czytamy wszystko, co wygląda na pozycję
        let lastHeroLoc = null;
        function parseSpawns(raw) {
            const out = [];
            const seen = new Set();
            const entries = Array.isArray(raw) ? raw : Object.values(raw || {});
            const toXY = (p) => {
                if (Array.isArray(p) && p.length >= 2) return [Number(p[0]), Number(p[1])];
                if (p && typeof p === 'object' && p.x !== undefined && p.y !== undefined) return [Number(p.x), Number(p.y)];
                return null;
            };
            for (const t of entries) {
                if (!t || typeof t !== 'object') continue;
                const event = /event/i.test(String(t.kind ?? t.type ?? ''));
                const name = t.name || t.nick || 'herosa';
                const lvl = t.lvl ?? t.level;
                let list = t.pos ?? t.positions ?? t.localizations ?? t.coords ?? t.spawns;
                if (list && !Array.isArray(list)) list = Object.values(list);
                if (!list) list = [t];
                // pojedyncza para [x,y] zamiast listy par
                if (list.length === 2 && list.every((v) => typeof v === 'number' || /^\d+$/.test(String(v)))) list = [list];
                for (const p of list) {
                    const xy = toXY(p);
                    if (!xy || !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) continue;
                    const key = `${xy[0]},${xy[1]}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push({ x: xy[0], y: xy[1], nick: `Resp ${event ? 'eventowy ' : ''}${name}${lvl ? ` (${lvl} lvl)` : ''}`, kind: event ? 'respEvent' : 'resp' });
                }
            }
            return out;
        }

        // przejścia szerokie na 2+ kratki gra podaje osobno – łączymy w jedno
        function mergeGateways(list) {
            const groups = [];
            for (const g of list) {
                const grp = groups.find((x) => x.nick === g.nick && x.items.some((i) => Math.abs(i.x - g.x) <= 1 && Math.abs(i.y - g.y) <= 1));
                if (grp) grp.items.push(g);
                else groups.push({ nick: g.nick, items: [g] });
            }
            return groups.map((grp, i) => {
                const xs = grp.items.map((t) => t.x);
                const ys = grp.items.map((t) => t.y);
                return {
                    id: `gw-${i}`, kind: 'gw', nick: grp.nick,
                    x: xs.reduce((a, b) => a + b, 0) / xs.length,
                    y: ys.reduce((a, b) => a + b, 0) / ys.length,
                    tx: grp.items[0].x, ty: grp.items[0].y,
                    spanX: Math.max(...xs) - Math.min(...xs) + 1,
                    spanY: Math.max(...ys) - Math.min(...ys) + 1,
                };
            });
        }

        // gdy panel włączono po starcie gry – próbujemy pobrać stan z silnika
        function bootstrapFromEngine() {
            const E = PAGE.Engine;
            if (!E) return;
            try {
                const d = E.map?.d;
                if (d && (!town || !town.w)) {
                    resetTown({ id: d.id, name: d.name, file: d.file || d.img || '', x: d.x || E.map.size?.x, y: d.y || E.map.size?.y, visibility: d.visibility, backgroundOffset: d.backgroundOffset });
                }
            } catch (_) {}
            try {
                if (!Object.keys(npcs).length && typeof E.npcs?.check === 'function') {
                    const list = E.npcs.check() || {};
                    for (const id in list) {
                        const d = list[id]?.d || list[id];
                        if (d && d.x !== undefined) npcs[String(d.id ?? id)] = { id: String(d.id ?? id), x: d.x, y: d.y, nick: d.nick, type: d.type, wt: d.wt, lvl: d.lvl, grp: d.grp, icon: d.icon };
                    }
                }
            } catch (_) {}
            try {
                if (!Object.keys(others).length && typeof E.others?.check === 'function') {
                    const list = E.others.check() || {};
                    for (const id in list) {
                        const d = list[id]?.d || list[id];
                        if (d && d.x !== undefined) others[String(d.id ?? id)] = Object.assign({ id: String(d.id ?? id) }, d);
                    }
                }
            } catch (_) {}
        }

        let lastOthersPull = 0;
        function refreshOthersFromEngine() {
            const now = Date.now();
            if (now - lastOthersPull < 1000) return;
            lastOthersPull = now;
            try {
                const E = PAGE.Engine;
                if (typeof E?.others?.check !== 'function') return;
                const list = E.others.check() || {};
                for (const id in list) {
                    const d = list[id]?.d || list[id];
                    if (d && d.x !== undefined) others[String(d.id ?? id)] = Object.assign({ id: String(d.id ?? id) }, d);
                }
            } catch (_) {}
        }

        // ---------- klasyfikacja ----------
        function npcKind(n) {
            if (n.invisible) return null;
            const type = Number(n.type);
            const wt = Number(n.wt) || 0;
            if (type === 2 || type === 3) {
                if (wt > 99) return 'titan';
                if (wt >= 90) return 'collosus';
                if (wt > 79) return n.event ? 'herosEvent' : 'heros';
                if (wt > 29) return 'elite3';
                if (wt > 19) return 'elite2';
                if (wt > 9) return 'elite';
                return 'mob';
            }
            if (type === 0 || type === 5 || type === 6) {
                if (wt > 29 && wt < 80) return 'elite3';
                if (wt > 9 && wt < 20) return 'elite';
                if (n.icon && GW_ICONS.some((g) => String(n.icon).includes(g))) return 'gw';
                if (!n.nick || !String(n.nick).trim()) return null;   // dekoracje / obiekty bez nazwy
                return 'npc';
            }
            if (type === 7) return 'item';
            return null;
        }

        function otherKind(o) {
            switch (Number(o.relation)) {
                case REL.FRIEND: return 'friend';
                case REL.CLAN: return 'clan';
                case REL.CLAN_ALLY:
                case REL.FRACTION_ALLY: return 'ally';
                case REL.ENEMY:
                case REL.CLAN_ENEMY:
                case REL.FRACTION_ENEMY: return 'enemy';
                default: return 'other';
            }
        }

        function collectObjects() {
            const list = [];
            for (const g of gws) list.push(g);
            if (state.mmShowSpawns) for (const s of spawns) list.push(s);
            for (const id in npcs) {
                const n = npcs[id];
                if (n.x === undefined || n.y === undefined) continue;
                const kind = npcKind(n);
                if (!kind) continue;
                if (kind === 'gw' && gws.some((g) => Math.abs(g.x - n.x) <= 1.5 && Math.abs(g.y - n.y) <= 1.5)) continue;
                if (kind === 'mob' && !state.mmShowMobs) continue;
                if (kind === 'npc' && !state.mmShowNpcs) continue;
                list.push({ id: `n${id}`, x: n.x, y: n.y, nick: n.nick || '', lvl: n.lvl, grp: n.grp, kind });
            }
            if (state.mmShowOthers) {
                if (!Object.keys(others).length) refreshOthersFromEngine();
                for (const id in others) {
                    const o = others[id];
                    if (o.x === undefined || o.y === undefined) continue;
                    list.push({
                        id: `o${id}`, x: o.x, y: o.y, nick: o.nick || '', lvl: o.lvl, prof: o.prof,
                        clan: typeof o.clan === 'object' ? o.clan?.name : '', kind: otherKind(o), player: true,
                    });
                }
            }
            if (search.coords) list.push({ id: 'marker', x: search.coords[0], y: search.coords[1], nick: `Koordy ${search.coords[0]},${search.coords[1]}`, kind: 'marker' });
            return list;
        }

        function matchesSearch(obj) {
            if (!search.text || obj.kind === 'marker') return true;
            const q = search.text;
            return `${obj.nick} ${obj.clan || ''} ${TYPE_NAMES[obj.kind] || ''}`.toLowerCase().includes(q);
        }

        // ---------- DOM ----------
        function getStage() {
            return document.querySelector('.game-window-positioner') || null;
        }

        function getCanvasRect() {
            const main = document.querySelector('#GAME_CANVAS');
            if (main) {
                const r = main.getBoundingClientRect();
                if (r.width > 200 && r.height > 200) return r;
            }
            // największy canvas gry (nie mapa podręczna, nie nasza)
            let best = null;
            for (const c of document.querySelectorAll('.game-window-positioner canvas, canvas')) {
                if (c.closest('.handheld-window, .c-window, .pa-mm')) continue;
                const r = c.getBoundingClientRect();
                if (!best || r.width * r.height > best.width * best.height) best = r;
            }
            if (best && best.width > 200 && best.height > 200) return best;
            const stage = getStage();
            if (stage) {
                const r = stage.getBoundingClientRect();
                if (r.width > 200 && r.height > 200) return r;
            }
            return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        }

        function createEl() {
            if (el) return;
            el = document.createElement('div');
            el.className = 'pa-mm';
            el.innerHTML = `
              <div class="pa-mm-col">
              <div class="pa-mm-head" data-mm-drag title="Przeciągnij, aby przesunąć mapę">
                <span class="pa-mm-grip">⋮⋮</span>
                <span class="pa-mm-brand">Nowa mapa</span>
                <span class="pa-mm-name" data-mm-name></span>
              </div>
              <div class="pa-mm-map" data-mm-map>
                <div class="pa-mm-objects" data-mm-objects></div>
                <div class="pa-mm-view" data-mm-view></div>
                <div class="pa-mm-hero" data-mm-hero></div>
                <div class="pa-mm-coords" data-mm-coords></div>
                <div class="pa-mm-msg" data-mm-msg></div>
              </div>
              <div class="pa-mm-bar">
                <label>Szukaj <input type="text" data-mm-search spellcheck="false" placeholder="Szukaj: nazwa lub x,y"></label>
                <span class="pa-mm-tools">
                <span class="pa-mm-zoom">
                  <button type="button" class="pa-mm-gear" data-mm-zoom="-1" title="Zmniejsz mapę">−</button>
                  <span data-mm-zoom-val></span>
                  <button type="button" class="pa-mm-gear" data-mm-zoom="1" title="Powiększ mapę">+</button>
                </span>
                <button type="button" class="pa-mm-gear" data-mm-gear title="Ustawienia">⚙</button>
                <button type="button" class="pa-mm-gear pa-mm-close" data-mm-close title="Zamknij (Esc)">✕</button>
                </span>
              </div>
              </div>
              <div class="pa-mm-side" data-mm-side></div>`;
            document.body.appendChild(el);
            el.classList.add('pa-mm-fixed');

            tip = document.createElement('div');
            tip.className = 'pa-tip';
            document.body.appendChild(tip);

            stopGameInput(el);
            ['keydown', 'keyup', 'keypress'].forEach((type) => {
                el.querySelector('[data-mm-search]').addEventListener(type, (e) => {
                    if (e.key === 'Escape') {
                        e.target.blur();
                        return;
                    }
                    e.stopPropagation();
                });
            });
            el.querySelector('[data-mm-search]').addEventListener('input', (e) => {
                const v = e.target.value.trim();
                const m = v.match(/^(\d+)\s*[,; ]\s*(\d+)$/);
                search = m ? { text: '', coords: [Number(m[1]), Number(m[2])] } : { text: v.toLowerCase(), coords: null };
                renderObjects();
            });
            el.querySelector('[data-mm-gear]').addEventListener('click', () => setMenuOpen(true, 'minimap'));
            el.querySelector('[data-mm-close]').addEventListener('click', () => close(true));
            makeWinDraggable(el, el.querySelector('[data-mm-drag]'), (pos) => {
                state.mmPos = pos;
                saveSettings();
            });
            el.querySelectorAll('[data-mm-zoom]').forEach((btn) => btn.addEventListener('click', () => {
                const step = Number(btn.getAttribute('data-mm-zoom')) * 10;
                state.mmSize = Math.max(30, Math.min(100, (Number(state.mmSize) || 90) + step));
                saveSettings();
                buildMap();
                syncUi();
            }));
            el.querySelector('[data-mm-side]').addEventListener('click', (e) => {
                const chaseBtn = e.target.closest('[data-mm-chase]');
                if (chaseBtn) {
                    const id = chaseBtn.getAttribute('data-mm-chase');
                    if (chase && chase.id === id) stopChase('Zatrzymano pościg');
                    else startChase(id);
                    sideSig = null;
                    renderSide();
                    return;
                }
                const btn = e.target.closest('[data-mm-approach]');
                const row = e.target.closest('[data-mm-row]');
                if (btn) {
                    const [x, y] = btn.getAttribute('data-mm-approach').split(',').map(Number);
                    approach(x, y);
                } else if (row) {
                    const [x, y] = row.getAttribute('data-mm-row').split(',').map(Number);
                    search = { text: '', coords: [x, y] };
                    renderObjects();
                }
            });

            const map = el.querySelector('[data-mm-map]');
            map.addEventListener('mousemove', onHover);
            map.addEventListener('mouseleave', () => {
                hoverTile = null;
                tip.style.display = 'none';
                updateCoords();
            });
            map.addEventListener('click', (e) => {
                const t = clickTarget(e);
                if (!t) return;
                if (chase) stopChase('Pościg przerwany');
                goTo(t.x, t.y);
            });
        }

        function tileFromEvent(e) {
            if (!scale) return null;
            const r = el.querySelector('[data-mm-map]').getBoundingClientRect();
            const x = Math.floor((e.clientX - r.left) / scale);
            const y = Math.floor((e.clientY - r.top) / scale);
            if (x < 0 || y < 0 || x >= mapW || y >= mapH) return null;
            return { x, y };
        }

        function goTo(x, y) {
            try {
                if (PAGE.Engine?.hero?.autoGoTo) {
                    PAGE.Engine.hero.autoGoTo({ x, y });
                    return;
                }
                if (PAGE.hero?.searchPath) {
                    PAGE.hero.mx = x;
                    PAGE.hero.my = y;
                    PAGE.hero.searchPath(x, y);
                }
            } catch (error) {
                console.warn('[darksad-addon] Nowa mapa goTo', error);
            }
        }

        function onHover(e) {
            const t = tileFromEvent(e);
            hoverTile = t;
            updateCoords();
            if (!t) {
                tip.style.display = 'none';
                return;
            }
            const r = el.querySelector('[data-mm-map]').getBoundingClientRect();
            const px = e.clientX - r.left;
            const py = e.clientY - r.top;
            const reach = Math.max(7, dotSize() / 2 + 5);
            const hits = [];
            for (const o of collectObjects()) {
                if (!matchesSearch(o)) continue;
                const cx = (o.x + 0.5) * scale;
                const cy = (o.y + 0.5) * scale;
                const d = Math.hypot(cx - px, cy - py);
                if (d <= reach) hits.push({ o, d });
            }
            if (!hits.length) {
                tip.style.display = 'none';
                return;
            }
            hits.sort((a, b) => a.d - b.d || (LAYERS[b.o.kind] || 0) - (LAYERS[a.o.kind] || 0));
            tip.innerHTML = hits.slice(0, 6).map(({ o }) => {
                const type = o.player ? (o.clan ? `gracz · ${escapeHtmlPa(o.clan)}` : 'gracz') : (TYPE_NAMES[o.kind] || '');
                const lvl = o.lvl ? ` · ${o.lvl}${o.prof || ''} lvl` : '';
                const grp = o.grp ? ' · grupa' : '';
                return `<div><b style="color:${COLORS[o.kind] || '#fff'}">●</b> <b>${escapeHtmlPa(o.nick)}</b><br><span style="color:var(--pa-muted)">${type}${lvl}${grp} · (${Math.round(o.tx ?? o.x)},${Math.round(o.ty ?? o.y)})</span></div>`;
            }).join('<div style="height:4px"></div>');
            tip.style.display = 'block';
            const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
            const y = Math.min(window.innerHeight - tip.offsetHeight - 8, e.clientY + 14);
            tip.style.left = `${Math.max(4, x)}px`;
            tip.style.top = `${Math.max(4, y)}px`;
        }

        // kliknięcie: jeśli kursor jest przy obiekcie – idź do niego
        function clickTarget(e) {
            const t = tileFromEvent(e);
            if (!t) return null;
            const r = el.querySelector('[data-mm-map]').getBoundingClientRect();
            const px = e.clientX - r.left;
            const py = e.clientY - r.top;
            const reach = Math.max(6, dotSize() / 2 + 3);
            let best = null;
            for (const o of collectObjects()) {
                if (o.kind === 'marker' || !matchesSearch(o)) continue;
                const d = Math.hypot((o.x + 0.5) * scale - px, (o.y + 0.5) * scale - py);
                if (d <= reach && (!best || d < best.d)) best = { d, x: Math.round(o.tx ?? o.x), y: Math.round(o.ty ?? o.y) };
            }
            return best ? { x: best.x, y: best.y } : t;
        }

        function heroPos() {
            const h = PAGE.Engine?.hero;
            if (h) {
                return {
                    x: h.d?.x ?? h.x, y: h.d?.y ?? h.y,
                    rx: Number.isFinite(h.rx) ? h.rx : h.d?.x, ry: Number.isFinite(h.ry) ? h.ry : h.d?.y,
                };
            }
            const o = PAGE.hero;
            return o ? { x: o.x, y: o.y, rx: o.x, ry: o.y } : null;
        }

        function updateCoords() {
            if (!el) return;
            const c = el.querySelector('[data-mm-coords]');
            const h = heroPos();
            if (hoverTile) c.textContent = `(${hoverTile.x},${hoverTile.y})`;
            else c.textContent = h ? `(${h.x},${h.y})` : '';
        }

        function mapOffsetFromEngine() {
            try {
                const m = PAGE.Engine?.map;
                const o = m?.d?.backgroundOffset || m?.backgroundOffset;
                if (o && (o.x !== undefined || o.y !== undefined)) return { x: Number(o.x) || 0, y: Number(o.y) || 0 };
            } catch (_) {}
            return null;
        }

        function mapImageUrl() {
            try {
                const img = PAGE.Engine?.map?.img;
                if (img && img.src && town && (!town.file || img.src.includes(town.file))) return img.src;
            } catch (_) {}
            if (!town || !town.file) return '';
            if (/^https?:/.test(town.file)) return town.file;
            const cfg = PAGE.CFG || {};
            const base = cfg.a_mpath || cfg.mpath || '/obrazki/miasta/';
            return base + town.file;
        }

        function buildMap() {
            if (!el) return;
            if (!town || !town.w) bootstrapFromEngine();
            const msg = el.querySelector('[data-mm-msg]');
            const map = el.querySelector('[data-mm-map]');
            if (!town || !town.w || !town.h) {
                msg.textContent = 'Brak danych mapy – przejdź na inną mapę albo odśwież grę (F5).';
                msg.style.display = 'block';
                map.style.width = '300px';
                map.style.height = '120px';
                scale = 0;
                return;
            }
            msg.style.display = 'none';
            mapW = town.w;
            mapH = town.h;
            // rozmiar zależy tylko od okna przeglądarki i ustawienia (100% = cała wysokość ekranu)
            const pct = Math.max(30, Math.min(100, Number(state.mmSize) || 90)) / 100;
            const availW = Math.max(200, window.innerWidth - 300);
            const availH = Math.max(150, window.innerHeight - 130);
            const fit = Math.min(availW / mapW, availH / mapH) * pct;
            let w = Math.max(120, Math.floor(mapW * fit));
            // wąska (wysoka) mapa – powiększamy ją do szerokości paska, jeśli zmieści się na ekranie
            const MIN_W = 430;
            if (w < MIN_W) {
                const grow = Math.min(MIN_W / mapW, availH / mapH, availW / mapW);
                w = Math.max(w, Math.floor(mapW * grow));
            }
            scale = w / mapW;
            w = Math.round(scale * mapW);
            const h = Math.round(scale * mapH);
            map.style.width = `${w}px`;
            const col = el.querySelector('.pa-mm-col');
            if (col) col.style.width = `${w + 14}px`;   // okno = szerokość mapy + ramka
            map.style.height = `${h}px`;

            const url = mapImageUrl();
            map.style.backgroundImage = url ? `url("${url}")` : '';
            // obraz mapy bywa większy niż sama mapa (margines + backgroundOffset) – nie rozciągamy go
            map.style.backgroundSize = '100% 100%';
            map.style.backgroundPosition = '0 0';
            if (url) {
                const img = new Image();
                const buildScale = scale;
                img.onload = () => {
                    if (scale !== buildScale) return;
                    const k = scale / 32;
                    const tilesW = img.naturalWidth / 32;
                    const tilesH = img.naturalHeight / 32;
                    let off = town.offset || mapOffsetFromEngine();
                    if (!off && (tilesW > mapW + 0.5 || tilesH > mapH + 0.5)) {
                        off = { x: Math.max(0, (tilesW - mapW) / 2), y: Math.max(0, (tilesH - mapH) / 2) };
                    }
                    if (!off && Math.abs(tilesW - mapW) < 0.5 && Math.abs(tilesH - mapH) < 0.5) return;
                    off = off || { x: 0, y: 0 };
                    map.style.backgroundSize = `${img.naturalWidth * k}px ${img.naturalHeight * k}px`;
                    map.style.backgroundPosition = `${-off.x * 32 * k}px ${-off.y * 32 * k}px`;
                };
                img.src = url;
            }
            clearObjects();
            el.querySelector('[data-mm-zoom-val]').textContent = `${Math.round(pct * 100)}%`;
            el.querySelector('[data-mm-name]').textContent = town.name || '';
            el.style.opacity = String(state.mmOpacity / 100);
            sideSig = null;
            renderObjects();
            position();
            tick();
        }

        function position() {
            if (!el) return;
            const col = el.querySelector('.pa-mm-col');
            const w = col ? col.offsetWidth : el.offsetWidth;
            const h = col ? col.offsetHeight : el.offsetHeight;
            let left;
            let top;
            if (state.mmPos) {
                left = state.mmPos.left;
                top = state.mmPos.top;
            } else {
                // domyślnie: mapa na środku, lekko w lewo – miejsce na listę po prawej
                left = (window.innerWidth - w) / 2 - 120;
                top = (window.innerHeight - h) / 2;
            }
            left = Math.max(4, Math.min(window.innerWidth - 80, left));
            top = Math.max(4, Math.min(window.innerHeight - 60, top));
            el.style.left = `${Math.round(left)}px`;
            el.style.top = `${Math.round(top)}px`;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }

        function resetPosition() {
            state.mmPos = null;
            saveSettings();
            position();
        }

        function dotSize() {
            // na małych mapach kratka jest duża – kropki nie rosną ponad 14 px
            return Math.max(7, Math.min(14, Math.ceil(scale * 1.15)));
        }

        const IMPORTANT = { titan: 1, collosus: 2, herosEvent: 3, heros: 4, elite3: 5, elite2: 6 };
        const PULSE = { titan: 1, collosus: 1, heros: 1, herosEvent: 1, elite3: 1 };
        let sideSig = null;

        function approach(x, y) {
            const h = heroPos();
            let tx = x;
            let ty = y;
            if (h) {
                const dx = Math.sign(h.x - x);
                const dy = Math.sign(h.y - y);
                tx = x + (dx || (dy ? 0 : 1));
                ty = y + dy;
            } else {
                tx = x + 1;
            }
            tx = Math.max(0, Math.min(mapW - 1, tx));
            ty = Math.max(0, Math.min(mapH - 1, ty));
            goTo(tx, ty);
            showToast(`Podchodzę do (${x},${y})`);
        }

        // ---------- gracze / pościg ----------
        function getPlayers() {
            if (!Object.keys(others).length) refreshOthersFromEngine();
            const h = heroPos();
            const out = [];
            for (const id in others) {
                const o = others[id];
                if (o.x === undefined || o.y === undefined) continue;
                const kind = otherKind(o);
                const dist = h ? Math.hypot(o.x - h.x, o.y - h.y) : 999;
                out.push({ id: String(id), nick: o.nick || '?', x: Number(o.x), y: Number(o.y), lvl: o.lvl, prof: o.prof || '', kind, dist, hostile: kind === 'enemy' || kind === 'other' });
            }
            return out.sort((a, b) => a.dist - b.dist);
        }

        function playerPos(id) {
            const o = others[id];
            if (o && o.x !== undefined) return { x: Number(o.x), y: Number(o.y), nick: o.nick };
            try {
                const d = PAGE.Engine?.others?.getById?.(id)?.d;
                if (d && d.x !== undefined) return { x: Number(d.x), y: Number(d.y), nick: d.nick };
            } catch (_) {}
            return null;
        }

        let chase = null;
        let chaseTimer = null;

        function startChase(id) {
            const p = playerPos(id);
            if (!p) {
                showToast('Nie widzę tego gracza na mapie');
                return;
            }
            chase = { id, nick: p.nick || '?', target: '', lastCmd: 0, lastAttack: 0, attacks: 0, mapId: town?.id };
            clearInterval(chaseTimer);
            chaseTimer = setInterval(chaseStep, 50);
            chaseStep();
            showToast(state.mmChaseAttack ? `Gonię i atakuję: ${chase.nick}` : `Gonię: ${chase.nick}`);
        }

        function stopChase(msg) {
            if (!chase) return;
            chase = null;
            clearInterval(chaseTimer);
            chaseTimer = null;
            if (msg) showToast(msg);
            sideSig = null;
            if (isOpen) renderSide();
        }

        function chaseStep() {
            if (!chase) return;
            if (town && chase.mapId !== undefined && String(town.id) !== String(chase.mapId)) {
                stopChase('Pościg przerwany – zmiana mapy');
                return;
            }
            const p = playerPos(chase.id);
            if (!p) {
                stopChase(`${chase.nick} zniknął z mapy – koniec pościgu`);
                return;
            }
            const h = heroPos();
            if (!h) return;
            // już stoimy obok – atakujemy (albo czekamy)
            if (Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)) <= 1) {
                chase.target = '';
                if (state.mmChaseAttack) {
                    const t = Date.now();
                    // losowy odstęp 1–1,5 s między próbami ataku
                    if (t - chase.lastAttack >= (chase.attackDelay || 0)) {
                        chase.lastAttack = t;
                        chase.attackDelay = 1000 + Math.random() * 500;
                        net.send(`fight&a=attack&id=${chase.id}`);
                    }
                }
                return;
            }
            const key = `${p.x},${p.y}`;
            const now = Date.now();
            if (key === chase.target && now - chase.lastCmd < 1500) return;
            chase.target = key;
            chase.lastCmd = now;
            const dx = Math.sign(h.x - p.x);
            const dy = Math.sign(h.y - p.y);
            const tx = Math.max(0, Math.min((mapW || 999) - 1, p.x + (dx || (dy ? 0 : 1))));
            const ty = Math.max(0, Math.min((mapH || 999) - 1, p.y + dy));
            goTo(tx, ty);
        }

        // walka się zaczęła – koniec pościgu
        net.on('f', (f) => {
            if (chase && f && String(f.init) === '1' && !f.close) stopChase(`Walka z ${chase.nick}!`);
        });

        function sidePlayerTitle(p) {
            return `${p.nick}${p.lvl ? ` (${p.lvl}${p.prof})` : ''} · ${p.kind === 'enemy' ? 'wróg' : 'gracz'} · ${Math.round(p.dist)} kratek · (${p.x},${p.y})\nKliknij, aby zaznaczyć na mapie`;
        }

        // aktualizuje tylko odległości / współrzędne w istniejących wierszach
        function updateSidePositions(side, list, players) {
            const rows = side.querySelectorAll('.pa-mm-row');
            if (rows.length !== list.length + players.length) {
                sideSig = null;
                return;
            }
            list.forEach((o, i) => {
                const row = rows[i];
                const pos = `${o.x},${o.y}`;
                if (row.getAttribute('data-mm-row') === pos) return;
                row.setAttribute('data-mm-row', pos);
                const btn = row.querySelector('[data-mm-approach]');
                if (btn) btn.setAttribute('data-mm-approach', pos);
                const small = row.querySelector('.pa-mm-row-text small');
                if (small) small.textContent = `${TYPE_NAMES[o.kind]}${o.lvl ? ` · ${o.lvl} lvl` : ''}${o.grp ? ' · grp' : ''} · (${o.x},${o.y})`;
            });
            players.forEach((p, i) => {
                const row = rows[list.length + i];
                const pos = `${p.x},${p.y}`;
                const dist = String(Math.round(p.dist));
                if (row.getAttribute('data-mm-row') === pos && row.dataset.mmDist === dist) return;
                row.setAttribute('data-mm-row', pos);
                row.dataset.mmDist = dist;
                row.title = sidePlayerTitle(p);
                const d = row.querySelector('[data-mm-dist]');
                if (d) d.textContent = `${dist} kr.`;
                const xy = row.querySelector('.pa-mm-xy');
                if (xy) xy.textContent = ` · (${p.x},${p.y})`;
            });
        }

        function renderSide() {
            const side = el.querySelector('[data-mm-side]');
            const players = getPlayers().filter((p) => p.hostile)
                .sort((a, b) => String(a.nick).localeCompare(String(b.nick), 'pl', { sensitivity: 'base' }));
            const list = [];
            for (const id in npcs) {
                const n = npcs[id];
                if (n.x === undefined) continue;
                const kind = npcKind(n);
                if (kind && IMPORTANT[kind]) list.push({ kind, nick: n.nick || '?', lvl: n.lvl, x: n.x, y: n.y, grp: n.grp });
            }
            list.sort((a, b) => IMPORTANT[a.kind] - IMPORTANT[b.kind] || (b.lvl || 0) - (a.lvl || 0));
            // podpis bez pozycji – przy samym ruchu nie przebudowujemy listy (inaczej przycisk pod kursorem mruga)
            const sig = list.map((o) => `${o.kind}${o.nick}${o.lvl}`).join('|') + '#' +
                players.map((p) => `${p.id}:${p.nick}`).join('|') + '#' + (chase ? chase.id : '') + '#' + state.mmChaseAttack;
            if (sig === sideSig) {
                updateSidePositions(side, list, players);
                return;
            }
            sideSig = sig;
            side.classList.toggle('pa-visible', list.length > 0 || players.length > 0);
            const rowsCount = list.length + players.length;
            side.classList.toggle('pa-mm-dense', rowsCount > 8);
            side.classList.toggle('pa-mm-xdense', rowsCount > 16);
            side.style.height = `${el.querySelector('.pa-mm-col').offsetHeight}px`;
            const playersHtml = players.length ? `<div class="pa-mm-side-title">Gracze w pobliżu (${players.length})</div>` + players.map((p) => {
                const on = chase && chase.id === p.id;
                return `
              <div class="pa-mm-row${on ? ' pa-mm-chasing' : ''}" data-mm-row="${p.x},${p.y}" data-mm-dist="${Math.round(p.dist)}" title="${escapeHtmlPa(p.nick)}${p.lvl ? ` (${p.lvl}${p.prof})` : ''} · ${p.kind === 'enemy' ? 'wróg' : 'gracz'} · ${Math.round(p.dist)} kratek · (${p.x},${p.y})&#10;Kliknij, aby zaznaczyć na mapie">
                <span class="pa-mm-row-dot" style="background:${COLORS[p.kind]}"></span>
                <span class="pa-mm-row-text"><b>${escapeHtmlPa(p.nick)}${p.lvl ? ` <em>${p.lvl}${p.prof}</em>` : ''}</b><small><span class="pa-mm-kind">${p.kind === 'enemy' ? 'wróg · ' : 'gracz · '}</span><span data-mm-dist>${Math.round(p.dist)} kr.</span><span class="pa-mm-xy"> · (${p.x},${p.y})</span></small></span>
                <button type="button" class="pa-mm-go${on ? ' pa-mm-stop' : ''}" data-mm-chase="${p.id}" title="${state.mmChaseAttack ? 'Biegnij za graczem i zaatakuj go' : 'Biegnij za graczem'}">${on ? 'Stop' : 'Goń'}</button>
              </div>`;
            }).join('') : '';
            side.innerHTML = (list.length ? `<div class="pa-mm-side-title">Wykryte (${list.length})</div>` : '') + list.map((o) => `
              <div class="pa-mm-row" data-mm-row="${o.x},${o.y}" title="Kliknij, aby zaznaczyć na mapie">
                <span class="pa-mm-row-dot" style="background:${COLORS[o.kind]}"></span>
                <span class="pa-mm-row-text"><b>${escapeHtmlPa(o.nick)}</b><small>${TYPE_NAMES[o.kind]}${o.lvl ? ` · ${o.lvl} lvl` : ''}${o.grp ? ' · grp' : ''} · (${o.x},${o.y})</small></span>
                <button type="button" class="pa-mm-go" data-mm-approach="${o.x},${o.y}">Podejdź</button>
              </div>`).join('') + playersHtml;
        }

        const objEls = new Map();

        function renderObjects() {
            if (!el || !isOpen || !scale) return;
            const layer = el.querySelector('[data-mm-objects]');
            const s = dotSize();
            const off = (s - scale) / 2;
            const seen = new Set();
            for (const o of collectObjects()) {
                if (!matchesSearch(o)) continue;
                const key = o.id || `${o.kind}-${o.x}-${o.y}`;
                seen.add(key);
                let d = objEls.get(key);
                const cls = `pa-mm-obj pa-mm-${o.kind}${o.player ? ' pa-mm-player' : ''}${PULSE[o.kind] ? ' pa-mm-pulse' : ''}`;
                let fresh = false;
                if (!d) {
                    d = document.createElement('div');
                    objEls.set(key, d);
                    layer.appendChild(d);
                    fresh = true;
                }
                if (!d.className.startsWith(cls)) d.className = cls + (d.classList.contains('pa-mm-anim') ? ' pa-mm-anim' : '') + (d.classList.contains('pa-mm-near') ? ' pa-mm-near' : '');
                d.dataset.x = o.x;
                d.dataset.y = o.y;
                const big = PULSE[o.kind] ? Math.round(s * 1.5) : s;
                const w = o.spanX ? Math.max(s, o.spanX * scale) : big;
                const hgt = o.spanY ? Math.max(s, o.spanY * scale) : big;
                d.style.width = `${w}px`;
                d.style.height = `${hgt}px`;
                d.style.marginLeft = `${(s - w) / 2}px`;
                d.style.marginTop = `${(s - hgt) / 2}px`;
                d.style.background = COLORS[o.kind] || '#fff';
                d.style.color = COLORS[o.kind] || '#fff';
                d.style.zIndex = String(LAYERS[o.kind] || 100);
                d.style.transform = `translate(${(o.x * scale - off).toFixed(1)}px, ${(o.y * scale - off).toFixed(1)}px)`;
                // płynny ruch dopiero po pierwszym ustawieniu pozycji
                if (fresh) requestAnimationFrame(() => d.classList.add('pa-mm-anim'));
                else if (!d.classList.contains('pa-mm-anim')) d.classList.add('pa-mm-anim');
            }
            for (const [key, d] of objEls) {
                if (!seen.has(key)) {
                    d.remove();
                    objEls.delete(key);
                }
            }
            renderSide();
        }

        function clearObjects() {
            for (const d of objEls.values()) d.remove();
            objEls.clear();
        }

        function queueRender() {
            if (!isOpen || renderQueued) return;
            renderQueued = true;
            requestAnimationFrame(() => {
                renderQueued = false;
                renderObjects();
            });
        }

        // respy zwykłych herosów: gdy raz podejdziemy w zasięg wykrywania, resp zostaje podświetlony
        // (zapamiętane na sesję, osobno dla każdej mapy)
        const checkedSpawns = new Set();
        function highlightNearSpawns(hx, hy) {
            const r = Math.max(1, Number(state.mmSpawnRange) || 10);
            const mapKey = town?.id ?? '';
            for (const d of el.querySelectorAll('.pa-mm-resp')) {
                const x = Number(d.dataset.x);
                const y = Number(d.dataset.y);
                const key = `${mapKey}:${x},${y}`;
                if (!checkedSpawns.has(key) && Math.hypot(x - hx, y - hy) <= r) checkedSpawns.add(key);
                const on = checkedSpawns.has(key);
                if (d.classList.contains('pa-mm-near') !== on) d.classList.toggle('pa-mm-near', on);
            }
        }

        function tick() {
            checkEngineMap();
            if (!el || !isOpen || !scale) return;
            const h = heroPos();
            const hero = el.querySelector('[data-mm-hero]');
            const view = el.querySelector('[data-mm-view]');
            if (!h || h.x === undefined) {
                hero.style.display = 'none';
                view.style.display = 'none';
                return;
            }
            const s = dotSize();
            const off = (s - scale) / 2;
            hero.style.display = 'block';
            hero.style.width = `${s + 1}px`;
            hero.style.height = `${s + 1}px`;
            hero.style.transform = `translate(${(h.rx * scale - off).toFixed(2)}px, ${(h.ry * scale - off).toFixed(2)}px)`;

            // zasięg widzenia postaci (jak w miniMap+): kwadrat (2v+1) kratek wyśrodkowany na postaci
            let v = Number(town?.visibility) || 0;
            if (!v) {
                try { v = Number(PAGE.Engine?.map?.d?.visibility) || 0; } catch (_) {}
            }
            if (!v) v = 16;
            const size = (2 * v + 1) * scale;
            const cx = (h.rx + 0.5) * scale;
            const cy = (h.ry + 0.5) * scale;
            view.style.display = 'block';
            view.style.width = `${size}px`;
            view.style.height = `${size}px`;
            view.style.transform = `translate(${(cx - size / 2).toFixed(2)}px, ${(cy - size / 2).toFixed(2)}px)`;
            highlightNearSpawns(Math.round(h.x ?? h.rx), Math.round(h.y ?? h.ry));
            if (!hoverTile) updateCoords();
        }

        // ---------- okno mapy podręcznej z gry ----------
        function findGameMiniMap() {
            const direct = document.querySelector('.c-window.handheld-window');
            if (direct) return direct;
            for (const w of document.querySelectorAll('.c-window, .border-window')) {
                if (w.closest('.pa-mm') || w.closest(`#${ADDON_ID}-modal`)) continue;
                const cls = String(w.className || '');
                const title = w.querySelector('.header-label .text')?.textContent || '';
                if (/handheld|mini-?map/i.test(cls) || /podr[eę]czna mapa|mapa podr[eę]czna/i.test(title)) return w;
            }
            return null;
        }

        // okno gry jest ukrywane przez CSS (visibility) – „otwarte” = podłączone i nie display:none
        function isShown(w) {
            if (!w || !w.isConnected) return false;
            return w.style.display !== 'none' && getComputedStyle(w).display !== 'none';
        }

        let suppressUntil = 0;

        function watchGame() {
            checkEngineMap();
            const g = findGameMiniMap();
            const shown = isShown(g);
            if (shown && g !== hiddenGameWin && Date.now() < suppressUntil) {
                // okno gry otworzyło się tuż po zamknięciu naszej mapy (ten sam klawisz) – zamknij je
                g.querySelector('.close-button-corner-decor .close-button, .close-button')?.click();
                return;
            }
            if (shown && g !== hiddenGameWin) {
                hiddenGameWin = g;
                if (!isOpen) open();
            } else if (hiddenGameWin && !isShown(hiddenGameWin)) {
                hiddenGameWin = null;
                if (isOpen) close(false);
            }
        }

        function closeGameWindow() {
            const g = hiddenGameWin;
            hiddenGameWin = null;
            if (!g || !isShown(g)) return;
            const btn = g.querySelector('.close-button-corner-decor .close-button, .close-button');
            if (btn) btn.click();
        }

        // ---------- otwieranie ----------
        function open() {
            createEl();
            isOpen = true;
            el.classList.add('pa-visible');
            buildMap();
            cancelAnimationFrame(tickTimer);
            const loop = () => {
                if (!isOpen) return;
                tick();
                tickTimer = requestAnimationFrame(loop);
            };
            tickTimer = requestAnimationFrame(loop);
        }

        function close(alsoGame = true) {
            isOpen = false;
            cancelAnimationFrame(tickTimer);
            if (el) el.classList.remove('pa-visible');
            if (tip) tip.style.display = 'none';
            if (alsoGame) closeGameWindow();
        }

        function toggle(force) {
            if (!enabled) return;
            const next = force === undefined ? !isOpen : force;
            if (next) open();
            else close(true);
        }

        function onKey(e) {
            if (!enabled) return;
            const t = e.target;
            if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
            if (e.key === 'Escape' && isOpen) {
                close(true);
                return;
            }
            if (state.mmHotkey && !e.ctrlKey && !e.altKey && !e.metaKey && String(e.key).toLowerCase() === state.mmHotkey) {
                if (e.repeat) return;
                const wasOpen = isOpen;
                toggle();
                // ten sam klawisz może od razu otworzyć okno gry – blokuj tylko po zamknięciu klawiszem
                if (wasOpen && !isOpen) suppressUntil = Date.now() + 400;
            }
        }

        // kliknięcie myszą (np. przycisk mapy w grze) zawsze ma działać od razu
        function onPointerDown() {
            suppressUntil = 0;
        }

        function setEnabled(on) {
            enabled = on;
            clearInterval(watchTimer);
            document.documentElement.classList.toggle('pa-mm-replace', on);
            if (on) {
                watchTimer = setInterval(watchGame, 50);
                window.addEventListener('resize', onResize);
            } else {
                close(true);
                stopChase();
                hiddenGameWin = null;
                objEls.clear();
                window.removeEventListener('resize', onResize);
                el?.remove();
                tip?.remove();
                el = null;
                tip = null;
            }
        }

        function onResize() {
            if (isOpen) buildMap();
        }

        function refresh() {
            if (isOpen) buildMap();
        }

        function init() {
            document.addEventListener('keydown', onKey);
            document.addEventListener('pointerdown', onPointerDown, true);
            if (state.mmEnabled) setEnabled(true);
            try {
                PAGE.paMiniMapDebug = () => {
                    const g = findGameMiniMap();
                    const wins = [...document.querySelectorAll('.c-window, .border-window')].filter(isShown)
                        .map((w) => ({ cls: String(w.className), title: w.querySelector('.header-label .text')?.textContent?.trim() }));
                    const info = {
                        town, npcs: Object.keys(npcs).length, others: Object.keys(others).length, gws: gws.length,
                        spawns: spawns.length, heroLocRaw: lastHeroLoc, mapImage: mapImageUrl(), gameMiniMap: g ? String(g.className) : null, visibleWindows: wins,
                    };
                    console.log('[darksad-addon] Nowa mapa', info);
                    return info;
                };
            } catch (_) {}
        }

        return { init, setEnabled, toggle, refresh, getPlayers, stopChase, resetPosition };
    })();


    function init() {
        try {
            injectStyles();
            applyTheme();

            const root = createRoot();

            bindEvents(root);
            makeNotifierDraggable(root);
            waitForHugeChatReady(root);
            observeTimersWindow();
            observeNotificationsWindow();
            observeChatLinks();
            initTitanHelper();
            berserk.init();
            builds.init();
            whoResize.init();
            miniMap.init();
            syncUi(root);

            // motyw gry ładuje się chwilę po starcie – dopasuj kolor jeszcze raz
            setTimeout(applyTheme, 3000);
            setTimeout(applyTheme, 10000);

            if (state.timersCollectorEnabled) {
                setTimeout(scheduleTimersRender, 500);
                setTimeout(scheduleTimersRender, 1500);
                setTimeout(scheduleTimersRender, 3000);
            }
            if (state.pilnowaczEnabled) {
                setTimeout(startPilnowacz, 500);
            }
            console.log(`[darksad-addon] Panel dodatków v${PANEL_VERSION} załadowany`);
        } catch (error) {
            console.error('[darksad-addon] Błąd startu dodatku:', error);
        }
    }

    // ustawienia i podsłuch serwera startują od razu (loader działa na document-start),
    // żeby złapać pakiety INIT z zestawami i ustawieniami berserka
    loadSettings();
    net.start();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
