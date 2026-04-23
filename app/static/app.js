const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ── Tabs ──
$$('.nav-btn').forEach(b => b.addEventListener('click', () => {
  $$('.nav-btn').forEach(x => x.classList.remove('active'));
  $$('.tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  $(`#tab-${b.dataset.tab}`).classList.add('active');
}));

// ── Toasts ──
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Fetch helper ──
async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// ═══════════════════════════════════════════
//  FILE BROWSER
// ═══════════════════════════════════════════
let fbCurrentPath = '/';
let fbSelectedFile = '';

async function loadFiles(path = '/') {
  fbCurrentPath = path;
  $('#fb-path').textContent = path;
  $('#fb-list').innerHTML = '<div class="fb-item"><span class="spin"></span> Chargement…</div>';

  try {
    const data = await api(`/api/files?path=${encodeURIComponent(path)}`);
    renderFileList(data.entries);
  } catch (e) {
    $('#fb-list').innerHTML = `<div class="fb-item" style="color:var(--err)">Erreur : ${e.message}</div>`;
  }
}

function renderFileList(entries) {
  const box = $('#fb-list');
  box.innerHTML = '';

  if (!entries.length) {
    box.innerHTML = '<div class="fb-item" style="color:var(--dim)">Dossier vide</div>';
    return;
  }

  entries.forEach(e => {
    const div = document.createElement('div');
    div.className = 'fb-item';
    if (e.type === 'file' && !e.readable) div.classList.add('locked');

    const icon = e.type === 'dir' ? '📁' : (e.readable ? '📄' : '🔒');
    const size = e.type === 'dir' ? '' : (e.size != null ? fmtSize(e.size) : '');

    div.innerHTML = `
      <span class="icon">${icon}</span>
      <span class="fname">${e.name}</span>
      <span class="fsize">${size}</span>
    `;

    if (e.type === 'dir') {
      div.addEventListener('click', () => loadFiles(e.path));
    } else if (e.readable) {
      div.addEventListener('click', () => selectFile(e.path, div));
    }

    box.appendChild(div);
  });
}

function selectFile(path, el) {
  fbSelectedFile = path;
  $$('.fb-item').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  $('#r_path').value = path;
}

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

// Back button in file browser
$('#fb-path').addEventListener('click', () => {
  if (fbCurrentPath === '/') return;
  const parts = fbCurrentPath.split('/').filter(Boolean);
  parts.pop();
  loadFiles('/' + parts.join('/') || '/');
});

// ═══════════════════════════════════════════
//  RULE MODAL
// ═══════════════════════════════════════════
const modal = $('#modal');

function openModal(rule = null) {
  modal.style.display = 'flex';
  $('#mtitle').textContent = rule ? 'Modifier la Règle' : 'Nouvelle Règle';
  $('#r_id').value = rule?.id || '';
  $('#r_name').value = rule?.name || '';
  $('#r_path').value = rule?.log_path || '';
  $('#r_ctx').value = rule?.context_lines ?? 10;
  $('#r_db').value = rule?.debounce ?? 30;

  // Mode "every"
  const isEvery = rule?.mode === 'every';
  $('#r_mode_every').checked = isEvery;

  // Keywords checkboxes
  const kws = rule?.keywords || [];
  $$('#kw-checks input').forEach(cb => {
    cb.checked = kws.includes(cb.value);
  });
  $('#r_kw_custom').value = '';

  // Reset file browser
  fbSelectedFile = rule?.log_path || '';
  if (rule?.log_path) {
    fbCurrentPath = '/';
    loadFiles('/');
    setTimeout(() => {
      // Try to highlight selected
      $$('.fb-item').forEach(el => {
        if (el.querySelector('.fname')?.textContent === rule.log_path.split('/').pop()) {
          selectFile(rule.log_path, el);
        }
      });
    }, 300);
  } else {
    loadFiles('/');
  }
}

function closeModal() {
  modal.style.display = 'none';
}

$('#add-rule').addEventListener('click', () => openModal());
$('#m_cancel').addEventListener('click', closeModal);
$('.backdrop').addEventListener('click', closeModal);

// Collect keywords from checkboxes + custom input
function collectKeywords() {
  const kws = [];
  $$('#kw-checks input:checked').forEach(cb => kws.push(cb.value));
  const custom = $('#r_kw_custom').value.trim();
  if (custom) {
    custom.split(',').map(s => s.trim()).filter(Boolean).forEach(s => kws.push(s));
  }
  return kws;
}

// Submit rule form
$('#frule').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('#r_id').value;
  const name = $('#r_name').value.trim();
  const path = $('#r_path').value;
  const isEvery = $('#r_mode_every').checked;
  const mode = isEvery ? 'every' : 'keyword';
  const keywords = isEvery ? [] : collectKeywords();
  const ctx = parseInt($('#r_ctx').value) || 10;
  const db = parseInt($('#r_db').value) || 30;

  if (!name) return toast('Nom requis', 'err');
  if (!path) return toast('Sélectionnez un fichier log', 'err');
  if (!isEvery && !keywords.length) return toast('Sélectionnez au moins un mot-clé', 'err');

  try {
    if (id) {
      await api(`/api/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, log_path: path, keywords, mode, context_lines: ctx, enabled: true, debounce: db }),
      });
      toast('Règle modifiée', 'ok');
    } else {
      await api('/api/rules', {
        method: 'POST',
        body: JSON.stringify({ name, log_path: path, keywords, mode, context_lines: ctx, debounce: db }),
      });
      toast('Règle ajoutée', 'ok');
    }
    closeModal();
    loadRules();
  } catch (err) {
    toast(err.message, 'err');
  }
});

// ═══════════════════════════════════════════
//  RULES LIST
// ═══════════════════════════════════════════
async function loadRules() {
  try {
    const rules = await api('/api/rules');
    const box = $('#rules-box');
    box.innerHTML = '';

    if (!rules.length) {
      $('#rules-empty').style.display = 'block';
      return;
    }
    $('#rules-empty').style.display = 'none';

    rules.forEach(r => {
      const div = document.createElement('div');
      div.className = 'rc';

      const modeLabel = r.mode === 'every' ? '🤷 Toute nouvelle ligne' : `🔑 Mots-clés (${r.keywords.length})`;
      const kwsHtml = r.keywords.length
        ? r.keywords.map(k => `<span>${esc(k)}</span>`).join('')
        : '<span style="color:var(--dim)">—</span>';

      div.innerHTML = `
        <div class="rh">
          <span class="name">${esc(r.name)}</span>
          <label class="tog">
            <input type="checkbox" ${r.enabled ? 'checked' : ''} data-rid="${r.id}">
            <span class="sl"></span>
          </label>
        </div>
        <div class="det">📂 ${esc(r.log_path)} &nbsp;·&nbsp; ${modeLabel} &nbsp;·&nbsp; ⏱ ${r.debounce}s</div>
        <div class="kws">${kwsHtml}</div>
        <div class="acts">
          <button class="btn sm ghost" data-edit="${r.id}">✏️ Modifier</button>
          <button class="btn sm ghost" data-force="${r.id}">🔍 Analyser</button>
          <button class="btn sm danger" data-del="${r.id}">🗑 Supprimer</button>
        </div>
      `;
      box.appendChild(div);
    });

    // Toggle
    box.querySelectorAll('.tog input').forEach(cb => cb.addEventListener('change', async e => {
      const rid = parseInt(e.target.dataset.rid);
      const rule = rules.find(r => r.id === rid);
      try {
        await api(`/api/rules/${rid}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: rule.name,
            log_path: rule.log_path,
            keywords: rule.keywords,
            mode: rule.mode,
            context_lines: rule.context_lines,
            enabled: e.target.checked,
            debounce: rule.debounce,
          }),
        });
        toast(e.target.checked ? 'Activée' : 'Désactivée', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    }));

    // Edit
    box.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      openModal(rules.find(r => r.id == b.dataset.edit));
    }));

    // Force analyze
    box.querySelectorAll('[data-force]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api(`/api/rules/${b.dataset.force}/force-analyze`, { method: 'POST' });
        toast('Analyse lancée', 'info');
      } catch (err) { toast(err.message, 'err'); }
    }));

    // Delete
    box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Supprimer cette règle ?')) return;
      try {
        await api(`/api/rules/${b.dataset.del}`, { method: 'DELETE' });
        toast('Règle supprimée', 'ok');
        loadRules();
      } catch (err) { toast(err.message, 'err'); }
    }));
  } catch (err) {
    toast('Erreur chargement règles', 'err');
  }
}

