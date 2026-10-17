import {
  crossedHalfDayBoundary,
  formatWorldDateTime,
  parseWorldDateTime,
  projectTime,
  sanitizeRate,
  seedLocalClock
} from "./clock-core.mjs";

const MOD = "gothic-tower-clock";
const CHANNEL = `module.${MOD}`;
const BELL_SRC = `modules/${MOD}/assets/bell.mp3`;
const BELL_COOLDOWN_MS = 22500; // Arquivo fornecido: aproximadamente 22,15 s.
const TICK_MS = 250;
const SYNC_MS = 8000;

function activeLeader() {
  return game.users.filter(u => u.active && u.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

const numerals = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
function createDial() {
  const ns = numerals.map((text, i) => {
    const angle = i * Math.PI / 6 - Math.PI / 2;
    const x = 50 + 37 * Math.cos(angle), y = 51 + 36.5 * Math.sin(angle);
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle">${text}</text>`;
  }).join("");
  return `<svg class="gtc-dial" viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="gtc-face-gradient"><stop offset="0" stop-color="#272b2e"/><stop offset="1" stop-color="#111519"/></radialGradient></defs>
    <circle class="gtc-dial-edge" cx="50" cy="50" r="49"/>
    <circle fill="url(#gtc-face-gradient)" cx="50" cy="50" r="45"/>
    <circle fill="none" stroke="#a89368" stroke-width="1" cx="50" cy="50" r="43" opacity=".8"/>
    <g class="gtc-numerals">${ns}</g>
    <g class="gtc-hour-hand" transform="rotate(0 50 50)"><path d="M50 56 L46 48 L49.3 25 L50.7 25 L54 48 Z"/></g>
    <g class="gtc-minute-hand" transform="rotate(0 50 50)"><path d="M50 57 L48.5 48 L49.4 14 L50.6 14 L51.5 48 Z"/></g>
    <g class="gtc-second-hand" transform="rotate(0 50 50)"><path d="M49.55 62 L49.55 20 L50.45 20 L50.45 62 Z"/></g>
    <circle cx="50" cy="50" r="4.5" fill="#bda777" stroke="#342a23" stroke-width="1.5"/>
    <circle cx="50" cy="50" r="1.5" fill="#16191b"/>
  </svg>`;
}

class GothicTowerClock {
  constructor() {
    this.root = null;
    this.panel = null;
    this.state = null;
    this.sync = null;
    this.previousTime = null;
    this.previousRevision = null;
    this.lastSyncWall = 0;
    this.lastBellWall = 0;
    this.lastBellId = null;
    this.interval = null;
    this.sidebarObserver = null;
    this.drag = null;
    this.dateDirty = false;
    this.runningAction = false;
  }

  async init() {
    this.state = game.settings.get(MOD, "state");
    if (!this.state?.revision && game.user.isGM) {
      await this.initializeWorld();
    }
    this.state = game.settings.get(MOD, "state");
    game.socket.on(CHANNEL, packet => this.handleSocket(packet));
    this.createUI();
    this.bindPosition();
    this.interval = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
    Hooks.on("collapseSidebar", () => window.requestAnimationFrame(() => this.position()));
    Hooks.on("changeSidebarTab", () => window.requestAnimationFrame(() => this.position()));
    window.addEventListener("resize", () => this.position());
    window.addEventListener("beforeunload", () => {
      if (this.interval !== null) window.clearInterval(this.interval);
      this.sidebarObserver?.disconnect();
    }, {once: true});
  }

  async initializeWorld() {
    // Somente um GM inicializa quando dois ou mais GMs abrem o mundo ao mesmo tempo.
    if (activeLeader()?.id !== game.user.id) return;
    const now = Date.now();
    const state = {
      gameTimeMs: seedLocalClock(), wallTimeMs: now,
      running: true, rate: 1, bell: true, volume: 0.75,
      revision: now
    };
    try { await game.settings.set(MOD, "state", state); }
    catch (error) { console.error(`${MOD} | Não foi possível inicializar`, error); }
  }

  isLeader() { return Boolean(game.user.isGM && activeLeader()?.id === game.user.id); }

  now() {
    if (!this.state) return seedLocalClock();
    if (!this.isLeader() && this.sync?.revision === this.state.revision
        && (Date.now() - this.sync.receivedAt) < 30000) {
      return this.sync.gameTimeMs + (this.state.running
        ? Math.max(0, Date.now() - this.sync.receivedAt) * this.state.rate : 0);
    }
    return projectTime(this.state, Date.now());
  }

  createUI() {
    const root = document.createElement("aside");
    root.id = "gtc-root";
    root.className = "gtc-root";
    root.setAttribute("aria-label", "Relógio da Torre Gótica");
    const gm = game.user.isGM;
    root.innerHTML = `<div class="gtc-grip" title="Arraste para mover o relógio" aria-label="Arraste para mover">✥ <span>TORRE DO TEMPO</span> ✥</div>
      <div class="gtc-artbox">
        <img class="gtc-art" src="modules/${MOD}/assets/tower.png" alt="Relógio de torre gótica com sinos e contrapesos" draggable="false" />
        ${createDial()}
        <div class="gtc-tools">
          <button type="button" data-gtc="mute" title="Silenciar badaladas neste computador" aria-label="Alternar áudio"><i class="fas fa-volume-up"></i></button>
          ${gm ? `<button type="button" data-gtc="settings" title="Configurar relógio (GM)" aria-label="Configurar relógio"><i class="fas fa-cog"></i></button>` : ""}
          <button type="button" data-gtc="dock" title="Voltar ao lado do chat" aria-label="Reencaixar ao chat"><i class="fas fa-arrows-to-dot"></i></button>
        </div>
      </div>
      <div class="gtc-plaque" aria-live="off">
        <div class="gtc-date">—</div>
        <div class="gtc-readout"><span class="gtc-time">--:--:--</span><span class="gtc-paused" hidden> ❚❚</span></div>
      </div>
      ${gm ? this.buildSettings() : ""}`;
    document.body.appendChild(root);
    this.root = root;
    this.panel = root.querySelector(".gtc-settings");
    this.applySize();
    this.refreshMute();
    root.addEventListener("click", ev => this.onClick(ev));
    root.addEventListener("submit", ev => this.onSave(ev));
    const timeInput = root.querySelector('[name="gameDateTime"]');
    timeInput?.addEventListener("input", () => { this.dateDirty = true; });
    root.querySelector(".gtc-grip").addEventListener("pointerdown", ev => this.onDragStart(ev));
    this.position();
  }

  buildSettings() {
    return `<form class="gtc-settings" hidden aria-label="Configuração do relógio">
      <div class="gtc-panel-title">CONTROLE DO TEMPO <button type="button" data-gtc="close" aria-label="Fechar">×</button></div>
      <label>Data e hora do mundo <input type="datetime-local" name="gameDateTime" step="60" required /></label>
      <label>Velocidade (segundos do mundo por segundo real)
        <select name="ratePreset">
          <option value="0.1">0,1× · lento</option>
          <option value="1">1× · tempo real</option>
          <option value="5">5×</option>
          <option value="10">10×</option>
          <option value="30">30×</option>
          <option value="60">60× · 1 min/s</option>
          <option value="600">600× · 10 min/s</option>
          <option value="3600">3600× · 1 h/s</option>
          <option value="custom">Personalizada…</option>
        </select>
      </label>
      <label class="gtc-custom-rate" hidden>Multiplicador personalizado <input type="number" name="customRate" min="0.01" max="3600" step="any" value="1" /></label>
      <label class="gtc-check"><input type="checkbox" name="running" /> Relógio em funcionamento</label>
      <label class="gtc-check"><input type="checkbox" name="bell" /> Tocar às 12h e à meia-noite</label>
      <label>Volume das badaladas <input type="range" name="volume" min="0" max="1" step="0.05" value="0.75" /></label>
      <div class="gtc-actions">
        <button type="submit" class="gtc-primary">Salvar alterações</button>
        <button type="button" data-gtc="test">Testar sino</button>
      </div>
      <div class="gtc-adjust-title">ADIANTAR O RELÓGIO</div>
      <div class="gtc-actions gtc-shortcuts">
        <button type="button" data-gtc="advance" data-ms="60000">+1 min</button>
        <button type="button" data-gtc="advance" data-ms="3600000">+1 h</button>
        <button type="button" data-gtc="advance" data-ms="86400000">+1 dia</button>
      </div>
      <small>A data é fictícia e igual para todos. Somente o GM altera o tempo. Os sinos tocam para todos, exceto usuários que silenciaram.</small>
      </form>`;
  }

  onClick(event) {
    const btn = event.target.closest("[data-gtc]");
    if (!btn) return;
    switch (btn.dataset.gtc) {
      case "mute": {
        const mute = !game.settings.get(MOD, "muted");
        game.settings.set(MOD, "muted", mute);
        this.refreshMute();
        break;
      }
      case "settings": this.toggleSettings(); break;
      case "close": this.toggleSettings(false); break;
      case "dock": game.settings.set(MOD, "position", {}).then(() => this.position()); break;
      case "test": if (game.user.isGM) this.broadcastBell(`test-${Date.now()}`, true); break;
      case "advance": if (game.user.isGM) this.advance(Number(btn.dataset.ms)); break;
    }
  }

  refreshMute() {
    const b = this.root?.querySelector('[data-gtc="mute"]');
    if (!b) return;
    const muted = game.settings.get(MOD, "muted");
    b.innerHTML = `<i class="fas fa-volume-${muted ? "mute" : "up"}"></i>`;
    b.title = muted ? "Ativar badaladas neste computador" : "Silenciar badaladas neste computador";
    b.setAttribute("aria-pressed", String(muted));
  }

  toggleSettings(open) {
    if (!this.panel || !game.user.isGM) return;
    const shouldOpen = typeof open === "boolean" ? open : this.panel.hidden;
    this.panel.hidden = !shouldOpen;
    if (shouldOpen) {
      this.dateDirty = false;
      const form = this.panel;
      form.elements.gameDateTime.value = formatWorldDateTime(this.now()).input;
      const rate = this.state?.rate ?? 1;
      const select = form.elements.ratePreset;
      const present = [...select.options].some(option => option.value === String(rate));
      select.value = present ? String(rate) : "custom";
      form.elements.customRate.value = String(rate);
      form.querySelector(".gtc-custom-rate").hidden = select.value !== "custom";
      form.elements.running.checked = this.state?.running ?? true;
      form.elements.bell.checked = this.state?.bell ?? true;
      form.elements.volume.value = String(this.state?.volume ?? .75);
      this.positionPanel();
    }
  }

  async onSave(event) {
    if (!event.target.classList.contains("gtc-settings")) return;
    event.preventDefault();
    if (!game.user.isGM || this.runningAction) return;
    const form = event.target;
    const rateText = form.elements.ratePreset.value === "custom"
      ? form.elements.customRate.value : form.elements.ratePreset.value;
    const rate = sanitizeRate(rateText);
    const parsed = parseWorldDateTime(form.elements.gameDateTime.value);
    if (rate === null || parsed === null) {
      ui.notifications.warn("Informe uma data válida e velocidade entre 0,01× e 3600×.");
      return;
    }
    const current = this.now();
    const proposed = this.dateDirty ? parsed : current;
    const next = {
      ...this.state, gameTimeMs: proposed, rate,
      running: form.elements.running.checked,
      bell: form.elements.bell.checked,
      volume: Number(form.elements.volume.value)
    };
    if (await this.saveState(next)) {
      this.toggleSettings(false);
      // Um ajuste explícito exatamente para 00:00 ou 12:00 pode acionar o sino.
      if (next.bell && this.dateDirty && proposed !== current) {
        const clockAtTime = formatWorldDateTime(proposed);
        if ([0, 12].includes(clockAtTime.hours) && clockAtTime.minutes === 0) {
          this.broadcastBell(`test-${Date.now()}`, true);
        }
      }
    }
  }

  async advance(milliseconds) {
    if (!Number.isFinite(milliseconds) || !game.user.isGM) return;
    const before = this.now();
    const advanced = before + milliseconds;
    const crossed = crossedHalfDayBoundary(before, advanced);
    if (await this.saveState({...this.state, gameTimeMs: advanced})) {
      if (crossed !== null && this.state.bell) this.broadcastBell(`boundary-${crossed}`, true);
      if (this.panel && !this.panel.hidden) {
        this.panel.elements.gameDateTime.value = formatWorldDateTime(advanced).input;
        this.dateDirty = false;
      }
    }
  }

  async saveState(patch) {
    if (this.runningAction) return false;
    this.runningAction = true;
    try {
      const now = Date.now();
      const next = {
        ...patch,
        wallTimeMs: now,
        revision: Math.max(now, (this.state?.revision ?? 0) + 1)
      };
      await game.settings.set(MOD, "state", next);
      this.state = next;
      this.sync = null;
      this.previousTime = null;
      this.previousRevision = next.revision;
      return true;
    } catch (error) {
      ui.notifications.error("Não foi possível salvar o relógio. Verifique as permissões do GM.");
      console.error(`${MOD} | Erro ao salvar estado`, error);
      return false;
    } finally {
      this.runningAction = false;
    }
  }

  tick() {
    if (!this.root) return;
    const nowMs = this.now();
    const clock = formatWorldDateTime(nowMs);
    if (clock.time === "—") return;
    const hourDegrees = ((clock.hours % 12) + clock.minutes / 60 + clock.seconds / 3600) * 30;
    const minuteDegrees = (clock.minutes + clock.seconds / 60 + clock.milliseconds / 60000) * 6;
    const secondDegrees = (clock.seconds + clock.milliseconds / 1000) * 6;
    this.root.querySelector(".gtc-hour-hand")?.setAttribute("transform", `rotate(${hourDegrees} 50 50)`);
    this.root.querySelector(".gtc-minute-hand")?.setAttribute("transform", `rotate(${minuteDegrees} 50 50)`);
    this.root.querySelector(".gtc-second-hand")?.setAttribute("transform", `rotate(${secondDegrees} 50 50)`);
    const dateNode = this.root.querySelector(".gtc-date");
    const timeNode = this.root.querySelector(".gtc-time");
    if (dateNode.textContent !== clock.date) dateNode.textContent = clock.date;
    if (timeNode.textContent !== clock.time) timeNode.textContent = clock.time;
    this.root.querySelector(".gtc-paused").hidden = Boolean(this.state?.running);

    // Apenas o GM líder calcula os instantes de badalada.
    if (this.isLeader() && this.state) {
      if (this.previousRevision === this.state.revision && this.state.running && this.state.bell) {
        const crossed = crossedHalfDayBoundary(this.previousTime, nowMs);
        if (crossed !== null) this.broadcastBell(`boundary-${crossed}`);
      }
      this.previousTime = nowMs;
      this.previousRevision = this.state.revision;
      if (Date.now() - this.lastSyncWall > SYNC_MS) {
        this.lastSyncWall = Date.now();
        game.socket.emit(CHANNEL, {
          type: "sync", senderId: game.user.id,
          revision: this.state.revision, gameTimeMs: nowMs
        });
      }
    } else {
      this.previousTime = null;
      this.previousRevision = this.state?.revision ?? null;
    }
  }

  broadcastBell(id, manual = false) {
    if (!game.user.isGM) return;
    if (!manual && !this.isLeader()) return;
    const packet = {type: "bell", id, manual, senderId: game.user.id, revision: this.state?.revision};
    game.socket.emit(CHANNEL, packet);
    this.playBell(packet);
  }

  handleSocket(packet) {
    if (!packet || !["sync", "bell"].includes(packet.type)) return;
    const sender = game.users.get(packet.senderId);
    if (!sender?.active || !sender?.isGM) return;
    if ((packet.type === "sync" || !packet.manual) && packet.senderId !== activeLeader()?.id) return;
    if (packet.type === "sync") {
      if (!this.state || packet.revision !== this.state.revision) return;
      if (!Number.isFinite(packet.gameTimeMs)) return;
      this.sync = {gameTimeMs: packet.gameTimeMs, receivedAt: Date.now(), revision: packet.revision};
    } else if (packet.type === "bell") {
      if (typeof packet.id !== "string" || (!packet.id.startsWith("boundary-") && !packet.id.startsWith("test-"))) return;
      this.playBell(packet);
    }
  }

  playBell(packet) {
    if (!packet?.id || packet.id === this.lastBellId) return;
    const now = Date.now();
    // A gravação tem 22 segundos; nunca reproduz duas cópias simultaneamente.
    if (now - this.lastBellWall < BELL_COOLDOWN_MS) return;
    this.lastBellId = packet.id;
    this.lastBellWall = now;
    this.root?.classList.add("gtc-ringing");
    window.setTimeout(() => this.root?.classList.remove("gtc-ringing"), 4000);
    if (game.settings.get(MOD, "muted")) return;
    const volume = Math.min(1, Math.max(0, Number(this.state?.volume ?? .75)));
    try {
      foundry.audio.AudioHelper.play({src: BELL_SRC, autoplay: true, loop: false,
        volume, channel: "interface"}, false);
    } catch (error) {
      console.warn(`${MOD} | Reprodução de áudio bloqueada:`, error);
    }
  }

  applySize() {
    if (!this.root) return;
    const n = Number(game.settings.get(MOD, "size"));
    this.root.style.setProperty("--gtc-width", `${Math.min(300, Math.max(160, n))}px`);
  }

  sidebarEl() { return document.querySelector("#sidebar") ?? document.querySelector("aside.sidebar"); }

  position() {
    if (!this.root) return;
    this.applySize();
    const size = this.root.getBoundingClientRect().width || 220;
    const saved = game.settings.get(MOD, "position") ?? {};
    const sidebar = this.sidebarEl();
    let left, top;
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      left = saved.x; top = saved.y;
    } else if (sidebar) {
      const r = sidebar.getBoundingClientRect();
      left = r.left - size - 12;
      top = Math.max(5, r.top + 6);
    } else {
      left = window.innerWidth - size - 330;
      top = 12;
    }
    this.root.style.left = `${Math.max(4, Math.min(left, window.innerWidth - size - 4))}px`;
    this.root.style.top = `${Math.max(4, Math.min(top, window.innerHeight - 72))}px`;
    if (this.panel && !this.panel.hidden) this.positionPanel();
  }

  positionPanel() {
    if (!this.panel || this.panel.hidden) return;
    const rootBox = this.root.getBoundingClientRect();
    const panelWidth = 298;
    const left = rootBox.left >= panelWidth + 14
      ? rootBox.left - panelWidth - 10
      : Math.min(window.innerWidth - panelWidth - 8, rootBox.right + 8);
    this.panel.style.left = `${Math.max(6, left)}px`;
    this.panel.style.top = `${Math.max(6, Math.min(rootBox.top, window.innerHeight - 380))}px`;
  }

  bindPosition() {
    const sidebar = this.sidebarEl();
    if (sidebar && typeof ResizeObserver !== "undefined") {
      this.sidebarObserver = new ResizeObserver(() => {
        const saved = game.settings.get(MOD, "position") ?? {};
        if (!Number.isFinite(saved.x)) this.position();
      });
      this.sidebarObserver.observe(sidebar);
    }
  }

  onDragStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const r = this.root.getBoundingClientRect();
    this.drag = {startX: e.clientX, startY: e.clientY, x: r.left, y: r.top};
    const move = ev => {
      if (!this.drag) return;
      this.root.style.left = `${Math.max(4, Math.min(this.drag.x + ev.clientX - this.drag.startX, window.innerWidth - r.width - 4))}px`;
      this.root.style.top = `${Math.max(4, Math.min(this.drag.y + ev.clientY - this.drag.startY, window.innerHeight - 72))}px`;
      this.positionPanel();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (this.drag) {
        game.settings.set(MOD, "position", {
          x: parseFloat(this.root.style.left), y: parseFloat(this.root.style.top)
        });
      }
      this.drag = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, {once: true});
  }
}

