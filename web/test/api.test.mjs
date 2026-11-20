// Prueba de extremo a extremo de la API contra un servidor en marcha.
//   BASE=http://localhost:3000 ADMIN=admin@prueba.test node test/api.test.mjs
// Recorre lo mismo que harán la web y el programa: registro, sesión, descarga, sincronización, panel y borrado.

import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ADMIN = process.env.ADMIN ?? "admin@prueba.test";
const stamp = Date.now();
let passed = 0;

async function call(method, path, { body, cookie, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, cookie: response.headers.getSetCookie?.().map((c) => c.split(";")[0]).join("; ") ?? "" };
}

async function step(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/// Sesión del administrador, abierta una sola vez: el servidor limita los intentos de inicio de sesión.
let adminSession;
const asAdmin = async () => (adminSession ??= await call("POST", "/api/auth/login", { body: { email: ADMIN, password: "clave-de-admin-0" } }));

const email = `jugador${stamp}@prueba.test`;
let cookie, appToken;

await step("el servidor responde y llega a la base de datos", async () => {
  assert.equal((await call("GET", "/api/health")).status, 200);
});

await step("sin sesión no hay usuario ni descarga", async () => {
  assert.equal((await call("GET", "/api/me")).data.user, null);
  assert.equal((await call("POST", "/api/download")).status, 401);
  assert.equal((await call("GET", "/api/admin/users")).status, 401);
});

await step("el registro valida nombre, correo y contraseña", async () => {
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "Ana", email: "no-es-correo", password: "12345678" } })).status, 400);
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "Ana", email, password: "corta" } })).status, 400);
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "", email, password: "12345678" } })).status, 400);
});

await step("registro en la web: crea la cuenta y abre sesión con cookie", async () => {
  const r = await call("POST", "/api/auth/register", { body: { name: "Ana Prueba", email: email.toUpperCase(), password: "clave-segura-1", consentLibrary: false } });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.email, email, "el correo se guarda en minúsculas");
  assert.equal(r.data.token, undefined, "a la web no se le entrega el token en la respuesta");
  assert.match(r.cookie, /rl_session=/);
  cookie = r.cookie;
  assert.equal((await call("GET", "/api/me", { cookie })).data.user.name, "Ana Prueba");
});

await step("no se puede registrar dos veces el mismo correo", async () => {
  assert.equal((await call("POST", "/api/auth/register", { body: { name: "Otra", email, password: "clave-segura-2" } })).status, 409);
});

await step("contraseña equivocada o correo inexistente dan el mismo error", async () => {
  const wrong = await call("POST", "/api/auth/login", { body: { email, password: "no-es-la-clave" } });
  const missing = await call("POST", "/api/auth/login", { body: { email: `nadie${stamp}@prueba.test`, password: "no-es-la-clave" } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.data, missing.data);
});

await step("el programa inicia sesión y recibe un token", async () => {
  const r = await call("POST", "/api/auth/login", { body: { email, password: "clave-segura-1", client: "app", device: "PC-DE-PRUEBA" } });
  assert.equal(r.status, 200);
  assert.equal(typeof r.data.token, "string");
  assert.equal(r.cookie, "");
  appToken = r.data.token;
  assert.equal((await call("GET", "/api/me", { token: appToken })).data.user.email, email);
  assert.equal((await call("GET", "/api/me", { token: "token-inventado" })).data.user, null);
});

const games = [
  { id: "steam:1", store: "steam", title: "Halcyon Drift", minutes: 7462, lastPlayed: 1795000000, achUnlocked: 8, achTotal: 25 },
  { id: "epic:a", store: "epic", title: "Nocturne Protocol", minutes: 845, lastPlayed: null, achUnlocked: null, achTotal: null },
  { id: "steam:1", store: "steam", title: "Repetido", minutes: 1 },
  { id: "", title: "Sin identificador" },
];

await step("sin permiso, la sincronización apunta el uso pero no guarda la biblioteca", async () => {
  const r = await call("POST", "/api/app/sync", { token: appToken, body: { appVersion: "0.3.0", games } });
  assert.equal(r.status, 200);
  assert.equal(r.data.gamesSaved, 0);
});

await step("con permiso, guarda la biblioteca sin repetidos ni entradas rotas", async () => {
  assert.equal((await call("PATCH", "/api/me", { cookie, body: { consentLibrary: true } })).data.user.consentLibrary, true);
  assert.equal((await call("POST", "/api/app/sync", { token: appToken, body: { appVersion: "0.3.0", games } })).data.gamesSaved, 2);
  // Una segunda sincronización sustituye la anterior, no la duplica.
  assert.equal((await call("POST", "/api/app/sync", { token: appToken, body: { appVersion: "0.3.1", games: games.slice(0, 1) } })).data.gamesSaved, 1);
});

await step("la descarga entrega el instalador publicado y queda anotada", async () => {
  const release = await call("GET", "/api/release");
  assert.equal(release.status, 200);
  const r = await call("POST", "/api/download", { cookie });
  if (release.data.release) {
    assert.equal(r.status, 200);
    assert.match(r.data.url, /^https:\/\/github\.com\/.+\.exe$/);
  } else {
    assert.equal(r.status, 503, "sin acceso a GitHub la descarga avisa en vez de romperse");
  }
});

await step("el panel de usuarios es solo para administradores", async () => {
  assert.equal((await call("GET", "/api/admin/users", { cookie })).status, 403);
  const admin = await call("POST", "/api/auth/register", { body: { name: "Admin Prueba", email: ADMIN.replace("@", `+${stamp}@`), password: "clave-de-admin-1" } });
  assert.equal(admin.status, 200);
  assert.equal((await call("GET", "/api/admin/users", { cookie: admin.cookie })).status, admin.data.user.admin ? 200 : 403);
});

await step("un administrador ve usuarios, totales, biblioteca y CSV", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: ADMIN, password: "clave-de-admin-0" } });
  const adminCookie = login.status === 200 ? login.cookie : (await call("POST", "/api/auth/register", { body: { name: "Dueño", email: ADMIN, password: "clave-de-admin-0" } })).cookie;
  const list = await call("GET", "/api/admin/users", { cookie: adminCookie });
  assert.equal(list.status, 200);
  const ana = list.data.users.find((u) => u.email === email);
  assert.ok(ana, "la usuaria de prueba aparece en el panel");
  assert.equal(ana.games, 1);
  assert.equal(ana.minutes, 7462);
  assert.equal(ana.appVersion, "0.3.1");
  assert.ok(ana.lastSeenAt > 0);
  const stats = await call("GET", "/api/admin/stats", { cookie: adminCookie });
  assert.equal(stats.status, 200);
  assert.ok(stats.data.totals.users >= 2 && stats.data.totals.installed >= 1 && stats.data.totals.sharing >= 1);
  assert.ok(stats.data.versions.some((v) => v.version === "0.3.1"));
  const top = stats.data.games.find((g) => g.title === "Halcyon Drift");
  assert.ok(top && top.players >= 1 && top.minutes >= 7462, "el juego compartido sale entre los más jugados");
  assert.equal((await call("GET", "/api/admin/stats", { cookie })).status, 403);
  const library = await call("GET", `/api/admin/users/${ana.id}/games`, { cookie: adminCookie });
  assert.equal(library.data.games[0].title, "Halcyon Drift");
  const csv = await call("GET", "/api/admin/users.csv", { cookie: adminCookie });
  assert.equal(csv.status, 200);
  assert.ok(String(csv.data).includes(email));
});

