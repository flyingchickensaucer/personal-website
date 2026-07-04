// ============================================================
//  CHROMA RIFT — entities.js
//  All drawn, animated game objects: player, bullets, enemies,
//  the prism, and a multi-part boss. Everything is vector art.
// ============================================================
"use strict";

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function starPath(ctx, spikes, outer, inner, rot) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i / (spikes * 2)) * TAU;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// ------------------------------------------------------------
//  PLAYER  (works for solo mouse-aim and versus auto-fire)
// ------------------------------------------------------------
class Player {
  constructor(x, y, opts = {}) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 15;
    this.maxhp = 100; this.hp = 100;
    this.colorIdx = opts.colorIdx || 0;
    this.fireCd = 0;
    this.fireInterval = 0.12;
    this.invuln = 0;
    this.thrust = 0;
    this.ringSpin = 0;
    this.hitFlash = 0;
    this.colorSwitchPulse = 0;

    // control / role config
    this.index = opts.index || 0;
    this.label = opts.label || "";
    this.accent = opts.accent || [60, 110, 200];   // hull tint (rgb)
    this.aimMouse = !!opts.aimMouse;                // solo aims at mouse
    this.autoFire = !!opts.autoFire;                // versus auto-fires forward
    this.netControlled = !!opts.netControlled;      // online: driven by a remote peer
    this.netAngle = null;                            // remote aim angle (online)
    this.keys = opts.keys || { up: false, down: false, left: false, right: false };
    this.aimX = x; this.aimY = y;
    this.angle = opts.angle != null ? opts.angle : -Math.PI / 2;
    this.moving = false;

    // progression (versus)
    this.level = 1;
    this.xp = 0;
    this.xpNext = 8;
    this.frags = 0;
    this.alive = true;
    this.respawn = 0;     // countdown while dead
    this.spawnPulse = 0;  // grow-in after respawn
  }

  setColor(i) {
    if (i === this.colorIdx) return;
    this.colorIdx = i;
    this.colorSwitchPulse = 1;
  }

  pvpDamage() { return 6 * (1 + 0.18 * (this.level - 1)); }
  maxSpeed() { return 400 + (this.level - 1) * 7; }

  // returns number of levels gained (so caller can play fx)
  gainXp(amt) {
    this.xp += amt;
    let gained = 0;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      gained++;
      this.xpNext = Math.round(this.xpNext * 1.45 + 2);
      this.maxhp += 10;
      this.hp = Math.min(this.maxhp, this.hp + 14);
      this.fireInterval = Math.max(0.07, this.fireInterval * 0.95);
    }
    return gained;
  }

  update(dt, bounds) {
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.colorSwitchPulse = Math.max(0, this.colorSwitchPulse - dt * 3);
    this.ringSpin += dt * 1.4;
    if (this.spawnPulse > 0) this.spawnPulse = Math.max(0, this.spawnPulse - dt * 2);

    if (!this.alive) { this.thrust = 0; return; }

    const accel = 1500;
    let ax = 0, ay = 0;
    if (this.keys.up) ay -= 1;
    if (this.keys.down) ay += 1;
    if (this.keys.left) ax -= 1;
    if (this.keys.right) ax += 1;
    const m = Math.hypot(ax, ay);
    this.moving = m > 0;
    if (m > 0) { ax /= m; ay /= m; this.thrust = Math.min(1, this.thrust + dt * 6); }
    else this.thrust = Math.max(0, this.thrust - dt * 6);

    this.vx += ax * accel * dt;
    this.vy += ay * accel * dt;
    const fr = Math.pow(0.0016, dt);
    this.vx *= fr; this.vy *= fr;
    const sp = Math.hypot(this.vx, this.vy), max = this.maxSpeed();
    if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, bounds.x + this.r, bounds.x + bounds.w - this.r);
    this.y = clamp(this.y, bounds.y + this.r, bounds.y + bounds.h - this.r);

    // aim
    if (this.aimMouse) {
      this.angle = angLerp(this.angle, angleTo(this.x, this.y, this.aimX, this.aimY), 0.35);
    } else if (this.netControlled && this.netAngle != null) {
      this.angle = this.netAngle;
    } else if (this.moving) {
      this.angle = angLerp(this.angle, Math.atan2(ay, ax), 0.3);
    }
  }

  draw(ctx, time, showLabel) {
    // dead -> draw respawn indicator only
    if (!this.alive) {
      const rgb = COLORS[this.colorIdx].rgb;
      ctx.save();
      ctx.translate(this.x, this.y);
      glow(ctx, 0, 0, 28, rgb, 0.18);
      ctx.strokeStyle = rgbaArr(rgb, 0.5);
      ctx.lineWidth = 3;
      const frac = 1 - clamp(this.respawn / 3, 0, 1);
      ctx.beginPath();
      ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      ctx.stroke();
      ctx.fillStyle = rgbaArr(rgb, 0.8);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "700 16px 'Segoe UI', sans-serif";
      ctx.fillText(Math.ceil(this.respawn), 0, 1);
      ctx.restore();
      return;
    }

    const rgb = COLORS[this.colorIdx].rgb;
    const blink = this.invuln > 0 && Math.floor(time * 20) % 2 === 0;
    const grow = 1 + smooth(this.spawnPulse) * 0.6;

    ctx.save();
    ctx.translate(this.x, this.y);

    // name/level tag (versus)
    if (showLabel) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "800 11px 'Segoe UI', sans-serif";
      ctx.fillStyle = rgbaArr(this.accent, 0.95);
      ctx.fillText(this.label + "  Lv" + this.level, 0, -this.r - 16);
    }

    ctx.scale(grow, grow);
    glow(ctx, 0, 0, 46 + this.colorSwitchPulse * 30, rgb, 0.22 + this.colorSwitchPulse * 0.25);

    // rotating color ring (telegraphs active color)
    ctx.save();
    ctx.rotate(this.ringSpin);
    ctx.strokeStyle = rgbaArr(rgb, 0.9);
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 9]);
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.rotate(this.angle);

    if (this.thrust > 0.05) {
      const fl = (0.6 + this.thrust * 0.8) * (12 + Math.sin(time * 40) * 4);
      const g = ctx.createLinearGradient(-this.r, 0, -this.r - fl, 0);
      g.addColorStop(0, rgbaArr(rgb, 0.9));
      g.addColorStop(1, rgbaArr(rgb, 0));
      ctx.fillStyle = g;
      poly(ctx, [[-this.r + 2, -6], [-this.r - fl, 0], [-this.r + 2, 6]]);
      ctx.fill();
    }

    if (!blink) {
      ctx.lineJoin = "round";
      const hull = [[20, 0], [2, -12], [-12, -10], [-7, 0], [-12, 10], [2, 12]];
      const hg = ctx.createLinearGradient(-14, 0, 22, 0);
      hg.addColorStop(0, "#161a30");
      hg.addColorStop(1, rgbaArr(this.accent, 0.95));
      ctx.fillStyle = hg;
      ctx.strokeStyle = rgbaArr(rgb, 0.95);
      ctx.lineWidth = 2.4;
      poly(ctx, hull);
      ctx.fill();
      ctx.stroke();

      const pulse = 4.6 + Math.sin(time * 8) * 0.8;
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, pulse + 4);
      cg.addColorStop(0, "#ffffff");
      cg.addColorStop(0.5, rgbaArr(rgb, 1));
      cg.addColorStop(1, rgbaArr(rgb, 0));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, pulse + 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------