let clock;
Hooks.once("init", () => {
  game.settings.register(MOD, "state", {
    name: "Estado do relógio gótico", scope: "world", config: false,
    type: Object, default: {},
    onChange: value => {
      if (!clock) return;
      clock.state = value;
      clock.sync = null;
      clock.previousTime = null;
      clock.previousRevision = value?.revision ?? null;
    }
  });
  game.settings.register(MOD, "muted", {
    name: "Silenciar sino neste computador", hint: "Preferência individual do jogador.",
    scope: "client", config: true, type: Boolean, default: false,
    onChange: () => clock?.refreshMute()
  });
  game.settings.register(MOD, "size", {
    name: "Largura do relógio (pixels)", scope: "client", config: true,
    type: Number, default: 220,
    onChange: () => clock?.position()
  });
  game.settings.register(MOD, "position", {
    name: "Posição da torre", scope: "client", config: false,
    type: Object, default: {}
  });
});

Hooks.once("ready", async () => {
  clock = new GothicTowerClock();
  await clock.init();
  // A seleção de velocidade do formulário fica visível apenas quando personalizada.
  clock.root?.querySelector('[name="ratePreset"]')?.addEventListener("change", event => {
    clock.panel.querySelector(".gtc-custom-rate").hidden = event.target.value !== "custom";
  });
  game.modules.get(MOD).api = {
    getTime: () => clock.now(),
    getState: () => ({...clock.state}),
    setTime: async timestamp => {
      if (!game.user.isGM) throw new Error("Somente o GM pode alterar o tempo.");
      if (!Number.isFinite(timestamp)) throw new Error("Data inválida.");
      return clock.saveState({...clock.state, gameTimeMs: timestamp});
    }
  };
});