await step("la medición cuenta visitas y clics conocidos, y descarta lo demás", async () => {
  const admin = await call("POST", "/api/auth/login", { body: { email: ADMIN, password: "clave-de-admin-0" } });
  const before = (await call("GET", "/api/admin/funnel?days=7", { cookie: admin.cookie })).data;
  const origen = `prueba${stamp}.test`;
  for (let i = 0; i < 3; i++) assert.equal((await call("POST", "/api/track", { body: { kind: "view", label: "/planes", source: origen } })).status, 204);
  assert.equal((await call("POST", "/api/track", { body: { kind: "click", label: "descargar-portada", source: origen } })).status, 204);
  assert.equal((await call("POST", "/api/track", { body: { kind: "view", label: "/inventada", source: origen } })).status, 204);
  assert.equal((await call("POST", "/api/track", { body: { kind: "click", label: "<script>", source: "x" } })).status, 204);
  const after = (await call("GET", "/api/admin/funnel?days=7", { cookie: admin.cookie })).data;
  assert.equal(after.steps[0].total, before.steps[0].total + 3);
  assert.equal(after.steps[1].total, before.steps[1].total + 1);
  assert.equal(after.sources.find((s) => s.label === origen).total, 3);
  assert.ok(!after.pages.some((p) => p.label === "/inventada"));
  assert.ok(after.steps[2].total >= 1, "las cuentas creadas en el periodo entran en el embudo");
  assert.equal((await call("GET", "/api/admin/funnel", { cookie })).status, 403);
});

await step("el formulario de soporte y el de cotización llegan al panel", async () => {
  const admin = await call("POST", "/api/auth/login", { body: { email: ADMIN, password: "clave-de-admin-0" } });
  assert.equal((await call("POST", "/api/contact", { body: { kind: "error", name: "Ana", email, message: "x" } })).status, 400);
  assert.equal((await call("POST", "/api/contact", { body: { kind: "otra", name: "Ana", email, message: "Un mensaje largo de prueba" } })).status, 400);
  assert.equal((await call("POST", "/api/contact", { body: { kind: "empresa", name: "Ana", email, message: "Quiero licencias para mi local" } })).status, 400);
  assert.equal((await call("POST", "/api/contact", { body: { kind: "error", name: "Ana", email, message: `No abre el juego ${stamp}` } })).status, 200);
  assert.equal((await call("POST", "/api/contact", { body: { kind: "empresa", name: "Ana", email, business: "Arena Prueba", seats: 24, message: `Cotización para el local ${stamp}` } })).status, 200);
  // El campo trampa relleno se acepta en apariencia, pero no se guarda.
  assert.equal((await call("POST", "/api/contact", { body: { kind: "ayuda", name: "Robot", email, message: `Publicidad ${stamp} no deseada`, website: "http://spam.test" } })).status, 200);
  const { messages } = (await call("GET", "/api/admin/messages", { cookie: admin.cookie })).data;
  const mine = messages.filter((m) => m.body.includes(String(stamp)));
  assert.equal(mine.length, 2);
  const quote = mine.find((m) => m.kind === "empresa");
  assert.equal(quote.business, "Arena Prueba");
  assert.equal(quote.seats, 24);
  assert.equal((await call("GET", "/api/admin/messages", { cookie })).status, 403);
  for (const m of mine) assert.equal((await call("DELETE", `/api/admin/messages/${m.id}`, { cookie: admin.cookie })).status, 200);
  const left = (await call("GET", "/api/admin/messages", { cookie: admin.cookie })).data.messages;
  assert.ok(!left.some((m) => m.body.includes(String(stamp))));
});

await step("la versión publicada trae su historial y la configuración pública", async () => {
  const { data } = await call("GET", "/api/release");
  assert.ok(Array.isArray(data.history));
  if (data.release) {
    assert.match(data.release.version, /^\d+\.\d+\.\d+$/);
    assert.equal(data.history[0].version, data.release.version);
    assert.ok(data.release.sha256 === null || /^[0-9a-f]{64}$/.test(data.release.sha256));
    assert.equal(data.release.url, undefined, "la dirección del instalador solo se entrega al descargar con sesión");
  }
  const config = (await call("GET", "/api/config")).data;
  assert.ok("contactEmail" in config && "communityUrl" in config);
});

