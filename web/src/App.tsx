import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { api, type User } from "./api";
import { Account } from "./pages/Account";
import { Admin } from "./pages/Admin";
import { Auth } from "./pages/Auth";
import { Landing } from "./pages/Landing";
import { Privacy } from "./pages/Privacy";
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
  else page = <Landing session={session} />;

  return (
    <MotionConfig reducedMotion="user">
    <div className="page">
      <header className="top">
        <Link to="/" go={go} className="brand">
          <Mark size={38} />
          <span className="wordmark">
            <b>RED</b>LEVEL
          </span>
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
        <span>Red Level para Windows 10 y 11</span>
        <Link to="/privacidad" go={go}>
          Privacidad
        </Link>
      </footer>
    </div>
    </MotionConfig>
  );
}