// ═══════════════════════════════════════════
//  ALERTS LIST
// ═══════════════════════════════════════════
async function loadAlerts() {
  try {
    const alerts = await api('/api/alerts?limit=100');
    const box = $('#alerts-box');
    box.innerHTML = '';

    if (!alerts.length) {
      $('#alerts-empty').style.display = 'block';
      return;
    }
    $('#alerts-empty').style.display = 'none';

    alerts.forEach(a => {
      const div = document.createElement('div');
      div.className = 'ac';
      const ts = new Date(a.ts * 1000).toLocaleString('fr-FR');
      div.innerHTML = `
        <div class="meta">🕐 ${ts} &nbsp;·&nbsp; 📂 ${esc(a.log_path)} &nbsp;·&nbsp; Notifié <span class="badge ${a.notified ? 'y' : 'n'}">${a.notified ? 'Oui' : 'Non'}</span></div>
        <div class="line">${esc(a.line)}</div>
        ${a.ai_resp ? `<div class="resp">🤖 ${esc(a.ai_resp)}</div>` : ''}
        <div class="acts">
          <button class="btn sm danger" data-del-alert="${a.id}">🗑 Supprimer</button>
        </div>
      `;
      box.appendChild(div);
    });

    box.querySelectorAll('[data-del-alert]').forEach(b => b.addEventListener('click', async () => {
      try {
        await api(`/api/alerts/${b.dataset.delAlert}`, { method: 'DELETE' });
        toast('Alerte supprimée', 'ok');
        loadAlerts();
      } catch (err) { toast(err.message, 'err'); }
    }));
  } catch (err) {
    toast('Erreur chargement alertes', 'err');
  }
}