await step("amigos: solicitud por código o correo, aceptar, presencia, chat e invitación", async () => {
  const app = (email) => call("POST", "/api/auth/register", { body: { name: email.startsWith("bea") ? "Bea" : "Carlos", email, password: "clave-segura-1", client: "app" } });
  const bea = await app(`bea${stamp}@prueba.test`);
  const carlos = await app(`carlos${stamp}@prueba.test`);
  const pulse = (token, body = {}) => call("POST", "/api/social/pulse", { token, body });

  const first = (await pulse(appToken, { playing: "Halcyon Drift" })).data;
  assert.match(first.me.code, /^RL-[0-9A-Z]+$/);
  assert.deepEqual(first.messages, [], "la primera vez no llegan mensajes antiguos");

  // Bea me añade por mi código; Carlos, por mi correo. Un destino inexistente responde igual.
  assert.equal((await call("POST", "/api/social/friends", { token: bea.data.token, body: { target: first.me.code.toLowerCase() } })).data.state, "sent");
  assert.equal((await call("POST", "/api/social/friends", { token: carlos.data.token, body: { target: email.toUpperCase() } })).data.state, "sent");
  assert.equal((await call("POST", "/api/social/friends", { token: bea.data.token, body: { target: "nadie@prueba.test" } })).data.state, "sent");
  const pending = (await pulse(appToken)).data;
  assert.deepEqual(pending.requests.map((r) => r.name).sort(), ["Bea", "Carlos"]);
  assert.equal(pending.friends.length, 0);

  const beaId = pending.requests.find((r) => r.name === "Bea").id;
  const carlosId = pending.requests.find((r) => r.name === "Carlos").id;
  // Sin ser amigos todavía no se pueden escribir.
  assert.equal((await call("POST", "/api/social/messages", { token: appToken, body: { to: beaId, body: "hola" } })).status, 403);
  assert.equal((await call("POST", `/api/social/friends/${beaId}/accept`, { token: appToken })).status, 200);
  assert.equal((await call("DELETE", `/api/social/friends/${carlosId}`, { token: appToken })).status, 200);
  assert.equal((await call("POST", `/api/social/friends/${carlosId}/accept`, { token: appToken })).status, 404);

  // Bea ve que estoy conectado y a qué juego.
  await pulse(appToken, { playing: "Halcyon Drift" });
  const beaView = (await pulse(bea.data.token)).data;
  assert.deepEqual(beaView.friends.map((f) => [f.online, f.playing]), [[true, "Halcyon Drift"]]);
  assert.equal(beaView.requests.length, 0);
  const mark = beaView.last;

  const sent = await call("POST", "/api/social/messages", { token: appToken, body: { to: beaId, body: "¿Una partida?" } });
  assert.equal(sent.status, 200);
  assert.equal((await call("POST", "/api/social/messages", { token: appToken, body: { to: beaId, kind: "invite", game: "Halcyon Drift" } })).status, 200);
  assert.equal((await call("POST", "/api/social/messages", { token: appToken, body: { to: beaId, body: "   " } })).status, 400);
  assert.equal((await call("POST", "/api/social/messages", { token: carlos.data.token, body: { to: beaId, body: "hola" } })).status, 403);

  // A Bea le llegan en su siguiente latido, en orden, y ya no se repiten.
  const arrived = (await pulse(bea.data.token, { after: mark })).data;
  const mine = arrived.messages.filter((m) => m.toId === beaView.me.id);
  assert.deepEqual(mine.map((m) => [m.kind, m.body]), [["text", "¿Una partida?"], ["invite", "Te invita a jugar a Halcyon Drift"]]);
  assert.equal(mine[1].game, "Halcyon Drift");
  assert.equal((await pulse(bea.data.token, { after: arrived.last })).data.messages.length, 0);
  const history = (await call("GET", `/api/social/messages/${first.me.id}`, { token: bea.data.token })).data.messages;
  assert.equal(history.length, 2);
  assert.equal((await call("GET", `/api/social/messages/${first.me.id}`, { token: carlos.data.token })).data.messages.length, 0, "nadie más lee esa conversación");

  // Dejar de ser amigos corta el chat. Y sin sesión no hay nada.
  assert.equal((await call("DELETE", `/api/social/friends/${first.me.id}`, { token: bea.data.token })).status, 200);
  assert.equal((await pulse(appToken)).data.friends.length, 0);
  assert.equal((await call("POST", "/api/social/pulse", { body: {} })).status, 401);
  for (const other of [bea, carlos]) await call("DELETE", "/api/me", { token: other.data.token });
});

await step("avatares: el admin los sube, cualquiera los ve y cada usuario elige el suyo", async () => {
  const admin = await call("POST", "/api/auth/login", { body: { email: ADMIN, password: "clave-de-admin-0" } });
  // Un PNG válido de 1×1, repetido para que pase del tamaño mínimo.
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const image = "data:image/png;base64," + Buffer.concat([Buffer.from(pixel, "base64"), Buffer.alloc(120)]).toString("base64");
  assert.equal((await call("POST", "/api/admin/avatars", { cookie, body: { name: "Intruso", image } })).status, 403);
  assert.equal((await call("POST", "/api/admin/avatars", { cookie: admin.cookie, body: { name: "Roto", image: "data:text/html;base64,PGI+" } })).status, 400);
  const added = await call("POST", "/api/admin/avatars", { cookie: admin.cookie, body: { name: `Calavera ${stamp}`, image } });
  assert.equal(added.status, 200);
  const id = added.data.avatar.id;
  const list = (await call("GET", "/api/avatars")).data.avatars;
  assert.equal(list[0].id, id, "el más nuevo va primero");
  const file = await fetch(BASE + `/api/avatars/${id}/image`);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.equal(file.headers.get("access-control-allow-origin"), "*", "el programa tiene que poder descargarla");
  assert.ok((await file.arrayBuffer()).byteLength > 100);

  assert.equal((await call("POST", "/api/social/avatar", { token: appToken, body: { avatarId: 99999999 } })).status, 404);
  assert.equal((await call("POST", "/api/social/avatar", { token: appToken, body: { avatarId: id } })).status, 200);
  assert.equal((await call("POST", "/api/social/pulse", { token: appToken, body: {} })).data.me.avatarId, id);
  // Al borrarlo de la galería, quien lo llevaba se queda sin él.
  assert.equal((await call("DELETE", `/api/admin/avatars/${id}`, { cookie: admin.cookie })).status, 200);
  assert.equal((await call("POST", "/api/social/pulse", { token: appToken, body: {} })).data.me.avatarId, null);
  assert.equal((await fetch(BASE + `/api/avatars/${id}/image`)).status, 404);
});