//  BULLET (player)
// ------------------------------------------------------------
class Bullet {
  constructor(x, y, ang, colorIdx, opts = {}) {
    const speed = opts.speed || 760;
    this.x = x; this.y = y;
    this.vx = Math.cos(ang) * speed;
    this.vy = Math.sin(ang) * speed;
    this.colorIdx = colorIdx;
    this.r = 5;
    this.life = 1.1;
    this.dead = false;
    this.trail = [];
    this.owner = opts.owner || null;   // which player fired it (versus)
    this.dmg = opts.dmg != null ? opts.dmg : 1;
  }
  update(dt) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 7) this.trail.shift();
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const rgb = COLORS[this.colorIdx].rgb;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < this.trail.length; i++) {
      const t = i / this.trail.length;
      ctx.fillStyle = rgbaArr(rgb, t * 0.4);
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, this.r * t * 0.9, 0, TAU);
      ctx.fill();
    }
    glow(ctx, this.x, this.y, 16, rgb, 0.6);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgbaArr(rgb, 0.95);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------
//  ENEMY BULLET (boss / shooters)
// ------------------------------------------------------------
class EnemyBullet {
  constructor(x, y, ang, colorIdx, speed = 230) {
    this.x = x; this.y = y;
    this.vx = Math.cos(ang) * speed;
    this.vy = Math.sin(ang) * speed;
    this.colorIdx = colorIdx;
    this.r = 7;
    this.life = 4;
    this.dead = false;
    this.spin = 0;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.spin += dt * 6;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx, time) {
    const rgb = COLORS[this.colorIdx].rgb;
    ctx.save();
    ctx.translate(this.x, this.y);
    glow(ctx, 0, 0, 16, rgb, 0.5);
    ctx.rotate(this.spin);
    ctx.fillStyle = rgbaArr(rgb, 0.95);
    starPath(ctx, 4, this.r + 2, this.r * 0.5, 0);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ------------------------------------------------------------
//  XP ORB — rainbow gem that levels you up (versus mode)
// ------------------------------------------------------------
const HEAL_RGB = [54, 230, 138];

class XpOrb {
  constructor(x, y, kind = "xp", big = false) {
    this.x = x; this.y = y;
    this.vx = rand(-12, 12); this.vy = rand(-12, 12);
    this.kind = kind;            // "xp" | "hp"
    this.big = big;
    this.value = big ? 7 : 2;    // xp granted
    this.heal = big ? 45 : 28;   // hp restored
    this.r = big ? 13 : 9;
    this.phase = rand(0, 1);
    this.spin = rand(0, TAU);
    this.bob = rand(0, TAU);
    this.dead = false;
    this.t = 0;
  }
  update(dt, players) {
    this.t += dt;
    this.phase = (this.phase + dt * 0.4) % 1;
    this.spin += dt * 1.6;
    this.bob += dt * 3;

    // gentle magnet toward nearest living player when close
    let near = null, nd = 1e9;
    for (const p of players) {
      if (!p.alive) continue;
      const d = dist2(this.x, this.y, p.x, p.y);
      if (d < nd) { nd = d; near = p; }
    }
    if (near && nd < 120 * 120) {
      const a = angleTo(this.x, this.y, near.x, near.y);
      const pull = 220 * (1 - Math.sqrt(nd) / 120);
      this.vx += Math.cos(a) * pull * dt;
      this.vy += Math.sin(a) * pull * dt;
    }
    this.vx *= 0.95; this.vy *= 0.95;
    this.x += this.vx * dt; this.y += this.vy * dt;
  }
  draw(ctx) {
    const r = this.r * (1 + Math.sin(this.bob) * 0.12);
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.kind === "hp") {
      // green med-orb with a white cross
      glow(ctx, 0, 0, r * 3, HEAL_RGB, this.big ? 0.5 : 0.4);
      ctx.fillStyle = rgbaArr(HEAL_RGB, 0.92);
      ctx.strokeStyle = "#eafff2";
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
      const a = r * 0.62, t = r * 0.26;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-a, -t, a * 2, t * 2);
      ctx.fillRect(-t, -a, t * 2, a * 2);
    } else {
      const rgb = rainbowRGB(this.phase);
      glow(ctx, 0, 0, r * 3, rgb, this.big ? 0.5 : 0.38);
      ctx.rotate(this.spin);
      ctx.fillStyle = rgbaArr(rgb, 0.92);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.6;
      poly(ctx, [[0, -r], [r * 0.8, 0], [0, r], [-r * 0.8, 0]]);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------
//  ENEMY  (types: drifter, chaser, orbiter, prism)
// ------------------------------------------------------------
const ENEMY_DEF = {
  drifter: { hp: 2, r: 16, score: 100, speed: 55 },
  chaser:  { hp: 2, r: 15, score: 130, speed: 120 },
  orbiter: { hp: 3, r: 17, score: 170, speed: 95 },
  prism:   { hp: 4, r: 19, score: 260, speed: 46 },
};

class Enemy {
  constructor(type, x, y, colorIdx, depthScale = 1) {
    const d = ENEMY_DEF[type];
    this.type = type;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = d.r;
    this.maxhp = Math.round(d.hp * depthScale);
    this.hp = this.maxhp;
    this.baseScore = d.score;
    this.speed = d.speed;
    this.colorIdx = colorIdx;
    this.dead = false;
    this.spin = rand(0, TAU);
    this.spinV = randSign() * rand(0.6, 1.8);
    this.phase = rand(0, TAU);
    this.hitFlash = 0;
    this.spawnT = 0;            // grow-in animation
    this.orbitAng = rand(0, TAU);
    this.orbitDir = randSign();
    this.dash = 0;
    this.dashCd = rand(0.8, 1.8);
    this.prismPhase = rand(0, 1);
    this.prismSpeed = rand(0.35, 0.55);
  }

  // current color this enemy is vulnerable to (prism cycles)
  curColor() {
    if (this.type === "prism") return Math.floor(this.prismPhase * COLOR_COUNT) % COLOR_COUNT;
    return this.colorIdx;
  }
  matches(bulletColor) { return bulletColor === this.curColor(); }

  update(dt, player) {
    this.spawnT = Math.min(1, this.spawnT + dt * 3);
    this.spin += this.spinV * dt;
    this.phase += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    const toAng = angleTo(this.x, this.y, player.x, player.y);
    const d = dist(this.x, this.y, player.x, player.y);

    if (this.type === "drifter") {
      const s = this.speed;
      this.vx = lerp(this.vx, Math.cos(toAng) * s, 0.04);
      this.vy = lerp(this.vy, Math.sin(toAng) * s, 0.04);
    } else if (this.type === "chaser") {
      this.dashCd -= dt;
      if (this.dashCd <= 0 && d < 520) { this.dash = 0.45; this.dashCd = rand(1.1, 2.0); }
      const s = this.dash > 0 ? this.speed * 3.2 : this.speed;
      if (this.dash > 0) this.dash -= dt;
      this.vx = lerp(this.vx, Math.cos(toAng) * s, 0.12);
      this.vy = lerp(this.vy, Math.sin(toAng) * s, 0.12);
    } else if (this.type === "orbiter") {
      const want = 190;
      this.orbitAng += this.orbitDir * dt * 1.1;
      const tx = player.x + Math.cos(this.orbitAng) * want;
      const ty = player.y + Math.sin(this.orbitAng) * want;
      const a = angleTo(this.x, this.y, tx, ty);
      this.vx = lerp(this.vx, Math.cos(a) * this.speed * 1.6, 0.08);
      this.vy = lerp(this.vy, Math.sin(a) * this.speed * 1.6, 0.08);
    } else if (this.type === "prism") {
      this.prismPhase = (this.prismPhase + dt * this.prismSpeed) % 1;
      const strafe = Math.sin(this.phase * 1.5) * 60;
      const px = Math.cos(toAng) * this.speed - Math.sin(toAng) * strafe;
      const py = Math.sin(toAng) * this.speed + Math.cos(toAng) * strafe;
      this.vx = lerp(this.vx, px, 0.05);
      this.vy = lerp(this.vy, py, 0.05);
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  draw(ctx, time) {
    const ci = this.curColor();
    const rgb = this.type === "prism" ? rainbowRGB(this.prismPhase) : COLORS[ci].rgb;
    const s = smooth(this.spawnT);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(s, s);

    glow(ctx, 0, 0, this.r * 2.2, rgb, 0.28);

    ctx.save();
    ctx.rotate(this.spin);

    if (this.hitFlash > 0) ctx.globalAlpha = 1;

    if (this.type === "drifter") {
      // spiky pulsing star with an eye
      const pr = this.r * (1 + Math.sin(this.phase * 4) * 0.08);
      ctx.fillStyle = rgbaArr(rgb, 0.9);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      starPath(ctx, 7, pr, pr * 0.55, 0);
      ctx.fill();
    } else if (this.type === "chaser") {
      // sharp dart / arrowhead
      ctx.fillStyle = rgbaArr(rgb, 0.92);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      const charging = this.dash > 0;
      const stretch = charging ? 1.5 : 1;
      poly(ctx, [[this.r * 1.5 * stretch, 0], [-this.r, -this.r * 0.85], [-this.r * 0.5, 0], [-this.r, this.r * 0.85]]);
      ctx.fill(); ctx.stroke();
    } else if (this.type === "orbiter") {
      // spinning gear/diamond
      ctx.fillStyle = rgbaArr(rgb, 0.9);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      starPath(ctx, 4, this.r * 1.15, this.r * 0.7, 0);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, this.r * 0.4, 0, TAU);
      ctx.fillStyle = "#0a0c1a"; ctx.fill();
    } else if (this.type === "prism") {
      // rotating triangular prism radiating its current color
      ctx.fillStyle = rgbaArr(rgb, 0.55);
      ctx.strokeStyle = rgbaArr(rgb, 1);
      ctx.lineWidth = 2.5;
      const R = this.r * 1.2;
      poly(ctx, [[0, -R], [R * 0.87, R * 0.5], [-R * 0.87, R * 0.5]]);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // hit flash overlay
    if (this.hitFlash > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(this.hitFlash * 3, 0, 1);
      glow(ctx, 0, 0, this.r * 1.6, [255, 255, 255], 0.8);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // core dot showing the exact color you must match
    const cdot = this.type === "prism" ? rainbowRGB(this.prismPhase) : COLORS[ci].rgb;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = rgbaArr(cdot, 1);
    ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();

    ctx.restore();
  }
}

// ------------------------------------------------------------
//  BOSSES — 8 unique fights, one every 5th wave, escalating.
//   1 PRISM CORE   colored shield nodes -> expose core (radial bursts)
//   2 THE DYAD     two free-roaming color cores; survivor enrages
//   3 VORTEX       color-cycling core, only its current color hurts it; spirals
//   4 AEGIS        rotating shield arc (hit the gap) + expanding shock rings
//   5 THE HIVE     invulnerable while it has minions; summons swarms
//   6 PHANTOM      teleports & dashes; fast color cycle; bullet trails
//   7 SIEGE ENGINE colored armor plates -> core; bullet walls with a gap
//   8 RIFT SOVEREIGN  nodes + spirals + summons + enrage finale
// ------------------------------------------------------------
const BOSS_NAMES = ["", "PRISM CORE", "THE DYAD", "VORTEX", "AEGIS", "THE HIVE", "PHANTOM", "SIEGE ENGINE", "RIFT SOVEREIGN"];

function bossCoreRGB(kind, time) {
  switch (kind) {
    case 3: return rainbowRGB(time * 0.5);
    case 4: return [150, 200, 255];
    case 5: return [110, 230, 150];
    case 6: return [180, 120, 235];
    case 7: return [235, 160, 90];
    case 8: return rainbowRGB(time * 0.4);
    default: return [185, 195, 255];
  }
}

class Boss {
  constructor(x, y, kind) {
    this.kind = clamp(Math.round(kind), 1, 8);
    this.name = BOSS_NAMES[this.kind];
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 46;
    this.dead = false;
    this.spin = 0;
    this.phase = 0;
    this.hitFlash = 0;
    this.spawnT = 0;
    this.driftAng = rand(0, TAU);
    this.fireCd = 2.2;
    this.colorPhase = rand(0, 1);
    this.spiralAng = 0;
    this.blinkCd = 2.4;
    this.dash = 0;
    this.afterimages = [];
    this.shock = null;          // aegis expanding ring {r, max, hit}
    this.shockCd = 3;
    this.summonCd = 3;
    this.trail = [];

    const k = this.kind;
    this.baseScore = 2500 + k * 900;
    this.bulletSpeed = 150 + k * 14;
    this.hasCore = k !== 2;
    this.coreMax = 28 + k * 16;
    this.coreHp = this.coreMax;
    this.parts = [];
    this._init(k);
  }

  _node(ang, dist, colorIdx, hp, r) {
    return { mode: "orbit", ang, dist, colorIdx, hp, maxhp: hp, r, dead: false, hitFlash: 0, spin: rand(0, TAU) };
  }

  _init(k) {
    const phHp = 4 + k;            // part hp scales with boss number
    if (k === 1) {
      for (let i = 0; i < 6; i++) this.parts.push(this._node((i / 6) * TAU, 96, i % 3, phHp, 18));
    } else if (k === 2) {
      // two free-roaming cores
      for (let i = 0; i < 2; i++) this.parts.push({
        mode: "free", x: this.x + (i ? 90 : -90), y: this.y, vx: 0, vy: 0,
        colorIdx: i === 0 ? 0 : 2, hp: 16 + k * 3, maxhp: 16 + k * 3, r: 30,
        dead: false, hitFlash: 0, spin: rand(0, TAU), fireCd: 1.5, enraged: false,
      });
    } else if (k === 7) {
      for (let i = 0; i < 4; i++) this.parts.push(this._node((i / 4) * TAU, this.r + 26, i % 3, phHp + 2, 20));
    } else if (k === 8) {
      for (let i = 0; i < 4; i++) this.parts.push(this._node((i / 4) * TAU, 120, i % 3, phHp + 1, 18));
    }
    // kinds 3,4,5,6 have no parts
  }

  // ---------- helpers ----------
  aliveParts() { return this.parts.filter(p => !p.dead); }
  curColor() { return Math.floor(this.colorPhase * COLOR_COUNT) % COLOR_COUNT; }
  enraged() { return this.hasCore && this.coreHp <= this.coreMax * 0.3; }

  partPos(p) {
    if (p.mode === "free") return { x: p.x, y: p.y };
    return { x: this.x + Math.cos(p.ang + this.spin) * p.dist, y: this.y + Math.sin(p.ang + this.spin) * p.dist };
  }

  _coreOpen(game) {
    switch (this.kind) {
      case 1: case 7: case 8: return this.aliveParts().length === 0;
      case 5: return this._minions(game) === 0;
      default: return true; // 3,4,6 always "open" but otherwise gated
    }
  }

  _minions(game) { return game.enemies.filter(e => e.fromBoss).length; }

  _eb(game, x, y, ang, ci, sp) { game.enemyBullets.push(new EnemyBullet(x, y, ang, ci, sp || this.bulletSpeed)); }

  _summon(game, type) {
    const p = game._edgePoint();
    const e = new Enemy(type, p.x, p.y, randInt(0, 2), 1 + game.wave * 0.08);
    e.fromBoss = true; e.awake = true;
    game.enemies.push(e);
    game.particles.shock(p.x, p.y, COLORS[e.colorIdx].rgb, { r0: 4, r1: 40, life: 0.4 });
  }

  // ---------- update ----------
  update(dt, player, game) {
    if (this.impossible && !this._scaled) { this.bulletSpeed *= 1.4; this._scaled = true; }
    this.spawnT = Math.min(1, this.spawnT + dt * 1.5);
    this.spin += dt * (this.kind === 3 ? 1.3 : 0.5);
    this.phase += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.colorPhase = (this.colorPhase + dt * (this.kind === 6 ? 0.9 : this.kind === 3 ? 0.55 : 0.3)) % 1;
    for (const p of this.parts) if (p.hitFlash > 0) p.hitFlash -= dt;

    const b = game.bounds;
    const en = this.enraged() ? 1.5 : 1;

    if (this.kind === 6) {
      // PHANTOM — blink + dash toward player
      this.blinkCd -= dt;
      if (this.blinkCd <= 0) {
        this.blinkCd = rand(1.6, 2.6) / en;
        this.afterimages.push({ x: this.x, y: this.y, t: 0 });
        this.x = rand(b.x + 80, b.x + b.w - 80);
        this.y = rand(b.y + 80, b.y + b.h * 0.7);
        this.dash = 0.5;
      }
      const toA = angleTo(this.x, this.y, player.x, player.y);
      const sp = (this.dash > 0 ? 320 : 90) * en;
      if (this.dash > 0) this.dash -= dt;
      this.vx = lerp(this.vx, Math.cos(toA) * sp, 0.08);
      this.vy = lerp(this.vy, Math.sin(toA) * sp, 0.08);
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else if (this.kind === 2) {
      // DYAD — two cores roam independently
      for (const p of this.parts) {
        if (p.dead) continue;
        p.spin += dt * 1.5;
        const toA = angleTo(p.x, p.y, player.x, player.y) + Math.sin(this.phase + p.colorIdx) * 0.8;
        const sp = (p.enraged ? 150 : 80) + (this.parts.filter(q => !q.dead).length === 1 ? 60 : 0);
        p.vx = lerp(p.vx, Math.cos(toA) * sp, 0.04);
        p.vy = lerp(p.vy, Math.sin(toA) * sp, 0.04);
        p.x = clamp(p.x + p.vx * dt, b.x + p.r, b.x + b.w - p.r);
        p.y = clamp(p.y + p.vy * dt, b.y + p.r, b.y + b.h - p.r);
        p.fireCd -= dt;
        if (p.fireCd <= 0) {
          p.fireCd = (p.enraged ? 0.7 : 1.4);
          const a = angleTo(p.x, p.y, player.x, player.y);
          for (let i = -1; i <= 1; i++) this._eb(game, p.x, p.y, a + i * 0.18, p.colorIdx, this.bulletSpeed);
        }
      }
      // keep boss point near midpoint of cores (for camera/contact fallback)
      const alive = this.parts.filter(p => !p.dead);
      if (alive.length) { this.x = alive.reduce((s, p) => s + p.x, 0) / alive.length; this.y = alive.reduce((s, p) => s + p.y, 0) / alive.length; }
    } else {
      // drifting bosses (1,3,4,5,7,8)
      this.driftAng += dt * 0.3;
      const cx = b.x + b.w / 2, cy = b.y + b.h * 0.38;
      this.x = lerp(this.x, cx + Math.cos(this.driftAng) * b.w * 0.22, 0.02);
      this.y = lerp(this.y, cy + Math.sin(this.driftAng * 1.3) * b.h * 0.13, 0.02);
    }

    // afterimage decay
    for (let i = this.afterimages.length - 1; i >= 0; i--) { this.afterimages[i].t += dt; if (this.afterimages[i].t > 0.5) this.afterimages.splice(i, 1); }

    // AEGIS shock ring
    if (this.kind === 4) {
      this.shockCd -= dt;
      if (!this.shock && this.shockCd <= 0) { this.shockCd = 4 / en; this.shock = { r: this.r, max: Math.max(b.w, b.h), hit: false }; }
      if (this.shock) {
        this.shock.r += dt * 360;
        const d = dist(this.x, this.y, player.x, player.y);
        if (!this.shock.hit && Math.abs(d - this.shock.r) < 22 && player.invuln <= 0) {
          this.shock.hit = true;
          game._hurtPlayer(player, 14 + this.kind, this.x, this.y);
        }
        if (this.shock.r > this.shock.max) this.shock = null;
      }
    }

    // HIVE / SOVEREIGN summons
    if (this.kind === 5 || this.kind === 8) {
      this.summonCd -= dt;
      const cap = this.kind === 5 ? 4 + Math.floor(game.wave / 10) : 3;
      if (this.summonCd <= 0 && this._minions(game) < cap) {
        this.summonCd = this.kind === 5 ? 2.2 : 4;
        this._summon(game, pick(this.kind === 5 ? ["drifter", "chaser", "orbiter"] : ["chaser", "orbiter"]));
      }
    }

    // firing (per kind)
    this.fireCd -= dt;
    if (this.fireCd <= 0) this._fire(player, game, en);

    this.openFlag = this._coreOpen(game);   // cache for rendering
  }

  _fire(player, game, en) {
    const k = this.kind, base = angleTo(this.x, this.y, player.x, player.y);
    const fr = this.impossible ? 0.6 : 1;   // impossible: fire faster
    Sound.enemyShot();
    if (k === 1) {
      this.fireCd = (this._coreOpen(game) ? 1.0 : 1.8) / en;
      const n = this._coreOpen(game) ? 16 : 9;
      for (let i = 0; i < n; i++) this._eb(game, this.x, this.y, base + (i / n) * TAU, i % 3);
    } else if (k === 3) {
      // VORTEX — rotating spiral arms
      this.fireCd = 0.16 / en;
      this.spiralAng += 0.4;
      for (let a = 0; a < 3; a++) this._eb(game, this.x, this.y, this.spiralAng + a * (TAU / 3), this.curColor(), this.bulletSpeed);
    } else if (k === 4) {
      // AEGIS — aimed triple from the gap side
      this.fireCd = 1.3 / en;
      for (let i = -1; i <= 1; i++) this._eb(game, this.x, this.y, base + i * 0.16, i + 1);
    } else if (k === 5) {
      this.fireCd = 1.8 / en;
      for (let i = -2; i <= 2; i++) this._eb(game, this.x, this.y, base + i * 0.14, (i + 2) % 3);
    } else if (k === 6) {
      this.fireCd = 0.5 / en;
      for (let i = 0; i < 6; i++) this._eb(game, this.x, this.y, this.phase * 2 + (i / 6) * TAU, this.curColor());
    } else if (k === 7) {
      // SIEGE — bullet wall with a gap
      this.fireCd = 1.6 / en;
      const gap = randInt(0, 9);
      for (let i = 0; i < 10; i++) {
        if (i === gap || i === gap + 1) continue;
        const a = base - 0.7 + (i / 9) * 1.4;
        this._eb(game, this.x, this.y, a, i % 3, this.bulletSpeed * 1.1);
      }
    } else if (k === 8) {
      // SOVEREIGN — alternating radial + spiral
      this.fireCd = (this._coreOpen(game) ? 0.7 : 1.2) / en;
      if (Math.floor(this.phase) % 2 === 0) {
        const n = 18;
        for (let i = 0; i < n; i++) this._eb(game, this.x, this.y, base + (i / n) * TAU, i % 3);
      } else {
        this.spiralAng += 0.5;
        for (let a = 0; a < 4; a++) this._eb(game, this.x, this.y, this.spiralAng + a * (TAU / 4), this.curColor());
      }
    } else {
      this.fireCd = 1.5;
    }
    this.fireCd *= fr;
  }

  // ---------- player bullet hit (returns true if consumed) ----------
  hitTest(bullet, game) {
    // parts
    for (const p of this.parts) {
      if (p.dead) continue;
      const pp = this.partPos(p);
      if (hitCircle(bullet.x, bullet.y, bullet.r, pp.x, pp.y, p.r)) {
        if (bullet.colorIdx === p.colorIdx) {
          p.hp -= bullet.dmg; p.hitFlash = 0.18;
          game.particles.burst(bullet.x, bullet.y, COLORS[p.colorIdx].rgb, 6, { speed: 3, life: 0.4, size: 2.5 });
          Sound.hit();
          if (p.hp <= 0) {
            p.dead = true;
            game.particles.burst(pp.x, pp.y, COLORS[p.colorIdx].rgb, 24, { speed: 6, life: 0.7, size: 3 });
            game.particles.shock(pp.x, pp.y, COLORS[p.colorIdx].rgb, { r1: 90 });
            Sound.explode(); game.shake = Math.max(game.shake, 6);
            game._addScore(500, pp.x, pp.y, COLORS[p.colorIdx].rgb);
            // dyad: survivor enrages; death when both gone
            if (this.kind === 2) {
              const alive = this.parts.filter(q => !q.dead);
              if (alive.length === 1) alive[0].enraged = true;
              if (alive.length === 0) this.dead = true;
            }
          }
        } else {
          Sound.blocked();
          game.particles.spray(bullet.x, bullet.y, Math.atan2(-bullet.vy, -bullet.vx), COLORS[bullet.colorIdx].rgb, 4, { life: 0.2 });
        }
        return true;
      }
    }

    // core
    if (this.hasCore && hitCircle(bullet.x, bullet.y, bullet.r, this.x, this.y, this.r)) {
      if (!this._coreOpen(game)) { Sound.blocked(); return true; }
      // VORTEX: only current color hurts it
      if (this.kind === 3 && bullet.colorIdx !== this.curColor()) {
        Sound.blocked();
        game.particles.spray(bullet.x, bullet.y, Math.atan2(-bullet.vy, -bullet.vx), COLORS[bullet.colorIdx].rgb, 4, { life: 0.2 });
        return true;
      }
      // AEGIS: blocked if the hit lands on the shielded arc
      if (this.kind === 4 && this._inShield(bullet)) {
        Sound.blocked();
        game.particles.spray(bullet.x, bullet.y, angleTo(this.x, this.y, bullet.x, bullet.y), [150, 200, 255], 4, { life: 0.2 });
        return true;
      }
      this.coreHp -= bullet.dmg; this.hitFlash = 0.16;
      game.particles.burst(bullet.x, bullet.y, COLORS[bullet.colorIdx].rgb, 5, { speed: 4, life: 0.4, size: 2.5 });
      Sound.hit();
      game._addScore(25, bullet.x, bullet.y, COLORS[bullet.colorIdx].rgb);
      if (this.coreHp <= 0) this.dead = true;
      return true;
    }
    return false;
  }

  _inShield(bullet) {
    if (this.kind !== 4) return false;
    const a = angleTo(this.x, this.y, bullet.x, bullet.y);
    let d = ((a - (this.spin * 1.5)) % TAU + TAU) % TAU;   // shield faces spin direction
    if (d > Math.PI) d -= TAU;
    return Math.abs(d) < 1.1; // ~126° shielded arc
  }

  // ---------- contact damage to player ----------
  contact(player) {
    for (const p of this.parts) {
      if (p.dead) continue;
      const pp = this.partPos(p);
      if (hitCircle(pp.x, pp.y, p.r, player.x, player.y, player.r)) return { dmg: 10 + this.kind, x: pp.x, y: pp.y };
    }
    if (this.hasCore && hitCircle(this.x, this.y, this.r, player.x, player.y, player.r)) {
      return { dmg: (this.kind === 6 ? 20 : 14) + this.kind, x: this.x, y: this.y };
    }
    return null;
  }

  // ---------- draw ----------
  draw(ctx, time) {
    const s = smooth(this.spawnT);
    const coreRgb = bossCoreRGB(this.kind, time);

    // phantom afterimages
    if (this.kind === 6) {
      for (const a of this.afterimages) {
        ctx.globalAlpha = (1 - a.t / 0.5) * 0.4;
        glow(ctx, a.x, a.y, this.r * 1.4, coreRgb, 0.4);
        ctx.globalAlpha = 1;
      }
    }

    // AEGIS shock ring
    if (this.kind === 4 && this.shock) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgbaArr(coreRgb, 0.6 * (1 - this.shock.r / this.shock.max));
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.shock.r, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // core (skip for dyad which has none)
    if (this.hasCore) {
      const open = this.openFlag !== undefined ? this.openFlag : true;
      ctx.save();
      ctx.translate(this.x, this.y); ctx.scale(s, s);
      glow(ctx, 0, 0, this.r * 2.4, coreRgb, open ? 0.42 : 0.24);

      // AEGIS shield arc
      if (this.kind === 4) {
        ctx.save(); ctx.rotate(this.spin * 1.5);
        ctx.strokeStyle = rgbaArr([150, 200, 255], 0.9); ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(0, 0, this.r + 14, -1.1, 1.1); ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.rotate(this.spin * (this.kind === 3 ? 3 : 2));
      const sides = this.kind === 7 ? 4 : this.kind === 6 ? 3 : 6;
      const pts = [];
      for (let i = 0; i < sides; i++) { const a = (i / sides) * TAU; pts.push([Math.cos(a) * this.r, Math.sin(a) * this.r]); }
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r);
      cg.addColorStop(0, open ? rgbaArr(coreRgb, 0.95) : "#262c54");
      cg.addColorStop(1, "#10142e");
      ctx.fillStyle = cg;
      ctx.strokeStyle = open ? rgbaArr(coreRgb, 1) : rgbaArr(coreRgb, 0.6);
      ctx.lineWidth = 3;
      poly(ctx, pts); ctx.fill(); ctx.stroke();

      // VORTEX spokes
      if (this.kind === 3) {
        ctx.strokeStyle = rgbaArr(coreRgb, 0.7); ctx.lineWidth = 4;
        for (let i = 0; i < 4; i++) { const a = i * (TAU / 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * this.r * 1.6, Math.sin(a) * this.r * 1.6); ctx.stroke(); }
      }
      const er = this.r * 0.4 * (1 + Math.sin(time * 5) * 0.12);
      ctx.fillStyle = open ? "#fff" : rgbaArr(coreRgb, 0.8);
      ctx.beginPath(); ctx.arc(0, 0, er, 0, TAU); ctx.fill();
      ctx.restore();

      // core hp ring
      ctx.strokeStyle = rgbaArr(coreRgb, 0.85); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, this.r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * (this.coreHp / this.coreMax)); ctx.stroke();

      // HIVE shield shimmer when invulnerable
      if (this.kind === 5 && !open) {
        ctx.strokeStyle = rgbaArr([110, 230, 150], 0.4 + 0.2 * Math.sin(time * 6));
        ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, this.r + 18, 0, TAU); ctx.stroke();
      }
      if (this.hitFlash > 0) { ctx.globalCompositeOperation = "lighter"; glow(ctx, 0, 0, this.r * 1.8, [255, 255, 255], clamp(this.hitFlash * 3, 0, 0.9)); }
      ctx.restore();
    }

    // parts
    for (const p of this.parts) {
      if (p.dead) continue;
      const pp = this.partPos(p);
      const rgb = COLORS[p.colorIdx].rgb;
      ctx.save(); ctx.translate(pp.x, pp.y); ctx.scale(s, s);
      glow(ctx, 0, 0, p.r * 2, rgb, 0.35);
      if (p.mode === "orbit") {
        ctx.strokeStyle = rgbaArr(rgb, 0.3); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(this.x - pp.x, this.y - pp.y); ctx.stroke();
      }
      ctx.rotate(p.spin);
      ctx.fillStyle = rgbaArr(rgb, 0.9); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      if (this.kind === 7) { ctx.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4); ctx.strokeRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4); }
      else if (this.kind === 2) { poly(ctx, [[0, -p.r], [p.r * 0.85, 0], [0, p.r], [-p.r * 0.85, 0]]); ctx.fill(); ctx.stroke(); }
      else { starPath(ctx, 5, p.r, p.r * 0.55, 0); ctx.fill(); ctx.stroke(); }
      ctx.rotate(-p.spin);
      // part hp ring
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgbaArr(rgb, 0.9); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, p.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * (p.hp / p.maxhp)); ctx.stroke();
      if (p.hitFlash > 0) { ctx.globalCompositeOperation = "lighter"; glow(ctx, 0, 0, p.r * 1.5, [255, 255, 255], clamp(p.hitFlash * 3, 0, 0.9)); }
      ctx.restore();
    }
  }
}
