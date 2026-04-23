const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let editRid = null;

function toast(msg, type = "info") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

async function api(url, opts = {}) {
  try {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  } catch (e) {
    toast(e.message, "err");
    throw e;
  }
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

// ── Tabs ──
$$(".nav-btn").forEach(b => b.addEventListener("click", () => {
  $$(".nav-btn").forEach(x => x.classList.remove("active"));
  $$(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $(`#tab-${b.dataset.tab}`).classList.add("active");
}));

// ── Settings ──
async function loadSettings() {
  const s = await api("/api/settings");
  Object.keys(s).forEach(k => {
    const el = $(`#${k}`);
    if (!el) return;
    if (el.type === "checkbox") el.checked = s[k].toLowerCase() === "true";
    else el.value = s[k];
  });
}

async function saveSettings(keys) {
  const d = {};
  keys.forEach(k => {
    const el = $(`#${k}`);
    if (!el) return;
    d[k] = el.type === "checkbox" ? el.checked.toString() : el.value;
  });
  await api("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d)
  });
  toast("Paramètres sauvegardés", "ok");
}

$("#f-ai").addEventListener("submit", e => {
  e.preventDefault();
  saveSettings(["ollama_host", "ollama_model", "system_prompt"]);
});

$("#f-smtp").addEventListener("submit", e => {
  e.preventDefault();
  saveSettings(["smtp_enabled", "smtp_server", "smtp_port", "smtp_tls", "smtp_user", "smtp_password", "smtp_from", "smtp_to"]);
});

$("#f-apprise").addEventListener("submit", e => {
  e.preventDefault();
  saveSettings(["apprise_enabled", "apprise_url", "apprise_method"]);
});

// ── Alerts ──
async function loadAlerts() {
  const alerts = await api("/api/alerts");
  const box = $("#alerts-box");
  box.innerHTML = "";
  if (!alerts.length) {
    $("#alerts-empty").style.display = "block";
    return;
  }
  $("#alerts-empty").style.display = "none";
  alerts.forEach(a => {
    const d = document.createElement("div");
    d.className = "ac";
    const ts = new Date(a.ts * 1000).toLocaleString("fr-FR");
    d.innerHTML = `
      <div class="meta">🕐 ${ts} | 📁 ${esc(a.log_path)} | 🔔 ${a.notified ? "Envoyé" : "Non envoyé"} <span class="badge ${a.notified ? 'y' : 'n'}">${a.notified ? '✓' : '✗'}</span></div>
      <div class="line">${esc(a.line)}</div>
      <div class="resp">${esc(a.ai_resp || "(pas de réponse IA)")}</div>
      <div class="acts"><button class="btn sm danger del-alert" data-id="${a.id}">🗑 Supprimer</button></div>`;
    box.appendChild(d);
  });
  box.querySelectorAll(".del-alert").forEach(b => {
    b.addEventListener("click", async () => {
      await api(`/api/alerts/${b.dataset.id}`, { method: "DELETE" });
      toast("Alerte supprimée", "ok");
      loadAlerts();
    });
  });
}

$("#ref-alerts").addEventListener("click", loadAlerts);
$("#clr-alerts").addEventListener("click", async () => {
  if (confirm("Supprimer tout l'historique ?")) {
    await api("/api/alerts", { method: "DELETE" });
    toast("Historique vidé", "ok");
    loadAlerts();
  }
});

// ── Rules ──
async function loadRules() {
  const rules = await api("/api/rules");
  const box = $("#rules-box");
  box.innerHTML = "";
  if (!rules.length) {
    $("#rules-empty").style.display = "block";
    return;
  }
  $("#rules-empty").style.display = "none";
  rules.forEach(r => {
    const d = document.createElement("div");
    d.className = "rc";
    d.innerHTML = `
      <div class="rh">
        <span class="name">${esc(r.name)}</span>
        <label class="tog"><input type="checkbox" class="rule-toggle" data-id="${r.id}" ${r.enabled ? "checked" : ""}><span class="sl"></span></label>
      </div>
      <div class="det">📁 ${esc(r.log_path)} | 📏 contexte: ${r.context_lines}l | ⏱ anti-flood: ${r.debounce}s</div>
      <div class="kws">${r.keywords.map(k => `<span>${esc(k)}</span>`).join("")}</div>
      <div class="acts">
        <button class="btn sm force-analyze" data-id="${r.id}">🔍 Analyser maintenant</button>
        <button class="btn sm ghost edit-rule" data-id="${r.id}">✏️ Modifier</button>
        <button class="btn sm danger del-rule" data-id="${r.id}">🗑 Supprimer</button>
      </div>`;
    box.appendChild(d);
  });

  box.querySelectorAll(".rule-toggle").forEach(cb => {
    cb.addEventListener("change", async () => {
      const r = rules.find(x => x.id == cb.dataset.id);
      if (!r) return;
      await api(`/api/rules/${cb.dataset.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...r, enabled: cb.checked })
      });
      toast(cb.checked ? "Règle activée" : "Règle désactivée", "ok");
    });
  });

  box.querySelectorAll(".del-rule").forEach(b => {
    b.addEventListener("click", async () => {
      if (confirm("Supprimer cette règle ?")) {
        await api(`/api/rules/${b.dataset.id}`, { method: "DELETE" });
        toast("Règle supprimée", "ok");
        loadRules();
      }
    });
  });

  box.querySelectorAll(".edit-rule").forEach(b => {
    b.addEventListener("click", () => openModal(rules.find(x => x.id == b.dataset.id)));
  });

  box.querySelectorAll(".force-analyze").forEach(b => {
    b.addEventListener("click", async () => {
      toast("Analyse en cours...", "info");
      try {
        await api(`/api/rules/${b.dataset.id}/force-analyze`, { method: "POST" });
        toast("Analyse terminée", "ok");
        loadAlerts();
      } catch (e) {
        // already toasted by api()
      }
    });
  });
}

// ── Modal ──
function openModal(rule = null) {
  $("#mtitle").textContent = rule ? "Modifier la Règle" : "Nouvelle Règle";
  $("#r_name").value = rule ? rule.name : "";
  $("#r_path").value = rule ? rule.log_path : "";
  $("#r_kw").value = rule ? rule.keywords.join(", ") : "";
  $("#r_ctx").value = rule ? rule.context_lines : 10;
  $("#r_db").value = rule ? rule.debounce : 30;
  editRid = rule ? rule.id : null;
  $("#modal").style.display = "flex";
}

function closeModal() {
  $("#modal").style.display = "none";
  editRid = null;
}

$("#add-rule").addEventListener("click", () => openModal());
$("#m_cancel").addEventListener("click", closeModal);
$(".backdrop").addEventListener("click", closeModal);

$("#frule").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#r_name").value.trim();
  const log_path = $("#r_path").value.trim();
  const keywords = $("#r_kw").value.split(",").map(s => s.trim()).filter(Boolean);
  const context_lines = parseInt($("#r_ctx").value) || 10;
  const debounce = parseInt($("#r_db").value) || 30;

  if (editRid) {
    await api(`/api/rules/${editRid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, log_path, keywords, context_lines, enabled: true, debounce })
    });
    toast("Règle modifiée", "ok");
  } else {
    await api("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, log_path, keywords, context_lines, debounce })
    });
    toast("Règle ajoutée", "ok");
  }
  closeModal();
  loadRules();
});

// ── Init ──
(async () => {
  await loadSettings();
  await loadRules();
  await loadAlerts();
  setInterval(loadAlerts, 15000);
})();