await step("el programa puede llamar a la API desde su ventana; una web ajena, no", async () => {
  const preflight = await fetch(BASE + "/api/social/pulse", { method: "OPTIONS", headers: { Origin: "http://tauri.localhost", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://tauri.localhost");
  assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/);
  const stranger = await fetch(BASE + "/api/me", { headers: { Origin: "https://otra-web.test" } });
  assert.equal(stranger.headers.get("access-control-allow-origin"), null);
});

await step("wallet y tienda: lo de la tienda es gratis, se consigue una vez y el saldo no cambia", async () => {
  const store = await call("GET", "/api/store");
  assert.equal(store.status, 200);
  const item = store.data.items.find((i) => i.id === "theme:hielo");
  assert.equal(item.price, 0, "todo lo de la tienda es gratis");
  assert.equal((await call("GET", "/api/wallet")).status, 401);
  const empty = (await call("GET", "/api/wallet", { token: appToken })).data;
  assert.deepEqual([empty.balance, empty.owned, empty.moves], [0, [], []]);

  // Gratis: se consigue sin saldo, queda en la cuenta y no mueve el wallet ni deja apunte.
  assert.equal((await call("POST", "/api/store/buy", { token: appToken, body: { item: item.id } })).status, 200);
  assert.equal((await call("POST", "/api/store/buy", { token: appToken, body: { item: "theme:no-existe" } })).status, 404);
  const mine = (await call("GET", "/api/wallet", { token: appToken })).data;
  assert.deepEqual([mine.balance, mine.owned, mine.moves], [0, [item.id], []], "gratis: sin coste ni historial");
  // Conseguirlo otra vez: ya es tuyo.
  assert.equal((await call("POST", "/api/store/buy", { token: appToken, body: { item: item.id } })).status, 409);

  // El wallet de RLC sigue vivo: el equipo reparte (misiones, regalos) y nunca deja el saldo en negativo.
  const admin = await call("POST", "/api/auth/login", { body: { email: ADMIN, password: "clave-de-admin-0" } });
  assert.equal((await call("POST", "/api/admin/wallet", { cookie, body: { email, amount: 5000 } })).status, 403, "solo el equipo reparte RLC");
  assert.equal((await call("POST", "/api/admin/wallet", { cookie: admin.cookie, body: { email: "nadie@prueba.test", amount: 10 } })).status, 404);
  assert.equal((await call("POST", "/api/admin/wallet", { cookie: admin.cookie, body: { email, amount: 0 } })).status, 400);
  const gift = await call("POST", "/api/admin/wallet", { cookie: admin.cookie, body: { email, amount: 250, note: "Bienvenida" } });
  assert.equal(gift.data.balance, 250);
  assert.equal((await call("POST", "/api/admin/wallet", { cookie: admin.cookie, body: { email, amount: -99999 } })).status, 400, "no se puede dejar en negativo");
  const after = (await call("GET", "/api/wallet", { cookie })).data;
  assert.deepEqual([after.balance, after.owned], [250, [item.id]], "la web y el programa ven lo mismo");
  assert.deepEqual(after.moves.map((m) => [m.kind, m.amount]), [["regalo", 250]]);
});

await step("mi PC desde el teléfono: el programa publica sus juegos, la web manda abrir y cerrar, y el PC lo recoge", async () => {
  assert.equal((await call("GET", "/api/remote")).status, 401);
  assert.equal((await call("GET", "/api/remote", { cookie })).data.pc, null);
  assert.equal((await call("POST", "/api/remote/command", { cookie, body: { action: "play", game: "steam:620" } })).status, 409, "sin PC conectado no hay órdenes");

  const library = [{ id: "steam:620", title: "Portal 2", store: "steam", cover: "https://cdn.prueba.test/620.jpg" }, { id: "local:tetra", title: "Tetra", store: "local", cover: "file:///c:/x.png" }];
  assert.equal((await call("POST", "/api/remote/library", { token: appToken, body: { device: "PC de Ana", games: library, enabled: true } })).data.games, 2);
  assert.deepEqual((await call("POST", "/api/remote/poll", { token: appToken, body: { running: null } })).data.commands, []);
  const seen = (await call("GET", "/api/remote", { cookie })).data;
  assert.deepEqual([seen.pc.device, seen.pc.online, seen.pc.running, seen.pc.games.length], ["PC de Ana", true, null, 2]);
  assert.equal(seen.pc.games[1].cover, null, "solo se publican carátulas de internet");

  assert.equal((await call("POST", "/api/remote/command", { cookie, body: { action: "borrar", game: "steam:620" } })).status, 400);
  assert.equal((await call("POST", "/api/remote/command", { cookie, body: { action: "play", game: "steam:999" } })).status, 404, "solo juegos que el PC publicó");
  const sent = await call("POST", "/api/remote/command", { cookie, body: { action: "play", game: "steam:620" } });
  assert.equal(sent.status, 200);
  assert.equal((await call("GET", "/api/remote", { cookie })).data.last.state, "pending");
  const picked = (await call("POST", "/api/remote/poll", { token: appToken, body: { running: null } })).data.commands;
  assert.deepEqual(picked, [{ id: sent.data.id, action: "play", game: "steam:620" }]);
  assert.deepEqual((await call("POST", "/api/remote/poll", { token: appToken, body: { running: null } })).data.commands, [], "una orden se entrega una sola vez");
  await call("POST", "/api/remote/poll", { token: appToken, body: { running: "steam:620", done: [{ id: sent.data.id, result: null }] } });
  const playing = (await call("GET", "/api/remote", { cookie })).data;
  assert.deepEqual([playing.pc.running, playing.last.state], ["steam:620", "done"]);

  // Desinstalar también es una orden; el PC contesta cómo fue y la web lo enseña como hecho.
  const removal = await call("POST", "/api/remote/command", { cookie, body: { action: "uninstall", game: "steam:620" } });
  assert.equal(removal.status, 200);
  assert.equal((await call("POST", "/api/remote/poll", { token: appToken, body: { running: null } })).data.commands[0].action, "uninstall");
  await call("POST", "/api/remote/poll", { token: appToken, body: { running: null, done: [{ id: removal.data.id, result: "ok:Portal 2 está desinstalado." }] } });
  const removed = (await call("GET", "/api/remote", { cookie })).data.last;
  assert.deepEqual([removed.state, removed.result], ["done", "Portal 2 está desinstalado."]);

  // Con el control apagado en el PC, la web no puede mandar nada.
  await call("POST", "/api/remote/library", { token: appToken, body: { device: "PC de Ana", games: library, enabled: false } });
  assert.equal((await call("POST", "/api/remote/command", { cookie, body: { action: "close", game: "steam:620" } })).status, 403);
});

await step("novedades: noticias de los canales RSS y próximos lanzamientos con su fecha", async () => {
  if (!process.env.NEWS_FEEDS?.includes("127.0.0.1")) {
    console.log("    (sin fuentes de prueba: no se llama a medios reales desde la prueba)");
    return;
  }
  const { createServer } = await import("node:http");
  const rss = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Medio de Prueba - Noticias</title>
    <item><title><![CDATA[El juego del a&ntilde;o ya tiene fecha]]></title><link>https://medio.prueba.test/a</link><pubDate>Thu, 19 Nov 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Llega en <b>marzo</b> &amp; trae modo cooperativo.</p><img src="https://medio.prueba.test/a.jpg">]]></description></item>
    <item><title>Noticia vieja</title><link>https://medio.prueba.test/b</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><description>Sin imagen.</description><media:content url="https://medio.prueba.test/b.jpg"/></item>
    <item><title>Enlace que no es de fiar</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const fake = createServer((req, res) => {
    if (req.url.startsWith("/rss")) return void res.writeHead(200, { "Content-Type": "application/rss+xml" }).end(rss);
    if (req.url.startsWith("/api/featuredcategories")) return void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ coming_soon: { items: [{ id: 111, name: "Juego Esperado", header_image: "https://cdn.prueba.test/111.jpg" }, { id: 222, name: "Otro Juego" }] } }));
    if (req.url.startsWith("/api/appdetails?appids=111")) return void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ 111: { success: true, data: { release_date: { coming_soon: true, date: "12 DIC 2026" } } } }));
    res.writeHead(500).end();
  });
  await new Promise((done) => fake.listen(9101, "127.0.0.1", done));
  const feed = await call("GET", "/api/feed");
  fake.close();
  assert.equal(feed.status, 200);
  assert.deepEqual(feed.data.news.map((n) => n.title), ["El juego del año ya tiene fecha", "Noticia vieja"], "ordenadas de nueva a vieja y sin el enlace raro");
  assert.deepEqual([feed.data.news[0].source, feed.data.news[0].summary, feed.data.news[0].image], ["Medio de Prueba", "Llega en marzo & trae modo cooperativo.", "https://medio.prueba.test/a.jpg"]);
  assert.equal(feed.data.news[1].image, "https://medio.prueba.test/b.jpg");
  assert.deepEqual(feed.data.upcoming.map((u) => [u.name, u.date, u.url]), [["Juego Esperado", "12 DIC 2026", "https://store.steampowered.com/app/111"], ["Otro Juego", "Próximamente", "https://store.steampowered.com/app/222"]]);
});

