// Base de datos: tablas, conexión y creación automática al arrancar.
// Las fechas se guardan como segundos Unix (enteros) para no depender de zonas horarias.

import { drizzle } from "drizzle-orm/mysql2";
import { boolean, int, mysqlTable, uniqueIndex, varchar, index } from "drizzle-orm/mysql-core";
import mysql from "mysql2/promise";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 190 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: int("created_at").notNull(),
  lastSeenAt: int("last_seen_at"),
  appVersion: varchar("app_version", { length: 20 }),
  consentLibrary: boolean("consent_library").notNull().default(false),
  consentAt: int("consent_at"),
});

export const sessions = mysqlTable(
  "sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    kind: varchar("kind", { length: 8 }).notNull(),
    device: varchar("device", { length: 120 }),
    createdAt: int("created_at").notNull(),
    lastUsedAt: int("last_used_at").notNull(),
    expiresAt: int("expires_at").notNull(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const libraryGames = mysqlTable(
  "library_games",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    gameId: varchar("game_id", { length: 190 }).notNull(),
    store: varchar("store", { length: 12 }).notNull(),
    title: varchar("title", { length: 190 }).notNull(),
    minutes: int("minutes").notNull().default(0),
    lastPlayed: int("last_played"),
    achUnlocked: int("ach_unlocked"),
    achTotal: int("ach_total"),
    updatedAt: int("updated_at").notNull(),
  },
  (t) => [uniqueIndex("library_user_game").on(t.userId, t.gameId)],
);

export const downloads = mysqlTable(
  "downloads",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    version: varchar("version", { length: 20 }).notNull(),
    createdAt: int("created_at").notNull(),
  },
  (t) => [index("downloads_user").on(t.userId)],
);

