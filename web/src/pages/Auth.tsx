import { useState, type FormEvent } from "react";
import { api, errorText } from "../api";
import { Link, type Session } from "../App";
import artLogin from "../assets/arte-entrar.jpg";
import artRegister from "../assets/arte-registro.jpg";

export function Auth({ mode, session }: { mode: "register" | "login"; session: Session }) {
  const register = mode === "register";
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = register ? await api.register(`${name} ${surname}`.trim(), email, password, consent) : await api.login(email, password);
      session.setUser(user);
      session.go("/cuenta");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="art">
        <img src={register ? artRegister : artLogin} alt="" />
      </div>
      <form className="auth-form" onSubmit={submit}>
        <h1>{register ? "Regístrate" : "Inicia sesión"}</h1>
        <p className="lead">{register ? "Crea tu cuenta para descargar Red Level y entrar en el programa." : "Ingresa tus datos y accede a tu cuenta."}</p>

        {register && (
          <div className="two">
            <label>
              Nombre
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required minLength={2} maxLength={40} />
            </label>
            <label>
              Apellido
              <input value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="family-name" maxLength={40} />
            </label>
          </div>
        )}
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 8 : 1} />
          {register && <small>Debe tener al menos 8 caracteres.</small>}
        </label>

        {register && (
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              Quiero compartir mi biblioteca y mis horas de juego. Nos sirve para ver qué juegos se juegan más y mejorar Red Level para ellos. Es opcional y puedes cambiarlo cuando quieras.{" "}
              <Link to="/privacidad" go={session.go}>
                Qué datos guardamos
              </Link>
            </span>
          </label>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button submit" disabled={busy}>
          {busy ? "Un momento…" : register ? "Crear" : "Entrar"}
        </button>
        <p className="fine center">
          {register ? "¿Ya tienes una cuenta? " : "¿Aún no tienes cuenta? "}
          <Link to={register ? "/entrar" : "/registro"} go={session.go}>
            {register ? "Inicia sesión" : "Regístrate"}
          </Link>
        </p>
      </form>
    </main>
  );
}
