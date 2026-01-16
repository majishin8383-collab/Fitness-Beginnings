// js/generator.js
// Deterministic plan generator v0.3
// Fixes: same exercises each session + duplicates within a session

const uid = (() => {
  let n = 0;
  return () => String(++n);
})();

function eqTags(cfg) {
  const t = new Set();
  t.add("bw");
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

// Tiny stable hash -> integer (FNV-ish)
function hashInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

// Seeded pick from pool, excluding already-picked names
function pickSeeded(cfg, pool, seed, usedNames, { preferPattern } = {}) {
  const tags = eqTags(cfg);

  const list = pool.filter(x => {
    if (preferPattern && x.pattern !== preferPattern) return false;
    if (movementBlocked(cfg, x.pattern)) return false;

    // equipment match
    if (!x.tags.some(tt => tags.has(tt))) return false;

    // avoid duplicates within session
    if (usedNames.has(x.name)) return false;

    // spine sensitivity extra safety
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

  // Choose index based on seed, but also “walk” if collision/edge case
  const base = hashInt(seed);
  for (let k = 0; k < list.length; k++) {
    const idx = (base + k) % list.length;
    const choice = list[idx];
    if (!usedNames.has(choice.name)) return choice;
  }

  return list[0];
}

function ruleFor(cfg, pattern) {
  const units = cfg.units || "lb";
  const female = cfg.gender === "female";
  const strength = cfg.goal === "strength";
  const endurance = cfg.goal === "endurance";
  const mobility = cfg.goal === "mobility";

  if (mobility) return null;

  // hypertrophy default
  let repMin = 8, repMax = 12;
  let inc = (units === "kg" ? 1.25 : 2.5);

  if (strength) { repMin = 3; repMax = 6; inc = (units === "kg" ? 2.5 : 5); }
  if (endurance) { repMin = 12; repMax = 20; inc = (units === "kg" ? 1.25 : 2.5); }

  // HIT: bias lower on compounds
  if (cfg.style === "hit") {
    if (pattern === "squat" || pattern === "hinge") { repMin = 5; repMax = 8; }
    if (pattern === "push" || pattern === "pull") { repMin = 6; repMax = 10; }
  }

  // spine sensitivity: smaller jumps + safer range on lower body
  if (cfg.inj_spine === "high" && (pattern === "squat" || pattern === "hinge")) {
    repMin = Math.max(repMin, 6);
    repMax = Math.max(repMax, 10);
    inc = (units === "kg" ? 1.25 : 2.5);
  }

  // quiet gender bias (defaults only)
  if (female) {
    repMin += 1;
    repMax += 2;
    inc = (units === "kg" ? 1.25 : 2.5);
  }

  return { repMin, repMax, inc, trigger: "clean_at_top" };
}

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
  accessories: [
    { name:"Lateral raise", pattern:"accessory", logType:"loadreps", tags:["dumbbell","cables"] },
    { name:"Curl", pattern:"accessory", logType:"loadreps", tags:["dumbbell","cables","barbell"] },
    { name:"Triceps pressdown", pattern:"accessory", logType:"loadreps", tags:["cables"] },
    { name:"Calf raise", pattern:"accessory", logType:"loadreps", tags:["bw","barbell","dumbbell"] },
    { name:"Dips", pattern:"dips", logType:"loadreps", tags:["dip","bw"] },
  ],
  pilates: [
    { name:"Breath + bracing", pattern:"core", logType:"timed", tags:["bw"] },
    { name:"Dead bug / hollow hold", pattern:"core", logType:"timed", tags:["bw"] },
    { name:"Side plank", pattern:"core", logType:"timed", tags:["bw"] },
    { name:"Hip mobility flow", pattern:"mobility", logType:"timed", tags:["bw"] },
    { name:"Thoracic mobility flow", pattern:"mobility", logType:"timed", tags:["bw"] },
  ],
  tactical: [
    { name:"Push-up interval", pattern:"push", logType:"timed", tags:["bw"] },
    { name:"Squat / lunge interval", pattern:"squat", logType:"timed", tags:["bw"] },
    { name:"Core circuit", pattern:"core", logType:"circuit", tags:["bw"] },
    { name:"Run/ruck/bike interval", pattern:"cardio", logType:"timed", tags:["cardio"] },
  ],
  calisthenics: [
    { name:"Push-up (variation)", pattern:"push", logType:"loadreps", tags:["bw"] },
    { name:"Pull-up (variation)", pattern:"pull", logType:"loadreps", tags:["pullup","bw"] },
    { name:"Dip (variation)", pattern:"dips", logType:"loadreps", tags:["dip","bw"] },
    { name:"Split squat progression", pattern:"squat", logType:"loadreps", tags:["bw"] },
    { name:"Hollow hold / plank", pattern:"core", logType:"timed", tags:["bw"] },
  ],
};

function addItem(cfg, items, usedNames, ex) {
  if (!ex) return;
  usedNames.add(ex.name);
  items.push({
    id: `I${uid()}`,
    name: ex.name,
    logType: ex.logType,
    pattern: ex.pattern,
    rule: ex.logType === "loadreps" ? ruleFor(cfg, ex.pattern) : null,
    defaultUnits: cfg.units || "lb",
  });
}

function buildSession(cfg, label, sessionIndex) {
  const items = [];
  const usedNames = new Set();
  const seedBase = `${cfg.style}|${cfg.goal}|${cfg.units}|${cfg.gender}|${label}|${sessionIndex}`;

  if (cfg.style === "pilates") {
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.pilates, seedBase + "|1", usedNames));
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.pilates, seedBase + "|2", usedNames, { preferPattern: "mobility" }));
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.pilates, seedBase + "|3", usedNames));
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.pilates, seedBase + "|4", usedNames, { preferPattern: "mobility" }));
    return { id: `S${uid()}`, label, items };
  }

  if (cfg.style === "tactical") {
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.tactical, seedBase + "|push", usedNames, { preferPattern: "push" }));
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.pull, seedBase + "|pull", usedNames, { preferPattern: "pull" }));
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.tactical, seedBase + "|squat", usedNames, { preferPattern: "squat" }));
    addItem(cfg, items, usedNames,
      pickSeeded(cfg, POOLS.tactical, seedBase + "|cardio", usedNames, { preferPattern: "cardio" }) ||
      pickSeeded(cfg, POOLS.tactical, seedBase + "|core", usedNames, { preferPattern: "core" })
    );
    return { id: `S${uid()}`, label, items };
  }

  if (cfg.style === "calisthenics") {
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.calisthenics, seedBase + "|push", usedNames, { preferPattern: "push" }));
    addItem(cfg, items, usedNames,
      pickSeeded(cfg, POOLS.calisthenics, seedBase + "|pull", usedNames, { preferPattern: "pull" }) ||
      pickSeeded(cfg, POOLS.pull, seedBase + "|pull2", usedNames, { preferPattern: "pull" })
    );
    addItem(cfg, items, usedNames,
      pickSeeded(cfg, POOLS.calisthenics, seedBase + "|squat", usedNames, { preferPattern: "squat" }) ||
      pickSeeded(cfg, POOLS.squat, seedBase + "|squat2", usedNames, { preferPattern: "squat" })
    );
    addItem(cfg, items, usedNames,
      pickSeeded(cfg, POOLS.calisthenics, seedBase + "|core", usedNames, { preferPattern: "core" }) ||
      pickSeeded(cfg, POOLS.pilates, seedBase + "|core2", usedNames, { preferPattern: "core" })
    );
    return { id: `S${uid()}`, label, items };
  }

  if (cfg.style === "hit") {
    // Minimalist HIT A/B/C — still varies deterministically
    if (label === "Day A") {
      addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.push, seedBase + "|push1", usedNames, { preferPattern: "push" }));
      addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.push, seedBase + "|push2", usedNames, { preferPattern: "push" }));
      addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.pull, seedBase + "|pull1", usedNames, { preferPattern: "pull" }));
      addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.pull, seedBase + "|pull2", usedNames, { preferPattern: "pull" }));
      return { id: `S${uid()}`, label, items };
    }
    if (label === "Day B") {
      addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.squat, seedBase + "|legs1", usedNames, { preferPattern: "squat" }));
      addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.hinge, seedBase + "|legs2", usedNames, { preferPattern: "hinge" }));
      addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.accessories, seedBase + "|acc", usedNames));
      return { id: `S${uid()}`, label, items };
    }
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.accessories, seedBase + "|a1", usedNames));
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.accessories, seedBase + "|a2", usedNames));
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.accessories, seedBase + "|a3", usedNames));
    addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.accessories, seedBase + "|a4", usedNames));
    return { id: `S${uid()}`, label, items };
  }

  // General / Traditional: rotate the emphasis per sessionIndex
  const orders = [
    ["push","pull","squat","accessories"],
    ["pull","push","hinge","accessories"],
    ["push","pull","hinge","accessories"],
    ["pull","push","squat","accessories"],
  ];
  const ord = orders[sessionIndex % orders.length];

  for (let slot = 0; slot < ord.length; slot++) {
    const key = ord[slot];
    if (key === "push") addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.push, seedBase + `|push${slot}`, usedNames, { preferPattern:"push" }));
    if (key === "pull") addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.pull, seedBase + `|pull${slot}`, usedNames, { preferPattern:"pull" }));
    if (key === "squat") addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.squat, seedBase + `|squat${slot}`, usedNames, { preferPattern:"squat" }));
    if (key === "hinge") addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.hinge, seedBase + `|hinge${slot}`, usedNames, { preferPattern:"hinge" }));
    if (key === "accessories") addItem(cfg, items, usedNames, pickSeeded(cfg, POOLS.accessories, seedBase + `|acc${slot}`, usedNames));
  }

  return { id: `S${uid()}`, label, items };
}

export function generateProgram(cfg) {
  const createdAt = Date.now();
  const meta = {
    style: cfg.style,
    goal: cfg.goal,
    freq: Number(cfg.freq),
    recovery: cfg.recovery,
    units: cfg.units,
    createdAt,
  };

  const labels = (() => {
    const f = Number(cfg.freq);
    if (cfg.style === "hit") return ["Day A", "Day B", "Day C"].slice(0, Math.min(3, f));
    if (f === 2) return ["Session 1", "Session 2"];
    if (f === 3) return ["Session 1", "Session 2", "Session 3"];
    return Array.from({ length: f }, (_, i) => `Session ${i + 1}`);
  })();

  const sessions = labels.map((l, i) => buildSession(cfg, l, i));
  return { meta, sessions };
}
