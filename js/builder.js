// js/builder.js
import { store } from "./storage.js";
import { generateProgram } from "./generator.js";

const KEY_CFG = "ATL_BUILDER_CFG_V1";
const KEY_PROG = "ATL_PROGRAM_V1";
const $ = (id) => document.getElementById(id);

function checkbox(id) { return $(id).checked; }
function value(id) { return $(id).value; }

function render(containerId, onProgramSaved) {
  const el = $(containerId);

  const cfg = store.load(KEY_CFG, {
    style: "general",
    goal: "muscle",
    freq: "3",
    recovery: "schedule",
    units: "lb",
    gender: "unspecified",

    eq_barbell: true,
    eq_dumbbell: true,
    eq_cables: true,
    eq_landmine: false,
    eq_pullup: true,
    eq_dip: true,
    eq_bench: true,
    eq_cardio: false,

    mv_squat: "limited",
    mv_hinge: "limited",
    mv_overhead: "limited",
    mv_dips: "good",
    mv_pullups: "good",
    inj_spine: "high",
  });

  el.innerHTML = `
    <div class="card">
      <strong>Plan Builder</strong>
      <div class="small muted" style="margin-top:6px;">
        Defaults only. Your real log data will override assumptions over time.
      </div>

      <div style="height:1px;background:#222638;margin:10px 0;"></div>

      <div class="row">
        <div style="flex:1 1 180px;">
          <label>Training style</label>
          <select id="b_style">
            <option value="general">General Fitness</option>
            <option value="traditional">Gym Hypertrophy (traditional)</option>
            <option value="hit">HIT / Minimalist</option>
            <option value="calisthenics">Calisthenics</option>
            <option value="tactical">Tactical / Military PT</option>
            <option value="pilates">Pilates / Mobility</option>
          </select>
        </div>

        <div style="flex:1 1 180px;">
          <label>Primary goal</label>
          <select id="b_goal">
            <option value="muscle">Muscle</option>
            <option value="strength">Strength</option>
            <option value="recomp">Recomp</option>
            <option value="endurance">Endurance</option>
            <option value="mobility">Mobility</option>
          </select>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div style="flex:1 1 180px;">
          <label>Days/week</label>
          <select id="b_freq">
            <option>2</option><option>3</option><option>4</option><option>5</option><option>6</option>
          </select>
        </div>

        <div style="flex:1 1 180px;">
          <label>Recovery style</label>
          <select id="b_recovery">
            <option value="schedule">Fixed weekly schedule</option>
            <option value="recovered">Train when recovered</option>
          </select>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div style="flex:1 1 180px;">
          <label>Units</label>
          <select id="b_units"><option value="lb">lb</option><option value="kg">kg</option></select>
        </div>

        <div style="flex:1 1 180px;">
          <label>Gender (optional)</label>
          <select id="b_gender">
            <option value="unspecified">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      <div style="height:1px;background:#222638;margin:10px 0;"></div>

      <strong class="small">Equipment</strong>
      <div class="row" style="margin-top:8px;">
        <label class="pill"><input type="checkbox" id="eq_barbell"> Barbell/Rack</label>
        <label class="pill"><input type="checkbox" id="eq_dumbbell"> Dumbbells</label>
        <label class="pill"><input type="checkbox" id="eq_cables"> Cables</label>
        <label class="pill"><input type="checkbox" id="eq_landmine"> Landmine</label>
        <label class="pill"><input type="checkbox" id="eq_pullup"> Pull-up bar</label>
        <label class="pill"><input type="checkbox" id="eq_dip"> Dip station</label>
        <label class="pill"><input type="checkbox" id="eq_bench"> Bench</label>
        <label class="pill"><input type="checkbox" id="eq_cardio"> Cardio</label>
      </div>

      <div style="height:1px;background:#222638;margin:10px 0;"></div>

      <strong class="small">Movement tolerance</strong>
      <div class="row" style="margin-top:8px;">
        <div style="flex:1 1 180px;">
          <label>Squat pattern</label>
          <select id="mv_squat"><option value="good">Good</option><option value="limited">Limited</option><option value="avoid">Avoid</option></select>
        </div>
        <div style="flex:1 1 180px;">
          <label>Hinge pattern</label>
          <select id="mv_hinge"><option value="good">Good</option><option value="limited">Limited</option><option value="avoid">Avoid</option></select>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div style="flex:1 1 180px;">
          <label>Overhead press</label>
          <select id="mv_overhead"><option value="good">Good</option><option value="limited">Limited</option><option value="avoid">Avoid</option></select>
        </div>
        <div style="flex:1 1 180px;">
          <label>Dips</label>
          <select id="mv_dips"><option value="good">Good</option><option value="limited">Limited</option><option value="avoid">Avoid</option></select>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <div style="flex:1 1 180px;">
          <label>Pull-ups</label>
          <select id="mv_pullups"><option value="good">Good</option><option value="limited">Limited</option><option value="avoid">Avoid</option></select>
        </div>
        <div style="flex:1 1 180px;">
          <label>Spine sensitivity</label>
          <select id="inj_spine"><option value="none">None</option><option value="mild">Mild</option><option value="high">High</option></select>
        </div>
      </div>

      <div class="row" style="margin-top:12px;">
        <button class="primary" id="btnGenerate">Generate plan</button>
        <span class="small muted" id="builderStatus"></span>
      </div>
    </div>
  `;

  // Set initial values
  $("b_style").value = cfg.style;
  $("b_goal").value = cfg.goal;
  $("b_freq").value = cfg.freq;
  $("b_recovery").value = cfg.recovery;
  $("b_units").value = cfg.units;
  $("b_gender").value = cfg.gender;

  $("eq_barbell").checked = !!cfg.eq_barbell;
  $("eq_dumbbell").checked = !!cfg.eq_dumbbell;
  $("eq_cables").checked = !!cfg.eq_cables;
  $("eq_landmine").checked = !!cfg.eq_landmine;
  $("eq_pullup").checked = !!cfg.eq_pullup;
  $("eq_dip").checked = !!cfg.eq_dip;
  $("eq_bench").checked = !!cfg.eq_bench;
  $("eq_cardio").checked = !!cfg.eq_cardio;

  $("mv_squat").value = cfg.mv_squat;
  $("mv_hinge").value = cfg.mv_hinge;
  $("mv_overhead").value = cfg.mv_overhead;
  $("mv_dips").value = cfg.mv_dips;
  $("mv_pullups").value = cfg.mv_pullups;
  $("inj_spine").value = cfg.inj_spine;

  $("btnGenerate").addEventListener("click", () => {
    const nextCfg = {
      style: value("b_style"),
      goal: value("b_goal"),
      freq: value("b_freq"),
      recovery: value("b_recovery"),
      units: value("b_units"),
      gender: value("b_gender"),

      eq_barbell: checkbox("eq_barbell"),
      eq_dumbbell: checkbox("eq_dumbbell"),
      eq_cables: checkbox("eq_cables"),
      eq_landmine: checkbox("eq_landmine"),
      eq_pullup: checkbox("eq_pullup"),
      eq_dip: checkbox("eq_dip"),
      eq_bench: checkbox("eq_bench"),
      eq_cardio: checkbox("eq_cardio"),

      mv_squat: value("mv_squat"),
      mv_hinge: value("mv_hinge"),
      mv_overhead: value("mv_overhead"),
      mv_dips: value("mv_dips"),
      mv_pullups: value("mv_pullups"),
      inj_spine: value("inj_spine"),
    };

    store.save(KEY_CFG, nextCfg);

    const program = generateProgram(nextCfg);
    store.save(KEY_PROG, program);

    $("builderStatus").textContent = "Plan generated & saved.";
    onProgramSaved?.(program);
  });
}

export const Builder = { render };
