// js/generator.js
// Tiny plan generator v0.1 (rule-based, not template bloat)

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
  // pullups: avoid still allows rows/pulldowns
  return false;
}

function pick(cfg, pool, { preferPattern } = {}) {
  const tags = eqTags(cfg);
  const list = pool.filter(x => {
    if (preferPattern && x.pattern !== preferPattern) return false;
    if (movementBlocked(cfg, x.pattern)) return false;

    // equipment match: needs at least one tag the user has
    const ok = x.tags.some(tt => tags.has(tt));
    if (!ok) return false;

    // extra safety: high spine sensitivity avoids barbell squat/deadlift naming
    if (cfg.inj_spine === "high") {
      const n = x.name.toLowerCase();
      if (n.includes("deadlift") || n === "back squat" || n === "squat") return false;
    }

    // if pullups limited/avoid, don’t pick pull-up
    if (x.name.toLowerCase().includes("pull-up") && cfg.mv_pullups !== "good") return false;

    // if dips limited, avoid dips
    if (x.name.toLowerCase() === "dips" && cfg.mv_dips !== "good") return false;

    return true;
  });

  return list[0] || null;
}

function ruleFor(cfg, pattern) {
  const units = cfg.units || "lb";
  const female = cfg.gender === "female";
  const strength = cfg.goal === "strength";
  const endurance = cfg.goal === "endurance";
  const mobility = cfg.goal === "mobility";

  if (mobility) return null;

  // base
  let repMin = 8, repMax = 12;
  let inc = (units === "kg" ? 1.25 : 2.5);

  if (strength) { repMin = 3; repMax = 6; inc = (units === "kg" ? 2.5 : 5); }
  if (endurance) { repMin = 12; repMax = 20; inc = (units === "kg" ? 1.25 : 2.5); }

  // HIT: slightly lower on compounds
  if (cfg.style === "hit") {
    if (pattern === "squat" || pattern === "hinge") { repMin = 5; repMax = 8; }
    if (pattern === "push" || pattern === "pull") { repMin = 6; repMax = 10; }
  }

  // high spine sensitivity: smaller jumps + safer range on lower body
  if (cfg.inj_spine === "high" && (pattern === "squat" || pattern === "hinge")) {
    repMin = Math.max(repMin, 6);
    repMax = Math.max(repMax, 10);
    inc = (units === "kg" ? 1.25 : 2.5);
  }

  // quiet gender bias where it statistically matters (defaults only)
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

function buildSession(cfg, label) {
  const items = [];
  const add = (ex) => {
    if (!ex) return;
    items.push({
      id: `I${uid()}`,
      name: ex.name,
      logType: ex.logType,
      pattern: ex.pattern,
      rule: ex.logType === "loadreps" ? ruleFor(cfg, ex.pattern) : null,
      defaultUnits: cfg.units || "lb",
    });
  };

  if (cfg.style === "pilates") {
    add(pick(cfg, POOLS.pilates));
    add(pick(cfg, POOLS.pilates, { preferPattern: "mobility" }));
    add(pick(cfg, POOLS.pilates));
    add(pick(cfg, POOLS.pilates, { preferPattern: "mobility" }));
    return { id: `S${uid()}`, label, items };
  }

  if (cfg.style === "tactical") {
    add(pick(cfg, POOLS.tactical, { preferPattern: "push" }));
    add(pick(cfg, POOLS.pull));
    add(pick(cfg, POOLS.tactical, { preferPattern: "squat" }));
    add(pick(cfg, POOLS.tactical, { preferPattern: "cardio" }) || pick(cfg, POOLS.tactical, { preferPattern: "core" }));
    return { id: `S${uid()}`, label, items };
  }

  if (cfg.style === "calisthenics") {
    add(pick(cfg, POOLS.calisthenics, { preferPattern: "push" }));
    add(pick(cfg, POOLS.calisthenics, { preferPattern: "pull" }) || pick(cfg, POOLS.pull));
    add(pick(cfg, POOLS.calisthenics, { preferPattern: "squat" }) || pick(cfg, POOLS.squat));
    add(pick(cfg, POOLS.calisthenics, { preferPattern: "core" }) || pick(cfg, POOLS.pilates));
    return { id: `S${uid()}`, label, items };
  }

  if (cfg.style === "hit") {
    // A/B/C rotation
    if (label === "Day A") {
      add(cfg.eq_cables ? { name:"Cable flye (pre-exhaust)", pattern:"push", logType:"loadreps", tags:["cables"] } : pick(cfg, POOLS.push));
      add(pick(cfg, POOLS.push));
      add(pick(cfg, POOLS.pull));
      add(pick(cfg, POOLS.pull));
      return { id: `S${uid()}`, label, items };
    }
    if (label === "Day B") {
      add(pick(cfg, POOLS.squat)); // already spine-aware filtered
      add(pick(cfg, POOLS.hinge));
      add(pick(cfg, POOLS.accessories, { preferPattern: "accessory" })); // often calves
      return { id: `S${uid()}`, label, items };
    }
    // Day C
    add(pick(cfg, POOLS.accessories));
    add(pick(cfg, POOLS.accessories));
    add(pick(cfg, POOLS.accessories));
    add(pick(cfg, POOLS.accessories));
    return { id: `S${uid()}`, label, items };
  }

  // Traditional / general: simple balanced session
  add(pick(cfg, POOLS.push));
  add(pick(cfg, POOLS.pull));
  add(pick(cfg, POOLS.squat));
  add(pick(cfg, POOLS.accessories));
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

  const sessions = labels.map(l => buildSession(cfg, l));

  return { meta, sessions };
}