// Un R2 de mentira para la prueba: guarda en memoria lo que el servidor y "el programa" suben con las direcciones firmadas.
const nube = new Map();
let nubeFalsa = null;
async function arrancarNubeFalsa() {
  const { createServer } = await import("node:http");
  nubeFalsa = createServer(async (req, res) => {
    const key = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (req.method === "PUT" && req.headers["x-amz-copy-source"]) {
      const source = nube.get("/" + decodeURIComponent(req.headers["x-amz-copy-source"]).replace(/^\//, ""));
      if (!source) return void res.writeHead(404).end();
      nube.set(key, source);
      return void res.writeHead(200, { "Content-Type": "application/xml" }).end(`<CopyObjectResult><ETag>"copia"</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`);
    }
    if (req.method === "PUT") return void (nube.set(key, Buffer.concat(chunks)), res.writeHead(200, { ETag: '"subida"' }).end());
    if (req.method === "DELETE") return void (nube.delete(key), res.writeHead(204).end());
    const found = nube.get(key);
    if (!found) return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Length": found.length, "Content-Type": "application/zip", ETag: '"copia"' });
    res.end(req.method === "HEAD" ? undefined : found);
  });
  await new Promise((done) => nubeFalsa.listen(Number(process.env.R2_FALSO_PUERTO ?? 9100), "127.0.0.1", done));
}

await step("guardado en la nube: subir, listar, bajar, reemplazar, límite de tamaño y borrar", async () => {
  assert.equal((await call("GET", "/api/saves")).status, 401);
  const before = await call("GET", "/api/saves", { token: appToken });
  assert.equal(before.status, 200);
  if (!before.data.enabled) {
    // Sin las variables R2_* el guardado queda apagado, y el programa no lo ofrece.
    assert.equal((await call("POST", "/api/saves/upload", { token: appToken, body: { game: "local:portal 2" } })).status, 503);
    console.log("    (R2 sin configurar en este servidor: solo se comprueba que queda apagado)");
    return;
  }
  await arrancarNubeFalsa();
  const game = "local:portal 2";
  assert.deepEqual(before.data.saves, []);
  assert.equal((await call("POST", "/api/saves/upload", { token: appToken, body: {} })).status, 400);
  assert.equal((await call("POST", "/api/saves/done", { token: appToken, body: { game } })).status, 404, "confirmar sin haber subido nada");

  const subir = async (bytes) => {
    const ticket = await call("POST", "/api/saves/upload", { token: appToken, body: { game, name: "Portal 2" } });
    assert.equal(ticket.status, 200);
    assert.equal((await fetch(ticket.data.url, { method: "PUT", body: bytes })).status, 200);
    return call("POST", "/api/saves/done", { token: appToken, body: { game, name: "Portal 2" } });
  };
  const first = Buffer.alloc(1000, 7);
  const done = await subir(first);
  assert.equal(done.status, 200);
  assert.equal(done.data.save.size, 1000);

  const listed = (await call("GET", "/api/saves", { token: appToken })).data;
  assert.equal(listed.saves.length, 1);
  assert.equal(listed.saves[0].name, "Portal 2");
  assert.equal(listed.usedBytes, 1000);

  const bajar = async () => {
    const ticket = await call("POST", "/api/saves/download", { token: appToken, body: { game } });
    assert.equal(ticket.status, 200);
    return Buffer.from(await (await fetch(ticket.data.url)).arrayBuffer());
  };
  assert.ok((await bajar()).equals(first));
  assert.equal((await call("POST", "/api/saves/download", { token: appToken, body: { game: "otro juego" } })).status, 404);

  // Una copia nueva reemplaza a la anterior.
  const second = Buffer.alloc(2500, 9);
  assert.equal((await subir(second)).data.save.size, 2500);
  assert.ok((await bajar()).equals(second));
  assert.equal((await call("GET", "/api/saves", { token: appToken })).data.saves.length, 1);

  // Una copia que pasa del límite se rechaza y la buena sigue ahí.
  const max = (await call("GET", "/api/saves", { token: appToken })).data.maxBytes;
  if (max <= 4 * 1024 * 1024) {
    assert.equal((await subir(Buffer.alloc(max + 10, 1))).status, 413);
    assert.ok((await bajar()).equals(second));
  }

  assert.equal((await call("POST", "/api/saves/delete", { token: appToken, body: { game } })).status, 200);
  assert.equal((await call("GET", "/api/saves", { token: appToken })).data.saves.length, 0);
  assert.equal(nube.size, 0, "no queda ningún archivo en la nube");
  // Se deja una copia para comprobar que borrar la cuenta se la lleva.
  assert.equal((await subir(first)).status, 200);
  assert.equal(nube.size, 1);
});

await step("avisos al instante: el mensaje, el cambio de juego y la orden al PC llegan sin esperar al latido", async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Deja abierta la conexión de avisos, como hacen el programa y la web, y apunta lo que va llegando.
  async function listen(token) {
    const controller = new AbortController();
    const response = await fetch(`${BASE}/api/live?device=pc`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
    const got = [];
    if (response.ok) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const match of decoder.decode(value).matchAll(/^data: (.+)$/gm)) got.push(match[1]);
          }
        } catch {
          /* cerrada a propósito */
        }
      })();
    }
    const until = async (topic, ms = 2000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (got.includes(topic)) return true;
        await sleep(20);
      }
      return false;
    };
    return { status: response.status, type: response.headers.get("content-type") ?? "", got, until, close: () => controller.abort() };
  }

  const closed = await listen(null);
  assert.equal(closed.status, 401, "sin sesión no hay avisos");
  closed.close();

  const join = (name) => call("POST", "/api/auth/register", { body: { name, email: `${name.toLowerCase()}${stamp}@prueba.test`, password: "clave-segura-1", client: "app" } });
  const dana = await join("Dana");
  const eli = await join("Eli");
  await call("POST", "/api/social/friends", { token: dana.data.token, body: { target: `eli${stamp}@prueba.test` } });
  assert.equal((await call("POST", "/api/social/friends", { token: eli.data.token, body: { target: `dana${stamp}@prueba.test` } })).data.state, "friends");
  const eliPulse = (await call("POST", "/api/social/pulse", { token: eli.data.token, body: { playing: null } })).data;

  const line = await listen(eli.data.token);
  assert.equal(line.status, 200);
  assert.match(line.type, /text\/event-stream/);
  assert.ok(await line.until("hello"), "al abrir, el servidor saluda");
  assert.ok((await call("GET", "/api/health")).data.live >= 1);

  // Dana escribe: a Eli le llega el aviso en el momento y, al pedirlo, el mensaje.
  line.got.length = 0;
  const before = Date.now();
  assert.equal((await call("POST", "/api/social/messages", { token: dana.data.token, body: { to: eliPulse.me.id, body: "¿Estás?" } })).status, 200);
  assert.ok(await line.until("chat"), "el aviso de mensaje no llegó");
  assert.ok(Date.now() - before < 1000, "el aviso tardó más de un segundo");
  const arrived = (await call("POST", "/api/social/pulse", { token: eli.data.token, body: { playing: null, after: eliPulse.last } })).data;
  assert.deepEqual(arrived.messages.map((m) => m.body), ["¿Estás?"]);

  // Dana abre un juego: Eli se entera sin esperar. Y el teléfono de Dana (que no dice a qué juega) no lo borra.
  line.got.length = 0;
  await call("POST", "/api/social/pulse", { token: dana.data.token, body: { playing: "Halcyon Drift" } });
  assert.ok(await line.until("social"), "el aviso de que un amigo empezó a jugar no llegó");
  await call("POST", "/api/social/pulse", { token: dana.data.token, body: {} });
  const friend = (await call("POST", "/api/social/pulse", { token: eli.data.token, body: { playing: null } })).data.friends[0];
  assert.deepEqual([friend.online, friend.playing], [true, "Halcyon Drift"]);

  // Una orden para el PC de Eli le llega a su programa al instante.
  await call("POST", "/api/remote/library", { token: eli.data.token, body: { device: "PC de Eli", games: [{ id: "steam:620", title: "Portal 2", store: "steam" }], enabled: true } });
  line.got.length = 0;
  assert.equal((await call("POST", "/api/remote/command", { token: eli.data.token, body: { action: "play", game: "steam:620" } })).status, 200);
  assert.ok(await line.until("remote"), "el aviso de la orden no llegó");
  assert.equal((await call("GET", "/api/remote", { token: eli.data.token })).data.pc.online, true);

  line.close();
  for (const other of [dana, eli]) await call("DELETE", "/api/me", { token: other.data.token });
});

