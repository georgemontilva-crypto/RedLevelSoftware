import { useEffect, useState } from "react";
import { api } from "../api";

export function Privacy() {
  const [contact, setContact] = useState<string | null>(null);
  useEffect(() => {
    api
      .config()
      .then(({ contactEmail }) => setContact(contactEmail))
      .catch(() => {});
  }, []);

  return (
    <main className="narrow prose">
      <h1>Privacidad</h1>
      <p className="lead">Qué guarda Red Level de ti, para qué y cómo borrarlo.</p>

      <h2>Lo que guardamos siempre</h2>
      <ul>
        <li>Tu nombre y tu correo, para crear tu cuenta y que puedas entrar en el programa.</li>
        <li>Tu contraseña, cifrada de forma que ni nosotros podemos leerla.</li>
        <li>Cuándo te registraste, cuándo abriste Red Level por última vez, qué versión usas y cuántas veces descargaste el instalador.</li>
      </ul>

      <h2>Lo que guardamos solo si tú lo activas</h2>
      <ul>
        <li>Tu biblioteca: qué juegos tienes en Red Level, de qué tienda son, cuántas horas llevas en cada uno, cuándo jugaste por última vez y cuántos logros tienes.</li>
      </ul>
      <p>Lo decides al registrarte y lo cambias cuando quieras desde tu cuenta. Si lo desactivas, borramos la biblioteca que ya teníamos guardada.</p>

      <h2>Estadísticas de esta web</h2>
      <p>Contamos cuántas visitas recibe cada página, desde qué sitio llegan y cuántas veces se pulsa «Descargar». Son solo cifras: no usamos cookies para ello ni guardamos tu dirección IP, así que no sabemos quién eres.</p>

      <h2>Mensajes que nos envías</h2>
      <p>Si escribes por el formulario de soporte o pides una cotización, guardamos tu nombre, tu correo y tu mensaje para poder responderte.</p>

      <h2>Lo que no guardamos</h2>
      <ul>
        <li>Tus contraseñas de Steam, Epic u otras tiendas: Red Level nunca te las pide.</li>
        <li>Lo que escribes con el teclado. Red Level vigila unas pocas teclas (como la tecla Windows) solo para anularlas mientras está abierto, y no registra nada.</li>
        <li>Tus archivos, tu ubicación o tu navegación.</li>
      </ul>

      <h2>Para qué lo usamos</h2>
      <p>Tu nombre y tu correo, para que tu cuenta funcione. Los datos de uso, para saber cuánta gente usa Red Level y con qué versiones.</p>
      <p>Tu biblioteca, si la compartes, para ver qué juegos se juegan más y ofrecer una mejor experiencia en esos juegos. No vendemos tus datos ni los compartimos con anunciantes.</p>

      <h2>Cómo borrarlo todo</h2>
      <p>En tu cuenta, «Eliminar mi cuenta» borra al instante tu cuenta, tus sesiones y tu biblioteca guardada.</p>

      {contact && (
        <>
          <h2>Contacto</h2>
          <p>
            Para cualquier duda sobre tus datos, escribe a <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        </>
      )}
    </main>
  );
}
