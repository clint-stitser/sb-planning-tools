/* ═══════════════════════════════════════════════════════════════
   ARTICLE EDITOR — S-BOS Knowledge Base
   Inline text editing → save to GitHub via Railway proxy.
   Works on article pages and workflow/value-chain pages.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const PROXY = window.location.hostname === 'clint-stitser.github.io'
    ? 'https://sb-planning-tools-production.up.railway.app'
    : '';

  /* ── Selectors: every text node that should be editable ─────── */
  // Uses actual class names from the KB templates.
  // Targets block-level containers to avoid double-editing nested spans.
  const SELECTORS = [
    // ── Article template (#articleBody) ──
    '#articleBody p',
    '#articleBody h2',
    '#articleBody h3',
    '#articleBody li',
    '#articleBody td',
    '#articleBody th',
    '#articleBody cite',
    '#articleBody blockquote > p',
    '#articleBody .callout-box > p',
    '#articleBody .callout-box-label',
    '#articleBody .layer-detail > p',
    '#articleBody .layer-detail > strong',
    '#articleBody .pillar-card-name',
    '#articleBody .pillar-card-desc',
    // ── Page hero (all page types) ──
    '.page-hero-title',
    '.page-hero-subtitle',
    '.page-hero-eyebrow',
    // ── Workflow / value-chain pages ──
    // Static elements (in HTML, not JS-rendered)
    '.section-title',
    '.section-label',
    '.prose',
    // JS-rendered by buildAsync()
    '.vc-async-name',
    '.vc-async-body',
    '.vc-async-roles li',
    // JS-rendered by buildExpectations()
    '.vc-expect-title',
    '.vc-expect-heading',
    '.vc-expect-list li',
    // Stage detail panel (rendered on chip click)
    '.vc-detail-title',
    '.vc-detail-desc',
    '.vc-role-name',
    '.vc-role-actions li',
    '.vc-xfer-item',
  ];

  let editMode  = false;
  let savedHtml = null;
  let observer  = null; // MutationObserver for JS-rendered content

  /* ── Make a single element editable ─────────────────────────── */
  function makeEditable(el) {
    if (el.closest('#editor-toolbar, #editor-modal, #history-toggle-bar, #history-panel')) return;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
  }

  /* ── Make all matching elements editable ─────────────────────── */
  function applyEditableToAll() {
    const sel = SELECTORS.join(', ');
    document.querySelectorAll(sel).forEach(makeEditable);
  }

  /* ── Watch for dynamically-added content (workflow stage panels) */
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (!editMode) return;
      const sel = SELECTORS.join(', ');
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          // Make the node itself editable if it matches
          if (node.matches && node.matches(sel)) makeEditable(node);
          // Also check descendants
          node.querySelectorAll && node.querySelectorAll(sel).forEach(makeEditable);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Inject all editor chrome into the page ─────────────────── */
  function injectChrome() {
    const style = document.createElement('style');
    style.textContent = `
      /* ── Edit mode: editable element highlight ── */
      body.edit-mode [contenteditable] {
        outline: 2px dashed rgba(245,166,35,0.6) !important;
        outline-offset: 2px;
        background: rgba(255,248,224,0.5) !important;
        cursor: text;
        border-radius: 3px;
        min-height: 1em;
      }
      body.edit-mode [contenteditable]:focus {
        outline: 2px solid #0070C0 !important;
        background: #EFF6FF !important;
      }
      body.edit-mode [contenteditable]:hover:not(:focus) {
        outline-color: rgba(245,166,35,0.9) !important;
      }
      /* Edit mode announcement banner */
      #edit-mode-banner {
        display: none;
        position: sticky;
        top: 0;
        z-index: 800;
        background: #FFFBEB;
        border-bottom: 2px solid #F5A623;
        padding: 8px 24px;
        font-family: var(--font-sub, sans-serif);
        font-size: 13px;
        font-weight: 700;
        color: #D97706;
        text-align: center;
        letter-spacing: 0.02em;
      }
      body.edit-mode #edit-mode-banner { display: block; }

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
        padding: 11px 22px;
        background: var(--dark, #231F20);
        color: #fff;
        border: none;
        border-radius: 30px;
        font-family: var(--font-sub, sans-serif);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.04em;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        transition: background 0.2s, transform 0.1s;
        white-space: nowrap;
      }
      #btn-edit-toggle:hover { background: #444; transform: translateY(-1px); }
      body.edit-mode #btn-edit-toggle { background: #27ae60; }
      body.edit-mode #btn-edit-toggle:hover { background: #1e9150; }

      #btn-cancel-edit {
        display: none;
        padding: 8px 18px;
        background: #fff;
        color: #666;
        border: 1px solid #BCBEC0;
        border-radius: 30px;
        font-family: var(--font-sub, sans-serif);
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      }
      body.edit-mode #btn-cancel-edit { display: block; }

      /* Save modal */
      #editor-modal {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 1000;
        align-items: center;
        justify-content: center;
      }
      #editor-modal.open { display: flex; }
      .editor-modal-box {
        background: #fff;
        border-radius: 14px;
        padding: 32px;
        width: 400px;
        max-width: 92vw;
        box-shadow: 0 24px 64px rgba(0,0,0,0.3);
      }
      .editor-modal-title {
        font-family: var(--font-head, sans-serif);
        font-size: 1.3rem;
        font-weight: 900;
        color: var(--dark, #231F20);
        margin: 0 0 6px;
      }
      .editor-modal-sub {
        font-size: 0.875rem;
        color: #888;
        margin: 0 0 20px;
        line-height: 1.5;
      }
      .editor-modal-input {
        width: 100%;
        padding: 11px 14px;
        border: 1.5px solid #BCBEC0;
        border-radius: 8px;
        font-family: var(--font-sub, sans-serif);
        font-size: 15px;
        color: var(--dark, #231F20);
        outline: none;
        box-sizing: border-box;
        margin-bottom: 16px;
        transition: border-color 0.15s;
      }
      .editor-modal-input:focus { border-color: #0070C0; }
      .editor-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
      .btn-modal-cancel {
        padding: 10px 20px;
        background: none;
        border: 1px solid #BCBEC0;
        border-radius: 8px;
        font-family: var(--font-sub, sans-serif);
        font-size: 13px;
        font-weight: 700;
        color: #888;
        cursor: pointer;
      }
      .btn-modal-save {
        padding: 10px 24px;
        background: #27ae60;
        color: #fff;
        border: none;
        border-radius: 8px;
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
        padding: 32px 40px 0;
      }
      #btn-history-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 18px;
        background: none;
        border: 1px solid #BCBEC0;
        border-radius: 20px;
        font-family: var(--font-sub, sans-serif);
        font-size: 12px;
        color: #888;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      #btn-history-toggle:hover { border-color: #0070C0; color: #0070C0; }
      #history-panel {
        display: none;
        max-width: 700px;
        margin: 20px auto 0;
        padding: 0 40px 48px;
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
        border-top: 1px solid #EAEAEA;
      }
      .history-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 11px 0;
        border-bottom: 1px solid #F2F2F2;
      }
      .history-item:last-child { border-bottom: none; }
      .history-author { font-family: var(--font-sub, sans-serif); font-size: 13px; font-weight: 700; color: var(--dark, #231F20); white-space: nowrap; }
      .history-date   { font-family: var(--font-sub, sans-serif); font-size: 12px; color: #BCBEC0; white-space: nowrap; flex: 1; }
      .history-sha    { font-family: monospace; font-size: 11px; color: #BCBEC0; background: #F5F5F5; padding: 2px 7px; border-radius: 4px; white-space: nowrap; }
      .history-empty  { font-size: 13px; color: #BCBEC0; padding: 16px 0; text-align: center; }
    `;
    document.head.appendChild(style);

    /* Sticky edit mode banner */
    const banner = document.createElement('div');
    banner.id = 'edit-mode-banner';
    banner.textContent = '✏  Edit mode — click any highlighted text to edit it. Click "Save changes" when done.';
    document.body.insertBefore(banner, document.body.firstChild);

    /* Floating toolbar */
    const toolbar = document.createElement('div');
    toolbar.id = 'editor-toolbar';
    toolbar.innerHTML = `
      <button id="btn-cancel-edit">✕ Discard</button>
      <button id="btn-edit-toggle">✏ Edit page</button>
    `;
    document.body.appendChild(toolbar);

    /* Save modal */
    const modal = document.createElement('div');
    modal.id = 'editor-modal';
    modal.innerHTML = `
      <div class="editor-modal-box">
        <div class="editor-modal-title">Save your changes</div>
        <div class="editor-modal-sub">Your name appears in the edit history for this page.</div>
        <input class="editor-modal-input" id="editor-name-input" type="text" placeholder="Your name" maxlength="80" autocomplete="name" />
        <div class="editor-modal-actions">
          <button class="btn-modal-cancel" id="btn-modal-cancel">Cancel</button>
          <button class="btn-modal-save"   id="btn-modal-save">Save changes</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    /* History panel */
    const histSection = document.createElement('div');
    histSection.innerHTML = `
      <div id="history-toggle-bar">
        <button id="btn-history-toggle">🕐 Edit history</button>
      </div>
      <div id="history-panel">
        <div class="history-panel-title">Edit History</div>
        <div id="history-list"><p class="history-empty">Loading…</p></div>
      </div>
    `;
    const footer = document.querySelector('footer');
    footer ? document.body.insertBefore(histSection, footer) : document.body.appendChild(histSection);

    bindEvents();
  }

  /* ── Enter edit mode ─────────────────────────────────────────── */
  function enterEditMode() {
    if (editMode) return;
    editMode = true;
    savedHtml = document.documentElement.outerHTML;

    applyEditableToAll();
    startObserver();

    document.body.classList.add('edit-mode');
    document.getElementById('btn-edit-toggle').textContent = '💾 Save changes';

    const count = document.querySelectorAll('[contenteditable]').length;
    showToast(`✏ ${count} text block${count !== 1 ? 's' : ''} are now editable — click any highlighted area to start typing.`);
  }

  /* ── Exit edit mode ──────────────────────────────────────────── */
  function exitEditMode(revert) {
    if (!editMode) return;
    if (observer) { observer.disconnect(); observer = null; }

    if (revert && savedHtml) {
      document.open(); document.write(savedHtml); document.close();
      return;
    }
    document.querySelectorAll('[contenteditable]').forEach(el => {
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
    });
    document.body.classList.remove('edit-mode');
    document.getElementById('btn-edit-toggle').textContent = '✏ Edit page';
    editMode = false;
    savedHtml = null;
  }

  /* ── Build clean HTML snapshot for commit ────────────────────── */
  function getCleanHtml() {
    return document.documentElement.outerHTML
      .replace(/\s*contenteditable="[^"]*"/g, '')
      .replace(/\s*spellcheck="[^"]*"/g, '');
  }

  /* ── Infer repo-relative file path ───────────────────────────── */
  function getFilePath() {
    if (typeof LESSON_CONFIG !== 'undefined' && LESSON_CONFIG.filePath) {
      return LESSON_CONFIG.filePath;
    }
    return window.location.pathname.replace(/^\//, '').replace(/\/$/, '') || 'index.html';
  }

  /* ── Commit via Railway proxy ────────────────────────────────── */
  async function saveToGithub(editorName) {
    const filePath = getFilePath();
    const res = await fetch(`${PROXY}/api/article/save`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ filePath, html: getCleanHtml(), editorName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /* ── Load commit history ─────────────────────────────────────── */
  async function loadHistory() {
    const list = document.getElementById('history-list');
    try {
      const res  = await fetch(`${PROXY}/api/article/history?path=${encodeURIComponent(getFilePath())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.history.length) {
        list.innerHTML = '<p class="history-empty">No edits recorded yet.</p>';
        return;
      }
      list.innerHTML = data.history.map(h => {
        const d       = new Date(h.date);
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const match   = h.message.match(/^(.+?) edited /);
        const name    = match ? match[1] : h.author;
        return `<div class="history-item">
          <span class="history-author">${esc(name)}</span>
          <span class="history-date">${dateStr}</span>
          <span class="history-sha">${esc(h.sha)}</span>
        </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<p class="history-empty">Couldn't load history: ${esc(err.message)}</p>`;
    }
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Bind all events ─────────────────────────────────────────── */
  function bindEvents() {
    const btnToggle  = document.getElementById('btn-edit-toggle');
    const btnCancel  = document.getElementById('btn-cancel-edit');
    const modal      = document.getElementById('editor-modal');
    const nameInput  = document.getElementById('editor-name-input');
    const btnSave    = document.getElementById('btn-modal-save');
    const btnModalX  = document.getElementById('btn-modal-cancel');
    const btnHistory = document.getElementById('btn-history-toggle');
    const histPanel  = document.getElementById('history-panel');

    btnToggle.addEventListener('click', () => {
      if (!editMode) {
        enterEditMode();
      } else {
        nameInput.value = '';
        nameInput.style.borderColor = '';
        modal.classList.add('open');
        setTimeout(() => nameInput.focus(), 50);
      }
    });

    btnCancel.addEventListener('click', () => {
      if (confirm('Discard all changes?')) exitEditMode(true);
    });

    btnModalX.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

    btnSave.addEventListener('click', doSave);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });

    async function doSave() {
      const name = nameInput.value.trim();
      if (!name) { nameInput.style.borderColor = '#e74c3c'; nameInput.focus(); return; }
      nameInput.style.borderColor = '';
      btnSave.disabled = true;
      btnSave.textContent = 'Saving…';
      try {
        await saveToGithub(name);
        modal.classList.remove('open');
        exitEditMode(false);
        showToast(`✓ Saved by ${name} — live in ~30 sec`);
        if (histPanel.classList.contains('open')) loadHistory();
      } catch (err) {
        btnSave.disabled = false;
        btnSave.textContent = 'Save changes';
        showToast(`Save failed: ${err.message}`, true);
      }
    }

    let historyLoaded = false;
    btnHistory.addEventListener('click', () => {
      const open = histPanel.classList.toggle('open');
      btnHistory.textContent = open ? '🕐 Hide history' : '🕐 Edit history';
      if (open && !historyLoaded) { historyLoaded = true; loadHistory(); }
    });
  }

  /* ── Toast ───────────────────────────────────────────────────── */
  function showToast(msg, isError = false) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:90px;right:28px;z-index:9999;
      padding:12px 20px;border-radius:8px;max-width:360px;line-height:1.4;
      font-family:var(--font-sub,sans-serif);font-size:13px;font-weight:700;
      box-shadow:0 4px 20px rgba(0,0,0,0.2);
      background:${isError ? '#e74c3c' : '#231F20'};color:#fff;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  /* ── Boot ────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChrome);
  } else {
    injectChrome();
  }
})();
