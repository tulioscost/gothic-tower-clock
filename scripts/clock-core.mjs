/** Regras de tempo isoladas do Foundry para testes e reutilização. */
export const HOUR_MS = 60 * 60 * 1000;
export const HALF_DAY_MS = 12 * HOUR_MS;
export const MAX_RATE = 3600;

export function projectTime(state, nowMs = Date.now()) {
  if (!state || !Number.isFinite(state.gameTimeMs)) return nowMs;
  if (!state.running) return state.gameTimeMs;
  return state.gameTimeMs + Math.max(0, nowMs - state.wallTimeMs) * state.rate;
}

/** Fuso fictício do mundo: todos os calendários são exibidos em UTC, sem DST. */
export function formatWorldDateTime(timestamp) {
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return {date: "—", time: "—", input: ""};
  const p = n => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const mo = p(d.getUTCMonth() + 1);
  const day = p(d.getUTCDate());
  const hour = p(d.getUTCHours());
  const min = p(d.getUTCMinutes());
  const sec = p(d.getUTCSeconds());
  return {
    date: `${day}/${mo}/${y}`,
    time: `${hour}:${min}:${sec}`,
    input: `${String(y).padStart(4,"0")}-${mo}-${day}T${hour}:${min}`,
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
    milliseconds: d.getUTCMilliseconds()
  };
}

export function parseWorldDateTime(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(text));
  if (!match) return null;
  const [, ys, mos, ds, hs, mins] = match;
  const y = Number(ys), mo = Number(mos), day = Number(ds), h = Number(hs), minute = Number(mins);
  if (y < 100 || mo < 1 || mo > 12 || day < 1 || day > 31 || h > 23 || minute > 59) return null;
  const timestamp = Date.UTC(y, mo - 1, day, h, minute);
  const d = new Date(timestamp);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) return null;
  return timestamp;
}

/** Índice da última meia-jornada ultrapassada. Não deve tocar ao abrir a cena. */
export function crossedHalfDayBoundary(previousMs, nextMs) {
  if (!Number.isFinite(previousMs) || !Number.isFinite(nextMs) || nextMs <= previousMs) return null;
  const before = Math.floor(previousMs / HALF_DAY_MS);
  const after = Math.floor(nextMs / HALF_DAY_MS);
  return after > before ? after : null;
}

export function seedLocalClock(date = new Date()) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds());
}

export function sanitizeRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0.01 || rate > MAX_RATE) return null;
  return rate;
}