$('#ref-alerts').addEventListener('click', loadAlerts);
$('#clr-alerts').addEventListener('click', async () => {
  if (!confirm('Supprimer toutes les alertes ?')) return;
  try {
    await api('/api/alerts', { method: 'DELETE' });
    toast('Alertes supprimées', 'ok');
    loadAlerts();
  } catch (err) { toast(err.message, 'err'); }
});

// ═══════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    Object.keys(s).forEach(k => {
      const el = $(`#${k}`);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = s[k] === 'true';
      else el.value = s[k];
    });
  } catch (err) { toast('Erreur chargement config', 'err'); }
}

async function saveSettings(formId, label) {
  const form = $(formId);
  const data = {};
  form.querySelectorAll('input, textarea, select').forEach(el => {
    if (!el.id) return;
    data[el.id] = el.type === 'checkbox' ? String(el.checked) : el.value;
  });
  try {
    await api('/api/settings', { method: 'POST', body: JSON.stringify(data) });
    toast(`${label} sauvegardée`, 'ok');
  } catch (err) { toast(err.message, 'err'); }
}

$('#f-ai').addEventListener('submit', e => { e.preventDefault(); saveSettings('#f-ai', 'Config IA'); });
$('#f-smtp').addEventListener('submit', e => { e.preventDefault(); saveSettings('#f-smtp', 'SMTP'); });
$('#f-apprise').addEventListener('submit', e => { e.preventDefault(); saveSettings('#f-apprise', 'Apprise'); });

// ═══════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
loadSettings();
loadRules();
loadAlerts();
