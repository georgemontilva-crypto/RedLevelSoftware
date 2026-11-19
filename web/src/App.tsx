import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { MotionConfig } from "motion/react";
import { api, muteTracking, track, type User } from "./api";
import { Account } from "./pages/Account";
import { AppShell } from "./pages/AppShell";
import { Admin } from "./pages/Admin";
import { Auth } from "./pages/Auth";
import { Landing } from "./pages/Landing";
import { Business, Downloads, Plans, Store, Support } from "./pages/Pages";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { Mark } from "./Mark";

export interface Session {
  user: User | null;
  setUser: (user: User | null) => void;
  go: (path: string) => void;
}

/// Enlace interno: cambia de página sin recargar.
/// Con `label`, además cuenta el clic para el embudo del panel.
export function Link({ to, className, children, go, label }: { to: string; className?: string; children: ReactNode; go: (path: string) => void; label?: string }) {
  const onClick = (event: MouseEvent) => {
    if (label) track("click", label);
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    go(to);
  };
  return (
    <a href={to} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

const links: [string, string][] = [
  ["/", "Inicio"],
  ["/#caracteristicas", "Características"],
  ["/#galeria", "Galería"],
  ["/tienda", "Store"],
  ["/planes", "Planes"],
  ["/soporte", "Soporte"],
];

export function App() {
  const [path, setPath] = useState(location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [menu, setMenu] = useState(false);

  /// Baja hasta la sección de la portada que indica la dirección (#planes, #preguntas…).
  const toHash = (hash: string) => setTimeout(() => document.getElementById(hash)?.scrollIntoView(), 80);

  const go = useCallback((to: string) => {
    const [pathname, hash] = to.split("#");
    history.pushState(null, "", to);
    setPath(pathname || "/");
    setMenu(false);
    if (hash) toHash(hash);
    else window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => {})
      .finally(() => setLoaded(true));
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Visitas por página, para el embudo del panel. El equipo de Red Level no cuenta.
  muteTracking(Boolean(user?.admin));
  useEffect(() => {
    if (!loaded) return;
    track("view", path);
    if (location.hash) toHash(location.hash.slice(1));
  }, [path, loaded]);

  const session: Session = { user, setUser, go };
  if (!loaded) return <div className="page" />;

  // Con la sesión iniciada, estas secciones se ven como una app: sin la cabecera ni el pie de la web.
  if (user && ["/inicio", "/mi-pc", "/wallet", "/tienda", "/cuenta"].includes(path)) return <AppShell path={path} session={session} />;

  const needsLogin = ["/cuenta", "/admin", "/mi-pc", "/inicio", "/wallet"].includes(path);
  let page: ReactNode;
  if (path === "/registro" || path === "/entrar" || (needsLogin && !user)) page = <Auth mode={path === "/registro" ? "register" : "login"} session={session} />;
  else if (path === "/cuenta") page = <Account session={session} />;
  else if (path === "/admin") page = <Admin session={session} />;
  else if (path === "/privacidad") page = <Privacy />;
  else if (path === "/terminos") page = <Terms />;
  else if (path === "/planes") page = <Plans session={session} />;
  else if (path === "/tienda") page = <Store session={session} />;
  else if (path === "/descargas") page = <Downloads session={session} />;
  else if (path === "/soporte") page = <Support session={session} />;
  else if (path === "/empresas") page = <Business session={session} />;
  else page = <Landing session={session} />;

  return (
    <MotionConfig reducedMotion="user">
    <div className="page">
      <header className="top">
        <Link to="/" go={go} className="brand">
          <span className="brand-mark">
            <Mark size={38} />
            <span className="wordmark">
              <b>RED</b>LEVEL
            </span>
          </span>
          <img className="brand-full" src="/logo-completo.webp" alt="Red Level Circle" />
        </Link>
        <nav className={`top-links${menu ? " is-open" : ""}`} aria-label="Secciones">
          {links.map(([to, label]) => (
            <Link key={to} to={to} go={go}>
              {label}
            </Link>
          ))}
          {user ? (
            <>
              <Link to="/inicio" go={go}>
                Abrir la app
              </Link>
              <Link to="/cuenta" go={go} className="only-menu">
                Mi cuenta
              </Link>
            </>
          ) : (
            <Link to="/entrar" go={go} className="only-menu">
              Entrar
            </Link>
          )}
          {user?.admin && (
            <Link to="/admin" go={go} className="only-menu">
              Panel
            </Link>
          )}
        </nav>
        <nav className="top-nav" aria-label="Cuenta">
          {user?.admin && (
            <Link to="/admin" go={go} className="only-wide">
              Panel
            </Link>
          )}
          {user ? (
            <Link to="/cuenta" go={go} className="only-wide">
              {user.name.split(" ")[0]}
            </Link>
          ) : (
            <Link to="/entrar" go={go} className="only-wide">
              Entrar
            </Link>
          )}
          <Link to={user ? "/descargas" : "/registro"} go={go} className="pill">
            Descargar gratis
          </Link>
          <button className="menu-toggle" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={menu ? "Cerrar el menú" : "Abrir el menú"}>
            {menu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </nav>
      </header>
      {page}
      <footer className="foot">
        <div className="foot-main">
          <div className="foot-brand">
            <img src="/logo-completo.webp" alt="Red Level Circle" />
            <p>Tu PC. Tu biblioteca. Tu consola. Una interfaz a pantalla completa para tus juegos, en Windows 10 y 11.</p>
          </div>
          <nav aria-label="Producto">
            <b>Producto</b>
            <Link to="/descargas" go={go}>
              Descargas
            </Link>
            <Link to="/#caracteristicas" go={go}>
              Características
            </Link>
            <Link to="/planes" go={go}>
              Planes
            </Link>
            <Link to="/tienda" go={go}>
              Red Level Store
            </Link>
            <Link to="/empresas" go={go}>
              Red Level Business
            </Link>
          </nav>
          <nav aria-label="Soporte">
            <b>Soporte</b>
            <Link to="/soporte" go={go}>
              Centro de ayuda
            </Link>
            <Link to="/#preguntas" go={go}>
              Preguntas frecuentes
            </Link>
            <Link to="/soporte#contacto" go={go}>
              Contacto y reporte de errores
            </Link>
          </nav>
          <nav aria-label="Legal">
            <b>Legal</b>
            <Link to="/privacidad" go={go}>
              Política de privacidad
            </Link>
            <Link to="/terminos" go={go}>
              Términos y condiciones
            </Link>
            <Link to="/terminos#reembolsos" go={go}>
              Política de reembolsos
            </Link>
            <Link to="/terminos#licencias" go={go}>
              Información de licencias
            </Link>
          </nav>
        </div>
        <p className="foot-legal">
          © {new Date().getFullYear()} Red Level Software. Todos los derechos reservados. Steam y Epic Games son marcas de sus respectivos dueños; Red Level no está afiliado a ellas ni cuenta con su respaldo.
        </p>
      </footer>
    </div>
    </MotionConfig>
  );
}
