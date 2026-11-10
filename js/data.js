// Game data: difficulties, satellites (towers), enemies and wave composition.
window.OD = window.OD || {};
(function (OD) {
  "use strict";

  OD.WIN_WAVE = 30;

  OD.DIFFICULTY = {
    easy: {
      name: "Easy", color: "#7dff9a", money: 300, lives: 50, hp: 1.0, growth: 0.27, late: 0.026, late2: 0.03, speed: 0.95, reward: 1.05,
      desc: "50 planet HP, weaker enemies.",
    },
    medium: {
      name: "Medium", color: "#ffd166", money: 275, lives: 25, hp: 1.06, growth: 0.33, late: 0.038, late2: 0.07, speed: 1.03, reward: 1.0,
      desc: "25 planet HP. A real fight past wave 15.",
    },
    hard: {
      name: "Hard", color: "#ff5c7a", money: 260, lives: 15, hp: 1.1, growth: 0.34, late: 0.038, late2: 0.1, speed: 1.06, reward: 0.95,
      desc: "15 planet HP, tough, fast enemies that ramp up hard after wave 10.",
    },
  };

  // Each satellite has 3 shared tiers, then branches into path A or B (2 more tiers each).
  // A tier's `cost` is what you pay to reach it (tier 0 cost = build price).
  OD.TOWERS = {
    laser: {
      name: "Laser Sat", key: "1", color: "#6cf0ff", desc: "Rapid beam, single target", kind: "laser", targets: true,
      tiers: [
        { name: "Laser Sat", cost: 50, dmg: 6, range: 150, rate: 5 },
        { name: "Twin Emitters", cost: 55, dmg: 8, range: 155, rate: 7, desc: "Adds a second emitter." },
        { name: "Focus Lens", cost: 90, dmg: 12, range: 175, rate: 8, desc: "Focused beam: more damage and range." },
      ],
      paths: {
        A: {
          name: "Prism Array", color: "#c18cff", desc: "The beam splits through a prism to hit extra targets.",
          tiers: [
            { name: "Prism Array", cost: 180, dmg: 14, range: 185, rate: 8, chain: 2, desc: "Beam splits to 2 extra targets." },
            { name: "Spectrum Cannon", cost: 420, dmg: 22, range: 205, rate: 9, chain: 4, desc: "Beam splits to 4 extra targets." },
          ],
        },
        B: {
          name: "Solar Lance", color: "#ffb347", desc: "A continuous beam that heats up the longer it holds a target.",
          tiers: [
            { name: "Solar Lance", cost: 200, dps: 55, range: 195, ramp: 3, desc: "Up to 3× damage on a held target." },
            { name: "Sunspear", cost: 480, dps: 115, range: 215, ramp: 4, desc: "Up to 4× damage. Melts bosses." },
          ],
        },
      },
    },

    missile: {
      name: "Missile Pod", key: "2", color: "#ff9f43", desc: "Homing rockets, splash", kind: "missile", targets: true,
      tiers: [
        { name: "Missile Pod", cost: 90, dmg: 26, range: 190, rate: 0.9, splash: 50, count: 1 },
        { name: "Twin Tubes", cost: 85, dmg: 28, range: 195, rate: 0.9, splash: 52, count: 2, desc: "Fires 2 missiles per volley." },
        { name: "Quad Rack", cost: 140, dmg: 34, range: 215, rate: 1.2, splash: 60, count: 2, desc: "Faster reloads, bigger blasts." },
      ],
      paths: {
        A: {
          name: "Cluster Swarm", color: "#ffd166", desc: "Missiles burst into bomblets on impact.",
          tiers: [
            { name: "Cluster Swarm", cost: 230, dmg: 36, range: 225, rate: 1.3, splash: 55, count: 3, cluster: 4, clusterDmg: 14, desc: "3 missiles, each bursts into 4 bomblets." },
            { name: "Hive Barrage", cost: 550, dmg: 46, range: 240, rate: 1.5, splash: 60, count: 5, cluster: 6, clusterDmg: 22, desc: "5-missile salvos, 6 bomblets each." },
          ],
        },
        B: {
          name: "Nova Warhead", color: "#ff5c5c", desc: "One huge warhead: massive blast that sets enemies burning.",
          tiers: [
            { name: "Nova Warhead", cost: 260, dmg: 150, range: 230, rate: 0.6, splash: 105, count: 1, burn: 18, desc: "Huge blast + burning." },
            { name: "Supernova", cost: 620, dmg: 400, range: 250, rate: 0.6, splash: 150, count: 1, burn: 45, desc: "A small star going off." },
          ],
        },
      },
    },

    tractor: {
      name: "Tractor Beam", key: "4", color: "#b388ff", desc: "Slows and drains nearby", kind: "field",
      tiers: [
        { name: "Tractor Beam", cost: 70, dps: 2, range: 110, slow: 0.55 },
        { name: "Dense Field", cost: 70, dps: 4, range: 120, slow: 0.45, desc: "Stronger slow and drain." },
        { name: "Wide Emitter", cost: 110, dps: 6, range: 145, slow: 0.4, desc: "Much bigger field." },
      ],
      paths: {
        A: {
          name: "Singularity", color: "#7a5cff", desc: "Gravity pulses fling enemies back out to space.",
          tiers: [
            { name: "Singularity", cost: 240, dps: 10, range: 150, slow: 0.4, push: 55, pushEvery: 4, desc: "Pushes enemies back every 4s." },
            { name: "Event Horizon", cost: 560, dps: 30, range: 165, slow: 0.3, push: 100, pushEvery: 3.5, desc: "Huge pushback + crushing damage." },
          ],
        },
        B: {
          name: "Cryo Field", color: "#9ae8ff", desc: "Freezes enemies solid and makes them brittle (take more damage).",
          tiers: [
            { name: "Cryo Field", cost: 220, dps: 6, range: 150, slow: 0.35, freeze: 0.8, freezeEvery: 3, vuln: 1.25, desc: "Freezes every 3s; +25% damage taken." },
            { name: "Absolute Zero", cost: 520, dps: 10, range: 165, slow: 0.3, freeze: 1.4, freezeEvery: 2.8, vuln: 1.5, desc: "Longer freeze; +50% damage taken." },
          ],
        },
      },
    },

    emp: {
      name: "EMP Sat", key: "5", color: "#ffe066", desc: "Pulse stuns everything near", kind: "emp",
      tiers: [
        { name: "EMP Sat", cost: 110, dmg: 15, range: 120, rate: 0.33, stun: 0.4 },
        { name: "Overcharge", cost: 90, dmg: 24, range: 125, rate: 0.4, stun: 0.5, desc: "Stronger, more frequent pulses." },
        { name: "Wide Pulse", cost: 140, dmg: 32, range: 150, rate: 0.4, stun: 0.6, desc: "Bigger pulse radius." },
      ],
      paths: {
        A: {
          name: "Shockwave", color: "#fff3a0", desc: "Massive pulses with long stuns.",
          tiers: [
            { name: "Shockwave", cost: 260, dmg: 75, range: 180, rate: 0.42, stun: 0.9, desc: "Big damage, 0.9s stun." },
            { name: "Pulsar", cost: 600, dmg: 170, range: 220, rate: 0.5, stun: 1.2, desc: "Enormous pulses, 1.2s stun." },
          ],
        },
        B: {
          name: "Ion Storm", color: "#80b3ff", desc: "Replaces pulses with chain lightning that jumps between enemies.",
          tiers: [
            { name: "Ion Storm", cost: 280, arc: true, dmg: 26, range: 170, rate: 4, chains: 2, stun: 0.08, desc: "Lightning jumps to 2 more enemies." },
            { name: "Tesla Crown", cost: 640, arc: true, dmg: 42, range: 190, rate: 6, chains: 4, stun: 0.1, desc: "Lightning jumps to 4 more enemies." },
          ],
        },
      },
    },

    miner: {
      name: "Mining Sat", key: "7", color: "#f5c542", desc: "Earns credits during waves", kind: "miner",
      tiers: [
        { name: "Mining Sat", cost: 120, income: 8, every: 8 },
        { name: "Ore Drills", cost: 100, income: 12, every: 8, desc: "More credits per cycle." },
        { name: "Refinery", cost: 160, income: 18, every: 8, desc: "Even more credits." },
      ],
      paths: {
        A: {
          name: "Deep Core Rig", color: "#ff9a3c", desc: "Pure profit.",
          tiers: [
            { name: "Deep Core Rig", cost: 320, income: 36, every: 8, desc: "Doubles income." },
            { name: "Stellar Forge", cost: 700, income: 70, every: 8, desc: "Mines a small star." },
          ],
        },
        B: {
          name: "Command Relay", color: "#5cc8ff", desc: "Boosts the fire rate and range of nearby satellites.",
          tiers: [
            { name: "Command Relay", cost: 300, income: 16, every: 8, buffRange: 150, buffRate: 1.2, buffRangeMul: 1.1, desc: "Nearby: +20% fire rate, +10% range. Fire-rate bonuses from relays stack (up to +140%)." },
            { name: "Fleet Uplink", cost: 650, income: 22, every: 8, buffRange: 180, buffRate: 1.35, buffRangeMul: 1.15, desc: "Nearby: +35% fire rate, +15% range. Fire-rate bonuses from relays stack (up to +140%)." },
          ],
        },
      },
    },

    carrier: {
      name: "Drone Carrier", key: "9", color: "#ff7ad9", desc: "Launches fighter drones", kind: "carrier", targets: true,
      tiers: [
        { name: "Drone Carrier", cost: 160, range: 230, craft: 2, dmg: 7, rate: 3 },
        { name: "Hangar Bay", cost: 130, range: 240, craft: 3, dmg: 8, rate: 3, desc: "A third fighter." },
        { name: "Ace Pilots", cost: 180, range: 260, craft: 3, dmg: 12, rate: 4, desc: "Faster, deadlier fighters." },
      ],
      paths: {
        A: {
          name: "Strike Wing", color: "#ff9de6", desc: "A swarm of fast fighters.",
          tiers: [
            { name: "Strike Wing", cost: 340, range: 280, craft: 5, dmg: 15, rate: 4, desc: "5 fighters." },
            { name: "Armada", cost: 760, range: 300, craft: 7, dmg: 22, rate: 5, desc: "7 elite fighters." },
          ],
        },
        B: {
          name: "Bomber Wing", color: "#ff6b8b", desc: "Heavy bombers that carpet-bomb groups.",
          tiers: [
            { name: "Bomber Wing", cost: 360, range: 280, craft: 3, bomb: true, dmg: 70, splash: 50, rate: 0.8, desc: "3 bombers with splash bombs." },
            { name: "Siege Wing", cost: 800, range: 300, craft: 4, bomb: true, dmg: 160, splash: 65, rate: 1, desc: "4 heavy bombers." },
          ],
        },
      },
    },
    rail: {
      name: "Railgun", key: "r", color: "#7dff9a", desc: "Huge damage, long reload", kind: "rail", targets: true,
      tiers: [
        { name: "Railgun", cost: 150, dmg: 120, range: 320, rate: 0.35 },
        { name: "Capacitor Bank", cost: 140, dmg: 165, range: 330, rate: 0.45, desc: "Faster charging, harder hits." },
        { name: "Piercing Slug", cost: 220, dmg: 210, range: 350, rate: 0.5, pierce: true, desc: "Shots pierce every enemy in a line." },
      ],
      paths: {
        A: {
          name: "Mass Driver", color: "#b6ff6c", desc: "Colossal shots built to crack bosses and shields.",
          tiers: [
            { name: "Mass Driver", cost: 420, dmg: 480, range: 380, rate: 0.45, pierce: true, boss: 2.5, desc: "2.5× damage to bosses." },
            { name: "Planet Cracker", cost: 900, dmg: 1150, range: 420, rate: 0.5, pierce: true, boss: 3, desc: "3× damage to bosses." },
          ],
        },
        B: {
          name: "Coil Repeater", color: "#39e6a0", desc: "Rotary coil barrels trade raw power for fire rate.",
          tiers: [
            { name: "Coil Repeater", cost: 380, dmg: 100, range: 330, rate: 2.5, pierce: true, desc: "Rapid piercing shots." },
            { name: "Gauss Storm", cost: 850, dmg: 150, range: 350, rate: 5, pierce: true, desc: "A hail of piercing slugs." },
          ],
        },
      },
    },

    // ---------- added later: Flak Array, Mine Layer, Focus Array (satellites) and the Missile Silo (ground) ----------
    flak: {
      name: "Flak Array", key: "3", color: "#ffb26b", desc: "Bursts hit several targets", kind: "flak", targets: true,
      tiers: [
        { name: "Flak Array", cost: 100, dmg: 12, range: 140, rate: 1.2, hits: 3 },
        { name: "Twin Barrels", cost: 80, dmg: 15, range: 145, rate: 1.4, hits: 4, desc: "Hits 4 targets per burst." },
        { name: "Proximity Fuses", cost: 130, dmg: 20, range: 160, rate: 1.5, hits: 5, desc: "Hits 5 targets, longer reach." },
      ],
      paths: {
        A: {
          name: "Hailstorm", color: "#ffd166", desc: "Wider bursts that shred whole swarms.",
          tiers: [
            { name: "Hailstorm", cost: 260, dmg: 24, range: 170, rate: 1.8, hits: 8, desc: "Hits 8 targets per burst." },
            { name: "Steel Rain", cost: 600, dmg: 34, range: 185, rate: 2.2, hits: 12, desc: "Hits 12 targets per burst." },
          ],
        },
        B: {
          name: "Shredder", color: "#ff7a4a", desc: "Armor-piercing rounds that ignore armor.",
          tiers: [
            { name: "Shredder", cost: 280, dmg: 44, range: 170, rate: 1.5, hits: 5, pierceArmor: true, desc: "Ignores armor." },
            { name: "Hull Breaker", cost: 640, dmg: 82, range: 185, rate: 1.7, hits: 6, pierceArmor: true, desc: "Ignores armor, huge hits." },
          ],
        },
      },
    },

    mines: {
      name: "Mine Layer", key: "6", color: "#ff6b8a", desc: "Drops space mines on its orbit", kind: "mines",
      tiers: [
        { name: "Mine Layer", cost: 150, dmg: 90, splash: 45, every: 2.5, max: 4, range: 30 },
        { name: "Mine Racks", cost: 110, dmg: 120, splash: 50, every: 2.6, max: 5, range: 30, desc: "Faster, stronger mines." },
        { name: "Smart Mines", cost: 170, dmg: 160, splash: 55, every: 2.2, max: 6, range: 34, desc: "Up to 6 mines at once." },
      ],
      paths: {
        A: {
          name: "Minefield", color: "#ffd166", desc: "Lays mines fast to carpet the orbit.",
          tiers: [
            { name: "Minefield", cost: 340, dmg: 180, splash: 55, every: 1.4, max: 10, range: 34, desc: "Up to 10 mines." },
            { name: "Kill Zone", cost: 760, dmg: 280, splash: 60, every: 0.9, max: 16, range: 36, desc: "Up to 16 mines." },
          ],
        },
        B: {
          name: "Nuke Mines", color: "#ff4a4a", desc: "Few mines, enormous blasts.",
          tiers: [
            { name: "Nuke Mine", cost: 380, dmg: 600, splash: 90, every: 3.5, max: 4, range: 36, desc: "Huge blasts." },
            { name: "Star Breaker", cost: 820, dmg: 1600, splash: 120, every: 3.5, max: 5, range: 40, desc: "Enormous blasts." },
          ],
        },
      },
    },

    focus: {
      name: "Focus Array", key: "8", color: "#9cf6ff", desc: "Boosts nearby satellites' damage", kind: "focus",
      tiers: [
        { name: "Focus Array", cost: 180, focusRange: 140, focusDmg: 1.15 },
        { name: "Wide Lens", cost: 140, focusRange: 150, focusDmg: 1.2, desc: "Nearby: +20% damage." },
        { name: "Phase Lens", cost: 200, focusRange: 165, focusDmg: 1.25, desc: "Nearby: +25% damage." },
      ],
      paths: {
        A: {
          name: "Prism Lens", color: "#c18cff", desc: "A bigger damage boost for every satellite nearby.",
          tiers: [
            { name: "Prism Lens", cost: 420, focusRange: 180, focusDmg: 1.35, desc: "Nearby: +35% damage." },
            { name: "Star Lens", cost: 900, focusRange: 200, focusDmg: 1.5, desc: "Nearby: +50% damage." },
          ],
        },
        B: {
          name: "Weak-Point Scanner", color: "#ff9de6", desc: "Marks invaders in range so everything hits them harder.",
          tiers: [
            { name: "Target Scanner", cost: 400, focusRange: 170, focusDmg: 1.25, mark: 1.15, desc: "Invaders in range take +15% damage." },
            { name: "Deep Scan", cost: 860, focusRange: 190, focusDmg: 1.3, mark: 1.3, desc: "Invaders in range take +30% damage." },
          ],
        },
      },
    },

    silo: {
      name: "Missile Silo", key: "g", color: "#9fd4ff", desc: "Ground launcher, defends LEO", kind: "silo", targets: true, ground: true,
      tiers: [
        { name: "Missile Silo", cost: 120, dmg: 54, rate: 0.8, splash: 40, count: 1 },
        { name: "Twin Silos", cost: 100, dmg: 61, rate: 1.0, splash: 42, count: 2, desc: "Fires 2 interceptors." },
        { name: "Fast Reload", cost: 150, dmg: 76, rate: 1.2, splash: 50, count: 2, desc: "Faster, harder hits." },
      ],
      paths: {
        A: {
          name: "Barrage", color: "#ffd166", desc: "Salvos of interceptors.",
          tiers: [
            { name: "Barrage", cost: 300, dmg: 83, rate: 1.5, splash: 50, count: 4, desc: "4-missile salvos." },
            { name: "Sky Wall", cost: 680, dmg: 108, rate: 1.8, splash: 55, count: 6, desc: "6-missile salvos." },
          ],
        },
        B: {
          name: "Nuke Silo", color: "#ff5c5c", desc: "One massive interceptor at a time.",
          tiers: [
            { name: "Nuke Silo", cost: 340, dmg: 396, rate: 0.5, splash: 110, count: 1, desc: "Huge blast." },
            { name: "Doomsday Silo", cost: 760, dmg: 1008, rate: 0.5, splash: 150, count: 1, desc: "Enormous blast." },
          ],
        },
      },
    },
  };

  // Each satellite in the unlock order costs more to build than the one before, and hits harder to match:
  // build price, and a multiplier on damage (or income) for every tier and specialization of that satellite.
  // Upgrade prices are unchanged.
  const TUNE = {
    tractor: { cost: 110, mul: 1.3 }, emp: { cost: 140, mul: 1.2 }, miner: { cost: 160, mul: 1.25 },
    carrier: { cost: 220, mul: 1.25 }, rail: { cost: 300, mul: 1.5 },
  };
  for (const [type, t] of Object.entries(TUNE)) {
    const def = OD.TOWERS[type];
    def.tiers[0].cost = t.cost;
    const all = [...def.tiers, ...Object.values(def.paths).flatMap(p => p.tiers)];
    for (const tier of all) for (const k of ["dmg", "dps", "income", "clusterDmg", "burn"]) if (tier[k]) tier[k] = k === "income" ? Math.round(tier[k] * t.mul) : Math.round(tier[k] * t.mul * 10) / 10;
  }

  // Like Bloons, satellites unlock as you go: each one appears in the build bar (as a locked "?") once this many
  // waves have been cleared in the current game. The Railgun, the strongest, comes last.
  OD.UNLOCK_WAVE = { laser: 0, missile: 3, silo: 4, flak: 5, tractor: 7, emp: 9, mines: 11, miner: 12, focus: 14, carrier: 16, rail: 18 };
  // build-bar order = unlock order
  const ORDER = Object.keys(OD.UNLOCK_WAVE), T0 = OD.TOWERS;
  OD.TOWERS = Object.fromEntries(ORDER.map(k => [k, T0[k]]));

  OD.tierOf = (type, level, path) => {
    const def = OD.TOWERS[type];
    return level <= 2 ? def.tiers[level] : def.paths[path].tiers[level - 3];
  };

  OD.ENEMIES = {
    drone:    { name: "Drone",          hp: 24,    speed: 46,  reward: 5,   size: 9,  color: "#ff5c7a", dmg: 1,   spiral: 0.8 },
    swarm:    { name: "Swarmer",        hp: 9,     speed: 78,  reward: 2,   size: 5,  color: "#ff9fb2", dmg: 1,   spiral: 0.7 },
    comet:    { name: "Comet",          hp: 18,    speed: 100, reward: 5,   size: 7,  color: "#9ad7ff", dmg: 1,   spiral: 0.35 },
    asteroid: { name: "Asteroid",       hp: 150,   speed: 30,  reward: 10,  size: 16, color: "#a68a6d", dmg: 2,   spiral: 0.6, split: { type: "rock", n: 2 } },
    rock:     { name: "Rock",           hp: 45,    speed: 40,  reward: 3,   size: 9,  color: "#8f7a64", dmg: 1,   spiral: 0.6 },
    cruiser:  { name: "Shield Cruiser", hp: 150,   shield: 130, speed: 36, reward: 16, size: 13, color: "#5c9dff", dmg: 3, spiral: 0.7 },
    mother:   { name: "Mothership",     hp: 1500,  speed: 20,  reward: 150, size: 30, color: "#ff3df2", dmg: 6,  spiral: 0.5, boss: true, spawn: { type: "drone", every: 4 } },
    dread:    { name: "Dreadnought",    hp: 6000, shield: 2200, speed: 13, reward: 600, size: 44, color: "#ff2d55", dmg: 20, spiral: 0.45, boss: true, spawn: { type: "cruiser", every: 6 } },
    // Endless (wave 31+): bigger, tougher invaders that arrive more and more often
    brute:    { name: "Juggernaut",     hp: 900,  armor: 0.4, speed: 26, reward: 30, size: 20, color: "#ff8a3c", dmg: 4, spiral: 0.6 },                       // armored: takes 40% less damage
    phantom:  { name: "Phase Wraith",   hp: 420,  speed: 64, reward: 24, size: 14, color: "#7affd9", dmg: 3, spiral: 0.75, cloak: { on: 1.6, off: 2.6 } },  // phases out of sight: can't be targeted
    brood:    { name: "Brood Hive",     hp: 3200, speed: 17, reward: 120, size: 28, color: "#c8ff4a", dmg: 8, spiral: 0.55, heal: 0.02, spawn: { type: "swarm", every: 1.4 }, split: { type: "swarm", n: 8 } },
    aegis:    { name: "Aegis Bastion",  hp: 2600, shield: 4200, armor: 0.25, regen: 0.35, regenDelay: 1.5, speed: 19, reward: 150, size: 26, color: "#4af0ff", dmg: 10, spiral: 0.5 },
    titan:    { name: "Void Titan",     hp: 32000, shield: 14000, armor: 0.35, regen: 0.12, speed: 11, reward: 2000, size: 58, color: "#9d4dff", dmg: 40, spiral: 0.45, boss: true, spawn: { type: "brute", every: 5 } },
  };

  // Returns an ordered list of groups: { type, count, gap }.
  OD.buildWave = function (n) {
    const g = [];
    const add = (type, count, gap) => { count = Math.round(count); if (count > 0) g.push({ type, count, gap }); };
    add("drone", 5 + n * 1.7, 0.7);
    if (n >= 3) add("comet", 1 + n * 0.9, 0.5);
    if (n >= 4 && n % 2 === 0) add("swarm", 6 + n, 0.12);
    if (n >= 6) add("asteroid", (n - 4) * 0.5, 1.3);
    if (n >= 9) add("cruiser", (n - 7) * 0.55, 1.1);
    if (n > 30) add("swarm", Math.min(n, 90), 0.1);
    // Endless: the big new invaders join in, earlier and more often as the waves climb
    if (n > 30) add("brute", Math.min(40, 1 + (n - 30) * 0.4), 0.9);
    if (n >= 35 && n % 2 === 1) add("phantom", Math.min(36, 2 + (n - 35) * 0.5), 0.6);
    if (n >= 40 && (n % 3 === 0 || n >= 100)) add("brood", Math.min(8, 1 + (n - 40) / 20), 3);
    if (n >= 45 && (n % 4 === 1 || n >= 120)) add("aegis", Math.min(10, 1 + (n - 45) / 15), 2.5);
    // light shuffle of the non-boss groups so waves feel different
    for (let i = g.length - 1; i > 0; i--) {
      if (Math.random() < 0.5) { const j = Math.floor(Math.random() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
    }
    if (n % 10 === 0 && n < 30) add("mother", n / 10, 4);
    if (n === 30) add("dread", 1, 1);
    if (n > 30 && n % 5 === 0) add("mother", Math.floor((n - 25) / 5), 3);
    if (n > 30 && n % 20 === 10) add("dread", 1 + Math.floor((n - 30) / 40), 2); // waves 50, 70, 90…
    if (n >= 55 && n % 15 === 10) add("titan", 1 + Math.floor((n - 55) / 60), 6); // waves 55, 70, 85, 100…
    // long Endless runs: past wave 60 the swarm of small fry stops growing (the big ships take over)
    if (n > 60) for (const grp of g) if (["drone", "comet", "asteroid", "cruiser", "swarm"].includes(grp.type)) grp.count = Math.min(grp.count, { drone: 110, comet: 60, asteroid: 40, cruiser: 40, swarm: 60 }[grp.type]);
    return g;
  };

  OD.hpScale = function (n, diff) {
    // linear growth, plus a curve from wave 8 that is steeper on harder difficulties
    // and a second, steeper climb from wave 18 so the last stretch stays tense
    // Endless past wave 60: an extra 3.5% per wave on top, compounding, so no defense holds forever
    return diff.hp * (1 + (n - 1) * diff.growth + Math.max(0, n - 8) ** 2 * diff.late + Math.max(0, n - 18) ** 2 * diff.late2) * 1.035 ** Math.max(0, n - 60);
  };
})(window.OD);
