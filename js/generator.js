// js/generator.js
// Structured plan generator v1.0
// Fixes: repeating sessions + unwanted overlap between Session 1 & 2
// Philosophy: sessions are built from pattern "recipes" (push/pull/legs/etc),
// then exercises are picked deterministically within those patterns.

const uid = (() => { let n = 0; return () => String(++n); })();

function eqTags(cfg) {
  const t = new Set(["bw"]);
  if (cfg.eq_barbell) { t.add("barbell"); t.add("rack"); }
  if (cfg.eq_dumbbell) t.add("dumbbell");
  if (cfg.eq_cables) t.add("cables");
  if (cfg.eq_landmine) t.add("landmine");
  if (cfg.eq_pullup) t.add("pullup");
  if (cfg.eq_dip) t.add("dip");
  if (cfg.eq_bench) t.add("bench");
  if (cfg.eq_cardio) t.add("cardio");
  return t;
}

function movementBlocked(cfg, pattern) {
  if (pattern === "squat" && cfg.mv_squat === "avoid") return true;
  if (pattern === "hinge" && cfg.mv_hinge === "avoid") return true;
  if (pattern === "overhead" && cfg.mv_overhead === "avoid") return true;
  if (pattern === "dips" && cfg.mv_dips === "avoid") return true;
  return false;
}

function hashInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function ruleFor(cfg, pattern) {
  const units = cfg.units || "lb";
  const female = cfg.gender === "female";
  const strength = cfg.goal === "strength";
  const endurance = cfg.goal === "endurance";
  const mobility = cfg.goal === "mobility";

  if (mobility) return null;

  let repMin = 8, repMax = 12;
  let inc = (units === "kg" ? 1.25 : 2.5);

  if (strength) { repMin = 3; repMax = 6; inc = (units === "kg" ? 2.5 : 5); }
  if (endurance) { repMin = 12; repMax = 20; inc = (units === "kg" ? 1.25 : 2.5); }

  // HIT bias
  if (cfg.style === "hit") {
    if (pattern === "squat" || pattern === "hinge") { repMin = 5; repMax = 8; }
    if (pattern === "push" || pattern === "pull") { repMin = 6; repMax = 10; }
  }

  // High spine sensitivity: safer ranges + smaller jumps on legs/hinge
  if (cfg.inj_spine === "high" && (pattern === "squat" || pattern === "hinge")) {
    repMin = Math.max(repMin, 6);
    repMax = Math.max(repMax, 10);
    inc = (units === "kg" ? 1.25 : 2.5);
  }

  // Female defaults (overrideable via logging)
  if (female) {
    repMin += 1;
    repMax += 2;
    inc = (units === "kg" ? 1.25 : 2.5);
  }

  return { repMin, repMax, inc, trigger: "clean_at_top" };
}

