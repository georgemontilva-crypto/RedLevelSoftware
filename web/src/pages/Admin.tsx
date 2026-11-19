import { useEffect, useMemo, useState } from "react";
import { api, day, errorText, hours, type AdminGame, type AdminUser } from "../api";
import type { Session } from "../App";

export function Admin({ session }: { session: Session }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ user: AdminUser; games: AdminGame[] | null } | null>(null);

  useEffect(() => {
    api
      .adminUsers()
      .then(({ users }) => setUsers(users))
      .catch((e) => setError(errorText(e)));
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (users ?? []).filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.email.includes(needle));
  }, [users, query]);

  async function show(user: AdminUser) {
    setOpen({ user, games: null });
    try {
      setOpen({ user, games: (await api.adminGames(user.id)).games });
    } catch {
      setOpen({ user, games: [] });
    }
  }

  if (!session.user?.admin || error) {
    return (
      <main className="narrow">
        <h1>Usuarios</h1>
        <p className="error">{error ?? "Esta página es solo para el equipo de Red Level."}</p>
      </main>
    );
  }

  const active = (users ?? []).filter((u) => u.lastSeenAt && u.lastSeenAt > Date.now() / 1000 - 7 * 86400).length;

  return (
    <main className="wide">
      <h1>Usuarios</h1>
      <div className="summary">
        <p>
          <b>{users?.length ?? "…"}</b> registrados
        </p>
        <p>
          <b>{users ? active : "…"}</b> abrieron Red Level esta semana
        </p>
        <p>
          <b>{users ? users.filter((u) => u.consentLibrary).length : "…"}</b> comparten su biblioteca
        </p>
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar por nombre o correo" />
        <a className="button" href="/api/admin/users.csv">
          Descargar CSV
        </a>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Registro</th>
              <th>Última conexión</th>
              <th>Versión</th>
              <th className="num">Descargas</th>
              <th className="num">Juegos</th>
              <th className="num">Horas</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} onClick={() => u.games > 0 && show(u)} className={u.games > 0 ? "clickable" : ""}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{day(u.createdAt)}</td>
                <td>{day(u.lastSeenAt)}</td>
                <td>{u.appVersion ?? "—"}</td>
                <td className="num">{u.downloads}</td>
                <td className="num">{u.consentLibrary ? u.games : "No comparte"}</td>
                <td className="num">{u.consentLibrary ? hours(u.minutes) : "—"}</td>
              </tr>
            ))}
            {users && shown.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  {users.length === 0 ? "Todavía no se ha registrado nadie." : "Nadie coincide con la búsqueda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal" onClick={() => setOpen(null)}>
          <section className="panel" onClick={(e) => e.stopPropagation()}>
            <div className="row spread">
              <h2>Biblioteca de {open.user.name}</h2>
              <button className="button" onClick={() => setOpen(null)}>
                Cerrar
              </button>
            </div>
            {open.games === null ? (
              <p className="muted">Cargando…</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Juego</th>
                      <th>Tienda</th>
                      <th className="num">Horas</th>
                      <th className="num">Logros</th>
                      <th>Última partida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.games.map((g, i) => (
                      <tr key={i}>
                        <td>{g.title}</td>
                        <td>{g.store}</td>
                        <td className="num">{hours(g.minutes)}</td>
                        <td className="num">{g.achTotal ? `${g.achUnlocked ?? 0} de ${g.achTotal}` : "—"}</td>
                        <td>{day(g.lastPlayed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
