// ============================================================
//  CHROMA RIFT — game.js
//  Main controller: loop, input, modes (solo + versus 2P),
//  waves, collisions, XP orbs, scoring.
// ============================================================
"use strict";

const ACCENT_P1 = [255, 90, 120];
const ACCENT_P2 = [80, 200, 255];

// Fixed virtual play-field. Everything simulates in these coordinates and
// is scaled-to-fit (letterboxed) onto each screen, so all players — at any
// window size — share the exact same arena.
const WORLD_W = 1280, WORLD_H = 720;

const DEFAULT_BINDS = {
  p1: { up: "w", down: "s", left: "a", right: "d", prevColor: "q", nextColor: "e" },
  p2: { up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright", prevColor: ",", nextColor: "." },
};
const BIND_ACTS = ["up", "down", "left", "right", "prevColor", "nextColor"];

class Game {
  constructor() {
    this.canvas = document.getElementById("c");
    this.ctx = this.canvas.getContext("2d");
    this.dpr = 1;
    this.W = 0; this.H = 0;

    this.state = "title"; // title | playing | paused | over
    this.mode = "solo";   // solo | versus
    this.particles = new Particles();
    this.stars = [];
    this.time = 0;
    this.shake = 0;

    this.players = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.orbs = [];
    this.boss = null;

    // solo input (mouse-aimed player)
    this.input = { up: false, down: false, left: false, right: false, mx: 0, my: 0, firing: false };
    // versus key states
    this.k1 = { up: false, down: false, left: false, right: false };
    this.k2 = { up: false, down: false, left: false, right: false };

    this.fragLimit = 8;
    this.best = parseInt(localStorage.getItem("chromaRiftBest") || "0", 10) || 0;

    // persistent settings (names, volume, shake, keybinds)
    this._loadSettings();
    Sound.setVolume(this.settings.volume);

    this._capture = null;       // active keybind capture {scheme, act}
    this._settingsOpen = false;
    this._settingsReturn = "title";
    this.peerName = null;       // opponent name (online)

    // networking (online versus)
    this.net = new Net();
    this.netRole = null;            // 'host' | 'guest'
    this.guestInput = { u: false, d: false, l: false, r: false, f: false, a: 0, c: 2 };
    this.localColorIdx = 2;         // guest's chosen color
    this.fxOut = [];                // fx events host streams to guest
    this.netAcc = 0;                // send throttle accumulator
    this.ghostPlayers = [];
    this.ghostBullets = [];
    this.ghostOrbs = [];
    this.ghostReady = false;

    this._bindDOM();
    this._bindInput();
    this._setupNet();
    this._resize();
    window.addEventListener("resize", () => this._resize());

    this._makeStars();
    this.last = performance.now();
    this.lastSim = performance.now();
    this._startClock();
  }

  // Drive simulation from a Web Worker metronome so the host keeps
  // simulating + networking even when its tab is backgrounded (critical
  // for two tabs on one machine). Rendering stays on requestAnimationFrame.
  _startClock() {
    this._useWorker = false;
    try {
      const src = "var h=setInterval(function(){postMessage(0);}," + (1000 / 60).toFixed(3) + ");";
      const blob = new Blob([src], { type: "application/javascript" });
      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.onmessage = () => this._step();
      this._useWorker = true;
    } catch (e) {
      this._useWorker = false;
    }
    requestAnimationFrame((t) => this._renderFrame(t));
  }

  // one simulation step (no rendering)
  _step() {
    const now = performance.now();
    let dt = (now - this.lastSim) / 1000;
    this.lastSim = now;
    if (dt <= 0) return;
    if (dt > 0.05) dt = 0.05;
    this.time += dt;

    if (this.state === "playing") {
      if (this.mode === "solo") this._updateSolo(dt);
      else if (this.mode === "versus") this._updateVersus(dt);
      else if (this.mode === "online") {
        if (this.netRole === "host") this._updateOnlineHost(dt);
        else this._updateOnlineGuest(dt);
      }
    } else {
      this.particles.update(dt * 0.4);
    }

    const live = this.state === "playing" || this.state === "paused";
    this.el.menuBtn.classList.toggle("hidden", !live);
  }

  // render loop (visuals only; pauses when tab is backgrounded — that's fine)
  _renderFrame(now) {
    requestAnimationFrame((t) => this._renderFrame(t));
    if (!this._useWorker) this._step(); // fallback if Web Workers unavailable
    this._render();
  }

  // -------------------------------------------------- setup
  _resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.W = w; this.H = h;                         // screen (CSS px)
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // fixed world bounds (never depends on screen size)
    const m = 12;
    this.bounds = { x: m, y: m, w: WORLD_W - m * 2, h: WORLD_H - m * 2 };

    // scale-to-fit world into screen, centered (letterbox)
    const scale = Math.min(w / WORLD_W, h / WORLD_H);
    this.view = { scale, offX: (w - WORLD_W * scale) / 2, offY: (h - WORLD_H * scale) / 2 };

    if (!this.input.mx) { this.input.mx = w / 2; this.input.my = h / 2; }
  }

  // convert raw screen mouse/touch coords into world coords
  _mouseWorld() {
    return {
      x: (this.input.mx - this.view.offX) / this.view.scale,
      y: (this.input.my - this.view.offY) / this.view.scale,
    };
  }

  _makeStars() {
    this.stars = [];
    for (let i = 0; i < 140; i++) {
      this.stars.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), z: rand(0.2, 1), tw: rand(0, TAU), sp: rand(0.5, 2) });
    }
  }

  // -------------------------------------------------- settings / keybinds
  _loadSettings() {
    const def = {
      names: { p1: "Player 1", p2: "Player 2" },
      volume: 0.5, shake: true,
      binds: { p1: { ...DEFAULT_BINDS.p1 }, p2: { ...DEFAULT_BINDS.p2 } },
    };
    try {
      const s = JSON.parse(localStorage.getItem("chromaRiftSettings"));
      if (s) {
        if (s.names) { def.names.p1 = s.names.p1 || def.names.p1; def.names.p2 = s.names.p2 || def.names.p2; }
        if (typeof s.volume === "number") def.volume = s.volume;
        if (typeof s.shake === "boolean") def.shake = s.shake;
        if (s.binds) for (const sc of ["p1", "p2"]) if (s.binds[sc]) for (const a of BIND_ACTS) if (s.binds[sc][a]) def.binds[sc][a] = s.binds[sc][a];
      }
    } catch (e) {}
    this.settings = def;
    this.binds = this.settings.binds;
    this.names = this.settings.names;
    this._rebuildGameKeys();
  }

  _saveSettings() {
    try { localStorage.setItem("chromaRiftSettings", JSON.stringify(this.settings)); } catch (e) {}
  }

  // set of keys the game consumes (for preventDefault)
  _rebuildGameKeys() {
    this._gameKeys = new Set([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    for (const sc of ["p1", "p2"]) for (const a of BIND_ACTS) this._gameKeys.add(this.binds[sc][a]);
  }

  keyLabel(k) {
    if (!k) return "—";
    const map = { arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", " ": "Space" };
    return map[k] || k.toUpperCase();
  }

  _applyMove(bind, c, target, down) {
    if (c === bind.up) target.up = down;
    else if (c === bind.down) target.down = down;
    else if (c === bind.left) target.left = down;
    else if (c === bind.right) target.right = down;
    else return false;
    return true;
  }

  _bindDOM() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      score: $("score"), wave: $("wave"), combo: $("combo"),
      health: $("healthFill"),
      dots: Array.from(document.querySelectorAll("#colorWrap .color-dot")),
      hud: $("hud"),
      banner: $("banner"), bannerText: $("bannerText"),
      title: $("titleScreen"), pause: $("pauseScreen"), over: $("overScreen"),
      finalScore: $("finalScore"), finalWave: $("finalWave"),
      finalCombo: $("finalCombo"), bestScore: $("bestScore"),
      mute: $("muteBtn"), menuBtn: $("menuBtn"),
      // versus
      vsHud: $("vsHud"),
      p1health: $("p1health"), p1xp: $("p1xp"), p1level: $("p1level"), p1frags: $("p1frags"),
      p2health: $("p2health"), p2xp: $("p2xp"), p2level: $("p2level"), p2frags: $("p2frags"),
      p1dots: Array.from(document.querySelectorAll("#p1dots .color-dot")),
      p2dots: Array.from(document.querySelectorAll("#p2dots .color-dot")),
      fragGoal: $("fragGoal"),
      vsOver: $("vsOverScreen"), vsWinner: $("vsWinner"), vsStats: $("vsStats"),
      // lobby
      lobby: $("lobbyScreen"), lobbyServer: $("lobbyServer"), lobbyServerRow: $("lobbyServerRow"),
      lobbyRoom: $("lobbyRoom"), lobbyStatus: $("lobbyStatus"), lobbyConnect: $("lobbyConnect"),
      // names in versus HUD
      p1name: $("p1name"), p2name: $("p2name"),
      // settings
      settings: $("settingsScreen"), setNameP1: $("setNameP1"), setNameP2: $("setNameP2"),
      setVolume: $("setVolume"), volVal: $("volVal"), setShake: $("setShake"),
      binds: Array.from(document.querySelectorAll("#settingsScreen .bind")),
    };

    const startSolo = () => { Sound.unlock(); this.startSolo(false); };
    const startVersus = () => { Sound.unlock(); this.startVersus(); };
    $("soloBtn").addEventListener("click", startSolo);
    $("versusBtn").addEventListener("click", startVersus);
    $("onlineBtn").addEventListener("click", () => { Sound.unlock(); this.openLobby(); });
    $("impossibleBtn").addEventListener("click", () => { Sound.unlock(); this.startSolo(true); });
    $("againBtn").addEventListener("click", () => { Sound.unlock(); this.startSolo(!!this.impossible); });
    $("resumeBtn").addEventListener("click", () => this.setPaused(false));
    $("quitBtn").addEventListener("click", () => this.toTitle());
    $("vsAgainBtn").addEventListener("click", () => this._rematch());
    $("vsMenuBtn").addEventListener("click", () => this.toTitle());
    $("lobbyConnect").addEventListener("click", () => this._connect());
    $("lobbyBack").addEventListener("click", () => { this.net.close(); this.toTitle(); });
    $("overMenuBtn").addEventListener("click", () => this.toTitle());
    this.el.menuBtn.addEventListener("click", () => this._inGameMenu());
    this.el.mute.addEventListener("click", () => {
      const m = Sound.toggle();
      this.el.mute.textContent = m ? "🔇" : "🔊";
    });

    // settings
    $("settingsBtn").addEventListener("click", () => this.openSettings("title"));
    $("pauseSettingsBtn").addEventListener("click", () => this.openSettings("pause"));
    $("settingsSave").addEventListener("click", () => this.closeSettings(true));
    $("settingsReset").addEventListener("click", () => this.resetSettings());
    this.el.setVolume.addEventListener("input", (e) => {
      const v = (+e.target.value) / 100;
      Sound.setVolume(v); this.el.volVal.textContent = e.target.value + "%";
    });
    this.el.binds.forEach((btn) => {
      btn.addEventListener("click", () => this._beginCapture(btn));
    });
  }

  _bindInput() {
    // normalize every key to lowercase so multi-char keys (ArrowUp, Escape…) match too
    const code = (e) => e.key.toLowerCase();

    const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"); };

    window.addEventListener("keydown", (e) => {
      // keybind capture mode (settings)
      if (this._capture) { e.preventDefault(); this._finishCapture(code(e)); return; }
      if (typing(e)) return;       // don't hijack keys while typing in a field
      if (this._settingsOpen) return;
      const c = code(e);
      if (this._gameKeys.has(c)) e.preventDefault();

      const b = this.binds;
      // movement routing
      if (this.mode === "versus") {
        this._applyMove(b.p1, c, this.k1, true);
        this._applyMove(b.p2, c, this.k2, true);
      } else {
        this._applyMove(b.p1, c, this.input, true);
      }

      if (c === "m") { const m = Sound.toggle(); this.el.mute.textContent = m ? "🔇" : "🔊"; }
      if (c === "p" || c === "escape") this.setPaused(this.state === "playing");
      if (this.state !== "playing") return;

      // direct color picks (always 1/2/3)
      const direct = c === "1" ? 0 : c === "2" ? 1 : c === "3" ? 2 : -1;
      if (this.mode === "versus") {
        if (c === b.p1.prevColor) this.cyclePlayerColor(0, -1);
        if (c === b.p1.nextColor) this.cyclePlayerColor(0, 1);
        if (c === b.p2.prevColor) this.cyclePlayerColor(1, -1);
        if (c === b.p2.nextColor) this.cyclePlayerColor(1, 1);
        if (direct >= 0) this.setPlayerColor(0, direct);
      } else if (this.mode === "online" && this.netRole === "guest") {
        if (c === b.p1.prevColor) this.guestCycleColor(-1);
        if (c === b.p1.nextColor) this.guestCycleColor(1);
        if (direct >= 0) this.guestSetColor(direct);
      } else {
        if (c === b.p1.prevColor) this.cyclePlayerColor(0, -1);
        if (c === b.p1.nextColor) this.cyclePlayerColor(0, 1);
        if (direct >= 0) this.setPlayerColor(0, direct);
      }
    });

    window.addEventListener("keyup", (e) => {
      if (typing(e) || this._settingsOpen) return;
      const c = code(e);
      const b = this.binds;
      if (this.mode === "versus") {
        this._applyMove(b.p1, c, this.k1, false);
        this._applyMove(b.p2, c, this.k2, false);
      } else {
        this._applyMove(b.p1, c, this.input, false);
      }
    });

    const rect = () => this.canvas.getBoundingClientRect();
    window.addEventListener("mousemove", (e) => {
      const r = rect(); this.input.mx = e.clientX - r.left; this.input.my = e.clientY - r.top;
    });
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.input.firing = true;
      if (e.button === 2) this._localCycle(1);
    });
    window.addEventListener("mouseup", () => { this.input.firing = false; });
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (this.state === "playing") this._localCycle(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    this.canvas.addEventListener("touchstart", (e) => { Sound.unlock(); for (const t of e.changedTouches) this._touch(t); }, { passive: true });
    this.canvas.addEventListener("touchmove", (e) => { for (const t of e.changedTouches) this._touch(t); }, { passive: true });
    const endTouch = () => { this.input.firing = false; };
    this.canvas.addEventListener("touchend", endTouch, { passive: true });
    this.canvas.addEventListener("touchcancel", endTouch, { passive: true });
  }

  _touch(t) {
    const r = this.canvas.getBoundingClientRect();
    this.input.mx = t.clientX - r.left; this.input.my = t.clientY - r.top; this.input.firing = true;
  }

  // -------------------------------------------------- color UI
  setPlayerColor(idx, i) {
    const p = this.players[idx];
    if (!p) return;
    p.setColor(i); Sound.switchColor(i); this._refreshDots();
  }
  cyclePlayerColor(idx, dir) {
    const p = this.players[idx];
    if (!p) return;
    p.setColor((p.colorIdx + dir + COLOR_COUNT) % COLOR_COUNT);
    Sound.switchColor(p.colorIdx); this._refreshDots();
  }
  _refreshDots() {
    if (this.mode === "solo") {
      const p = this.players[0];
      if (p) this.el.dots.forEach((d, i) => d.classList.toggle("active", i === p.colorIdx));
    } else if (this.mode === "versus") {
      const [a, b] = this.players;
      if (a) this.el.p1dots.forEach((d, i) => d.classList.toggle("active", i === a.colorIdx));
      if (b) this.el.p2dots.forEach((d, i) => d.classList.toggle("active", i === b.colorIdx));
    }
  }

  // local color-cycle that routes by mode/role (mouse + scroll)
  _localCycle(dir) {
    if (this.state !== "playing") return;
    if (this.mode === "solo") this.cyclePlayerColor(0, dir);
    else if (this.mode === "online") {
      if (this.netRole === "guest") this.guestCycleColor(dir);
      else this.cyclePlayerColor(0, dir);
    }
  }
  guestSetColor(i) { this.localColorIdx = i; Sound.switchColor(i); }
  guestCycleColor(dir) {
    this.localColorIdx = (this.localColorIdx + dir + COLOR_COUNT) % COLOR_COUNT;
    Sound.switchColor(this.localColorIdx);
  }

  // ============================================================
  //  ONLINE — lobby + connection
  // ============================================================
  _setupNet() {
    this.net.on("role", (m) => {
      this.netRole = m.role;
      this.el.lobbyStatus.textContent = (m.role === "host" ? "You are the HOST." : "Joined room.") + " Waiting for opponent…";
    });
    this.net.on("ready", () => { this.startOnlineMatch(); });
    this.net.on("full", () => { this.el.lobbyStatus.textContent = "That room is full. Try another code."; this.net.close(); });
    this.net.on("peerleft", () => {
      if (this.state === "playing" && this.mode === "online") {
        this.banner("OPPONENT LEFT");
        setTimeout(() => this.toTitle(), 1400);
      } else if (this.el.lobby && !this.el.lobby.classList.contains("hidden")) {
        this.el.lobbyStatus.textContent = "Opponent disconnected. Waiting…";
      }
    });
    this.net.on("close", () => {
      if (this.el.lobby && !this.el.lobby.classList.contains("hidden"))
        this.el.lobbyStatus.textContent = "Disconnected from server.";
    });
    this.net.on("error", () => {
      this.el.lobbyStatus.textContent = "Could not reach server. Is it running at that address?";
    });
    this.net.on("message", (m) => this._onNetMessage(m));
  }

  // -------------------------------------------------- settings UI
  openSettings(returnTo) {
    this._settingsReturn = returnTo || "title";
    this._settingsOpen = true;
    this.el.setNameP1.value = this.names.p1;
    this.el.setNameP2.value = this.names.p2;
    const vpct = Math.round(this.settings.volume * 100);
    this.el.setVolume.value = vpct; this.el.volVal.textContent = vpct + "%";
    this.el.setShake.checked = !!this.settings.shake;
    this._renderBindButtons();
    this.el.title.classList.add("hidden");
    this.el.pause.classList.add("hidden");
    this.el.settings.classList.remove("hidden");
  }

  closeSettings(save) {
    if (save) {
      this.names.p1 = (this.el.setNameP1.value || "").trim().slice(0, 14) || "Player 1";
      this.names.p2 = (this.el.setNameP2.value || "").trim().slice(0, 14) || "Player 2";
      this.settings.volume = (+this.el.setVolume.value) / 100;
      this.settings.shake = !!this.el.setShake.checked;
      Sound.setVolume(this.settings.volume);
      this._rebuildGameKeys();
      this._saveSettings();
      // reflect names live if a local match is in progress
      if (this.mode === "versus") this._setVsNames(this.names.p1, this.names.p2);
    } else {
      Sound.setVolume(this.settings.volume); // revert volume preview
    }
    this._capture = null;
    this._settingsOpen = false;
    this.el.settings.classList.add("hidden");
    if (this._settingsReturn === "pause") this.el.pause.classList.remove("hidden");
    else this.el.title.classList.remove("hidden");
  }

  resetSettings() {
    this.binds.p1 = { ...DEFAULT_BINDS.p1 };
    this.binds.p2 = { ...DEFAULT_BINDS.p2 };
    this.names.p1 = "Player 1"; this.names.p2 = "Player 2";
    this.settings.volume = 0.5; this.settings.shake = true;
    Sound.setVolume(0.5);
    this._rebuildGameKeys();
    this.el.setNameP1.value = this.names.p1;
    this.el.setNameP2.value = this.names.p2;
    this.el.setVolume.value = 50; this.el.volVal.textContent = "50%";
    this.el.setShake.checked = true;
    this._renderBindButtons();
  }

  _renderBindButtons() {
    this.el.binds.forEach((btn) => {
      btn.textContent = this.keyLabel(this.binds[btn.dataset.scheme][btn.dataset.act]);
      btn.classList.remove("capturing");
    });
  }

  _beginCapture(btn) {
    this._capture = { scheme: btn.dataset.scheme, act: btn.dataset.act, btn };
    this.el.binds.forEach((b) => b.classList.remove("capturing"));
    btn.classList.add("capturing");
    btn.textContent = "press a key…";
  }

  _finishCapture(key) {
    const cap = this._capture;
    this._capture = null;
    if (!cap || key === "escape") { this._renderBindButtons(); return; }
    // free this key from any other action in the same scheme (no duplicates)
    for (const a of BIND_ACTS) if (this.binds[cap.scheme][a] === key) this.binds[cap.scheme][a] = "";
    this.binds[cap.scheme][cap.act] = key;
    this._rebuildGameKeys();
    this._renderBindButtons();
  }

  openLobby() {
    this.state = "title";
    this.el.title.classList.add("hidden");
    this.el.lobby.classList.remove("hidden");
    // auto server URL when page is served; show field only for file://
    const auto = Net.defaultUrl();
    this.el.lobbyServer.value = auto;
    const served = location.protocol === "http:" || location.protocol === "https:";
    this.el.lobbyServerRow.style.display = served ? "none" : "";
    if (!this.el.lobbyRoom.value) this.el.lobbyRoom.value = this._randomRoom();
    this.el.lobbyStatus.textContent = served
      ? "Share the room code with your friend, then both press Connect."
      : "Start the server, enter its address + a shared room code.";
  }

  _randomRoom() {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = ""; for (let i = 0; i < 4; i++) s += letters[rnd(letters.length)];
    return s;
  }

  async _connect() {
    const url = (this.el.lobbyServer.value || Net.defaultUrl()).trim();
    const room = (this.el.lobbyRoom.value || "PUBLIC").trim().toUpperCase();
    this.el.lobbyStatus.textContent = "Connecting…";
    this.net.close();
    this.net = new Net();
    this._setupNet();
    try {
      await this.net.connect(url);
      this.net.join(room);
    } catch (e) {
      this.el.lobbyStatus.textContent = "Could not connect to " + url;
    }
  }

  _onNetMessage(m) {
    if (m.type === "i") { this.guestInput = m; return; }          // host receives guest input
    if (m.type === "s") { this._applySnapshot(m); return; }        // guest receives state
    if (m.type === "over") { this._guestOver(m); return; }
    if (m.type === "restart") { if (this.netRole === "guest") this.startOnlineMatch(); return; }
    if (m.type === "hello") {                                      // peer announced their name
      this.peerName = m.name || "Opponent";
      if (this.mode === "online") {
        if (this.netRole === "host") {
          if (this.players[1]) this.players[1].label = this.peerName;
          this._setVsNames(this.names.p1, this.peerName);
        } else {
          if (this.ghostPlayers[0]) this.ghostPlayers[0].label = this.peerName;
          this._setVsNames(this.peerName, this.names.p1);
        }
      }
      return;
    }
  }

  startOnlineMatch() {
    this.mode = "online";
    this.impossible = false;
    this._commonReset();
    this.el.lobby.classList.add("hidden");
    this.el.hud.classList.add("hidden");
    this.el.vsHud.classList.remove("hidden");
    this.el.fragGoal.textContent = "FIRST TO " + this.fragLimit;
    this.netAcc = 0;
    const b = this.bounds;

    const myName = this.names.p1;
    const oppName = this.peerName || "Opponent";

    if (this.netRole === "host") {
      const p1 = new Player(b.x + b.w * 0.2, b.y + b.h * 0.5, {
        index: 0, label: myName, accent: ACCENT_P1, aimMouse: true, keys: this.input, colorIdx: 0, angle: 0,
      });
      const p2 = new Player(b.x + b.w * 0.8, b.y + b.h * 0.5, {
        index: 1, label: oppName, accent: ACCENT_P2, netControlled: true,
        keys: { up: false, down: false, left: false, right: false }, colorIdx: 2, angle: Math.PI,
      });
      this.players = [p1, p2];
      this.player = null;
      this.orbs = []; this.orbTimer = 0.5; this.maxOrbs = 7;
      for (let i = 0; i < 4; i++) this._spawnOrb();
      this._setVsNames(myName, oppName);
    } else {
      // guest renders ghosts only; guest is P2 (right)
      this.players = [];
      this.localColorIdx = 2;
      this.ghostPlayers = [
        new Player(b.x + b.w * 0.2, b.y + b.h * 0.5, { index: 0, label: oppName, accent: ACCENT_P1, colorIdx: 0, angle: 0 }),
        new Player(b.x + b.w * 0.8, b.y + b.h * 0.5, { index: 1, label: myName, accent: ACCENT_P2, colorIdx: 2, angle: Math.PI }),
      ];
      this.ghostBullets = []; this.ghostOrbs = []; this.ghostReady = false;
      this._setVsNames(oppName, myName);
    }

    this.state = "playing";
    this.el.menuBtn.textContent = "LEAVE"; this.el.menuBtn.title = "Leave match";
    this.banner("FIGHT");
    Sound.wave();
    this.net.send({ type: "hello", name: myName });   // tell peer my name
  }

  _setVsNames(n1, n2) {
    if (this.el.p1name) this.el.p1name.textContent = n1;
    if (this.el.p2name) this.el.p2name.textContent = n2;
  }

  _rematch() {
    if (this.mode === "online") {
      if (this.netRole === "host" && this.net.connected) { this.net.send({ type: "restart" }); this.startOnlineMatch(); }
      else this.el.vsWinner.textContent = "WAITING FOR HOST…";
    } else {
      this.startVersus();
    }
  }

  // -------------------------------------------------- state / start
  _commonReset() {
    this.bullets = []; this.enemyBullets = []; this.enemies = []; this.orbs = [];
    this.boss = null; this.particles.reset();
    this.shake = 0;
    this.el.title.classList.add("hidden");
    this.el.over.classList.add("hidden");
    this.el.pause.classList.add("hidden");
    this.el.vsOver.classList.add("hidden");
  }

  startSolo(impossible) {
    this.mode = "solo";
    this.impossible = !!impossible;
    this._commonReset();
    this.players = [new Player(WORLD_W / 2, WORLD_H / 2, {
      index: 0, label: this.names.p1, aimMouse: true, autoFire: false, accent: [60, 110, 200], keys: this.input,
    })];
    this.player = this.players[0];
    // difficulty scalars
    this.bossEvery = this.impossible ? 3 : 5;
    this.dmgMul = this.impossible ? 1.6 : 1;     // more damage taken
    this.scoreMul = this.impossible ? 2 : 1;     // double score reward
    if (this.impossible) { this.player.maxhp = 60; this.player.hp = 60; }
    this.score = 0; this.displayScore = 0; this.combo = 0; this.bestCombo = 1;
    this.wave = 0; this.waveQueue = []; this.spawnTimer = 0; this.betweenWaves = 1.0;
    this.orbs = []; this.healTimer = 10;
    this.state = "playing";
    this.el.hud.classList.remove("hidden");
    this.el.vsHud.classList.add("hidden");
    this.el.menuBtn.textContent = "❚❚"; this.el.menuBtn.title = "Pause (Esc)";
    this.el.hud.classList.toggle("impossible", this.impossible);
    if (this.impossible) this.banner("☠ IMPOSSIBLE");
    this._refreshDots();
  }

  startVersus() {
    this.mode = "versus";
    this.impossible = false;
    this._commonReset();
    this.k1 = { up: false, down: false, left: false, right: false };
    this.k2 = { up: false, down: false, left: false, right: false };
    const b = this.bounds;
    const p1 = new Player(b.x + b.w * 0.2, b.y + b.h * 0.5, {
      index: 0, label: this.names.p1, accent: ACCENT_P1, autoFire: true, keys: this.k1, colorIdx: 0, angle: 0,
    });
    const p2 = new Player(b.x + b.w * 0.8, b.y + b.h * 0.5, {
      index: 1, label: this.names.p2, accent: ACCENT_P2, autoFire: true, keys: this.k2, colorIdx: 2, angle: Math.PI,
    });
    this.players = [p1, p2];
    this.player = null;
    this._setVsNames(this.names.p1, this.names.p2);
    this.orbTimer = 0.5;
    this.maxOrbs = 7;
    this.state = "playing";
    this.el.hud.classList.add("hidden");
    this.el.vsHud.classList.remove("hidden");
    this.el.menuBtn.textContent = "❚❚"; this.el.menuBtn.title = "Pause (Esc)";
    this.el.fragGoal.textContent = "FIRST TO " + this.fragLimit;
    // seed a few orbs
    for (let i = 0; i < 4; i++) this._spawnOrb();
    this._refreshDots();
    this.banner("FIGHT");
    Sound.wave();
  }

  toTitle() {
    if (this.mode === "online") { this.net.close(); this.netRole = null; this.peerName = null; }
    this.state = "title";
    this.el.pause.classList.add("hidden");
    this.el.over.classList.add("hidden");
    this.el.vsOver.classList.add("hidden");
    this.el.vsHud.classList.add("hidden");
    if (this.el.lobby) this.el.lobby.classList.add("hidden");
    this.el.hud.classList.remove("hidden");
    this.el.hud.classList.remove("impossible");
    this.el.title.classList.remove("hidden");
  }

  // in-game corner button: pause (solo/local) or leave (online)
  _inGameMenu() {
    if (this.state !== "playing" && this.state !== "paused") return;
    if (this.mode === "online") this.toTitle();
    else this.setPaused(this.state !== "paused");
  }

  setPaused(p) {
    if (this.mode === "online") return; // can't pause a live online match
    if (this.state !== "playing" && this.state !== "paused") return;
    this.state = p ? "paused" : "playing";
    this.el.pause.classList.toggle("hidden", !p);
  }

  gameOver() {
    this.state = "over";
    Sound.gameOver();
    if (this.score > this.best) { this.best = this.score; localStorage.setItem("chromaRiftBest", String(this.best)); }
    this.el.finalScore.textContent = Math.floor(this.score).toLocaleString();
    this.el.finalWave.textContent = this.wave;
    this.el.finalCombo.textContent = "x" + this.multiplier(this.bestCombo);
    this.el.bestScore.textContent = Math.floor(this.best).toLocaleString();
    setTimeout(() => this.el.over.classList.remove("hidden"), 700);
  }

  versusOver(winner, playersArr) {
    this.state = "over";
    Sound.levelUp();
    this.shake = 14;
    this.el.vsWinner.textContent = winner.label + " WINS";
    this.el.vsWinner.style.color = rgbaArr(winner.accent, 1);
    const [a, b] = playersArr || this.players;
    const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    this.el.vsStats.innerHTML =
      `<div class="result-row"><span style="color:${rgbaArr(ACCENT_P1, 1)}">${esc(a.label)}</span><b>${a.frags} KO · Lv ${a.level}</b></div>` +
      `<div class="result-row"><span style="color:${rgbaArr(ACCENT_P2, 1)}">${esc(b.label)}</span><b>${b.frags} KO · Lv ${b.level}</b></div>`;
    setTimeout(() => this.el.vsOver.classList.remove("hidden"), 700);
  }

  // -------------------------------------------------- waves (solo)
  banner(text) {
    this.el.bannerText.textContent = text;
    this.el.banner.classList.remove("hidden", "show");
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add("show");
    setTimeout(() => this.el.banner.classList.add("hidden"), 1800);
  }

  startWave() {
    this.wave++;
    this.el.wave.classList.remove("bump"); void this.el.wave.offsetWidth; this.el.wave.classList.add("bump");
    const bossEvery = this.bossEvery || 5;
    const isBoss = this.wave % bossEvery === 0;
    this.waveQueue = [];
    if (isBoss) {
      Sound.bossWarn();
      const bossKind = Math.min(8, this.wave / bossEvery);
      this.boss = new Boss(WORLD_W / 2, this.bounds.y + 140, bossKind);
      this.boss.impossible = this.impossible;
      this.banner((this.impossible ? "☠ " : "⬢  ") + this.boss.name);
      // escorts (more on impossible)
      if (bossKind !== 5 && bossKind !== 8 || this.impossible) {
        const adds = (1 + Math.floor(bossKind / 2)) * (this.impossible ? 2 : 1);
        for (let i = 0; i < adds; i++) this.waveQueue.push(this._spec(this.impossible ? pick(["orbiter", "chaser"]) : "orbiter"));
      }
    } else {
      Sound.wave(); this.banner("WAVE " + this.wave);
      let budget = Math.round(4 + this.wave * 1.7);
      const unlocked = ["drifter"];
      if (this.impossible) { unlocked.push("chaser", "orbiter", "prism"); budget = Math.round(budget * 1.7); }
      else {
        if (this.wave >= 2) unlocked.push("chaser");
        if (this.wave >= 3) unlocked.push("orbiter");
        if (this.wave >= 4) unlocked.push("prism");
      }
      for (let i = 0; i < budget; i++) this.waveQueue.push(this._spec(pick(unlocked)));
    }
    this.spawnTimer = 0;
  }

  _spec(type) { return { type, colorIdx: randInt(0, COLOR_COUNT - 1) }; }

  _spawnFromQueue() {
    const spec = this.waveQueue.shift();
    const depthScale = (1 + this.wave * 0.12) * (this.impossible ? 1.6 : 1);
    const p = this._edgePoint();
    const e = new Enemy(spec.type, p.x, p.y, spec.colorIdx, depthScale);
    if (this.impossible) e.speed *= 1.35;
    this.enemies.push(e);
    this.particles.shock(p.x, p.y, this.colorRGB(e), { r0: 4, r1: 46, life: 0.5 });
  }

  _edgePoint() {
    const b = this.bounds, pad = 50;
    const side = randInt(0, 3);
    if (side === 0) return { x: rand(b.x, b.x + b.w), y: b.y - pad };
    if (side === 1) return { x: b.x + b.w + pad, y: rand(b.y, b.y + b.h) };
    if (side === 2) return { x: rand(b.x, b.x + b.w), y: b.y + b.h + pad };
    return { x: b.x - pad, y: rand(b.y, b.y + b.h) };
  }

  // -------------------------------------------------- orbs (versus)
  _spawnOrb() {
    const b = this.bounds;
    let x, y, tries = 0;
    do {
      x = rand(b.x + 50, b.x + b.w - 50);
      y = rand(b.y + 50, b.y + b.h - 50);
      tries++;
    } while (tries < 24 && this.players.some(p => dist2(x, y, p.x, p.y) < 130 * 130));
    const kind = chance(0.28) ? "hp" : "xp";
    const orb = new XpOrb(x, y, kind, chance(0.18));
    this.orbs.push(orb);
    this.particles.shock(x, y, kind === "hp" ? HEAL_RGB : rainbowRGB(orb.phase), { r0: 3, r1: 36, life: 0.4 });
  }

  colorRGB(e) { return e.type === "prism" ? rainbowRGB(e.prismPhase) : COLORS[e.curColor()].rgb; }
  multiplier(combo) { return 1 + Math.min(9, Math.floor(combo / 5)); }

  // -------------------------------------------------- solo health pickups
  _spawnSoloHeal(x, y) {
    const b = this.bounds;
    if (x == null) { x = rand(b.x + 50, b.x + b.w - 50); y = rand(b.y + 50, b.y + b.h - 50); }
    const orb = new XpOrb(x, y, "hp", chance(0.25));
    this.orbs.push(orb);
    this.particles.shock(x, y, HEAL_RGB, { r0: 3, r1: 36, life: 0.4 });
  }

  _collectSoloHeals() {
    const p = this.player;
    for (const o of this.orbs) {
      if (o.dead) continue;
      if (hitCircle(o.x, o.y, o.r, p.x, p.y, p.r + 4)) {
        o.dead = true;
        const before = p.hp;
        p.hp = Math.min(p.maxhp, p.hp + o.heal);
        const gained = Math.round(p.hp - before);
        this.particles.burst(o.x, o.y, HEAL_RGB, o.big ? 18 : 11, { speed: 5, life: 0.6, size: 3 });
        this.particles.text(o.x, o.y - 8, "+" + gained + " HP", HEAL_RGB, { size: 14 });
        this.particles.shock(p.x, p.y, HEAL_RGB, { r1: 60 });
        Sound.pickup(o.big);
      }
    }
  }

  // -------------------------------------------------- shared player update + firing
  _updatePlayersAndFire(dt) {
    const arena = this.mode === "versus" || this.mode === "online";
    for (const p of this.players) {
      if (p.aimMouse) { const mw = this._mouseWorld(); p.aimX = mw.x; p.aimY = mw.y; }
      p.update(dt, this.bounds);

      if (arena && !p.alive) {
        p.respawn -= dt;
        if (p.respawn <= 0) this._respawn(p);
        continue;
      }
      let wantFire;
      if (p.aimMouse) wantFire = this.input.firing;
      else if (p.netControlled) wantFire = !!p.netFire;
      else wantFire = p.autoFire;
      if (wantFire && p.fireCd <= 0 && p.alive) this._fire(p);
    }
  }

  _fire(p) {
    const dir = p.angle + rand(-0.03, 0.03);
    const px = p.x + Math.cos(p.angle) * 18, py = p.y + Math.sin(p.angle) * 18;
    const arena = this.mode === "versus" || this.mode === "online";
    this.bullets.push(new Bullet(px, py, dir, p.colorIdx, {
      owner: p, dmg: arena ? p.pvpDamage() : 1,
    }));
    p.fireCd = p.fireInterval;
    Sound.shoot(p.colorIdx);
    this.particles.spray(px, py, p.angle, COLORS[p.colorIdx].rgb, 3, { speed: 5, arc: 0.4, life: 0.2, size: 2 });
  }

  _respawn(p) {
    const b = this.bounds;
    p.x = p.index === 0 ? b.x + b.w * 0.2 : b.x + b.w * 0.8;
    p.y = b.y + b.h * 0.5;
    p.vx = p.vy = 0;
    p.alive = true; p.hp = p.maxhp; p.invuln = 2; p.spawnPulse = 1;
    this.particles.shock(p.x, p.y, COLORS[p.colorIdx].rgb, { r1: 90 });
  }

  // -------------------------------------------------- solo update
  _updateSolo(dt) {
    const p = this.player;
    this._updatePlayersAndFire(dt);

    for (const b of this.bullets) b.update(dt);
    for (const b of this.enemyBullets) b.update(dt);
    for (const e of this.enemies) e.update(dt, p);
    for (const o of this.orbs) o.update(dt, this.players);
    if (this.boss) this.boss.update(dt, p, this);

    this._collideSolo(dt);
    this._collectSoloHeals();

    this.bullets = this.bullets.filter(b => !b.dead && this._inWorld(b));
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead && this._inWorld(b, 60));
    this.enemies = this.enemies.filter(e => !e.dead);
    this.orbs = this.orbs.filter(o => !o.dead);

    // periodically drop a health orb when the player is hurt (disabled on impossible)
    this.healTimer -= dt;
    if (this.healTimer <= 0) {
      this.healTimer = rand(10, 16);
      if (!this.impossible && p.hp < p.maxhp && this.orbs.length < 2) this._spawnSoloHeal();
    }

    this.particles.update(dt);
    this.displayScore += (this.score - this.displayScore) * Math.min(1, dt * 8);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);

    if (this.waveQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this._spawnFromQueue(); this.spawnTimer = rand(0.35, 0.8) * (this.impossible ? 0.5 : 1); }
    } else if (this.enemies.length === 0 && !this.boss) {
      this.betweenWaves -= dt;
      if (this.betweenWaves <= 0) { this.startWave(); this.betweenWaves = this.impossible ? 1.2 : 2.2; }
    }

    this._updateHudSolo();
    if (p.hp <= 0 && this.state === "playing") this.gameOver();
  }

  // -------------------------------------------------- versus / arena sim
  _simVersus(dt) {
    this._updatePlayersAndFire(dt);
    for (const b of this.bullets) b.update(dt);
    for (const o of this.orbs) o.update(dt, this.players);

    this._collideVersus(dt);

    this.bullets = this.bullets.filter(b => !b.dead && this._inWorld(b));
    this.orbs = this.orbs.filter(o => !o.dead);
    this.particles.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);

    this.orbTimer -= dt;
    if (this.orbTimer <= 0 && this.orbs.length < this.maxOrbs) {
      this._spawnOrb();
      this.orbTimer = rand(0.9, 1.7);
    }
  }

  _updateVersus(dt) {
    this._simVersus(dt);
    this._updateHudVersus(this.players[0], this.players[1]);
    for (const p of this.players) {
      if (p.frags >= this.fragLimit) { this.versusOver(p, this.players); break; }
    }
  }

  // -------------------------------------------------- online: host (authoritative)
  _updateOnlineHost(dt) {
    // apply remote guest input to P2
    const gi = this.guestInput, p2 = this.players[1];
    p2.keys.up = !!gi.u; p2.keys.down = !!gi.d; p2.keys.left = !!gi.l; p2.keys.right = !!gi.r;
    p2.netAngle = gi.a; p2.netFire = !!gi.f;
    if (gi.c != null) p2.setColor(gi.c);

    this.fxOut.length = 0;
    this._simVersus(dt);
    this._updateHudVersus(this.players[0], this.players[1]);

    // stream state ~30Hz
    this.netAcc += dt;
    if (this.netAcc >= 1 / 30) { this.netAcc = 0; this._sendState(); }

    for (const p of this.players) {
      if (p.frags >= this.fragLimit) {
        this.net.send({ type: "over", w: p.index });
        this.versusOver(p, this.players);
        break;
      }
    }
  }

  _sendState() {
    const ps = this.players.map(p => ({
      x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy),
      a: +p.angle.toFixed(2), c: p.colorIdx, h: Math.max(0, Math.round(p.hp)), m: p.maxhp,
      l: p.level, xp: Math.round(p.xp), xn: p.xpNext, f: p.frags, al: p.alive ? 1 : 0,
      rs: +p.respawn.toFixed(1),
    }));
    const bs = this.bullets.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), c: b.colorIdx }));
    const os = this.orbs.map(o => ({ x: Math.round(o.x), y: Math.round(o.y), r: o.r, ph: +o.phase.toFixed(2), b: o.big ? 1 : 0, k: o.kind }));
    this.net.send({ type: "s", sk: +this.shake.toFixed(1), ps, bs, os, fx: this.fxOut.slice(0, 30) });
  }

  // -------------------------------------------------- online: guest (render only)
  _updateOnlineGuest(dt) {
    // send my input ~40Hz
    this.netAcc += dt;
    if (this.netAcc >= 1 / 40) { this.netAcc = 0; this._sendInput(); }

    // extrapolate ghosts for smooth motion
    for (const p of this.ghostPlayers) {
      if (p.alive) { p.x += p.vx * dt; p.y += p.vy * dt; }
      p.ringSpin += dt * 1.4;
      const sp = Math.hypot(p.vx, p.vy);
      p.thrust = clamp(sp / 200, 0, 1);
      if (p.invuln > 0) p.invuln -= dt;
      if (!p.alive) p.respawn = Math.max(0, p.respawn - dt);
    }
    for (const b of this.ghostBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (const o of this.ghostOrbs) { o.phase = (o.phase + dt * 0.4) % 1; o.bob += dt * 3; o.spin += dt * 1.6; }

    this.particles.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 26);

    if (this.ghostReady) this._updateHudVersus(this.ghostPlayers[0], this.ghostPlayers[1]);
  }

  _sendInput() {
    // aim angle from my mouse (converted to world) relative to my (P2) ghost
    let a = 0;
    const me = this.ghostPlayers[1];
    if (me) { const mw = this._mouseWorld(); a = angleTo(me.x, me.y, mw.x, mw.y); }
    this.net.send({
      type: "i",
      u: this.input.up, d: this.input.down, l: this.input.left, r: this.input.right,
      f: this.input.firing, a: +a.toFixed(2), c: this.localColorIdx,
    });
  }

  _applySnapshot(m) {
    this.ghostReady = true;
    this.shake = Math.max(this.shake, m.sk || 0);
    // players
    for (let i = 0; i < 2; i++) {
      const s = m.ps[i], p = this.ghostPlayers[i];
      if (!s || !p) continue;
      p.x = s.x; p.y = s.y; p.vx = s.vx; p.vy = s.vy; p.angle = s.a;
      p.colorIdx = s.c; p.hp = s.h; p.maxhp = s.m; p.level = s.l;
      p.xp = s.xp; p.xpNext = s.xn; p.frags = s.f; p.alive = !!s.al; p.respawn = s.rs;
    }
    // bullets
    this.ghostBullets = (m.bs || []).map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, colorIdx: b.c }));
    // orbs
    this.ghostOrbs = (m.os || []).map(o => {
      const orb = new XpOrb(o.x, o.y, o.k || "xp", !!o.b);
      orb.phase = o.ph; orb.r = o.r;
      return orb;
    });
    // fx
    if (m.fx) for (const ev of m.fx) this._applyFx(ev);
  }

  _applyFx(ev) {
    const rgb = ev.c != null ? COLORS[ev.c].rgb : rainbowRGB(rand(0, 1));
    switch (ev.k) {
      case "h": this.particles.burst(ev.x, ev.y, rgb, 5, { speed: 3.5, life: 0.35, size: 2.4 }); Sound.hit(); break;
      case "b": this.particles.spray(ev.x, ev.y, rand(0, TAU), rgb, 5, { speed: 4, arc: 1, life: 0.22, size: 2 }); Sound.blocked(); break;
      case "k": this.particles.burst(ev.x, ev.y, rgb, 28, { speed: 7, life: 0.85, size: 3.5 }); this.particles.shock(ev.x, ev.y, rgb, { r1: 120 }); Sound.explode(); this.shake = Math.max(this.shake, 12); break;
      case "p": this.particles.burst(ev.x, ev.y, rainbowRGB(rand(0, 1)), 12, { speed: 5, life: 0.6, size: 3 }); Sound.pickup(false); break;
      case "hp": this.particles.burst(ev.x, ev.y, HEAL_RGB, 12, { speed: 5, life: 0.6, size: 3 }); this.particles.text(ev.x, ev.y - 8, "+HP", HEAL_RGB, { size: 14 }); Sound.pickup(true); break;
      case "l": this.particles.shock(ev.x, ev.y, rgb, { r1: 80 }); this.particles.text(ev.x, ev.y - 20, "LEVEL UP", rgb, { size: 18, life: 1.0, vy: -46 }); Sound.levelUp(); break;
      case "ko": this.particles.text(ev.x, ev.y - 18, "KO!", [255, 210, 120], { size: 24, life: 1.0, vy: -40 }); break;
    }
  }

  _guestOver(m) {
    const idx = m.w;
    const gp = this.ghostPlayers[idx];
    const winner = { label: gp ? gp.label : (idx === 0 ? "P1" : "P2"), accent: idx === 0 ? ACCENT_P1 : ACCENT_P2 };
    this.versusOver(winner, this.ghostPlayers);
  }

  // host helper: queue an fx event for the guest
  _fx(k, x, y, c) {
    if (this.mode === "online" && this.netRole === "host" && this.fxOut.length < 40)
      this.fxOut.push({ k, x: Math.round(x), y: Math.round(y), c });
  }

  _inWorld(o, pad = 30) { return o.x > -pad && o.x < WORLD_W + pad && o.y > -pad && o.y < WORLD_H + pad; }

  // -------------------------------------------------- solo collisions
  _collideSolo(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (hitCircle(b.x, b.y, b.r, e.x, e.y, e.r)) {
          if (e.matches(b.colorIdx)) this._damageEnemy(e, 1, b);
          else { this.particles.spray(b.x, b.y, Math.atan2(-b.vy, -b.vx), COLORS[b.colorIdx].rgb, 5, { speed: 4, arc: 1, life: 0.25, size: 2 }); Sound.blocked(); }
          b.dead = true; break;
        }
      }
      if (b.dead) continue;
      if (this.boss && !this.boss.dead) {
        if (this.boss.hitTest(b, this)) {
          b.dead = true;
          if (this.boss.dead) this._killBoss();
        }
      }
    }

    if (p.invuln <= 0) {
      for (const b of this.enemyBullets) {
        if (b.dead) continue;
        if (hitCircle(b.x, b.y, b.r, p.x, p.y, p.r)) { b.dead = true; this._hurtPlayer(p, 8, b.x, b.y); break; }
      }
    }
    if (p.invuln <= 0) {
      for (const e of this.enemies) {
        if (hitCircle(e.x, e.y, e.r, p.x, p.y, p.r)) {
          this._hurtPlayer(p, e.type === "chaser" ? 16 : 12, e.x, e.y);
          const a = angleTo(p.x, p.y, e.x, e.y);
          e.vx += Math.cos(a) * 220; e.vy += Math.sin(a) * 220;
          break;
        }
      }
      if (this.boss) {
        const c = this.boss.contact(p);
        if (c) this._hurtPlayer(p, c.dmg, c.x, c.y);
      }
    }
  }

  _damageEnemy(e, dmg, b) {
    e.hp -= dmg; e.hitFlash = 0.16;
    const rgb = this.colorRGB(e);
    this.particles.burst(b ? b.x : e.x, b ? b.y : e.y, rgb, 5, { speed: 3.5, life: 0.35, size: 2.4 });
    Sound.hit();
    if (e.hp <= 0) {
      e.dead = true;
      this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
      const mult = this.multiplier(this.combo);
      this._addScore(e.baseScore * mult, e.x, e.y, rgb, mult > 1 ? "x" + mult : null);
      this.particles.burst(e.x, e.y, rgb, 22, { speed: 6, life: 0.7, size: 3 });
      this.particles.shock(e.x, e.y, rgb, { r1: 70 });
      Sound.explode(); this.shake = Math.max(this.shake, 4);
      // chance to drop a health orb (more likely when hurt, capped; rarer on impossible)
      const dropBase = this.impossible ? 0.04 : 0.16;
      if (this.orbs.length < 3 && chance(this.player.hp < this.player.maxhp * 0.6 ? dropBase : dropBase * 0.45)) {
        this._spawnSoloHeal(e.x, e.y);
      }
    }
  }

  _killBoss() {
    const boss = this.boss; boss.dead = true;
    Sound.bigExplode(); this.shake = 16;
    for (let i = 0; i < 5; i++) setTimeout(() => {
      this.particles.burst(boss.x + rand(-40, 40), boss.y + rand(-40, 40), rainbowRGB(rand(0, 1)), 30, { speed: 8, life: 1, size: 4 });
      this.particles.shock(boss.x, boss.y, rainbowRGB(rand(0, 1)), { r1: 160, life: 0.6 });
    }, i * 120);
    this._addScore(boss.baseScore, boss.x, boss.y, [255, 220, 120], "BOSS!");
    Sound.levelUp(); this.boss = null;
  }

  _hurtPlayer(p, dmg, fromX, fromY) {
    if (this.mode === "solo" && this.dmgMul) dmg *= this.dmgMul;
    p.hp = Math.max(0, p.hp - dmg);
    p.invuln = 0.9; p.hitFlash = 0.3;
    if (this.mode === "solo") this.combo = 0;
    const a = angleTo(fromX, fromY, p.x, p.y);
    p.vx += Math.cos(a) * 260; p.vy += Math.sin(a) * 260;
    this.shake = Math.max(this.shake, 10);
    this.particles.burst(p.x, p.y, [255, 90, 110], 18, { speed: 6, life: 0.6, size: 3 });
    Sound.hurt();
  }

  _addScore(amt, x, y, rgb, label) {
    if (this.scoreMul) amt *= this.scoreMul;
    this.score += amt;
    this.particles.text(x, y - 10, (label ? label + " " : "") + "+" + Math.floor(amt), rgb, { size: label ? 22 : 16, life: 0.9, vy: -40 });
  }

  // -------------------------------------------------- versus collisions
  _collideVersus(dt) {
    // bullets vs the other player
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const p of this.players) {
        if (p === b.owner || !p.alive || p.invuln > 0) continue;
        if (hitCircle(b.x, b.y, b.r, p.x, p.y, p.r)) {
          if (b.colorIdx === p.colorIdx) {
            p.hp -= b.dmg; p.hitFlash = 0.2;
            this.particles.burst(b.x, b.y, COLORS[b.colorIdx].rgb, 6, { speed: 4, life: 0.4, size: 2.5 });
            Sound.hit();
            this._fx("h", b.x, b.y, b.colorIdx);
            if (p.hp <= 0) this._koPlayer(p, b.owner);
          } else {
            Sound.blocked();
            this.particles.spray(b.x, b.y, Math.atan2(-b.vy, -b.vx), COLORS[b.colorIdx].rgb, 5, { speed: 4, arc: 1, life: 0.22, size: 2 });
            this._fx("b", b.x, b.y, b.colorIdx);
          }
          b.dead = true; break;
        }
      }
    }
    // orbs vs players
    for (const o of this.orbs) {
      if (o.dead) continue;
      for (const p of this.players) {
        if (!p.alive) continue;
        if (hitCircle(o.x, o.y, o.r, p.x, p.y, p.r + 4)) {
          o.dead = true;
          if (o.kind === "hp") {
            const before = p.hp;
            p.hp = Math.min(p.maxhp, p.hp + o.heal);
            const gained = Math.round(p.hp - before);
            this.particles.burst(o.x, o.y, HEAL_RGB, o.big ? 18 : 11, { speed: 5, life: 0.6, size: 3 });
            this.particles.text(o.x, o.y - 8, "+" + gained + " HP", HEAL_RGB, { size: 14 });
            this.particles.shock(p.x, p.y, HEAL_RGB, { r1: 60 });
            Sound.pickup(o.big);
            this._fx("hp", o.x, o.y);
          } else {
            const rgb = rainbowRGB(o.phase);
            const lv = p.gainXp(o.value);
            this.particles.burst(o.x, o.y, rgb, o.big ? 18 : 10, { speed: 5, life: 0.6, size: 3 });
            this.particles.text(o.x, o.y - 8, "+" + o.value + " XP", rgb, { size: 14 });
            Sound.pickup(o.big);
            this._fx("p", o.x, o.y);
            if (lv > 0) {
              Sound.levelUp();
              this.particles.text(p.x, p.y - 24, "LEVEL UP", p.accent, { size: 18, life: 1.1, vy: -46 });
              this.particles.shock(p.x, p.y, p.accent, { r1: 80 });
              this._fx("l", p.x, p.y);
            }
          }
          break;
        }
      }
    }
  }

  _koPlayer(victim, killer) {
    victim.alive = false; victim.respawn = 3;
    const rgb = COLORS[victim.colorIdx].rgb;
    this.particles.burst(victim.x, victim.y, rgb, 28, { speed: 7, life: 0.85, size: 3.5 });
    this.particles.shock(victim.x, victim.y, rgb, { r1: 120 });
    Sound.explode(); this.shake = Math.max(this.shake, 12);
    this._fx("k", victim.x, victim.y, victim.colorIdx);
    if (killer && killer !== victim) {
      killer.frags++;
      const lv = killer.gainXp(6 + victim.level * 2);
      this.particles.text(victim.x, victim.y - 18, "KO!", [255, 210, 120], { size: 24, life: 1.0, vy: -40 });
      this._fx("ko", victim.x, victim.y);
      if (lv > 0) { Sound.levelUp(); this.particles.text(killer.x, killer.y - 24, "LEVEL UP", killer.accent, { size: 18, life: 1.1, vy: -46 }); this._fx("l", killer.x, killer.y); }
    }
  }

  // -------------------------------------------------- HUD
  _updateHudSolo() {
    this.el.score.textContent = Math.floor(this.displayScore).toLocaleString();
    this.el.wave.textContent = this.wave;
    this.el.combo.textContent = "x" + this.multiplier(this.combo);
    this.el.health.style.width = (100 * this.player.hp / this.player.maxhp) + "%";
  }

  _updateHudVersus(a, b) {
    if (!a || !b) return;
    this.el.p1health.style.width = (100 * Math.max(0, a.hp) / a.maxhp) + "%";
    this.el.p2health.style.width = (100 * Math.max(0, b.hp) / b.maxhp) + "%";
    this.el.p1xp.style.width = (100 * a.xp / a.xpNext) + "%";
    this.el.p2xp.style.width = (100 * b.xp / b.xpNext) + "%";
    this.el.p1level.textContent = "Lv " + a.level;
    this.el.p2level.textContent = "Lv " + b.level;
    this.el.p1frags.textContent = a.frags;
    this.el.p2frags.textContent = b.frags;
    this.el.p1dots.forEach((d, i) => d.classList.toggle("active", i === a.colorIdx));
    this.el.p2dots.forEach((d, i) => d.classList.toggle("active", i === b.colorIdx));
  }

  // -------------------------------------------------- render
  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    const bg = ctx.createRadialGradient(this.W / 2, this.H * 0.45, 60, this.W / 2, this.H * 0.5, Math.max(this.W, this.H) * 0.75);
    bg.addColorStop(0, "#0c1126"); bg.addColorStop(1, "#05060e");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, this.W, this.H);

    // enter world space: scale-to-fit + center (letterbox), then shake
    ctx.save();
    ctx.translate(this.view.offX, this.view.offY);
    ctx.scale(this.view.scale, this.view.scale);
    if (this.shake > 0.3 && this.settings.shake) ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));

    this._drawGrid(ctx);
    this._drawStars(ctx);

    // arena border so the play-field edges are always visible
    ctx.strokeStyle = "rgba(120,150,255,0.16)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

    if (this.state !== "title") {
      if (this.mode === "solo") {
        for (const o of this.orbs) o.draw(ctx);
        if (this.boss) this.boss.draw(ctx, this.time);
        for (const e of this.enemies) e.draw(ctx, this.time);
        for (const b of this.enemyBullets) b.draw(ctx, this.time);
        for (const b of this.bullets) b.draw(ctx);
        for (const p of this.players) p.draw(ctx, this.time, false);
      } else if (this.mode === "online" && this.netRole === "guest") {
        for (const o of this.ghostOrbs) o.draw(ctx);
        for (const b of this.ghostBullets) this._drawGhostBullet(ctx, b);
        for (const p of this.ghostPlayers) p.draw(ctx, this.time, true);
      } else {
        for (const o of this.orbs) o.draw(ctx);
        for (const b of this.bullets) b.draw(ctx);
        for (const p of this.players) p.draw(ctx, this.time, true);
      }
    }

    this.particles.draw(ctx);
    ctx.restore();

    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.4, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
  }

  _drawGrid(ctx) {
    const step = 54;
    const pulse = 0.04 + 0.02 * Math.sin(this.time * 1.5);
    ctx.strokeStyle = `rgba(90,120,220,${pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (this.time * 8) % step; x < WORLD_W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
    for (let y = 0; y < WORLD_H; y += step) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); }
    ctx.stroke();
  }

  _drawStars(ctx) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * s.sp + s.tw));
      ctx.fillStyle = `rgba(160,180,255,${tw * s.z * 0.6})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.z * 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  _drawGhostBullet(ctx, b) {
    const rgb = COLORS[b.colorIdx].rgb;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glow(ctx, b.x, b.y, 16, rgb, 0.6);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = rgbaArr(rgb, 0.95);
    ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

window.addEventListener("DOMContentLoaded", () => { window.game = new Game(); });