// --- Exercise pools ---
const POOLS = {
  push: [
    { name:"Incline press", pattern:"push", logType:"loadreps", tags:["bench","barbell","dumbbell"] },
    { name:"Flat press", pattern:"push", logType:"loadreps", tags:["bench","barbell","dumbbell"] },
    { name:"Landmine press", pattern:"push", logType:"loadreps", tags:["landmine"] },
    { name:"Push-up", pattern:"push", logType:"loadreps", tags:["bw"] },
  ],
  pull: [
    { name:"Cable row", pattern:"pull", logType:"loadreps", tags:["cables"] },
    { name:"Seated row (attachment)", pattern:"pull", logType:"loadreps", tags:["cables"] },
    { name:"Lat pulldown", pattern:"pull", logType:"loadreps", tags:["cables"] },
    { name:"Pull-up", pattern:"pull", logType:"loadreps", tags:["pullup","bw"] },
  ],
  squat: [
    { name:"Split squat", pattern:"squat", logType:"loadreps", tags:["dumbbell","bw"] },
    { name:"Step-up", pattern:"squat", logType:"loadreps", tags:["bench","dumbbell","bw"] },
    { name:"Goblet squat", pattern:"squat", logType:"loadreps", tags:["dumbbell"] },
    { name:"Squat", pattern:"squat", logType:"loadreps", tags:["rack","barbell"] },
  ],
  hinge: [
    { name:"Hip thrust / glute bridge", pattern:"hinge", logType:"loadreps", tags:["bench","barbell","bw"] },
    { name:"Cable pull-through", pattern:"hinge", logType:"loadreps", tags:["cables"] },
    { name:"RDL (light/controlled)", pattern:"hinge", logType:"loadreps", tags:["barbell","dumbbell"] },
  ],
  accessory: [
    { name:"Lateral raise", pattern:"accessory", logType:"loadreps", tags:["dumbbell","cables"] },
    { name:"Curl", pattern:"accessory", logType:"loadreps", tags:["dumbbell","cables","barbell"] },
    { name:"Triceps pressdown", pattern:"accessory", logType:"loadreps", tags:["cables"] },
    { name:"Calf raise", pattern:"accessory", logType:"loadreps", tags:["bw","barbell","dumbbell"] },
    { name:"Dips", pattern:"dips", logType:"loadreps", tags:["dip","bw"] },
  ],
  core: [
    { name:"Dead bug / hollow hold", pattern:"core", logType:"timed", tags:["bw"] },
    { name:"Side plank", pattern:"core", logType:"timed", tags:["bw"] },
    { name:"Breath + bracing", pattern:"core", logType:"timed", tags:["bw"] },
  ],
  mobility: [
    { name:"Hip mobility flow", pattern:"mobility", logType:"timed", tags:["bw"] },
    { name:"Thoracic mobility flow", pattern:"mobility", logType:"timed", tags:["bw"] },
  ],
  cardio: [
    { name:"Run/ruck/bike interval", pattern:"cardio", logType:"timed", tags:["cardio","bw"] },
  ]
};

function pickSeeded(cfg, pool, seed, usedNames, usedPatterns, { preferPattern } = {}) {
  const tags = eqTags(cfg);

  const list = pool.filter(x => {
    if (preferPattern && x.pattern !== preferPattern) return false;
    if (movementBlocked(cfg, x.pattern)) return false;

    // equipment
    if (!x.tags.some(tt => tags.has(tt))) return false;

    // no duplicates in session
    if (usedNames.has(x.name)) return false;

    // avoid repeating the same *pattern* too many times in a session
    if (usedPatterns.has(x.pattern) && x.pattern !== "accessory" && x.pattern !== "core" && x.pattern !== "mobility") {
      return false;
    }

    // high spine sensitivity: avoid heavy labels
    if (cfg.inj_spine === "high") {
      const n = x.name.toLowerCase();
      if (n.includes("deadlift") || n === "back squat" || n === "squat") return false;
    }

    // tolerance constraints
    if (x.name.toLowerCase().includes("pull-up") && cfg.mv_pullups !== "good") return false;
    if (x.name.toLowerCase() === "dips" && cfg.mv_dips !== "good") return false;

    return true;
  });

  if (!list.length) return null;

  const base = hashInt(seed);
  for (let k = 0; k < list.length; k++) {
    const idx = (base + k) % list.length;
    const choice = list[idx];
    if (!usedNames.has(choice.name)) return choice;
  }
  return list[0];
}

function addItem(cfg, items, usedNames, usedPatterns, ex) {
  if (!ex) return;
  usedNames.add(ex.name);
  usedPatterns.add(ex.pattern);
  items.push({
    id: `I${uid()}`,
    name: ex.name,
    logType: ex.logType,
    pattern: ex.pattern,
    rule: ex.logType === "loadreps" ? ruleFor(cfg, ex.pattern) : null,
    defaultUnits: cfg.units || "lb",
  });
}

