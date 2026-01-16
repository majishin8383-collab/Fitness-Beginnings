// js/logger.js
import { store, todayISO, escapeHtml } from "./storage.js";

const KEY_LOG = "ATL_LOG_V1";
const $ = (id) => document.getElementById(id);

function toNum(v) {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

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

function findLast(log, sessionId, itemId) {
  const sorted = [...log].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return sorted.find(e => e.sessionId === sessionId && e.itemId === itemId) || null;
}

function progressHint(item, last, clean, current) {
  if (!item?.rule || item.logType !== "loadreps") return "—";
  const { repMin, repMax, inc } = item.rule;
  const base = `Target ${repMin}-${repMax} reps`;

  if (!last) return base;
  if (!current || !clean) return base;

  const reps = Number(current.reps);
  if (Number.isFinite(reps) && reps >= repMax) {
    return `Earned: next time +${inc}`;
  }
  return base;
}

// ---- Cadence coach (4 down / 2 up) ----
// Uses navigator.vibrate (works on many Android phones).
// Not "rep counting", but it "keeps tempo" so you can focus.
const Cadence = (() => {
  let timer = null;
  let running = false;

  function vib(ms) {
    try { navigator.vibrate?.(ms); } catch {}
  }

  function start({ downMs = 4000, upMs = 2000 } = {}) {
    stop();
    running = true;

    // Pattern: buzz at start of eccentric + start of concentric
    // We cycle every (down + up)
    const cycle = () => {
      if (!running) return;
      vib(30); // start down
      timer = setTimeout(() => {
        vib(30); // start up
        timer = setTimeout(cycle, upMs);
      }, downMs);
    };

    cycle();
  }

  function stop() {
    running = false;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  return { start, stop, get running() { return running; } };
})();

function showInputs(logType) {
  $("lg_in_loadreps").classList.toggle("hidden", logType !== "loadreps");
  $("lg_in_timed").classList.toggle("hidden", logType !== "timed");
  $("lg_in_circuit").classList.toggle("hidden", logType !== "circuit");
}

function buildHTML() {
  return `
    <div class="card">
      <strong>Log</strong>
      <div class="small muted" style="margin-top:6px;">
        Auto-fills last values. Hit top of rep range clean → auto-suggests the next jump.
      </div>

      <div style="height:1px;background:#222638;margin:10px 0;"></div>

      <div class="row">
        <div style="flex:1 1 220px;">
          <label>Session</label>
          <select id="lg_session"></select>
        </div>
        <div style="flex:1 1 220px;">
          <label>Exercise / Block</label>
          <select id="lg_item"></select>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div style="flex:1 1 220px;">
          <label>Date</label>
          <input id="lg_date" type="date" />
        </div>
        <div style="flex:1 1 220px;">
          <label>Last</label>
          <div class="badge" id="lg_last">—</div>
        </div>
      </div>

      <div style="height:1px;background:#222638;margin:10px 0;"></div>

      <div id="lg_in_loadreps" class="hidden">
        <div class="row">
          <div style="flex:1 1 140px;">
            <label>Weight</label>
            <input id="lg_weight" inputmode="decimal" placeholder="e.g., 135" />
          </div>
          <div style="flex:1 1 140px;">
            <label>Reps</label>
            <input id="lg_reps" inputmode="numeric" placeholder="e.g., 8" />
          </div>
          <div style="flex:1 1 140px;">
            <label>Units</label>
            <select id="lg_units">
              <option value="lb">lb</option>
              <option value="kg">kg</option>
              <option value="bw">bw</option>
              <option value="bw+">bw+</option>
            </select>
          </div>
        </div>
      </div>

      <div id="lg_in_timed" class="hidden">
        <div class="row">
          <div style="flex:1 1 220px;">
            <label>Time (seconds)</label>
            <input id="lg_seconds" inputmode="numeric" placeholder="e.g., 60" />
          </div>
          <div style="flex:1 1 220px;">
            <label>Intensity (optional)</label>
            <select id="lg_intensity">
              <option value="">—</option>
              <option value="easy">Easy</option>
              <option value="moderate">Moderate</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      </div>

      <div id="lg_in_circuit" class="hidden">
        <div class="row">
          <div style="flex:1 1 220px;">
            <label>Rounds</label>
            <input id="lg_rounds" inputmode="numeric" placeholder="e.g., 5" />
          </div>
          <div style="flex:1 1 220px;">
            <label>Total time (minutes)</label>
            <input id="lg_minutes" inputmode="decimal" placeholder="e.g., 18.5" />
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <label class="pill"><input type="checkbox" id="lg_clean" /> Clean + controlled</label>
        <span class="badge" id="lg_hint">—</span>
      </div>

      <div class="row" style="margin-top:10px;">
        <label class="pill"><input type="checkbox" id="lg_cadence" /> Cadence coach (4–2)</label>
        <span class="small muted">Vibration keeps tempo so you can focus</span>
      </div>

      <div style="margin-top:10px;">
        <label>Notes (optional)</label>
        <textarea id="lg_notes" placeholder="e.g., strict, no pain, slowed reps"></textarea>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="primary" id="lg_save">Save entry</button>
        <button id="lg_use_last">Use last values</button>
        <span class="small muted" id="lg_toast"></span>
      </div>
    </div>
  `;
}

function toast(msg) {
  $("lg_toast").textContent = msg;
  setTimeout(() => {
    if ($("lg_toast").textContent === msg) $("lg_toast").textContent = "";
  }, 2500);
}

export const Logger = {
  render(containerId, getProgram, onLogSaved) {
    const host = $(containerId);
    host.innerHTML = buildHTML();

    $("lg_date").value = todayISO();

    const readProgram = () => getProgram?.() || null;

    const fillSessions = () => {
      const program = readProgram();
      const sel = $("lg_session");
      sel.innerHTML = "";
      if (!program?.sessions?.length) {
        sel.innerHTML = `<option value="">(Generate a plan first)</option>`;
        $("lg_item").innerHTML = `<option value="">—</option>`;
        return;
      }

      program.sessions.forEach(s => {
        const o = document.createElement("option");
        o.value = s.id;
        o.textContent = s.label;
        sel.appendChild(o);
      });

      sel.value = program.sessions[0].id;
      fillItems();
    };

    const fillItems = () => {
      const program = readProgram();
      const sid = $("lg_session").value;
      const session = program?.sessions?.find(s => s.id === sid);

      const itemSel = $("lg_item");
      itemSel.innerHTML = "";

      if (!session?.items?.length) {
        itemSel.innerHTML = `<option value="">—</option>`;
        return;
      }

      session.items.forEach(it => {
        const o = document.createElement("option");
        o.value = it.id;
        o.textContent = it.name;
        itemSel.appendChild(o);
      });

      itemSel.value = session.items[0].id;
      applyItem();
    };

    const clearInputs = () => {
      $("lg_weight").value = "";
      $("lg_reps").value = "";
      $("lg_units").value = "lb";
      $("lg_seconds").value = "";
      $("lg_rounds").value = "";
      $("lg_minutes").value = "";
      $("lg_intensity").value = "";
      $("lg_notes").value = "";
      $("lg_clean").checked = false;
      $("lg_hint").textContent = "—";
    };

    const applyItem = () => {
      const program = readProgram();
      const sid = $("lg_session").value;
      const iid = $("lg_item").value;
      const session = program?.sessions?.find(s => s.id === sid);
      const item = session?.items?.find(it => it.id === iid);
      if (!item) {
        $("lg_last").textContent = "—";
        $("lg_hint").textContent = "—";
        return;
      }

      clearInputs();
      showInputs(item.logType);

      // Default units from plan meta or item default
      const planUnits = program?.meta?.units || "lb";
      $("lg_units").value = item.defaultUnits || planUnits;

      const log = store.load(KEY_LOG, []);
      const last = findLast(log, sid, iid);
      $("lg_last").textContent = fmtResult(last);

      // Autofill weight/units only (leave reps empty so user enters fresh)
      if (last && last.logType === "loadreps") {
        $("lg_units").value = last.result.units;
        $("lg_weight").value = last.result.weight ?? "";
      }
      if (last && last.logType === "timed") {
        $("lg_seconds").value = last.result.seconds ?? "";
      }
      if (last && last.logType === "circuit") {
        $("lg_rounds").value = last.result.rounds ?? "";
        $("lg_minutes").value = last.result.minutes ?? "";
      }

      // update hint baseline
      $("lg_hint").textContent = progressHint(item, last, false, null);
    };

    const currentInputSummary = (item) => {
      if (!item) return null;
      if (item.logType === "loadreps") {
        const reps = toNum($("lg_reps").value);
        const units = $("lg_units").value;
        const weight = toNum($("lg_weight").value);
        if (!reps) return null;
        return { reps, units, weight };
      }
      return null;
    };

    const refreshHint = () => {
      const program = readProgram();
      const sid = $("lg_session").value;
      const iid = $("lg_item").value;
      const session = program?.sessions?.find(s => s.id === sid);
      const item = session?.items?.find(it => it.id === iid);
      if (!item) return;

      const log = store.load(KEY_LOG, []);
      const last = findLast(log, sid, iid);
      const clean = $("lg_clean").checked;
      const current = currentInputSummary(item);
      $("lg_hint").textContent = progressHint(item, last, clean, current);
    };

    // cadence toggle
    $("lg_cadence").addEventListener("change", () => {
      if ($("lg_cadence").checked) {
        Cadence.start({ downMs: 4000, upMs: 2000 });
        toast("Cadence coach ON (vibration).");
      } else {
        Cadence.stop();
        toast("Cadence coach OFF.");
      }
    });

    // wire events
    $("lg_session").addEventListener("change", () => fillItems());
    $("lg_item").addEventListener("change", () => applyItem());
    $("lg_clean").addEventListener("change", refreshHint);
    $("lg_reps").addEventListener("input", refreshHint);
    $("lg_weight").addEventListener("input", refreshHint);
    $("lg_units").addEventListener("change", refreshHint);

    $("lg_use_last").addEventListener("click", () => {
      const program = readProgram();
      const sid = $("lg_session").value;
      const iid = $("lg_item").value;
      const session = program?.sessions?.find(s => s.id === sid);
      const item = session?.items?.find(it => it.id === iid);
      const log = store.load(KEY_LOG, []);
      const last = findLast(log, sid, iid);
      if (!last || !item) return toast("No previous entry.");

      if (last.logType === "loadreps") {
        $("lg_units").value = last.result.units;
        $("lg_weight").value = last.result.weight ?? "";
        $("lg_reps").value = last.result.reps ?? "";
      } else if (last.logType === "timed") {
        $("lg_seconds").value = last.result.seconds ?? "";
      } else if (last.logType === "circuit") {
        $("lg_rounds").value = last.result.rounds ?? "";
        $("lg_minutes").value = last.result.minutes ?? "";
      }
      $("lg_clean").checked = !!last.clean;
      toast("Loaded last values.");
      refreshHint();
    });

    $("lg_save").addEventListener("click", () => {
      const program = readProgram();
      if (!program?.sessions?.length) return toast("Generate a plan first.");

      const date = $("lg_date").value || todayISO();
      const sid = $("lg_session").value;
      const iid = $("lg_item").value;

      const session = program.sessions.find(s => s.id === sid);
      const item = session?.items?.find(it => it.id === iid);
      if (!session || !item) return toast("Choose session + item.");

      let result = null;

      if (item.logType === "loadreps") {
        const reps = toNum($("lg_reps").value);
        if (!reps || reps <= 0) return toast("Enter reps.");

        const units = $("lg_units").value;
        let weight = null;

        if (units === "bw") {
          weight = null;
        } else {
          const w = toNum($("lg_weight").value);
          if (w === null || w < 0) return toast("Enter weight.");
          weight = w;
        }
        result = { reps, units, weight };
      }

      if (item.logType === "timed") {
        const seconds = toNum($("lg_seconds").value);
        if (!seconds || seconds <= 0) return toast("Enter seconds.");
        result = { seconds, intensity: $("lg_intensity").value || "" };
      }

      if (item.logType === "circuit") {
        const rounds = toNum($("lg_rounds").value);
        const minutes = toNum($("lg_minutes").value);
        if (!rounds || rounds <= 0) return toast("Enter rounds.");
        if (!minutes || minutes <= 0) return toast("Enter total minutes.");
        result = { rounds, minutes };
      }

      const clean = $("lg_clean").checked;
      const notes = $("lg_notes").value.trim();

      const entry = {
        ts: Date.now(),
        date,
        sessionId: sid,
        sessionLabel: session.label,
        itemId: iid,
        itemName: item.name,
        logType: item.logType,
        result,
        clean,
        notes
      };

      const log = store.load(KEY_LOG, []);
      log.push(entry);
      store.save(KEY_LOG, log);

      toast("Saved.");
      onLogSaved?.(entry);

      // Keep cadence running if user wants it on
      applyItem();
    });

    // initial populate
    fillSessions();
  }
};
