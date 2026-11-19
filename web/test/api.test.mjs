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
});

await step("la web se sirve en cualquier ruta y la API desconocida responde 404", async () => {
  const page = await call("GET", "/registro");
  assert.equal(page.status, 200);
  assert.ok(String(page.data).includes('<div id="root">'));
  assert.equal((await call("GET", "/api/no-existe")).status, 404);
});

console.log(`\n${passed} comprobaciones superadas.`);
