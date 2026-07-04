// ============================================================
//  CHROMA RIFT — net.js
//  Thin WebSocket client. Connects to the relay server, joins
//  a room, and exchanges messages with the one peer in it.
// ============================================================
"use strict";

class Net {
  constructor() {
    this.ws = null;
    this.role = null;     // 'host' | 'guest'
    this.room = null;
    this.connected = false;
    this.cb = {};
  }

  on(type, fn) { this.cb[type] = fn; return this; }
  _emit(type, data) { if (this.cb[type]) this.cb[type](data); }

  // best-guess ws URL when the page is served by our own server
  static defaultUrl() {
    const loc = window.location;
    if (loc.protocol === "http:" || loc.protocol === "https:") {
      const proto = loc.protocol === "https:" ? "wss:" : "ws:";
      return proto + "//" + loc.host;
    }
    // opened from disk (file://) — assume a local server
    return "ws://localhost:3000";
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try { this.ws = new WebSocket(url); }
      catch (e) { reject(e); return; }

      let settled = false;
      this.ws.onopen = () => { this.connected = true; settled = true; resolve(); };
      this.ws.onerror = (e) => { this._emit("error", e); if (!settled) reject(new Error("connect failed")); };
      this.ws.onclose = () => { this.connected = false; this._emit("close"); };
      this.ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        this._handle(m);
      };
    });
  }

  _handle(m) {
    switch (m.type) {
      case "role": this.role = m.role; this.room = m.room; this._emit("role", m); break;
      case "ready": this._emit("ready", m); break;
      case "peerleft": this._emit("peerleft", m); break;
      case "full": this._emit("full", m); break;
      default: this._emit("message", m);
    }
  }

  join(room) { this.send({ type: "join", room }); }
  send(obj) { if (this.ws && this.connected) this.ws.send(JSON.stringify(obj)); }
  close() { if (this.ws) { try { this.ws.close(); } catch (e) {} } this.connected = false; }
}
