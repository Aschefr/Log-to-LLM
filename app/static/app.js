// ═══════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════
const $ = s => document.querySelector(s);
const api = (url, opts = {}) => fetch(url, {
  headers: { 'Content-Type': 'application/json', ...opts.headers },
  ...opts,
}).then(r => {
  if (!r.ok) throw new Error(r.status === 422 ? 'Données invalides' : r.statusText);
  return r.json();
});

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ═══════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ═══════════════════════════════════════════
//  MODAL
// ═══════════════════════════════════════════
function openModal(rule = null) {
  $('#mtitle').textContent = rule ? 'Modifier la Règle' : 'Nouvelle Règle';
  $('#r_id').value = rule?.id || '';
  $('#r_name').value = rule?.name || '';
  $('#r_path').value = rule?.log_path || '';
  $('#r_ctx').value = rule?.context_lines ?? 10;
  $('#r_db').value = rule?.debounce ?? 30;
  $('#r_mode_every').checked = rule?.mode === 'every';

  // Keywords
  const kws = rule?.keywords || [];
  $('#kw-checks').querySelectorAll('input').forEach(cb => {
    cb.checked = kws.includes(cb.value);
  });
  $('#r_kw_custom').value = '';

  // File browser
  if (rule?.log_path) {
    showSelectedPath(rule.log_path);
  } else {
    showFileBrowser();
  }

  $('#modal').style.display = 'flex';
}

function closeModal() {
  $('#modal').style.display = 'none';
}

$('#add-rule').addEventListener('click', () => openModal());
$('#m_cancel').addEventListener('click', closeModal);
$('#modal .backdrop').addEventListener('click', closeModal);

// ═══════════════════════════════════════════
//  FILE BROWSER
// ═══════════════════════════════════════════
let currentPath = '/';

function showFileBrowser() {
  $('#fb-path').style.display = 'flex';
  $('#fb-list').style.display = 'block';
  $('#r_path').value = '';
  loadFiles('/');
}

function showSelectedPath(path) {
  $('#fb-path').style.display = 'none';
  $('#fb-list').style.display = 'none';
  $('#r_path').value = path;
  $('#fb-path').textContent = path;
}

async function loadFiles(path) {
  currentPath = path;
  $('#fb-path').textContent = path;
  try {
    const data = await api(`/api/files?path=${encodeURIComponent(path)}`);
    const list = $('#fb-list');
    list.innerHTML = '';

    // Parent button
    if (data.parent) {
      const parentBtn = document.createElement('div');
      parentBtn.className = 'fb-item';
      parentBtn.innerHTML = `<span class="icon">⬆️</span><span class="fname">..</span>`;
      parentBtn.addEventListener('click', () => loadFiles(data.parent));
      list.appendChild(parentBtn);
    }

    // Entries
    data.entries.forEach(item => {
      const div = document.createElement('div');
      div.className = `fb-item ${!item.readable ? 'locked' : ''}`;
      const icon = item.is_dir ? '📁' : (item.readable ? '📄' : '🔒');
      const size = item.is_dir ? '' : ` <span class="fsize">${formatSize(item.size)}</span>`;
      div.innerHTML = `<span class="icon">${icon}</span><span class="fname">${item.name}</span>${size}`;

      if (item.is_dir) {
        div.addEventListener('click', () => loadFiles(item.path));
      } else if (item.readable) {
        div.addEventListener('click', () => {
          showSelectedPath(item.path);
        });
      }

      list.appendChild(div);
    });
  } catch (err) {
    toast(err.message, 'err');
  }
}

function formatSize(bytes) {
  if (bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

// ═══════════════════════════════════════════
//  RULES
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
      div.innerHTML = `
        <div class="rh">
          <span class="name">${esc(r.name)}</span>
          <label class="tog">
            <input type="checkbox" data-rid="${r.id}" ${r.enabled ? 'checked' : ''}>
            <span class="sl"></span>
          </label>
        </div>
        <div class="det">📂 ${esc(r.log_path)} &nbsp;·&nbsp; 🎯 ${r.mode === 'every' ? 'Toutes lignes' : r.keywords.length + ' mots-clés'}</div>
        <div class="kws">${r.keywords.map(k => `<span>${esc(k)}</span>`).join('')}</div>
        <div class="acts">
          <button class="btn sm" data-edit="${r.id}">✏️ Modifier</button>
          <button class="btn sm" data-force="${r.id}">🔍 Analyser</button>
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
