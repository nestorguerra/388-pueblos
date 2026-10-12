// Conexión con el servidor propio de 388 Pueblos (server/servidor.py), cuando la web se sirve desde él.
// Dentro de un Artifact no existe window.P388 y las páginas usan las capacidades del Artifact.
export const SERVER = typeof window !== 'undefined' && window.P388 && window.P388.api ? window.P388.api : null;

export function deviceId() {
  let id = null;
  try { id = localStorage.getItem('388p:device'); } catch {}
  if (!id || !/^[A-Za-z0-9_-]{12,64}$/.test(id)) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    id = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('388p:device', id); } catch {}
  }
  return id;
}

export async function apiGet(path) {
  const r = await fetch(`${SERVER}${path}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`api ${r.status}`);
  return r.json();
}

export async function apiPost(path, body) {
  const r = await fetch(`${SERVER}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `api ${r.status}`), { status: r.status });
  return j;
}

// Sala de un pueblo por WebSocket con la misma forma que la sala del Artifact (presence / onPeers).
export function wsRoom(name) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${encodeURIComponent(name)}`;
  let ws = null, me = null, open = false, retry = 0, timer = null;
  let peers = new Map();
  const mine = {};
  const handlers = [], connHandlers = [];
  const snapshot = () => [
    { peer: me || 'yo', kind: 'viewer', isMe: true, sameTab: true, presence: { ...mine } },
    ...[...peers].map(([id, p]) => ({ peer: id, kind: 'viewer', isMe: false, sameTab: false, presence: p || {} })),
  ];
  const emit = () => { const s = snapshot(); handlers.forEach((h) => h({ peers: s })); };
  const flush = () => { if (open && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'p', ...mine })); };
  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => { open = true; retry = 0; connHandlers.forEach((h) => h(true)); flush(); };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'room') { me = m.me; peers = new Map((m.peers || []).map((p) => [p.id, p.p])); }
      else if (m.t === 'join') peers.set(m.id, {});
      else if (m.t === 'p') peers.set(m.id, m.p);
      else if (m.t === 'bye') peers.delete(m.id);
      emit();
    };
    ws.onclose = () => {
      const was = open;
      open = false;
      peers.clear();
      if (was) { connHandlers.forEach((h) => h(false)); emit(); }
      setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++));
    };
  };
  connect();
  return {
    presence(patch) {
      for (const k of Object.keys(patch)) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
      if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 50);
      return Promise.resolve();
    },
    onPeers(h) { handlers.push(h); setTimeout(emit, 0); return () => {}; },
    onConnection(h) { connHandlers.push(h); setTimeout(() => h(open), 0); return () => {}; },
    connected: () => open,
  };
}
