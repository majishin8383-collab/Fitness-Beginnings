// js/app.js
import { store, todayISO, escapeHtml } from "./storage.js";
import { Builder } from "./builder.js";

const KEY_LOG = "ATL_LOG_V1";
const KEY_PROG = "ATL_PROGRAM_V1";

const $ = (id) => document.getElementById(id);

function fmtResult(e) {
  if (!e) return "—";
  if (e.logType === "loadreps") {
    const u = e.result?.units ?? "lb";
    if (u === "bw") return `bw × ${e.result?.reps ?? "?"}`;
    if (u === "bw+") return `bw+${e.result?.weight ?? "?"} × ${e.result?.reps ?? "?"}`;
    return `${e.result?.weight ?? "?"}${u} × ${e.result?.reps ?? "?"}`;
  }
  if (e.logType === "timed") return `${e.result?.seconds ?? "?"}s`;
  if (e.logType === "circuit") return `${e.result?.rounds ?? "?"} rounds in ${e.result?.minutes ?? "?"} min`;
  return "—";
}

function nextSessionLabel(program, log) {
  if (!program?.sessions?.length) return "—";
  if (!log.length) return program.sessions[0].label;

  const last = [...log].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const idx = program.sessions.findIndex((s) => s.id === last.sessionId);
  const next = program.sessions[(idx + 1) % program.sessions.length];
  return next?.label || program.sessions[0].label;
}

function renderPills(program, log) {
  if (!program) {
    $("pillPlan").textContent = "Plan: Not set";
    $("pillNext").textContent = "Next: —";
    return;
  }
  const s = program.meta?.style ?? "custom";
  const g = program.meta?.goal ?? "—";
  $("pillPlan").textContent = `Plan: ${s} / ${g}`;
  $("pillNext").textContent = `Next: ${nextSessionLabel(program, log)}`;
}

function renderPlan(program) {
  const el = $("tab_plan");
  if (!program) {
    el.innerHTML = `
      <div class="card">
        <strong>Plan</strong>
        <div class="small muted" style="margin-top:6px;">Generate a plan in Builder.</div>
      </div>
    `;
    return;
  }

  const opts = program.sessions.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`).join("");

  el.innerHTML = `
    <div class="card">
      <div class="row between">
        <strong>Plan</strong>
        <span class="badge">${escapeHtml(program.meta.style)} · ${escapeHtml(program.meta.goal)} · ${program.meta.freq}d/w</span>
      </div>

      <div class="row" style="margin-top:10px;">
        <div style="flex:1 1 220px;">
          <label>Preview session</label>
          <select id="planSession">${opts}</select>
        </div>
      </div>

      <div style="height:1px;background:#222638;margin:10px 0;"></div>

      <ul id="planList" class="small" style="margin:0;padding-left:18px;"></ul>
    </div>
  `;

  const sessionSelect = $("planSession");
  const list = $("planList");

  const renderList = () => {
    const sid = sessionSelect.value;
    const s = program.sessions.find(x => x.id === sid);
    if (!s) { list.innerHTML = ""; return; }
    list.innerHTML = s.items.map(it => {
      const r = it.rule ? `${it.rule.repMin}-${it.rule.repMax} reps (+${it.rule.inc})` : (it.logType === "timed" ? "timed" : it.logType);
      return `<li><b>${escapeHtml(it.name)}</b> <span class="muted">(${escapeHtml(it.logType)} · ${escapeHtml(r)})</span></li>`;
    }).join("");
  };

  sessionSelect.addEventListener("change", renderList);
  renderList();
}

function renderSettings(log) {
  const panel = $("settingsPanel");
  panel.innerHTML = `
    <div class="row between">
      <strong>Settings</strong>
      <button id="btnCloseSettings">✕</button>
    </div>
    <div class="row" style="margin-top:10px;">
      <button id="btnExportLog">Export log CSV</button>
      <button id="btnClearLog" class="danger">Clear log</button>
      <button id="btnClearPlan" class="danger">Clear plan</button>
    </div>
    <div class="small muted" style="margin-top:10px;">
      Data is stored locally in your browser (localStorage). Export for backup.
    </div>
  `;

  $("btnCloseSettings").addEventListener("click", () => panel.classList.add("hidden"));

  $("btnExportLog").addEventListener("click", () => {
    const csv = exportLogCSV(log);
    downloadText(csv, "accountability-log.csv", "text/csv;charset=utf-8");
  });

  $("btnClearLog").addEventListener("click", () => {
    if (!confirm("Clear the entire log?")) return;
    store.save(KEY_LOG, []);
    location.reload();
  });

  $("btnClearPlan").addEventListener("click", () => {
    if (!confirm("Clear plan + keep log?")) return;
    localStorage.removeItem(KEY_PROG);
    location.reload();
  });
}

function exportLogCSV(log) {
  const header = ["date","session","item","logType","result","clean","notes"].join(",");
  const safe = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const lines = [...log]
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .map((e) => [
      e.date,
      e.sessionLabel,
      e.itemName,
      e.logType,
      JSON.stringify(e.result),
      e.clean ? "1" : "0",
      e.notes || ""
    ].map(safe).join(","));

  return [header, ...lines].join("\n");
}

function downloadText(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderHistory(log) {
  const q = $("histSearch").value.trim().toLowerCase();
  const filtered = [...log]
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .filter((e) => {
      if (!q) return true;
      const blob = `${e.date} ${e.sessionLabel} ${e.itemName} ${JSON.stringify(e.result)} ${e.notes || ""}`.toLowerCase();
      return blob.includes(q);
    });

  $("histCount").textContent = `${filtered.length} entries`;

  $("histBody").innerHTML = filtered.length
    ? filtered.map((e) => `
      <tr>
        <td>${escapeHtml(e.date)}</td>
        <td>${escapeHtml(e.sessionLabel || "")}</td>
        <td>${escapeHtml(e.itemName || "")}</td>
        <td>${escapeHtml(fmtResult(e))}${e.clean ? " ✅" : ""}</td>
        <td class="muted">${escapeHtml(e.notes || "")}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" class="muted">No entries yet.</td></tr>`;
}

