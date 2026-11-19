/// Qué trajo cada versión, en una línea. Se muestra en la página de descargas.
export const notes: Record<string, string[]> = {
  "0.21.0": [
    "Pantalla principal reorganizada: las noticias arriba en grande, debajo «Mis juegos» y la barra de «Seguir jugando»; a la derecha tu wallet, los próximos lanzamientos y el juego elegido con su botón de jugar; al borde, la tira de amigos.",
    "Más medios de noticias en español.",
  ],
  "0.20.0": [
    "App web: chat con tus amigos (código de amigo, solicitudes y conversación en vivo con quien esté en el programa o en la app).",
    "App web: desde Mi PC también se puede desinstalar un juego del ordenador.",
    "App web: sección propia de Noticias y Lanzamientos.",
  ],
  "0.19.0": [
    "Novedades: las últimas noticias de videojuegos y los próximos lanzamientos con su fecha, en el programa (barra lateral) y en el Inicio de la app web.",
    "Corregido: con la interfaz Cristal, la barra lateral y el logo se montaban encima de la biblioteca.",
  ],
  "0.18.0": [
    "Pantalla principal nueva, en tres zonas: a la izquierda los accesos con su nombre (Tienda, Amigos, Pantallas, Wifi, Discos, Ajustes, Minimizar y Apagar); en el centro tu biblioteca en su propio marco; a la derecha tu wallet, tus amigos, el juego elegido y «Seguir jugando».",
  ],
  "0.17.1": [
    "La web, con tu cuenta, se usa como una app: Inicio con tu tarjeta de RLC y tus juegos, Tienda, Mi PC, Wallet y Perfil, con la barra de secciones abajo en el teléfono.",
  ],
  "0.17.0": [
    "Mi PC desde el teléfono: entra en la web con tu cuenta y verás los juegos de tu ordenador; puedes abrirlos y cerrarlos desde ahí.",
    "Red Level sigue atento en segundo plano: los mensajes, los avisos y las órdenes del teléfono llegan aunque esté minimizado o haya un juego delante.",
  ],
  "0.16.1": [
    "Segundo monitor: la app que no cabe en su cuadro toma la forma del cuadro, así su miniatura lo llena en vez de quedar pequeña en el centro.",
  ],
  "0.16.0": [
    "Segundo monitor: las apps que no caben en su cuadro (Spotify, Discord y muchas otras tienen un tamaño mínimo) se ven como miniatura en vivo; al tocarla se abren en grande.",
    "Las versiones nuevas llegan con Red Level abierto: se comprueba cada cinco minutos y se avisa en el momento.",
    "Avatares en Red Level Store: la galería se actualiza sola y se elige con un toque.",
    "La interfaz Cristal viene incluida.",
  ],
  "0.15.0": [
    "Segundo monitor: las apps que arrancan con un lanzador o que ya estaban abiertas ahora se reconocen y se encajan en su cuadro; al cambiar la división se recolocan todas.",
    "Segundo monitor: la interfaz de Red Level ocupa la pantalla entera, sin bordes ni esquinas del escritorio, y ya no tapa las apps al tocarla.",
    "Mi cuenta: bajo tu nombre ves tu saldo de RLC; al tocarlo se abre tu perfil con el wallet y el historial.",
    "Los ajustes vuelven al panel lateral, ordenados por categorías.",
    "Sin barras de desplazamiento a la vista en la tienda ni en los paneles.",
  ],
  "0.14.0": [
    "Wallet de RLC: tu saldo y tus compras van con tu cuenta, igual en el programa y en la web.",
    "Red Level Store ya vende: los temas e interfaces de la tienda se compran con RLC y quedan tuyos para siempre.",
    "La web se puede instalar como app en el teléfono y en el PC.",
  ],
  "0.13.0": [
    "Interfaces: además del color, ahora eliges el estilo de todo Red Level. Llega Glitch, con esquinas cortadas, líneas de barrido e interferencias, como la web.",
    "Guardado en la nube: elige la carpeta de partidas de un juego y Red Level sube una copia cada vez que lo cierras. Se restaura desde la ficha del juego, también en otro PC.",
    "Red Level sigue en marcha al minimizarlo: queda en la barra de tareas y en los iconos ocultos, junto al reloj, y vuelve con un clic.",
    "Abrir Red Level cuando ya estaba en marcha lo trae al frente en lugar de abrir otra copia.",
  ],
  "0.12.0": [
    "Red Level Store tiene su propia pantalla, con categorías y una miniatura de cómo queda cada tema.",
    "Los ajustes van ordenados por categorías: perfil, cuenta, biblioteca, sonido y avisos, modo consola y pantallas. Ahora se puede regular el volumen.",
    "Corregido: al minimizar Red Level y volver, o al cerrar un juego, el puntero podía quedarse invisible.",
  ],
  "0.11.0": ["Red Level se abre con tu cuenta. En tu perfil hay una galería de avatares que va creciendo, y tus amigos ven el que elijas."],
  "0.10.0": ["Amigos en Red Level: añade a alguien con su código o su correo, mira quién está conectado y a qué juega, chatea e invita a jugar. Los avisos salen flotando sobre el juego."],
  "0.9.0": [
    "Las apps del segundo monitor se encajan solas en su cuadro, aunque se abran maximizadas o tarden en mostrar su ventana, y se cierran de verdad desde la barra.",
    "Biblioteca en fila, en cuadrícula o en lista; juegos ocultos y bibliotecas propias con el nombre que quieras.",
    "Logros de Red Level por tiempo jugado, con aviso flotante sobre el juego, y desinstalar desde la ficha.",
    "El espacio en disco se despliega desde su icono, y tu perfil muestra a qué estás jugando.",
  ],
  "0.8.1": ["Las portadas automáticas ya no confunden un juego con otro de nombre parecido."],
  "0.8.0": ["Los juegos instalados fuera de las tiendas se añaden solos: Red Level los busca en tus carpetas de juegos y les pone su portada."],
  "0.7.0": [
    "Para el segundo monitor eliges entre los programas instalados en tu PC, con su icono.",
    "Manejo con flechas o WASD, Tab para cambiar de biblioteca y mandos de Xbox, PS4 y PS5.",
    "Sonidos de interfaz, espacio libre de cada disco y botón para minimizar. El puntero ya no desaparece sobre el segundo monitor apagado.",
  ],
  "0.6.0": ["Red Level Store llega al programa: tres temas incluidos para cambiar los colores de la interfaz y tres temas de tienda para probar."],
  "0.5.0": ["El segundo monitor se divide en cuadros, de 1 a 12. Al tocar un cuadro, esa app se abre en grande para manejarla."],
  "0.4.0": ["El segundo monitor abre las apps que tú añadas: elige cualquier programa de tu PC desde su barra."],
  "0.3.0": ["Red Level avisa cuando hay una versión nueva y la instala por ti, sin perder tu perfil ni tus horas."],
  "0.2.0": ["El segundo monitor tiene su propia barra para abrir apps y cambiar entre ellas."],
  "0.1.1": ["El instalador lleva el icono y la imagen de Red Level."],
  "0.1.0": ["Primera versión: biblioteca de Steam, Epic y juegos locales, con horas, logros y modo consola a pantalla completa."],
};
