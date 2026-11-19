import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { api, type User } from "./api";
import { Account } from "./pages/Account";
import { Admin } from "./pages/Admin";
import { Auth } from "./pages/Auth";
import { Landing } from "./pages/Landing";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { Mark } from "./Mark";

export interface Session {
  user: User | null;
  setUser: (user: User | null) => void;
  go: (path: string) => void;
}

/// Enlace interno: cambia de página sin recargar.
export function Link({ to, className, children, go }: { to: string; className?: string; children: ReactNode; go: (path: string) => void }) {
  const onClick = (event: MouseEvent) => {
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

export function App() {
  const [path, setPath] = useState(location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  const go = useCallback((to: string) => {
    history.pushState(null, "", to);
    setPath(to);
    window.scrollTo(0, 0);
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

  const session: Session = { user, setUser, go };
  if (!loaded) return <div className="page" />;

  const needsLogin = path === "/cuenta" || path === "/admin";
  let page: ReactNode;
  if (path === "/registro" || path === "/entrar" || (needsLogin && !user)) page = <Auth mode={path === "/registro" ? "register" : "login"} session={session} />;
  else if (path === "/cuenta") page = <Account session={session} />;
  else if (path === "/admin") page = <Admin session={session} />;
  else if (path === "/privacidad") page = <Privacy />;
  else if (path === "/terminos") page = <Terms />;
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
        <nav className="top-nav">
          {user ? (
            <>
              {user.admin && (
                <Link to="/admin" go={go}>
                  Usuarios
                </Link>
              )}
              <Link to="/cuenta" go={go} className="pill">
                {user.name.split(" ")[0]}
              </Link>
            </>
          ) : (
            <>
              <Link to="/entrar" go={go}>
                Entrar
              </Link>
              <Link to="/registro" go={go} className="pill">
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </header>
      {page}
      <footer className="foot">
        <div className="foot-main">
          <div className="foot-brand">
            <img src="/logo-completo.webp" alt="Red Level Circle" />
            <p>Tu biblioteca de juegos de PC a pantalla completa. Para Windows 10 y 11.</p>
          </div>
          <nav aria-label="Red Level">
            <b>Red Level</b>
            <Link to={user ? "/cuenta" : "/registro"} go={go}>
              Descargar
            </Link>
            <a href="/#como-empezar">Cómo empezar</a>
            <a href="/#preguntas">Preguntas frecuentes</a>
          </nav>
          <nav aria-label="Legal">
            <b>Legal</b>
            <Link to="/terminos" go={go}>
              Términos y condiciones
            </Link>
            <Link to="/privacidad" go={go}>
              Política de privacidad
            </Link>
          </nav>
        </div>
        <p className="foot-legal">
          © {new Date().getFullYear()} Red Level Circle. Todos los derechos reservados. Steam, Epic Games, Discord, Spotify y YouTube son marcas de sus respectivos dueños; Red Level no está afiliado a ellas ni cuenta con su respaldo.
        </p>
      </footer>
    </div>
    </MotionConfig>
  );
}
