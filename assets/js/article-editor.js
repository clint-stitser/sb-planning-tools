/* ═══════════════════════════════════════════════════════════════
   ARTICLE EDITOR — S-BOS Knowledge Base
   Inline text editing with save-to-GitHub and edit history panel.

   Usage: include this script in any article page AFTER LESSON_CONFIG
   is defined. Requires LESSON_CONFIG.filePath (path relative to repo
   root, e.g. "lessons/welcome-to-sbos.html").
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Same-origin when served from Railway; cross-origin fallback for GitHub Pages dev
  const PROXY = window.location.hostname === 'clint-stitser.github.io'
    ? 'https://sb-planning-tools-production.up.railway.app'
    : '';

  /* ── Editable element selector ──────────────────────────────── */
  // Article pages: targets text inside #articleBody
  // Workflow/value-chain pages: targets rendered text in the step/stage cards
  const EDITABLE_SEL = [
    // Article template
    '#articleBody p', '#articleBody h2', '#articleBody h3',
    '#articleBody li', '#articleBody td', '#articleBody th',
    '#articleBody blockquote > p', '#articleBody cite',
    '#articleBody .callout-box > p',
    '#articleBody .layer-detail > p', '#articleBody .layer-detail > strong',
    '#articleBody .pillar-card-name', '#articleBody .pillar-card-desc',
    // Workflow / value-chain template (JS-rendered)
    '.vc-step-title', '.vc-step-who', '.vc-step-what',
    '.vc-step-tool', '.vc-step-output', '.vc-step-note',
    '.async-card h3', '.async-card p', '.async-card li',
    '.expectation-block li', '.expectation-block p',
    '.page-hero-title', '.page-hero-subtitle',
  ].join(', ');

  let editMode    = false;
  let savedHtml   = null; // snapshot for Cancel

  /* ── Inject editor chrome ────────────────────────────────────── */
  function injectChrome() {
    const style = document.createElement('style');
    style.textContent = `
      /* Edit mode visual cues */
      body.edit-mode [contenteditable] {
        outline: none;
        border-bottom: 1.5px dashed #F5A623;
        cursor: text;
        border-radius: 1px;
      }
      body.edit-mode [contenteditable]:focus {
        border-bottom-color: var(--blue, #0070C0);
        background: #FAFEFF;
      }
      body.edit-mode [contenteditable]:empty:before {
        content: attr(data-placeholder);
        color: #BCBEC0;
        font-style: italic;
      }

      /* Edit mode badge in meta bar */
      .edit-mode-badge {
        display: none;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        background: #FFF8E1;
        border: 1px solid #F5A623;
        border-radius: 20px;
        font-family: var(--font-sub, sans-serif);
        font-size: 12px;
        font-weight: 700;
        color: #D97706;
        flex-shrink: 0;
      }
      body.edit-mode .edit-mode-badge { display: flex; }

      /* Floating edit toolbar */
      #editor-toolbar {
        position: fixed;
        bottom: 28px;
        right: 28px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        z-index: 900;
      }
      #btn-edit-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        background: var(--dark, #231F20);
        color: #fff;
        border: none;
        border-radius: 30px;
        font-family: var(--font-sub, sans-serif);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.04em;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        transition: background 0.2s, transform 0.1s;
      }
      #btn-edit-toggle:hover { background: #444; transform: translateY(-1px); }
      body.edit-mode #btn-edit-toggle { background: #27ae60; }
      body.edit-mode #btn-edit-toggle:hover { background: #1e9150; }

      #btn-cancel-edit {
        display: none;
        padding: 8px 16px;
        background: #fff;
        color: #888;
        border: 1px solid #BCBEC0;
        border-radius: 30px;
        font-family: var(--font-sub, sans-serif);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      }
      body.edit-mode #btn-cancel-edit { display: block; }

      /* Save modal */
      #editor-modal {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.45);
        z-index: 1000;
        align-items: center;
        justify-content: center;
      }
      #editor-modal.open { display: flex; }
      .editor-modal-box {
        background: #fff;
        border-radius: 12px;
        padding: 32px;
        width: 380px;
        max-width: 90vw;
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      }
      .editor-modal-title {
        font-family: var(--font-head, sans-serif);
        font-size: 1.3rem;
        font-weight: 900;
        color: var(--dark, #231F20);
        margin: 0 0 8px;
      }
      .editor-modal-sub {
        font-size: 0.88rem;
        color: #888;
        margin: 0 0 20px;
        line-height: 1.5;
      }
      .editor-modal-input {
        width: 100%;
        padding: 10px 14px;
        border: 1.5px solid #BCBEC0;
        border-radius: 8px;
        font-family: var(--font-sub, sans-serif);
        font-size: 14px;
        color: var(--dark, #231F20);
        outline: none;
        box-sizing: border-box;
        margin-bottom: 16px;
        transition: border-color 0.2s;
      }
      .editor-modal-input:focus { border-color: var(--blue, #0070C0); }
      .editor-modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      .btn-modal-cancel {
        padding: 9px 18px;
        background: none;
        border: 1px solid #BCBEC0;
        border-radius: 6px;
        font-family: var(--font-sub, sans-serif);
        font-size: 13px;
        font-weight: 700;
        color: #888;
        cursor: pointer;
      }
      .btn-modal-save {
        padding: 9px 22px;
        background: #27ae60;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-family: var(--font-sub, sans-serif);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
      }
      .btn-modal-save:hover { background: #1e9150; }
      .btn-modal-save:disabled { background: #aaa; cursor: not-allowed; }

      /* Edit history panel */
      #history-toggle-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px 40px 0;
        max-width: 1100px;
        margin: 0 auto;
      }
      #btn-history-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 16px;
        background: none;
        border: 1px solid #BCBEC0;
        border-radius: 20px;
        font-family: var(--font-sub, sans-serif);
        font-size: 12px;
        color: #888;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s;
      }
      #btn-history-toggle:hover { border-color: var(--blue, #0070C0); color: var(--blue, #0070C0); }
      #history-panel {
        display: none;
        max-width: 760px;
        margin: 16px auto 0;
        padding: 0 40px 40px;
        border-top: 1px solid #BCBEC0;
      }
      #history-panel.open { display: block; }
      .history-panel-title {
        font-family: var(--font-sub, sans-serif);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #BCBEC0;
        padding: 20px 0 12px;
      }
      .history-item {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid #F2F2F2;
      }
      .history-item:last-child { border-bottom: none; }
      .history-author {
        font-family: var(--font-sub, sans-serif);
        font-size: 13px;
        font-weight: 700;
        color: var(--dark, #231F20);
        white-space: nowrap;
      }
      .history-date {
        font-family: var(--font-sub, sans-serif);
        font-size: 12px;
        color: #BCBEC0;
        white-space: nowrap;
      }
      .history-msg {
        font-size: 12px;
        color: #888;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .history-loading {
        font-size: 13px;
        color: #BCBEC0;
        padding: 16px 0;
        text-align: center;
      }
      .history-sha {
        font-family: monospace;
        font-size: 11px;
        color: #BCBEC0;
        background: #F7F7F7;
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);

    /* ── Edit mode badge in meta bar ── */
    const metaBar = document.querySelector('.lesson-meta-bar');
    if (metaBar) {
      const badge = document.createElement('span');
      badge.className = 'edit-mode-badge';
      badge.innerHTML = '✏ Editing';
      metaBar.insertBefore(badge, metaBar.querySelector('.btn-complete'));
    }

    /* ── Floating toolbar ── */
    const toolbar = document.createElement('div');
    toolbar.id = 'editor-toolbar';
    toolbar.innerHTML = `
      <button id="btn-cancel-edit">✕ Cancel</button>
      <button id="btn-edit-toggle">✏ Edit Article</button>
    `;
    document.body.appendChild(toolbar);

    /* ── Save modal ── */
    const modal = document.createElement('div');
    modal.id = 'editor-modal';
    modal.innerHTML = `
      <div class="editor-modal-box">
        <div class="editor-modal-title">Save your changes</div>
        <div class="editor-modal-sub">Enter your name so it appears in the edit history for this article.</div>
        <input class="editor-modal-input" id="editor-name-input" type="text" placeholder="Your name" maxlength="80" autocomplete="name" />
        <div class="editor-modal-actions">
          <button class="btn-modal-cancel" id="btn-modal-cancel">Cancel</button>
          <button class="btn-modal-save" id="btn-modal-save">Save changes</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    /* ── History panel (injected before <footer>) ── */
    const footer = document.querySelector('footer');
    const historySection = document.createElement('div');
    historySection.innerHTML = `
      <div id="history-toggle-bar">
        <button id="btn-history-toggle">🕐 Edit history</button>
      </div>
      <div id="history-panel">
        <div class="history-panel-title">Edit History</div>
        <div id="history-list"><p class="history-loading">Loading…</p></div>
      </div>
    `;
    if (footer) {
      document.body.insertBefore(historySection, footer);
    } else {
      document.body.appendChild(historySection);
    }

    bindEvents();
  }

  /* ── Detect page type ───────────────────────────────────────── */
  function isWorkflowPage() {
    // Workflow pages render content from a JS PROCESS object and live in /workflows/
    return window.location.pathname.includes('/workflows/') &&
      document.getElementById('articleBody') === null;
  }

  /* ── Enable edit mode ────────────────────────────────────────── */
  function enterEditMode() {
    if (editMode) return;
    editMode = true;
    savedHtml = document.documentElement.outerHTML; // snapshot for cancel

    const found = document.querySelectorAll(EDITABLE_SEL);
    found.forEach(el => {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
    });
    document.body.classList.add('edit-mode');
    document.getElementById('btn-edit-toggle').textContent = '💾 Save changes';

    if (isWorkflowPage()) {
      showToast('Editing hero text & card text. Step navigation stays interactive — save to commit changes.', false);
    }
  }

  /* ── Exit edit mode ──────────────────────────────────────────── */
  function exitEditMode(revert) {
    if (!editMode) return;
    if (revert && savedHtml) {
      document.open();
      document.write(savedHtml);
      document.close();
      return; // page reloads its own scripts
    }
    document.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    document.body.classList.remove('edit-mode');
    document.getElementById('btn-edit-toggle').textContent = '✏ Edit Article';
    editMode = false;
    savedHtml = null;
  }

  /* ── Collect clean HTML for commit ──────────────────────────── */
  function getCleanHtml() {
    // Remove contenteditable attrs from a serialised copy
    return document.documentElement.outerHTML
      .replace(/\s*contenteditable="[^"]*"/g, '')
      .replace(/\s*spellcheck="[^"]*"/g, '');
  }

  /* ── Resolve file path for this page ────────────────────────── */
  function getFilePath() {
    if (typeof LESSON_CONFIG !== 'undefined' && LESSON_CONFIG.filePath) {
      return LESSON_CONFIG.filePath;
    }
    // Infer from URL for pages without LESSON_CONFIG (e.g. workflow pages)
    // pathname = "/workflows/escrow-process.html" → "workflows/escrow-process.html"
    return window.location.pathname.replace(/^\//, '').replace(/\/$/, '') || 'index.html';
  }

  /* ── Persist to GitHub via Railway proxy ─────────────────────── */
  async function saveToGithub(editorName) {
    const filePath = getFilePath();
    if (!filePath) throw new Error('Could not determine file path for this page.');

    const res = await fetch(`${PROXY}/api/article/save`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ filePath, html: getCleanHtml(), editorName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /* ── Load history from GitHub commits ───────────────────────── */
  async function loadHistory() {
    const filePath = getFilePath();
    const list = document.getElementById('history-list');
    try {
      const res  = await fetch(`${PROXY}/api/article/history?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.history.length) {
        list.innerHTML = '<p class="history-loading">No edits recorded yet.</p>';
        return;
      }
      list.innerHTML = data.history.map(h => {
        const d = new Date(h.date);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        // Extract human editor name from commit message if it matches our pattern
        const match = h.message.match(/^(.+?) edited .+ — /);
        const displayName = match ? match[1] : h.author;
        return `
          <div class="history-item">
            <span class="history-author">${esc(displayName)}</span>
            <span class="history-date">${dateStr} at ${timeStr}</span>
            <span class="history-sha">${esc(h.sha)}</span>
          </div>
        `;
      }).join('');
    } catch (err) {
      list.innerHTML = `<p class="history-loading">Couldn't load history: ${esc(err.message)}</p>`;
    }
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Event wiring ────────────────────────────────────────────── */
  function bindEvents() {
    const btnToggle  = document.getElementById('btn-edit-toggle');
    const btnCancel  = document.getElementById('btn-cancel-edit');
    const modal      = document.getElementById('editor-modal');
    const nameInput  = document.getElementById('editor-name-input');
    const btnSave    = document.getElementById('btn-modal-save');
    const btnModalX  = document.getElementById('btn-modal-cancel');
    const btnHistory = document.getElementById('btn-history-toggle');
    const histPanel  = document.getElementById('history-panel');

    /* Edit / Save toggle */
    btnToggle.addEventListener('click', () => {
      if (!editMode) {
        enterEditMode();
      } else {
        // Open save modal
        nameInput.value = '';
        modal.classList.add('open');
        nameInput.focus();
      }
    });

    /* Cancel edit */
    btnCancel.addEventListener('click', () => {
      if (confirm('Discard all changes and return to read mode?')) {
        exitEditMode(true);
      }
    });

    /* Modal cancel */
    btnModalX.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

    /* Modal save */
    btnSave.addEventListener('click', () => doSave());
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });

    async function doSave() {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); nameInput.style.borderColor = '#e74c3c'; return; }
      nameInput.style.borderColor = '';
      btnSave.disabled = true;
      btnSave.textContent = 'Saving…';
      try {
        await saveToGithub(name);
        modal.classList.remove('open');
        exitEditMode(false);
        showToast(`✓ Saved — changes by ${name} are live in ~30 seconds.`);
        // Refresh history if panel is open
        if (histPanel.classList.contains('open')) loadHistory();
      } catch (err) {
        btnSave.disabled = false;
        btnSave.textContent = 'Save changes';
        showToast(`Error: ${err.message}`, true);
      }
    }

    /* History panel toggle */
    let historyLoaded = false;
    btnHistory.addEventListener('click', () => {
      const open = histPanel.classList.toggle('open');
      btnHistory.textContent = open ? '🕐 Hide history' : '🕐 Edit history';
      if (open && !historyLoaded) {
        historyLoaded = true;
        loadHistory();
      }
    });
  }

  /* ── Toast notification ──────────────────────────────────────── */
  function showToast(msg, isError = false) {
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed; bottom:90px; right:28px; z-index:9999;
      padding:12px 20px; border-radius:8px; max-width:340px;
      font-family:var(--font-sub,sans-serif); font-size:13px; font-weight:700;
      box-shadow:0 4px 16px rgba(0,0,0,0.18); animation:fadeInUp .2s ease;
      background:${isError ? '#e74c3c' : '#27ae60'}; color:#fff;
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  /* ── Init on DOMContentLoaded ────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChrome);
  } else {
    injectChrome();
  }
})();
