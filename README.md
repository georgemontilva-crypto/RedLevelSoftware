# Red Level

Tu biblioteca de juegos de PC a pantalla completa. Red Level reúne los juegos de Steam, de Epic y los instalados en el equipo en una sola interfaz oscura, con las horas jugadas y los logros de cada uno, y deja Windows fuera de la vista mientras juegas.

## Qué hace

- **Biblioteca por tienda.** Detecta solo los juegos de Steam y Epic. Los demás se añaden eligiendo su ejecutable.
- **Horas y logros.** En Steam los lee de los archivos del propio Steam: no pide clave ni perfil público. Epic no comparte horas ni logros con otras apps, así que las horas de Epic y de los juegos locales las cuenta Red Level mientras está abierto.
- **Sin escritorio.** Pantalla completa, barra de tareas oculta, notificaciones silenciadas y teclas de Windows anuladas (tecla Windows, Alt+Tab, Alt+F4, Ctrl+Esc).
- **Segundo monitor.** Tiene su propia barra de Red Level: añades los programas de tu PC que quieras tener a la vista y cambias entre ellos; también se puede apagar.
- **Perfil.** Toma el nombre de la cuenta de Windows y admite foto.
- **Wifi.** Ver redes, conectar y desconectar sin salir.

Salida de emergencia: **Ctrl + Alt + Mayús + Q** cierra Red Level y devuelve Windows a la normalidad. Ctrl+Alt+Supr sigue funcionando siempre: ningún programa puede bloquearlo.

## Instalar

Descarga el instalador de la última versión en [Releases](../../releases/latest). Windows 10 u 11 de 64 bits.

El instalador todavía no está firmado: Windows mostrará "Windows protegió su PC". Pulsa **Más información** y luego **Ejecutar de todas formas**.

## Cómo está hecho

| Carpeta | Contenido |
| --- | --- |
| `src/` | Interfaz (React + TypeScript + Vite). |
| `crates/core/` | Núcleo en Rust: Steam, Epic, horas, logros, wifi y controles de Windows. Tiene pruebas propias. |
| `src-tauri/` | La ventana (Tauri 2) y los comandos que conectan interfaz y núcleo. |
| `web/` | Web con registro, cuenta, descarga y panel de usuarios; es la API del programa. Ver `web/README.md`. |
| `.github/workflows/build.yml` | Compila el instalador en Windows, lo prueba y lo publica. |
| `.github/workflows/web.yml` | Compila la web y prueba su API contra MySQL. |

Cada subida a `main` ejecuta las pruebas del núcleo, compila, abre el programa en una máquina Windows con una biblioteca de prueba y, si todo pasa, publica el instalador.

### Para desarrollar

Hace falta Node.js 22 y Rust.

```powershell
npm install
npm run tauri dev -- -- --ventana --sin-bloqueo
```

`--ventana` lo abre en una ventana normal y `--sin-bloqueo` no toca teclas, barra de tareas ni notificaciones. `npm run dev` abre solo la interfaz en el navegador con juegos de muestra.

Para ver qué lee Red Level de las bibliotecas del equipo sin abrir la app:

```powershell
cargo run -p redlevel-core --example inspect
```
