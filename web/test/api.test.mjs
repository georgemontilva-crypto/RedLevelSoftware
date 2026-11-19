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

await step("wallet y tienda: el equipo da RLC, se compra una vez y el saldo nunca baja de cero", async () => {
  const store = await call("GET", "/api/store");
  assert.equal(store.status, 200);
  const item = store.data.items.find((i) => i.id === "theme:hielo");
  assert.ok(item.price > 0);
  assert.equal((await call("GET", "/api/wallet")).status, 401);
  const empty = (await call("GET", "/api/wallet", { token: appToken })).data;
  assert.deepEqual([empty.balance, empty.owned, empty.moves], [0, [], []]);
  assert.equal((await call("POST", "/api/store/buy", { token: appToken, body: { item: item.id } })).status, 402, "sin saldo no se compra");
  assert.equal((await call("POST", "/api/store/buy", { token: appToken, body: { item: "theme:no-existe" } })).status, 404);

  const admin = await call("POST", "/api/auth/login", { body: { email: ADMIN, password: "clave-de-admin-0" } });
  assert.equal((await call("POST", "/api/admin/wallet", { cookie, body: { email, amount: 5000 } })).status, 403, "solo el equipo reparte RLC");
  assert.equal((await call("POST", "/api/admin/wallet", { cookie: admin.cookie, body: { email: "nadie@prueba.test", amount: 10 } })).status, 404);
  assert.equal((await call("POST", "/api/admin/wallet", { cookie: admin.cookie, body: { email, amount: 0 } })).status, 400);
  const gift = await call("POST", "/api/admin/wallet", { cookie: admin.cookie, body: { email, amount: item.price + 50, note: "Bienvenida" } });
  assert.equal(gift.data.balance, item.price + 50);
  assert.equal((await call("POST", "/api/admin/wallet", { cookie: admin.cookie, body: { email, amount: -99999 } })).status, 400, "no se puede dejar en negativo");

  // Dos compras a la vez del mismo artículo: solo una entra y solo se cobra una vez.
  const both = await Promise.all([1, 2].map(() => call("POST", "/api/store/buy", { token: appToken, body: { item: item.id } })));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  const after = (await call("GET", "/api/wallet", { cookie })).data;
  assert.equal(after.balance, 50, "la web y el programa ven el mismo saldo");
  assert.deepEqual(after.owned, [item.id]);
  assert.deepEqual(after.moves.map((m) => [m.kind, m.amount]), [["compra", -item.price], ["regalo", item.price + 50]]);
  assert.equal((await call("POST", "/api/store/buy", { token: appToken, body: { item: "look:cristal" } })).status, 402);
  assert.equal((await call("GET", "/api/wallet", { token: appToken })).data.owned.length, 1);
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
