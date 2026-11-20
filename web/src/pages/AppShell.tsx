import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Coins, Gamepad2, House, MessageCircle, Monitor, Newspaper, Target, UserRound } from "lucide-react";
import { api, type Feed, type Mission, type RemoteGame, type RemoteState, type Wallet } from "../api";
import type { Session } from "../App";
import { useFresh } from "../live";
import { Mark } from "../Mark";
import { Account } from "./Account";
import { Friends, useWebSocial } from "./Friends";
import { Missions } from "./Missions";
import { News } from "./News";
import { Remote } from "./Remote";
import { InstallButton, Shop } from "./Shop";
import { Apariencia } from "./Apariencia";

const rlc = (amount: number) => amount.toLocaleString("es");
const hours = (minutes: number) => (minutes >= 60 ? `${Math.round(minutes / 60).toLocaleString("es")} h` : `${minutes} min`);
const moveDate = (seconds: number) => new Date(seconds * 1000).toLocaleDateString("es", { day: "numeric", month: "short" });

const tabs = [
  { path: "/inicio", label: "Inicio", icon: House },
  { path: "/amigos", label: "Amigos", icon: MessageCircle },
  { path: "/mi-pc", label: "Mi PC", icon: Gamepad2 },
  { path: "/noticias", label: "Noticias", icon: Newspaper },
  { path: "/cuenta", label: "Perfil", icon: UserRound },
];
/// Secciones que no tienen pestaña propia: se llega desde Inicio y desde el saldo de arriba.
const titles: Record<string, string> = { "/tienda": "Tienda", "/wallet": "Wallet", "/misiones": "Misiones", "/apariencia": "Apariencia" };

function Cover({ game }: { game: RemoteGame }) {
  const [broken, setBroken] = useState(false);
  if (game.cover && !broken) return <img src={game.cover} alt="" loading="lazy" onError={() => setBroken(true)} />;
  return <span className="pc-letter">{game.title.slice(0, 1).toUpperCase()}</span>;
}