function wireTabs() {
  document.querySelectorAll(".tabbtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabbtn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      ["builder","plan","log","fuel"].forEach((t) => {
        $("tab_" + t).classList.toggle("hidden", t !== tab);
      });
    });
  });
}

function stubPanels() {
  $("tab_log").innerHTML = `
    <div class="card">
      <strong>Log</strong>
      <div class="small muted" style="margin-top:6px;">
        Logger UI lands next (auto-fill + auto-progression).
      </div>
      <div class="small muted" style="margin-top:6px;">
        Today is ${todayISO()}.
      </div>
    </div>
  `;
  $("tab_fuel").innerHTML = `
    <div class="card">
      <strong>Fuel</strong>
      <div class="small muted" style="margin-top:6px;">
        Fuel checklist + macro starter targets lands after logger.
      </div>
    </div>
  `;
}

function init() {
  wireTabs();
  stubPanels();

  let program = store.load(KEY_PROG, null);
  const log = store.load(KEY_LOG, []);

  // Builder mounts here and can refresh plan/pills
  Builder.render("tab_builder", (newProgram) => {
    program = newProgram;
    renderPlan(program);
    renderPills(program, store.load(KEY_LOG, []));
    // jump user to Plan tab after generation (optional)
    document.querySelector('.tabbtn[data-tab="plan"]').click();
  });

  renderPlan(program);
  renderPills(program, log);
  renderSettings(log);
  renderHistory(log);

  $("btnSettings").addEventListener("click", () => $("settingsPanel").classList.toggle("hidden"));
  $("histSearch").addEventListener("input", () => renderHistory(store.load(KEY_LOG, [])));

  $("btnHistToday").addEventListener("click", () => {
    alert(`Today is ${todayISO()}. (Log form comes next.)`);
  });

  $("btnDeleteLast").addEventListener("click", () => {
    const cur = store.load(KEY_LOG, []);
    if (!cur.length) return;
    if (!confirm("Delete last entry?")) return;
    const idx = cur.map((e, i) => ({ e, i }))
      .sort((a, b) => (b.e.ts || 0) - (a.e.ts || 0))[0].i;
    cur.splice(idx, 1);
    store.save(KEY_LOG, cur);
    renderHistory(cur);
    renderPills(store.load(KEY_PROG, null), cur);
  });
}

init();
