// ============================================================
//  CHROMA RIFT — particles.js
//  Pooled particle system + floating score text + shockwaves.
// ============================================================
"use strict";

class Particles {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.waves = []; // expanding ring shockwaves
  }

  reset() { this.parts.length = 0; this.texts.length = 0; this.waves.length = 0; }

  // generic spark burst, rgb is [r,g,b]
  burst(x, y, rgb, count, opts = {}) {
    const {
      speed = 3, spread = 1, life = 0.6, size = 3, drag = 0.92, gravity = 0,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * (1 - spread * 0.5), speed * (1 + spread * 0.5));
      this.parts.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * rand(0.7, 1.2), max: life,
        size: size * rand(0.6, 1.3),
        rgb, drag, gravity,
        t: 0,
      });
    }
  }

  // directional spray (e.g. blocked shot, thruster)
  spray(x, y, dir, rgb, count, opts = {}) {
    const { speed = 4, arc = 0.6, life = 0.4, size = 2.5, drag = 0.9 } = opts;
    for (let i = 0; i < count; i++) {
      const a = dir + rand(-arc, arc);
      const s = rand(speed * 0.4, speed);
      this.parts.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * rand(0.7, 1.2), max: life, size: size * rand(0.6, 1.2),
        rgb, drag, gravity: 0, t: 0,
      });
    }
  }

  shock(x, y, rgb, opts = {}) {
    const { r0 = 6, r1 = 80, life = 0.4, width = 4 } = opts;
    this.waves.push({ x, y, rgb, r0, r1, life, max: life, width, t: 0 });
  }

  text(x, y, str, rgb, opts = {}) {
    const { life = 0.9, size = 18, vy = -34, vx = 0 } = opts;
    this.texts.push({ x, y, str, rgb, life, max: life, size, vy, vx, t: 0 });
  }

  update(dt) {
    const p = this.parts;
    for (let i = p.length - 1; i >= 0; i--) {
      const o = p[i];
      o.t += dt; o.life -= dt;
      if (o.life <= 0) { p.splice(i, 1); continue; }
      o.vx *= o.drag; o.vy *= o.drag;
      o.vy += o.gravity * dt;
      o.x += o.vx; o.y += o.vy;
    }
    const w = this.waves;
    for (let i = w.length - 1; i >= 0; i--) {
      w[i].t += dt; w[i].life -= dt;
      if (w[i].life <= 0) w.splice(i, 1);
    }
    const tx = this.texts;
    for (let i = tx.length - 1; i >= 0; i--) {
      const o = tx[i];
      o.t += dt; o.life -= dt;
      if (o.life <= 0) { tx.splice(i, 1); continue; }
      o.x += o.vx * dt; o.y += o.vy * dt; o.vy *= 0.96;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // shockwave rings
    for (const w of this.waves) {
      const k = 1 - w.life / w.max;
      const r = lerp(w.r0, w.r1, smooth(k));
      const a = (1 - k) * 0.8;
      ctx.strokeStyle = rgbaArr(w.rgb, a);
      ctx.lineWidth = w.width * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, TAU);
      ctx.stroke();
    }

    // particles
    for (const o of this.parts) {
      const a = clamp(o.life / o.max, 0, 1);
      const r = o.size * (0.4 + a * 0.6);
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2.2);
      g.addColorStop(0, rgbaArr(o.rgb, a));
      g.addColorStop(1, rgbaArr(o.rgb, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, r * 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // floating texts (normal blend so they read clearly)
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const o of this.texts) {
      const a = clamp(o.life / o.max, 0, 1);
      ctx.font = `800 ${o.size}px 'Segoe UI', system-ui, sans-serif`;
      ctx.shadowColor = rgbaArr(o.rgb, a * 0.9);
      ctx.shadowBlur = 12;
      ctx.fillStyle = rgbaArr(o.rgb, a);
      ctx.fillText(o.str, o.x, o.y);
    }
    ctx.restore();
  }
}
