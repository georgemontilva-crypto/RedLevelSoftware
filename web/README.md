# Web de Red Level

Registro, inicio de sesión, descarga del instalador y panel de usuarios. Es también la API con la que el programa de Windows inicia sesión y envía sus datos.

- **Interfaz:** React + Vite (`src/`).
- **Servidor:** Express + Drizzle + MySQL (`server/`). Sirve la interfaz ya compilada.
- **Sin migraciones a mano:** las tablas se crean solas al arrancar.

## Desplegar en Railway

1. En Railway: **New Project → Deploy from GitHub repo →** `RedLevelSoftware`.
2. En el proyecto: **New → Database → Add MySQL**.
3. En el servicio web: **Variables →** añade:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` |
   | `ADMIN_EMAILS` | Tu correo (el que usarás para registrarte). Varios, separados por coma. |
   | `CONTACT_EMAIL` | Correo de contacto para las páginas de soporte y privacidad. |
   | `COMMUNITY_URL` | Opcional. Enlace `https://` a tu comunidad; muestra el botón «Unirme a la comunidad». |
   | `GITHUB_TOKEN` | Opcional. Token de GitHub de solo lectura; evita que GitHub limite las consultas de versiones. |
   | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Opcionales, van juntas. Con las cuatro se activa el **guardado en la nube** de partidas en Cloudflare R2. Sin ellas queda apagado. |
   | `CLOUD_SAVE_MAX_MB`, `CLOUD_SAVE_TOTAL_MB` | Opcionales. Tamaño máximo de la copia de un juego (200) y espacio total por cuenta (1024), en MB. |
   | `RAWG_API_KEY` | Opcional. Clave gratuita de rawg.io: con ella los próximos lanzamientos incluyen consolas y fecha exacta. Sin ella salen de la tienda de Steam. |
   | `DB_POOL` | Opcional. Conexiones simultáneas con MySQL (20). Súbelo solo si el plan de la base de datos admite más. |
   | `MEDIA_MAX_MB` | Opcional. Peso máximo de un archivo subido desde el panel (vídeos e imágenes de misiones y banners), en MB. Por defecto 2048. Necesita las variables `R2_*`. |
   | `NEWS_FEEDS` | Opcional. Canales RSS de noticias de videojuegos, separados por comas, para la sección Novedades. Sin ella se usan medios en español y, si no responden, dos en inglés. |
   | `APP_ORIGINS` | Opcional. Orígenes extra, separados por comas, que pueden llamar a la API con token (el programa de Windows ya está permitido). |

4. **Settings → Networking → Generate Domain** (o conecta tu dominio).

Railway construye la web con el `Dockerfile` del repo (Node 22), sin configurar nada más. Funciona igual con el **Root Directory** vacío o puesto en `web`.

Después regístrate en la web con el correo que pusiste en `ADMIN_EMAILS`: verás el enlace **Usuarios** arriba, con la lista, los totales y la descarga en CSV.

## Páginas

| Ruta | Qué es |
| --- | --- |
| `/` | Portada con la descarga. |
| `/registro`, `/entrar` | Crear cuenta e iniciar sesión (correo y contraseña). |
| `/cuenta` | Descargar el instalador, cambiar el nombre, permiso de biblioteca, cerrar sesión y eliminar la cuenta. |
| `/privacidad` | Qué datos se guardan y para qué. |
| `/admin` | Usuarios registrados. Solo para los correos de `ADMIN_EMAILS`. |

## API

| Método y ruta | Uso |
| --- | --- |
| `POST /api/auth/register` | `{ name, email, password, consentLibrary?, client?, device? }` |
| `POST /api/auth/login` | `{ email, password, client?, device? }` |
| `POST /api/auth/logout` | Cierra la sesión actual. |
| `GET /api/me` · `PATCH /api/me` · `DELETE /api/me` | Ver, cambiar (`name`, `consentLibrary`) o eliminar la cuenta. |
| `GET /api/release` | Última versión publicada del instalador. |
| `POST /api/download` | Con sesión: devuelve el enlace del instalador y anota la descarga. |
| `POST /api/app/sync` | El programa, al abrirse: `{ appVersion, games? }`. La biblioteca solo se guarda si el usuario lo permitió. |
| `GET /api/admin/users` · `/api/admin/users.csv` · `/api/admin/users/:id/games` | Panel de usuarios. |

La web usa una cookie de sesión. El programa envía `client: "app"` al entrar, recibe un `token` y lo manda en `Authorization: Bearer …`.

## En tu PC

Hace falta Node.js 22 y un MySQL.

```powershell
cd web
npm install
copy .env.example .env
```

Edita `.env` con tu conexión a MySQL y luego, en dos terminales:

```powershell
npm run dev:server
```

```powershell
npm run dev
```

La web queda en http://localhost:5173.

Para probar la API contra un servidor en marcha:

```powershell
npm test
```