await step("publicidad: el admin sube banners con enlace y días, el programa los enseña y se cuentan vistas y clics", async () => {
  const admin = await asAdmin();
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const image = "data:image/png;base64," + Buffer.concat([Buffer.from(pixel, "base64"), Buffer.alloc(120)]).toString("base64");
  const ad = { name: `Teclados Kairo ${stamp}`, link: "https://kairo.prueba.test/oferta", image, days: 30, zone: "hero" };

  assert.equal((await call("POST", "/api/admin/ads", { cookie, body: ad })).status, 403, "solo el equipo sube banners");
  assert.equal((await call("POST", "/api/admin/ads", { cookie: admin.cookie, body: { ...ad, link: "javascript:alert(1)" } })).status, 400);
  assert.equal((await call("POST", "/api/admin/ads", { cookie: admin.cookie, body: { ...ad, link: "http://sin-candado.test" } })).status, 400);
  assert.equal((await call("POST", "/api/admin/ads", { cookie: admin.cookie, body: { ...ad, name: "" } })).status, 400);
  assert.equal((await call("POST", "/api/admin/ads", { cookie: admin.cookie, body: { ...ad, image: "data:text/html;base64,PGI+" } })).status, 400);
  const added = await call("POST", "/api/admin/ads", { cookie: admin.cookie, body: ad });
  assert.equal(added.status, 200);
  const id = added.data.ad.id;
  const days = (added.data.ad.endsAt - Date.now() / 1000) / 86_400;
  assert.ok(days > 29.9 && days < 30.1, "treinta días en pantalla");

  // Cualquiera (el programa, sin sesión) recibe la lista y la imagen.
  const shown = (await call("GET", "/api/ads")).data.ads.find((a) => a.id === id);
  assert.deepEqual(shown, { id, name: ad.name, link: ad.link, zone: "hero" });
  const file = await fetch(BASE + `/api/ads/${id}/image`);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.equal(file.headers.get("access-control-allow-origin"), "*");

  // Vistas y clics. Un banner que no existe no cuenta, y repetirlo en la misma llamada tampoco.
  assert.equal((await call("POST", "/api/ads/seen", { body: { ids: [id, id, 99999999] } })).status, 204);
  assert.equal((await call("POST", "/api/ads/seen", { body: { ids: [id] } })).status, 204);
  assert.equal((await call("POST", `/api/ads/${id}/click`)).status, 204);
  assert.equal((await call("GET", "/api/admin/ads", { cookie })).status, 403);
  const stats = (await call("GET", "/api/admin/ads", { cookie: admin.cookie })).data.ads.find((a) => a.id === id);
  assert.deepEqual([stats.views, stats.clicks, stats.active], [2, 1, true]);

  // En pausa deja de enseñarse; sin días, no tiene fecha de fin; borrado, desaparece con su imagen.
  assert.equal((await call("PATCH", `/api/admin/ads/${id}`, { cookie: admin.cookie, body: { active: false, days: 0 } })).status, 200);
  assert.equal((await call("GET", "/api/ads")).data.ads.some((a) => a.id === id), false);
  const paused = (await call("GET", "/api/admin/ads", { cookie: admin.cookie })).data.ads.find((a) => a.id === id);
  assert.deepEqual([paused.active, paused.endsAt], [false, null]);
  assert.equal((await call("DELETE", `/api/admin/ads/${id}`, { cookie: admin.cookie })).status, 200);
  assert.equal((await fetch(BASE + `/api/ads/${id}/image`)).status, 404);
});