/// La tarjeta de la cuenta: el saldo en RLC con el nombre de su dueño, como una tarjeta de socio.
function RlcCard({ name, balance }: { name: string; balance: number | null }) {
  return (
    <div className="rl-card">
      <div className="rl-card-top">
        <Mark size={34} />
        <span>Red Level</span>
        <b>RLC</b>
      </div>
      <p className="rl-card-balance">
        <strong>{balance === null ? "···" : rlc(balance)}</strong>
        <small>RLC disponibles</small>
      </p>
      <div className="rl-card-foot">
        <span>{name}</span>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}

function Home({ session, wallet, remote }: { session: Session; wallet: Wallet | null; remote: RemoteState | null }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  useEffect(() => {
    api
      .feed()
      .then(setFeed)
      .catch(() => {});
    api
      .missions()
      .then(({ missions }) => setMissions(missions.filter((m) => !m.claimed && !m.soldOut)))
      .catch(() => {});
  }, []);
  const prize = missions.reduce((sum, m) => sum + m.reward, 0);
  const pc = remote?.pc ?? null;
  const running = pc?.running ? (pc.games.find((g) => g.id === pc.running) ?? null) : null;
  const recent = useMemo(() => [...(pc?.games ?? [])].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || (b.minutes ?? 0) - (a.minutes ?? 0)).slice(0, 10), [pc?.games]);
  const totalMinutes = (pc?.games ?? []).reduce((sum, g) => sum + (g.minutes ?? 0), 0);
  const first = session.user?.name.split(" ")[0] ?? "";

  return (
    <div className="appx-page">
      <p className="appx-hello">
        Hola, <b>{first}</b>
      </p>
      <RlcCard name={session.user?.name ?? ""} balance={wallet ? wallet.balance : null} />
      <div className="appx-duo">
        <button className="button primary" onClick={() => session.go("/tienda")}>
          Ir a la tienda
        </button>
        <button className="button" onClick={() => session.go("/wallet")}>
          Movimientos
        </button>
      </div>
      <InstallButton />

      <button className={`appx-pc ${pc?.online ? "is-on" : ""}`} onClick={() => session.go("/mi-pc")}>
        <span className="appx-pc-icon">{running ? <Cover game={running} /> : <Monitor size={24} aria-hidden="true" />}</span>
        <span className="appx-pc-text">
          <small>{pc ? pc.device : "Tu PC"}</small>
          <b>{running ? `Jugando ${running.title}` : pc?.online ? "Conectado y listo" : pc ? "Sin conexión" : "Aún no conectado"}</b>
        </span>
        <i aria-hidden="true" />
      </button>
      {!pc && remote && <p className="fine">Abre Red Level en tu ordenador con esta misma cuenta y tus juegos aparecerán aquí.</p>}

      <button className="appx-pc appx-opt" onClick={() => session.go("/misiones")}>
        <span className="appx-pc-icon">
          <Target size={24} aria-hidden="true" />
        </span>
        <span className="appx-pc-text">
          <small>Misiones</small>
          <b>{missions.length > 0 ? `${missions.length} ${missions.length === 1 ? "misión" : "misiones"} · hasta ${rlc(prize)} RLC` : "Gana RLC con los patrocinantes"}</b>
        </span>
        <ChevronRight size={20} aria-hidden="true" />
      </button>

      {recent.length > 0 && (
        <>
          <div className="appx-row-head">
            <h2>Tus juegos</h2>
            <button onClick={() => session.go("/mi-pc")}>Ver los {pc?.games.length}</button>
          </div>
          <ul className="appx-shelf">
            {recent.map((game) => (
              <li key={game.id}>
                <button onClick={() => session.go("/mi-pc")} aria-label={game.title}>
                  <span className="pc-cover">
                    <Cover game={game} />
                  </span>
                  <b>{game.title}</b>
                  {(game.minutes ?? 0) > 0 && <small>{hours(game.minutes ?? 0)}</small>}
                </button>
              </li>
            ))}
          </ul>
          <dl className="appx-stats">
            <div>
              <dt>Juegos</dt>
              <dd>{pc?.games.length}</dd>
            </div>
            <div>
              <dt>Tiempo jugado</dt>
              <dd>{hours(totalMinutes)}</dd>
            </div>
            <div>
              <dt>En tu wallet</dt>
              <dd>{wallet ? rlc(wallet.balance) : "–"}</dd>
            </div>
          </dl>
        </>
      )}

      {feed && feed.upcoming.length > 0 && (
        <>
          <div className="appx-row-head">
            <h2>Próximos lanzamientos</h2>
          </div>
          <ul className="appx-shelf appx-releases">
            {feed.upcoming.map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <span className="appx-release-art">
                    {item.image && <img src={item.image} alt="" loading="lazy" />}
                    <b>{item.date}</b>
                  </span>
                  <strong>{item.name}</strong>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {feed && feed.news.length > 0 && (
        <>
          <div className="appx-row-head">
            <h2>Noticias</h2>
            <button onClick={() => session.go("/noticias")}>Ver todas</button>
          </div>
          <ul className="appx-news">
            {feed.news.slice(0, 3).map((item) => (
              <li key={item.url}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.image && <img src={item.image} alt="" loading="lazy" />}
                  <span>
                    <small>{item.source}</small>
                    <strong>{item.title}</strong>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function WalletPage({ session, wallet }: { session: Session; wallet: Wallet | null }) {
  return (
    <div className="appx-page">
      <RlcCard name={session.user?.name ?? ""} balance={wallet ? wallet.balance : null} />
      <p className="fine">RLC es la moneda de Red Level: vale igual aquí y en el programa. La recarga con dinero abre próximamente.</p>
      <div className="appx-row-head">
        <h2>Movimientos</h2>
      </div>
      {wallet && wallet.moves.length === 0 && <p className="fine">Todavía no hay movimientos. Lo que compres y los RLC que recibas aparecerán aquí.</p>}
      <ul className="appx-moves">
        {(wallet?.moves ?? []).map((move, index) => (
          <li key={index}>
            <span>
              <b>{move.note}</b>
              <small>{moveDate(move.at)}</small>
            </span>
            <span>
              <b className={move.amount > 0 ? "is-plus" : "is-minus"}>
                {move.amount > 0 ? "+" : "−"}
                {rlc(Math.abs(move.amount))}
              </b>
              <small>{rlc(move.balance)} RLC</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/// La web para quien ya entró: se usa como una app, con su barra de secciones abajo en el teléfono.
export function AppShell({ path, session }: { path: string; session: Session }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [remote, setRemote] = useState<RemoteState | null>(null);

  // El saldo se vuelve a leer al cambiar de sección: puede haber cambiado en la tienda o en el programa.
  useEffect(() => {
    api
      .wallet()
      .then(setWallet)
      .catch(() => {});
  }, [path]);
  useFresh(
    () =>
      void api
        .remote()
        .then(setRemote)
        .catch(() => {}),
    ["remote"],
    6000,
    30_000,
  );
  useFresh(
    () =>
      void api
        .wallet()
        .then(setWallet)
        .catch(() => {}),
    ["wallet"],
    120_000,
    120_000,
  );

  const social = useWebSocial();
  const unread = Object.values(social.unread).reduce((sum, count) => sum + count, 0) + (social.pulse?.requests.length ?? 0);
  const current = tabs.find((t) => t.path === path) ?? null;
  let page: ReactNode;
  if (path === "/mi-pc") page = <Remote session={session} />;
  else if (path === "/tienda") page = <div className="appx-page"><Shop session={session} /></div>;
  else if (path === "/wallet") page = <WalletPage session={session} wallet={wallet} />;
  else if (path === "/cuenta") page = <Account session={session} />;
  else if (path === "/amigos") page = <Friends social={social} />;
  else if (path === "/noticias") page = <News />;
  else if (path === "/misiones") page = <Missions go={session.go} />;
  else if (path === "/apariencia") page = <Apariencia session={session} />;
  else page = <Home session={session} wallet={wallet} remote={remote} />;

  return (
    <div className="appx">
      {/* Fondo animado del Motion Pack de la cuenta (el mismo que en el PC). Solo decora: no se puede tocar. */}
      <div className="motion-fx" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      {/* Líneas de barrido del aspecto Glitch (solo se ven con ese aspecto puesto). */}
      <div className="look-fx" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <header className="appx-bar">
        <button className="appx-brand" onClick={() => session.go("/inicio")} aria-label="Inicio">
          <Mark size={30} />
        </button>
        <h1>{current?.label ?? titles[path] ?? "Inicio"}</h1>
        <button className="appx-chip" onClick={() => session.go("/wallet")} aria-label={`Tu wallet: ${wallet ? rlc(wallet.balance) : 0} RLC`}>
          <Coins size={15} aria-hidden="true" /> {wallet ? rlc(wallet.balance) : "···"}
        </button>
      </header>
      <nav className="appx-nav" aria-label="Secciones">
        {tabs.map((tab) => (
          <button key={tab.path} className={`${tab.path === current?.path ? "is-on" : ""} ${tab.path === "/mi-pc" ? "is-main" : ""}`} aria-current={tab.path === current?.path ? "page" : undefined} onClick={() => session.go(tab.path)}>
            <tab.icon size={22} aria-hidden="true" />
            <span>{tab.label}</span>
            {tab.path === "/mi-pc" && remote?.pc?.running && <i aria-label="Hay un juego abierto" />}
            {tab.path === "/amigos" && unread > 0 && <b className="appx-badge">{unread}</b>}
          </button>
        ))}
      </nav>
      <div className="appx-body">{page}</div>
    </div>
  );
}
