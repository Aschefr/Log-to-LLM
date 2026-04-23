const $ = s => document.querySelector(s);

const api = (url, opts = {}) => fetch(url, {
  headers: { 'Content-Type': 'application/json', ...opts.headers },
  ...opts,
}).then(r => {
  if (!r.ok) throw new Error(r.status === 422 ? 'Données invalides' : r.statusText);
  return r.json();
});

function toast(msg, type) {
  type = type || 'info';
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(function() { t.remove(); }, 3000);
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function formatSize(bytes) {
  if (bytes === 0) return '';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return bytes.toFixed(1) + ' ' + units[i];
}

// ── TABS ──
document.querySelectorAll('.nav-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ── MODAL ──
function openModal(rule) {
  rule = rule || null;
  document.getElementById('mtitle').textContent = rule ? 'Modifier la Règle' : 'Nouvelle Règle';
  document.getElementById('r_id').value = rule ? (rule.id || '') : '';
  document.getElementById('r_name').value = rule ? (rule.name || '') : '';
  document.getElementById('r_path').value = rule ? (rule.log_path || '') : '';
  document.getElementById('r_ctx').value = rule ? (rule.context_lines != null ? rule.context_lines : 10) : 10;
  document.getElementById('r_db').value = rule ? (rule.debounce != null ? rule.debounce : 30) : 30;
  document.getElementById('r_mode_every').checked = rule ? (rule.mode === 'every') : false;

  var kws = rule ? (rule.keywords || []) : [];
  document.querySelectorAll('#kw-checks input').forEach(function(cb) {
    cb.checked = kws.indexOf(cb.value) !== -1;
  });
  document.getElementById('r_kw_custom').value = '';

  if (rule && rule.log_path) {
    showSelectedPath(rule.log_path);
  } else {
    showFileBrowser();
  }

  document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

document.getElementById('add-rule').addEventListener('click', function() { openModal(); });
document.getElementById('m_cancel').addEventListener('click', closeModal);
document.querySelector('#modal .backdrop').addEventListener('click', closeModal);

// ── FILE BROWSER ──
var currentPath = '/';

function showFileBrowser() {
  document.getElementById('fb-path').style.display = 'flex';
  document.getElementById('fb-list').style.display = 'block';
  document.getElementById('selected-file-display').style.display = 'none';
  document.getElementById('r_path').value = '';
  loadFiles('/');
}

function showSelectedPath(path) {
  document.getElementById('fb-path').style.display = 'none';
  document.getElementById('fb-list').style.display = 'none';
  document.getElementById('selected-file-display').style.display = 'flex';
  document.getElementById('selected-file-path').textContent = path;
  document.getElementById('r_path').value = path;
}

document.getElementById('btn-change-file').addEventListener('click', function() {
  showFileBrowser();
});

function loadFiles(path) {
  currentPath = path;
  document.getElementById('fb-path').textContent = path;
  api('/api/files?path=' + encodeURIComponent(path)).then(function(data) {
    var list = document.getElementById('fb-list');
    list.innerHTML = '';

    if (data.parent) {
      var pb = document.createElement('div');
      pb.className = 'fb-item';
      pb.innerHTML = '<span class="icon">\u2B06\ufe0f</span><span class="fname">..</span>';
      pb.addEventListener('click', function() { loadFiles(data.parent); });
      list.appendChild(pb);
    }

    data.entries.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'fb-item' + (item.readable === false ? ' locked' : '');
      var icon = item.is_dir ? '\ud83d\udcc2' : (item.readable ? '\ud83d\udcc4' : '\ud83d\udd12');
      var size = item.is_dir ? '' : ' <span class="fsize">' + formatSize(item.size) + '</span>';
      div.innerHTML = '<span class="icon">' + icon + '</span><span class="fname">' + esc(item.name) + '</span>' + size;

      if (item.is_dir) {
        div.addEventListener('click', function() { loadFiles(item.path); });
      } else if (item.readable) {
        div.addEventListener('click', function() { showSelectedPath(item.path); });
      }
      list.appendChild(div);
    });
  }).catch(function(err) { toast(err.message, 'err'); });
}

// ── RULES ──
function loadRules() {
  api('/api/rules').then(function(rules) {
    var box = document.getElementById('rules-box');
    box.innerHTML = '';

    if (!rules.length) {
      document.getElementById('rules-empty').style.display = 'block';
      return;
    }
    document.getElementById('rules-empty').style.display = 'none';

    rules.forEach(function(r) {
      var div = document.createElement('div');
      div.className = 'rc';
      div.innerHTML =
        '<div class="rh"><span class="name">' + esc(r.name) + '</span>' +
        '<label class="tog"><input type="checkbox" data-rid="' + r.id + '"' + (r.enabled ? ' checked' : '') + '>' +
        '<span class="sl"></span></label></div>' +
        '<div class="det">\ud83d\udcc2 ' + esc(r.log_path) + ' &nbsp;\u00b7&nbsp; \ud83c\udfaf ' +
        (r.mode === 'every' ? 'Toutes lignes' : r.keywords.length + ' mots-clés') + '</div>' +
        '<div class="kws">' + r.keywords.map(function(k) { return '<span>' + esc(k) + '</span>'; }).join('') + '</div>' +
        '<div class="acts">' +
        '<button class="btn sm" data-edit="' + r.id + '">\u270f\ufe0f Modifier</button> ' +
        '<button class="btn sm" data-force="' + r.id + '">\ud83d\udd0d Analyser</button> ' +
        '<button class="btn sm danger" data-del="' + r.id + '">\ud83d\uddd1 Supprimer</button></div>';
      box.appendChild(div);
    });

    box.querySelectorAll('.tog input').forEach(function(cb) {
      cb.addEventListener('change', function(e) {
        var rid = parseInt(e.target.dataset.rid);
        var rule = rules.find(function(r) { return r.id === rid; });
        api('/api/rules/' + rid, {
          method: 'PUT',
          body: JSON.stringify({
            name: rule.name, log_path: rule.log_path, keywords: rule.keywords,
            mode: rule.mode, context_lines: rule.context_lines,
            enabled: e.target.checked, debounce: rule.debounce
          })
        }).then(function() { toast(e.target.checked ? 'Activée' : 'Désactivée', 'ok'); })
          .catch(function(err) { toast(err.message, 'err'); });
      });
    });

    box.querySelectorAll('[data-edit]').forEach(function(b) {
      b.addEventListener('click', function() {
        openModal(rules.find(function(r) { return r.id == b.dataset.edit; }));
      });
    });

    box.querySelectorAll('[data-force]').forEach(function(b) {
      b.addEventListener('click', function() {
        api('/api/rules/' + b.dataset.force + '/force-analyze', { method: 'POST' })
          .then(function() { toast('Analyse lancée', 'info'); })
          .catch(function(err) { toast(err.message, 'err'); });
      });
    });

    box.querySelectorAll('[data-del]').forEach(function(b) {
      b.addEventListener('click', function() {
        if (!confirm('Supprimer cette règle ?')) return;
        api('/api/rules/' + b.dataset.del, { method: 'DELETE' })
          .then(function() { toast('Règle supprimée', 'ok'); loadRules(); })
          .catch(function(err) { toast(err.message, 'err'); });
      });
    });
  }).catch(function(err) { toast('Erreur chargement règles', 'err'); });
}

// ── ALERTS ──
function loadAlerts() {
  api('/api/alerts?limit=100').then(function(alerts) {
    var box = document.getElementById('alerts-box');
    box.innerHTML = '';

    if (!alerts.length) {
      document.getElementById('alerts-empty').style.display = 'block';
      return;
    }
    document.getElementById('alerts-empty').style.display = 'none';

    alerts.forEach(function(a) {
      var div = document.createElement('div');
      div.className = 'ac';
      var ts = new Date(a.ts * 1000).toLocaleString('fr-FR');
      div.innerHTML =
        '<div class="meta">\ud83d\udd50 ' + ts + ' &nbsp;\u00b7&nbsp; \ud83d\udcc2 ' + esc(a.log_path) +
        ' &nbsp;\u00b7&nbsp; Notifié <span class="badge ' + (a.notified ? 'y' : 'n') + '">' +
        (a.notified ? 'Oui' : 'Non') + '</span></div>' +
        '<div class="line">' + esc(a.line) + '</div>' +
        (a.ai_resp ? '<div class="resp">\ud83e\udd16 ' + esc(a.ai_resp) + '</div>' : '') +
        '<div class="acts"><button class="btn sm danger" data-del-alert="' + a.id + '">\ud83d\uddd1 Supprimer</button></div>';
      box.appendChild(div);
    });

    box.querySelectorAll('[data-del-alert]').forEach(function(b) {
      b.addEventListener('click', function() {
        api('/api/alerts/' + b.dataset.delAlert, { method: 'DELETE' })
          .then(function() { toast('Alerte supprimée', 'ok'); loadAlerts(); })
          .catch(function(err) { toast(err.message, 'err'); });
      });
    });
  }).catch(function(err) { toast('Erreur chargement alertes', 'err'); });
}

document.getElementById('ref-alerts').addEventListener('click', loadAlerts);

document.getElementById('clr-alerts').addEventListener('click', function() {
  if (!confirm('Supprimer toutes les alertes ?')) return;
  api('/api/alerts', { method: 'DELETE' })
    .then(function() { toast('Alertes supprimées', 'ok'); loadAlerts(); })
    .catch(function(err) { toast(err.message, 'err'); });
});

// ── SETTINGS ──
function loadSettings() {
  api('/api/settings').then(function(s) {
    Object.keys(s).forEach(function(k) {
      var el = document.getElementById(k);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = s[k] === 'true';
      else el.value = s[k];
    });
  }).catch(function(err) { toast('Erreur chargement config', 'err'); });
}

function saveSettings(formId, label) {
  var form = document.getElementById(formId);
  var data = {};
  form.querySelectorAll('input, textarea, select').forEach(function(el) {
    if (!el.id) return;
    data[el.id] = el.type === 'checkbox' ? String(el.checked) : el.value;
  });
  api('/api/settings', { method: 'POST', body: JSON.stringify(data) })
    .then(function() { toast(label + ' sauvegardée', 'ok'); })
    .catch(function(err) { toast(err.message, 'err'); });
}

document.getElementById('f-ai').addEventListener('submit', function(e) {
  e.preventDefault(); saveSettings('#f-ai', 'Config IA');
});

document.getElementById('f-smtp').addEventListener('submit', function(e) {
  e.preventDefault(); saveSettings('#f-smtp', 'SMTP');
});

document.getElementById('f-apprise').addEventListener('submit', function(e) {
  e.preventDefault(); saveSettings('#f-apprise', 'Apprise');
});

// ── RULE FORM SUBMIT ──
document.getElementById('frule').addEventListener('submit', function(e) {
  e.preventDefault();
  var id = document.getElementById('r_id').value;
  var name = document.getElementById('r_name').value.trim();
  var log_path = document.getElementById('r_path').value.trim();
  var ctx = parseInt(document.getElementById('r_ctx').value) || 10;
  var db = parseInt(document.getElementById('r_db').value) || 30;
  var mode = document.getElementById('r_mode_every').checked ? 'every' : 'keyword';

  var kws = [];
  document.querySelectorAll('#kw-checks input:checked').forEach(function(cb) { kws.push(cb.value); });
  var custom = document.getElementById('r_kw_custom').value.trim();
  if (custom) {
    custom.split(',').forEach(function(s) {
      s = s.trim();
      if (s) kws.push(s);
    });
  }

  if (!name) { toast('Nom requis', 'err'); return; }
  if (!log_path) { toast('Sélectionnez un fichier', 'err'); return; }

  var body = { name: name, log_path: log_path, keywords: kws, mode: mode, context_lines: ctx, debounce: db };
  if (id) body.enabled = true;

  var req = id
    ? api('/api/rules/' + id, { method: 'PUT', body: JSON.stringify(body) })
    : api('/api/rules', { method: 'POST', body: JSON.stringify(body) });

  req.then(function() {
    toast(id ? 'Règle modifiée' : 'Règle créée', 'ok');
    closeModal();
    loadRules();
  }).catch(function(err) { toast(err.message, 'err'); });
});

// ── INIT ──
loadSettings();
loadRules();
loadAlerts();