await step("misiones: el admin las sube, el progreso no corre más que el reloj y la recompensa se cobra una vez", async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const admin = await asAdmin();
  const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const image = "data:image/png;base64," + Buffer.concat([Buffer.from(pixel, "base64"), Buffer.alloc(120)]).toString("base64");
  // Una misión de jugar muy corta (seis segundos) para poder completarla en la prueba.
  const mission = { sponsor: "Estudio Halcón", title: `Juega a Halcyon Drift ${stamp}`, body: "Juega unos minutos y llévate RLC.", kind: "play", target: "Halcyon Drift", minutes: 0.1, reward: 150, link: "https://halcon.prueba.test", linkLabel: "Ver el juego", days: 7, maxClaims: 1, image };

  assert.equal((await call("GET", "/api/missions")).status, 401);
  assert.equal((await call("POST", "/api/admin/missions", { cookie, body: mission })).status, 403, "solo el equipo sube misiones");
  assert.equal((await call("POST", "/api/admin/missions", { cookie: admin.cookie, body: { ...mission, reward: 0 } })).status, 400);
  assert.equal((await call("POST", "/api/admin/missions", { cookie: admin.cookie, body: { ...mission, kind: "video", target: "http://sin-candado.test/v.mp4" } })).status, 400);
  assert.equal((await call("POST", "/api/admin/missions", { cookie: admin.cookie, body: { ...mission, link: "javascript:alert(1)" } })).status, 400);
  // Una imagen sin reducir (lo que manda un teléfono que no sabe hacer WebP) se rechaza con su motivo, no con un fallo del servidor.
  const heavy = (bytes) => "data:image/png;base64," + Buffer.alloc(bytes, 7).toString("base64");
  for (const bytes of [900_000, 4_000_000]) {
    const refused = await call("POST", "/api/admin/missions", { cookie: admin.cookie, body: { ...mission, image: heavy(bytes) } });
    assert.ok(refused.status === 400 || refused.status === 413, `imagen de ${bytes} bytes: ${refused.status}`);
    assert.match(refused.data.error, /pesa demasiado/);
  }
  const added = await call("POST", "/api/admin/missions", { cookie: admin.cookie, body: mission });
  assert.equal(added.status, 200);
  const id = added.data.id;

  const mine = () => call("GET", "/api/missions", { token: appToken }).then((r) => r.data.missions.find((m) => m.id === id));
  const fresh = await mine();
  assert.deepEqual([fresh.sponsor, fresh.kind, fresh.game, fresh.goalSeconds, fresh.reward, fresh.accepted, fresh.seconds, fresh.claimed, fresh.linkLabel], ["Estudio Halcón", "play", "Halcyon Drift", 6, 150, false, 0, false, "Ver el juego"]);
  assert.equal((await fetch(BASE + `/api/missions/${id}/image`)).headers.get("content-type"), "image/png");

  // Sin aceptarla no cuenta, y sin completarla no se cobra.
  assert.equal((await call("POST", `/api/missions/${id}/progress`, { token: appToken, body: { seconds: 60 } })).status, 409);
  assert.equal((await call("POST", `/api/missions/${id}/accept`, { token: appToken })).status, 200);
  assert.equal((await call("POST", `/api/missions/${id}/claim`, { token: appToken })).status, 409);
  // Decir "llevo una hora" nada más aceptar no sirve: solo cuenta el tiempo que ha pasado de verdad (más un margen corto).
  const cheat = (await call("POST", `/api/missions/${id}/progress`, { token: appToken, body: { seconds: 3600 } })).data;
  assert.ok(cheat.seconds <= 6 && cheat.done === (cheat.seconds >= 6), "el progreso corrió más que el reloj");
  let state = cheat;
  for (let round = 0; round < 6 && !state.done; round++) {
    await sleep(1100);
    state = (await call("POST", `/api/missions/${id}/progress`, { token: appToken, body: { seconds: 60 } })).data;
  }
  assert.equal(state.done, true);

  const before = (await call("GET", "/api/wallet", { token: appToken })).data.balance;
  const [first, second] = await Promise.all([call("POST", `/api/missions/${id}/claim`, { token: appToken }), call("POST", `/api/missions/${id}/claim`, { token: appToken })]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409], "dos reclamos a la vez: solo uno cobra");
  const wallet = (await call("GET", "/api/wallet", { token: appToken })).data;
  assert.equal(wallet.balance, before + 150);
  assert.equal(wallet.moves[0].note, `Misión: ${mission.title}`);
  const done = await mine();
  assert.deepEqual([done.claimed, done.soldOut], [true, true], "con el tope en una recompensa, ya no quedan");

  const stats = (await call("GET", "/api/admin/missions", { cookie: admin.cookie })).data.missions.find((m) => m.id === id);
  assert.deepEqual([stats.accepted, stats.completed, stats.claimed, stats.maxClaims], [1, 1, 1, 1]);
  // En pausa ya no admite progreso, pero quien la reclamó la sigue viendo entre las suyas.
  assert.equal((await call("PATCH", `/api/admin/missions/${id}`, { cookie: admin.cookie, body: { active: false } })).status, 200);
  assert.equal((await call("POST", `/api/missions/${id}/progress`, { token: appToken, body: { seconds: 5 } })).status, 404);
  assert.equal((await mine()).claimed, true);
  assert.equal((await call("DELETE", `/api/admin/missions/${id}`, { cookie: admin.cookie })).status, 200);
  assert.equal(await mine(), undefined);
});

