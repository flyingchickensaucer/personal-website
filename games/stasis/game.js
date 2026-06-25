/* STASIS — time moves only when you do.
 * Single-file canvas game. No build, no deps. Open index.html to play.
 */
(() => {
  "use strict";

  // ----------------------------------------------------------------- setup
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const el = (id) => document.getElementById(id);
  const ui = {
    hud: el("hud"),
    score: el("score"),
    best: el("best"),
    combo: el("combo"),
    timeFill: el("timebar-fill"),
    title: el("title"),
    gameover: el("gameover"),
    finalScore: el("final-score"),
    finalBest: el("final-best"),
    newbest: el("newbest"),
    play: el("play"),
    again: el("again"),
  };

  let W = 0,
    H = 0,
    DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ----------------------------------------------------------------- utils
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const len = (x, y) => Math.hypot(x, y);

  // ----------------------------------------------------------------- input
  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, px: W / 2, py: H / 2, speed: 0, down: false };

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if ((k === "r" || k === " ") && state === "dead") start();
    if (k === " ") e.preventDefault();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener("mousedown", () => {
    mouse.down = true;
    tryFire();
  });
  window.addEventListener("mouseup", () => (mouse.down = false));

  ui.play.addEventListener("click", start);
  ui.again.addEventListener("click", start);

  // ----------------------------------------------------------------- state
  let state = "title"; // title | play | dead
  let score = 0;
  let best = Number(localStorage.getItem("stasis_best") || 0);
  ui.best.textContent = best;

  let player, enemies, ebullets, pbullets, parts, floaters, telegraphs;
  let timeScale = 0.05;
  let spawnTimer = 0;
  let elapsed = 0; // world time survived (drives difficulty)
  let shake = 0;
  let hitStop = 0;
  let combo = 0;
  let comboTimer = 0;
  let flashDanger = 0;

  const STILL = 0.045; // time scale while perfectly still
  const PLAYER_SPEED = 360;
  const FIRE_CD = 0.16;
  const AMMO_MAX = 5;
  const AMMO_REGEN = 0.85; // seconds per round

  function reset() {
    player = {
      x: W / 2,
      y: H / 2,
      r: 11,
      fireCd: 0,
      ammo: AMMO_MAX,
      ammoTimer: 0,
      inv: 1.2, // spawn invulnerability (real seconds)
      trail: 0,
    };
    enemies = [];
    ebullets = [];
    pbullets = [];
    parts = [];
    floaters = [];
    telegraphs = [];
    timeScale = 0.05;
    spawnTimer = 0.6;
    elapsed = 0;
    shake = 0;
    hitStop = 0;
    combo = 0;
    comboTimer = 0;
    flashDanger = 0;
    score = 0;
  }

  function start() {
    reset();
    state = "play";
    ui.title.classList.add("hidden");
    ui.gameover.classList.add("hidden");
    ui.hud.classList.remove("hidden");
    ui.score.textContent = "0";
  }

  function gameOver() {
    state = "dead";
    addShake(1.1);
    hitStop = 0.08;
    flashDanger = 1;
    // death burst
    burst(player.x, player.y, 60, "#fff", 520);
    burst(player.x, player.y, 40, "var-danger", 420);
    const isNew = score > best;
    if (isNew) {
      best = score;
      localStorage.setItem("stasis_best", String(best));
    }
    ui.best.textContent = best;
    setTimeout(() => {
      if (state !== "dead") return;
      ui.finalScore.textContent = score;
      ui.finalBest.textContent = best;
      ui.newbest.classList.toggle("hidden", !isNew);
      ui.hud.classList.add("hidden");
      ui.gameover.classList.remove("hidden");
    }, 480);
  }

  // ----------------------------------------------------------------- juice
  function addShake(v) {
    shake = Math.min(1.5, shake + v);
  }

  function burst(x, y, n, color, spd) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(spd * 0.2, spd);
      parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.8),
        max: 0.8,
        r: rand(1.5, 3.5),
        color,
      });
    }
  }

  function floater(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 0.9, vy: -40 });
  }

  // ----------------------------------------------------------------- firing
  function tryFire() {
    if (state !== "play") return;
    if (player.fireCd > 0) return;
    if (player.ammo <= 0) {
      addShake(0.05);
      return;
    }
    const a = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const sp = 1050;
    pbullets.push({
      x: player.x + Math.cos(a) * 16,
      y: player.y + Math.sin(a) * 16,
      px: player.x,
      py: player.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: 4,
      life: 1.3,
    });
    player.fireCd = FIRE_CD;
    player.ammo--;
    addShake(0.18);
    // recoil + muzzle flash
    for (let i = 0; i < 6; i++) {
      const sa = a + rand(-0.4, 0.4);
      parts.push({
        x: player.x + Math.cos(a) * 16,
        y: player.y + Math.sin(a) * 16,
        vx: Math.cos(sa) * rand(120, 360),
        vy: Math.sin(sa) * rand(120, 360),
        life: rand(0.1, 0.25),
        max: 0.25,
        r: rand(1, 2.5),
        color: "#fff",
      });
    }
  }

  // ----------------------------------------------------------------- spawning
  function spawnEnemy() {
    // pick an edge, spawn a telegraph that resolves into an enemy
    const margin = 40;
    let x, y;
    const side = (Math.random() * 4) | 0;
    if (side === 0) (x = rand(0, W)), (y = -margin);
    else if (side === 1) (x = W + margin), (y = rand(0, H));
    else if (side === 2) (x = rand(0, W)), (y = H + margin);
    else (x = -margin), (y = rand(0, H));

    // difficulty selects type
    const d = elapsed;
    let type = "chaser";
    const roll = Math.random();
    if (d > 12 && roll < 0.45) type = "shooter";
    else if (d > 28 && roll > 0.82) type = "darter";

    telegraphs.push({ x, y, t: 0.7, type });
  }

  function makeEnemy(x, y, type) {
    const base = { x, y, px: x, py: y, type, fire: rand(0.8, 1.8), born: 0 };
    if (type === "chaser") return { ...base, r: 13, speed: 78 + elapsed * 0.7, hp: 1, color: "#ff2e4d" };
    if (type === "darter") return { ...base, r: 10, speed: 150 + elapsed * 0.8, hp: 1, color: "#ff8a3c" };
    return { ...base, r: 14, speed: 52, hp: 1, color: "#ff5c74", shooter: true };
  }

  // ----------------------------------------------------------------- update
  let lastT = performance.now();
  function frame(now) {
    let dt = (now - lastT) / 1000;
    lastT = now;
    dt = Math.min(dt, 1 / 30);

    // mouse speed (for time advance from aiming)
    const mdx = mouse.x - mouse.px;
    const mdy = mouse.y - mouse.py;
    mouse.speed = len(mdx, mdy) / Math.max(dt, 1e-4);
    mouse.px = mouse.x;
    mouse.py = mouse.y;

    if (state === "play") update(dt);
    render(dt);
    requestAnimationFrame(frame);
  }

  function update(dt) {
    if (hitStop > 0) {
      hitStop -= dt;
      // still decay shake during hitstop for snap
      shake = Math.max(0, shake - dt * 1.5);
      return;
    }

    // ---- movement input
    let ix = 0,
      iy = 0;
    if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
    if (keys.has("d") || keys.has("arrowright")) ix += 1;
    if (keys.has("w") || keys.has("arrowup")) iy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) iy += 1;
    const moving = ix !== 0 || iy !== 0;
    if (moving) {
      const m = len(ix, iy);
      ix /= m;
      iy /= m;
    }

    // ---- time scale: world wakes when you act
    let activity = 0;
    if (moving) activity = 1;
    activity = Math.max(activity, clamp(mouse.speed / 900, 0, 1));
    if (player.fireCd > FIRE_CD - 0.12) activity = 1;
    const target = STILL + (1 - STILL) * activity;
    timeScale += (target - timeScale) * (target > timeScale ? 0.45 : 0.12);
    const dtw = dt * timeScale; // world (scaled) time

    elapsed += dtw;

    // ---- player (moves in real time so it always feels responsive)
    player.x = clamp(player.x + ix * PLAYER_SPEED * dt, player.r, W - player.r);
    player.y = clamp(player.y + iy * PLAYER_SPEED * dt, player.r, H - player.r);
    if (player.fireCd > 0) player.fireCd -= dt;
    if (player.inv > 0) player.inv -= dt;
    // ammo regen (real time)
    if (player.ammo < AMMO_MAX) {
      player.ammoTimer += dt;
      if (player.ammoTimer >= AMMO_REGEN) {
        player.ammoTimer = 0;
        player.ammo++;
      }
    }
    // auto-fire while held
    if (mouse.down) tryFire();
    // movement trail
    player.trail += dt;
    if (moving && player.trail > 0.02) {
      player.trail = 0;
      parts.push({
        x: player.x,
        y: player.y,
        vx: rand(-12, 12),
        vy: rand(-12, 12),
        life: 0.35,
        max: 0.35,
        r: rand(2, 4),
        color: "#5ef0ff",
      });
    }

    // ---- spawning / difficulty
    spawnTimer -= dtw;
    const interval = clamp(1.5 - elapsed * 0.012, 0.42, 1.5);
    const maxE = clamp(3 + Math.floor(elapsed / 7), 3, 16);
    if (spawnTimer <= 0 && enemies.length + telegraphs.length < maxE) {
      spawnTimer = interval;
      spawnEnemy();
      if (elapsed > 20 && Math.random() < 0.3) spawnEnemy();
    }

    // ---- telegraphs resolve
    for (let i = telegraphs.length - 1; i >= 0; i--) {
      const tg = telegraphs[i];
      tg.t -= dt; // resolve in real time so they appear promptly
      if (tg.t <= 0) {
        enemies.push(makeEnemy(tg.x, tg.y, tg.type));
        telegraphs.splice(i, 1);
      }
    }

    // ---- enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.px = e.x;
      e.py = e.y;
      e.born += dtw;
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      const d = len(player.x - e.x, player.y - e.y);

      if (e.shooter) {
        // maintain distance
        const want = 290;
        const dir = d > want + 30 ? 1 : d < want - 30 ? -1 : 0;
        e.x += Math.cos(ang) * e.speed * dir * dtw;
        e.y += Math.sin(ang) * e.speed * dir * dtw;
        e.fire -= dtw;
        if (e.fire <= 0) {
          e.fire = clamp(1.7 - elapsed * 0.006, 0.7, 1.7);
          const bs = 240 + elapsed * 1.2;
          ebullets.push({
            x: e.x,
            y: e.y,
            px: e.x,
            py: e.y,
            vx: Math.cos(ang) * bs,
            vy: Math.sin(ang) * bs,
            r: 5,
            life: 4,
          });
        }
      } else {
        e.x += Math.cos(ang) * e.speed * dtw;
        e.y += Math.sin(ang) * e.speed * dtw;
        // contact kill
        if (d < e.r + player.r && player.inv <= 0) {
          gameOver();
          return;
        }
      }
    }

    // ---- player bullets
    for (let i = pbullets.length - 1; i >= 0; i--) {
      const b = pbullets[i];
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dtw;
      b.y += b.vy * dtw;
      b.life -= dtw;
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (len(b.x - e.x, b.y - e.y) < e.r + b.r) {
          killEnemy(e, j);
          hit = true;
          break;
        }
      }
      if (hit || b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20)
        pbullets.splice(i, 1);
    }

    // ---- enemy bullets
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i];
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dtw;
      b.y += b.vy * dtw;
      b.life -= dtw;
      if (player.inv <= 0 && len(b.x - player.x, b.y - player.y) < b.r + player.r) {
        gameOver();
        return;
      }
      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30)
        ebullets.splice(i, 1);
    }

    // ---- particles (real-ish time, lightly scaled so they linger when frozen)
    const pdt = dt * lerp(0.35, 1, timeScale);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * pdt;
      p.y += p.vy * pdt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= pdt;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y += f.vy * dt;
      f.vy *= 0.9;
      f.life -= dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }

    // ---- combo decay (real time)
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }

    shake = Math.max(0, shake - dt * 2.2);
    flashDanger = Math.max(0, flashDanger - dt * 2.5);
  }

  function killEnemy(e, idx) {
    enemies.splice(idx, 1);
    combo++;
    comboTimer = 2.2;
    const val = 1 + Math.floor(combo / 4);
    score += val;
    ui.score.textContent = score;
    player.ammo = Math.min(AMMO_MAX, player.ammo + 1);
    addShake(0.35);
    hitStop = 0.025;
    burst(e.x, e.y, 22, e.color, 360);
    burst(e.x, e.y, 8, "#fff", 220);
    if (combo > 1) {
      floater(e.x, e.y - e.r, "x" + combo, "#ffd34e");
      ui.combo.textContent = combo + " CHAIN";
      ui.combo.classList.add("show");
      clearTimeout(killEnemy._t);
      killEnemy._t = setTimeout(() => ui.combo.classList.remove("show"), 1100);
    }
  }

  // ----------------------------------------------------------------- render
  function render(dt) {
    let ox = 0,
      oy = 0;
    if (shake > 0) {
      const s = shake * shake * 16;
      ox = rand(-s, s);
      oy = rand(-s, s);
    }

    ctx.setTransform(DPR, 0, 0, DPR, ox * DPR, oy * DPR);
    // background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(-40, -40, W + 80, H + 80);
    drawGrid();

    const frozenness = state === "play" ? 1 - timeScale : 0;

    if (state === "play" || state === "dead") {
      drawTelegraphs();
      drawParticles();
      drawEnemyBullets(frozenness);
      drawEnemies();
      drawPlayerBullets();
      if (state === "play") drawPlayer();
      drawFloaters();
    } else {
      drawParticles();
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawVignette(frozenness);
    if (flashDanger > 0) {
      ctx.fillStyle = `rgba(255,46,77,${flashDanger * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state === "play") drawCrosshair();

    // time bar
    if (state === "play") {
      const fill = clamp((timeScale - STILL) / (1 - STILL), 0, 1);
      ui.timeFill.style.width = (fill * 100).toFixed(0) + "%";
    }

    // idle drift on menus
    if (state === "title") idleField(dt);
  }

  function drawGrid() {
    const g = 46;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.beginPath();
    const offx = state === "play" ? (player.x * 0.02) % g : 0;
    const offy = state === "play" ? (player.y * 0.02) % g : 0;
    for (let x = -offx; x < W; x += g) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = -offy; y < H; y += g) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.stroke();
  }

  function drawTelegraphs() {
    for (const tg of telegraphs) {
      const k = 1 - tg.t / 0.7;
      ctx.save();
      ctx.translate(tg.x, tg.y);
      ctx.rotate(k * 4);
      ctx.strokeStyle = `rgba(255,46,77,${0.3 + k * 0.5})`;
      ctx.lineWidth = 2;
      const r = lerp(28, 14, k);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(Math.cos(a + 1) * r, Math.sin(a + 1) * r);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function col(c) {
    return c === "var-danger" ? "#ff2e4d" : c;
  }

  function drawParticles() {
    for (const p of parts) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = col(p.color);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemyBullets(frozenness) {
    ctx.save();
    ctx.shadowColor = "#ff2e4d";
    ctx.shadowBlur = 12;
    for (const b of ebullets) {
      // trail
      ctx.strokeStyle = "rgba(255,92,116,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = "#ff2e4d";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      // frozen ring hint
      if (frozenness > 0.5) {
        ctx.globalAlpha = (frozenness - 0.5) * 0.7;
        ctx.strokeStyle = "#5ef0ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 4, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function drawEnemies() {
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      ctx.rotate(ang);
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = e.color;
      if (e.shooter) {
        // diamond
        ctx.beginPath();
        ctx.moveTo(e.r, 0);
        ctx.lineTo(0, e.r);
        ctx.lineTo(-e.r, 0);
        ctx.lineTo(0, -e.r);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#0a0a0f";
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 0.35, 0, TAU);
        ctx.fill();
      } else {
        // arrow / triangle pointing at player
        ctx.beginPath();
        ctx.moveTo(e.r, 0);
        ctx.lineTo(-e.r * 0.8, e.r * 0.7);
        ctx.lineTo(-e.r * 0.8, -e.r * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPlayerBullets() {
    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 10;
    for (const b of pbullets) {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = player;
    // ammo ring
    for (let i = 0; i < AMMO_MAX; i++) {
      const a0 = -Math.PI / 2 + (i / AMMO_MAX) * TAU + 0.12;
      const a1 = -Math.PI / 2 + ((i + 1) / AMMO_MAX) * TAU - 0.12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8, a0, a1);
      ctx.lineWidth = 3;
      ctx.strokeStyle = i < p.ammo ? "#5ef0ff" : "rgba(255,255,255,0.12)";
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = p.inv > 0 ? "#fff" : "#5ef0ff";
    ctx.shadowBlur = 22;
    ctx.globalAlpha = p.inv > 0 ? 0.5 + 0.5 * Math.sin(performance.now() / 60) : 1;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    // aim pip
    const a = Math.atan2(mouse.y - p.y, mouse.x - p.x);
    ctx.fillStyle = "#0a0a0f";
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(a) * p.r * 0.45, p.y + Math.sin(a) * p.r * 0.45, p.r * 0.32, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.save();
    ctx.font = "700 18px " + getFont();
    ctx.textAlign = "center";
    for (const f of floaters) {
      ctx.globalAlpha = clamp(f.life / 0.9, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawCrosshair() {
    const x = mouse.x,
      y = mouse.y;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.moveTo(x - 14, y);
    ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y);
    ctx.lineTo(x + 14, y);
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x, y + 14);
    ctx.stroke();
  }

  function drawVignette(frozenness) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (frozenness > 0.05) {
      ctx.fillStyle = `rgba(94,240,255,${frozenness * 0.06})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  let fontCache;
  function getFont() {
    if (fontCache) return fontCache;
    fontCache = getComputedStyle(document.body).fontFamily || "sans-serif";
    return fontCache;
  }

  // calm drifting dots behind the title
  let idle = [];
  function idleField(dt) {
    if (idle.length === 0) {
      for (let i = 0; i < 40; i++)
        idle.push({ x: rand(0, W), y: rand(0, H), vx: rand(-8, 8), vy: rand(-8, 8), r: rand(1, 2.5) });
    }
    ctx.fillStyle = "rgba(94,240,255,0.25)";
    for (const d of idle) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < 0) d.x = W;
      if (d.x > W) d.x = 0;
      if (d.y < 0) d.y = H;
      if (d.y > H) d.y = 0;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
  }

  reset(); // initialize arrays so title-screen rendering is safe
  requestAnimationFrame(frame);
})();