function sessionRecipes(cfg, freq) {
  // “No overlap” interpretation: each session emphasizes different main regions/patterns.
  // We still allow accessories/core/mobility to appear across days.
  if (cfg.style === "pilates") {
    return Array.from({ length: freq }, (_, i) => ({
      label: `Session ${i + 1}`,
      blocks: ["core","mobility","core","mobility"]
    }));
  }

  if (cfg.style === "tactical") {
    return Array.from({ length: freq }, (_, i) => ({
      label: `Session ${i + 1}`,
      blocks: ["push","pull","squat","cardio"]
    }));
  }

  if (cfg.style === "calisthenics") {
    return Array.from({ length: freq }, (_, i) => ({
      label: `Session ${i + 1}`,
      blocks: ["push","pull","squat","core"]
    }));
  }

  if (cfg.style === "hit") {
    // HIT A/B/C has built-in separation
    const base = [
      { label:"Day A", blocks:["push","push","pull","pull"] },
      { label:"Day B", blocks:["squat","hinge","accessory"] },
      { label:"Day C", blocks:["accessory","accessory","accessory","core"] },
    ];
    return base.slice(0, Math.min(3, freq));
  }

  // Default structured gym splits:
  if (freq === 2) {
    return [
      { label:"Upper", blocks:["push","pull","push","pull","accessory"] },
      { label:"Lower", blocks:["squat","hinge","squat","accessory","core"] },
    ];
  }

  if (freq === 3) {
    return [
      { label:"Push", blocks:["push","push","accessory","core"] },
      { label:"Legs", blocks:["squat","hinge","squat","accessory","core"] },
      { label:"Pull", blocks:["pull","pull","accessory","core"] },
    ];
  }

  if (freq === 4) {
    return [
      { label:"Upper A", blocks:["push","pull","push","accessory","core"] },
      { label:"Lower A", blocks:["squat","hinge","squat","accessory","core"] },
      { label:"Upper B", blocks:["pull","push","pull","accessory","core"] },
      { label:"Lower B", blocks:["hinge","squat","hinge","accessory","core"] },
    ];
  }

  if (freq === 5) {
    return [
      { label:"Push", blocks:["push","push","accessory","core"] },
      { label:"Pull", blocks:["pull","pull","accessory","core"] },
      { label:"Legs", blocks:["squat","hinge","squat","accessory","core"] },
      { label:"Upper", blocks:["push","pull","accessory","core"] },
      { label:"Lower", blocks:["hinge","squat","accessory","core"] },
    ];
  }

  // 6+ days: add a conditioning/mobility day in rotation
  const base6 = [
    { label:"Push", blocks:["push","push","accessory","core"] },
    { label:"Pull", blocks:["pull","pull","accessory","core"] },
    { label:"Legs", blocks:["squat","hinge","squat","accessory","core"] },
    { label:"Upper", blocks:["push","pull","accessory","core"] },
    { label:"Lower", blocks:["hinge","squat","accessory","core"] },
    { label:"Conditioning", blocks:["cardio","core","mobility","core"] },
  ];
  return base6.slice(0, freq);
}

function buildSession(cfg, recipe, sessionIndex) {
  const items = [];
  const usedNames = new Set();
  const usedPatterns = new Set();
  const seedBase = `${cfg.style}|${cfg.goal}|${cfg.units}|${cfg.gender}|${recipe.label}|${sessionIndex}`;

  for (let i = 0; i < recipe.blocks.length; i++) {
    const b = recipe.blocks[i];
    let pool = null;
    let preferPattern = null;

    if (b === "push") { pool = POOLS.push; preferPattern = "push"; }
    if (b === "pull") { pool = POOLS.pull; preferPattern = "pull"; }
    if (b === "squat") { pool = POOLS.squat; preferPattern = "squat"; }
    if (b === "hinge") { pool = POOLS.hinge; preferPattern = "hinge"; }
    if (b === "accessory") { pool = POOLS.accessory; }
    if (b === "core") { pool = POOLS.core; }
    if (b === "mobility") { pool = POOLS.mobility; }
    if (b === "cardio") { pool = POOLS.cardio; }

    const ex = pickSeeded(cfg, pool || [], seedBase + `|${b}|${i}`, usedNames, usedPatterns, { preferPattern });
    addItem(cfg, items, usedNames, usedPatterns, ex);
  }

  return { id: `S${uid()}`, label: recipe.label, items };
}

export function generateProgram(cfg) {
  const createdAt = Date.now();
  const freq = Math.max(2, Math.min(6, Number(cfg.freq) || 3));

  const meta = {
    style: cfg.style,
    goal: cfg.goal,
    freq,
    recovery: cfg.recovery,
    units: cfg.units,
    createdAt,
  };

  const recipes = sessionRecipes(cfg, freq);
  const sessions = recipes.map((r, i) => buildSession(cfg, r, i));

  return { meta, sessions };
                      }