await step("archivos del equipo en R2: el vídeo y la imagen de una misión se suben sin tope y se sirven desde el almacén", async () => {
  const admin = await asAdmin();
  const upload = (bytes, type, cookieOf = admin.cookie) => fetch(BASE + "/api/admin/media", { method: "POST", headers: { "Content-Type": type, Cookie: cookieOf }, body: bytes });
  const enabled = (await call("GET", "/api/admin/missions", { cookie: admin.cookie })).data.uploads;
  if (!enabled) {
    assert.equal((await upload(Buffer.alloc(10, 1), "video/mp4")).status, 503);
    console.log("    (R2 sin configurar en este servidor: solo se comprueba que subir queda apagado)");
    return;
  }
  assert.equal((await upload(Buffer.alloc(10, 1), "video/mp4", cookie)).status, 403, "solo el equipo sube archivos");
  assert.equal((await upload(Buffer.alloc(10, 1), "application/x-msdownload")).status, 400);
  // Un vídeo de 5 MB: mucho más de lo que cabría en una petición normal.
  const film = Buffer.alloc(5 * 1024 * 1024, 3);
  const video = await (await upload(film, "video/mp4")).json();
  const picture = await (await upload(Buffer.alloc(1_200_000, 5), "image/jpeg")).json();
  assert.match(video.key, /^media\/\d{6}\/[a-f0-9]{24}\.mp4$/);
  assert.match(picture.key, /\.jpg$/);
  assert.equal(video.size, film.length);

  const mission = { sponsor: "Volt", title: `Tráiler ${stamp}`, body: "", kind: "video", target: "", videoKey: video.key, imageKey: picture.key, minutes: 1, reward: 50, days: 3 };
  assert.equal((await call("POST", "/api/admin/missions", { cookie: admin.cookie, body: { ...mission, videoKey: "media/202601/../../otra-cosa.mp4" } })).status, 400, "una clave inventada no vale");
  const added = await call("POST", "/api/admin/missions", { cookie: admin.cookie, body: mission });
  assert.equal(added.status, 200);
  const id = added.data.id;
  const seen = (await call("GET", "/api/missions", { token: appToken })).data.missions.find((m) => m.id === id);
  assert.equal(seen.video, `/api/missions/${id}/video`);

  // Quien pide el vídeo o la imagen es enviado a su dirección temporal en el almacén, y allí está el archivo entero.
  const hop = await fetch(BASE + `/api/missions/${id}/video`, { redirect: "manual" });
  assert.equal(hop.status, 302);
  assert.ok(hop.headers.get("location").includes(video.key));
  const played = Buffer.from(await (await fetch(BASE + `/api/missions/${id}/video`)).arrayBuffer());
  assert.equal(played.length, film.length);
  assert.equal((await fetch(BASE + `/api/missions/${id}/image`, { redirect: "manual" })).status, 302);
  assert.equal((await fetch(BASE + `/api/missions/${id}/image`)).status, 200);

  // Al borrar la misión, sus archivos salen del almacén.
  const where = hop.headers.get("location");
  assert.equal((await call("DELETE", `/api/admin/missions/${id}`, { cookie: admin.cookie })).status, 200);
  assert.equal((await fetch(where)).status, 404);
});

await step("retirar el permiso borra la biblioteca guardada", async () => {
  await call("PATCH", "/api/me", { cookie, body: { consentLibrary: false } });
  const admin = await call("POST", "/api/auth/login", { body: { email: ADMIN, password: "clave-de-admin-0" } });
  const ana = (await call("GET", "/api/admin/users", { cookie: admin.cookie })).data.users.find((u) => u.email === email);
  assert.equal(ana.games, 0);
});

await step("cerrar sesión invalida la cookie", async () => {
  assert.equal((await call("POST", "/api/auth/logout", { cookie })).status, 200);
  assert.equal((await call("GET", "/api/me", { cookie })).data.user, null);
});

await step("eliminar la cuenta lo borra todo y el token del programa deja de valer", async () => {
  assert.equal((await call("DELETE", "/api/me", { token: appToken })).status, 200);
  assert.equal((await call("GET", "/api/me", { token: appToken })).data.user, null);
  assert.equal((await call("POST", "/api/auth/login", { body: { email, password: "clave-segura-1" } })).status, 401);
  assert.equal(nube.size, 0, "las copias en la nube se borran con la cuenta");
  nubeFalsa?.close();
});

await step("la web se sirve en cualquier ruta y la API desconocida responde 404", async () => {
  for (const route of ["/planes", "/tienda", "/descargas", "/soporte", "/empresas"]) assert.equal((await call("GET", route)).status, 200);
  const page = await call("GET", "/registro");
  assert.equal(page.status, 200);
  assert.ok(String(page.data).includes('<div id="root">'));
  assert.equal((await call("GET", "/api/no-existe")).status, 404);
});

console.log(`\n${passed} comprobaciones superadas.`);