// Las mismas tablas en SQL. Se ejecutan al arrancar: no hay que correr ninguna migración a mano.
const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at INT NOT NULL,
    last_seen_at INT NULL,
    app_version VARCHAR(20) NULL,
    consent_library BOOLEAN NOT NULL DEFAULT FALSE,
    consent_at INT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    kind VARCHAR(8) NOT NULL,
    device VARCHAR(120) NULL,
    created_at INT NOT NULL,
    last_used_at INT NOT NULL,
    expires_at INT NOT NULL,
    INDEX sessions_user (user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS library_games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    game_id VARCHAR(190) NOT NULL,
    store VARCHAR(12) NOT NULL,
    title VARCHAR(190) NOT NULL,
    minutes INT NOT NULL DEFAULT 0,
    last_played INT NULL,
    ach_unlocked INT NULL,
    ach_total INT NULL,
    updated_at INT NOT NULL,
    UNIQUE INDEX library_user_game (user_id, game_id)
  )`,
  `CREATE TABLE IF NOT EXISTS downloads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    version VARCHAR(20) NOT NULL,
    created_at INT NOT NULL,
    INDEX downloads_user (user_id)
  )`,
  // Contadores de la web por día: visitas y clics. Solo cifras, sin nada que identifique a nadie.
  `CREATE TABLE IF NOT EXISTS metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    day INT NOT NULL,
    kind VARCHAR(12) NOT NULL,
    label VARCHAR(60) NOT NULL,
    source VARCHAR(60) NOT NULL,
    total INT NOT NULL DEFAULT 0,
    UNIQUE INDEX metrics_key (day, kind, label, source)
  )`,
  // Mensajes de soporte y solicitudes de cotización para negocios.
  `CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(12) NOT NULL,
    name VARCHAR(80) NOT NULL,
    email VARCHAR(190) NOT NULL,
    business VARCHAR(120) NULL,
    seats INT NULL,
    body TEXT NOT NULL,
    created_at INT NOT NULL,
    INDEX messages_created (created_at)
  )`,
  // Amistades: quien la pide (user_a) y quien la recibe (user_b). Pasa de 'pending' a 'accepted'.
  `CREATE TABLE IF NOT EXISTS friendships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_a INT NOT NULL,
    user_b INT NOT NULL,
    status VARCHAR(10) NOT NULL,
    created_at INT NOT NULL,
    UNIQUE INDEX friendships_pair (user_a, user_b),
    INDEX friendships_b (user_b)
  )`,
  // Mensajes entre amigos. kind: 'text' o 'invite' (invitación a jugar, con el juego en game).
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_id INT NOT NULL,
    to_id INT NOT NULL,
    kind VARCHAR(8) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    game VARCHAR(190) NULL,
    created_at INT NOT NULL,
    INDEX chat_to (to_id, id),
    INDEX chat_from (from_id, id)
  )`,
  // Galería de avatares que sube el equipo de Red Level, y el que eligió cada usuario.
  `CREATE TABLE IF NOT EXISTS avatars (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    mime VARCHAR(20) NOT NULL,
    image MEDIUMBLOB NOT NULL,
    created_at INT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_avatar (
    user_id INT PRIMARY KEY,
    avatar_id INT NOT NULL
  )`,
  // Presencia: cuándo se vio por última vez a cada usuario en el programa y a qué jugaba.
  `CREATE TABLE IF NOT EXISTS presence (
    user_id INT PRIMARY KEY,
    online_at INT NOT NULL,
    playing VARCHAR(190) NULL
  )`,
  // Guardado en la nube: una copia de las partidas por usuario y juego. El archivo está en R2; aquí, su ficha.
  `CREATE TABLE IF NOT EXISTS cloud_saves (
    user_id INT NOT NULL,
    game_hash CHAR(32) NOT NULL,
    game_key VARCHAR(200) NOT NULL,
    name VARCHAR(120) NOT NULL,
    size BIGINT NOT NULL,
    updated_at INT NOT NULL,
    PRIMARY KEY (user_id, game_hash)
  )`,
  // Wallet: saldo en RLC de cada cuenta, sus movimientos y lo que ha comprado en la tienda.
  `CREATE TABLE IF NOT EXISTS wallets (
    user_id INT PRIMARY KEY,
    balance INT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS wallet_moves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount INT NOT NULL,
    kind VARCHAR(24) NOT NULL,
    note VARCHAR(160) NOT NULL,
    created_at INT NOT NULL,
    balance_after INT NOT NULL,
    INDEX wallet_moves_user (user_id)
  )`,
  // Mi PC desde el teléfono: los juegos que publica el programa y las órdenes de abrir o cerrar.
  `CREATE TABLE IF NOT EXISTS remote_pcs (
    user_id INT PRIMARY KEY,
    device VARCHAR(80) NOT NULL,
    games MEDIUMTEXT NOT NULL,
    enabled TINYINT NOT NULL DEFAULT 1,
    running_id VARCHAR(190) NULL,
    updated_at INT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS remote_commands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action VARCHAR(12) NOT NULL,
    game_id VARCHAR(190) NOT NULL,
    created_at INT NOT NULL,
    taken_at INT NULL,
    done_at INT NULL,
    result VARCHAR(160) NULL,
    INDEX remote_commands_user (user_id)
  )`,
  // Publicidad: banners que se enseñan en Novedades. La imagen va aquí mismo, como la de los avatares.
  `CREATE TABLE IF NOT EXISTS ads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    link VARCHAR(400) NOT NULL,
    mime VARCHAR(20) NOT NULL,
    image MEDIUMBLOB NOT NULL,
    active TINYINT NOT NULL,
    ends_at INT NULL,
    views INT NOT NULL,
    clicks INT NOT NULL,
    created_at INT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS owned_items (
    user_id INT NOT NULL,
    item_id VARCHAR(60) NOT NULL,
    acquired_at INT NOT NULL,
    PRIMARY KEY (user_id, item_id)
  )`,
];

const url = process.env.DATABASE_URL ?? process.env.MYSQL_URL;
if (!url) {
  console.error("Falta la variable DATABASE_URL con la conexión a MySQL.");
  process.exit(1);
}

// Conexiones abiertas con la base de datos a la vez. 20 da para miles de usuarios conectados, porque cada consulta
// dura milisegundos; se puede subir con DB_POOL si el plan de MySQL admite más.
export const pool = mysql.createPool({ uri: url, connectionLimit: Math.max(4, Number(process.env.DB_POOL) || 20), waitForConnections: true });
export const db = drizzle(pool);

/// Crea las tablas que falten. Si la base de datos aún no responde (pasa al desplegar, mientras
/// MySQL arranca), reintenta durante un minuto antes de rendirse.
export async function createTables(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      for (const statement of CREATE_TABLES) await pool.query(statement);
      return;
    } catch (error) {
      if (attempt >= 20) throw error;
      console.error(`La base de datos no responde todavía (intento ${attempt} de 20): ${(error as Error).message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export const now = () => Math.floor(Date.now() / 1000);
