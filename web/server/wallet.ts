// Wallet de la cuenta y compras en Red Level Store.
// La moneda es el RLC. El saldo, los movimientos y lo comprado van con la cuenta: valen igual
// en el programa y en la web. Todavía no se venden RLC: los reparte el equipo desde el panel.

import type { Express, Request } from "express";
import type { User } from "./auth";
import { now, pool } from "./db";
import { poke } from "./live";

type Row = Record<string, unknown>;
const rows = async (query: string, params: unknown[] = []) => ((await pool.query(query, params)) as unknown as [Row[]])[0];
const n = (value: unknown) => Number(value ?? 0);

/// Cuántos RLC equivalen a un dólar, como referencia para los precios.
export const RLC_PER_USD = 100;

export interface StoreItem {
  id: string;
  kind: "theme" | "look" | "motion";
  name: string;
  about: string;
  /// Precio en RLC.
  price: number;
}

/// Lo que se vende en la tienda. Los identificadores son los mismos que usa el programa.
export const catalog: StoreItem[] = [
  { id: "theme:neon-violeta", kind: "theme", name: "Neón violeta", about: "Luces de neón moradas.", price: 100 },
  { id: "theme:ambar", kind: "theme", name: "Ámbar", about: "Cálido, como una consola clásica.", price: 100 },
  { id: "theme:hielo", kind: "theme", name: "Hielo", about: "Cian frío y brillante.", price: 200 },
  { id: "motion:aurora", kind: "motion", name: "Aurora", about: "Luces grandes que se mueven lentas, como una aurora.", price: 150 },
  { id: "motion:rejilla", kind: "motion", name: "Rejilla", about: "Un suelo de líneas que avanza hacia ti, como un arcade de los 80.", price: 150 },
  { id: "motion:estrellas", kind: "motion", name: "Estrellas", about: "Un cielo de estrellas que titilan y se desplazan.", price: 200 },
];

async function walletOf(userId: number) {
  const [wallet] = await rows(`SELECT balance FROM wallets WHERE user_id = ?`, [userId]);
  const owned = (await rows(`SELECT item_id AS id FROM owned_items WHERE user_id = ? ORDER BY acquired_at`, [userId])).map((r) => String(r.id));
  const moves = (await rows(`SELECT amount, kind, note, created_at AS at, balance_after AS balance FROM wallet_moves WHERE user_id = ? ORDER BY id DESC LIMIT 30`, [userId])).map((r) => ({
    amount: n(r.amount),
    kind: String(r.kind),
    note: String(r.note),
    at: n(r.at),
    balance: n(r.balance),
  }));
  return { balance: n(wallet?.balance), owned, moves };
}

/// Suma (o resta) RLC a una cuenta y deja el movimiento anotado. Nunca deja el saldo por debajo de cero.
export async function move(userId: number, amount: number, kind: string, note: string): Promise<number | null> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0)`, [userId]);
    const [changed] = (await connection.query(`UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND balance + ? >= 0`, [amount, userId, amount])) as unknown as [{ affectedRows: number }];
    if (!changed.affectedRows) {
      await connection.rollback();
      return null;
    }
    const [[wallet]] = (await connection.query(`SELECT balance FROM wallets WHERE user_id = ?`, [userId])) as unknown as [Row[]];
    const balance = n(wallet.balance);
    await connection.query(`INSERT INTO wallet_moves (user_id, amount, kind, note, created_at, balance_after) VALUES (?, ?, ?, ?, ?, ?)`, [userId, amount, kind, note, now(), balance]);
    await connection.commit();
    return balance;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteWalletOf(userId: number) {
  await pool.query(`DELETE FROM wallets WHERE user_id = ?`, [userId]);
  await pool.query(`DELETE FROM wallet_moves WHERE user_id = ?`, [userId]);
  await pool.query(`DELETE FROM owned_items WHERE user_id = ?`, [userId]);
}

interface Deps {
  requireUser: (req: Request) => Promise<User>;
  requireAdmin: (req: Request) => Promise<User>;
  limit: (req: Request, max?: number, windowSeconds?: number) => void;
  problem: (status: number, message: string) => Error;
  text: (value: unknown, max: number) => string;
}

export function registerWallet(app: Express, { requireUser, requireAdmin, limit, problem, text }: Deps) {
  /// El catálogo es público: la web lo enseña también sin sesión.
  app.get("/api/store", (_req, res) => {
    res.json({ items: catalog, rlcPerUsd: RLC_PER_USD });
  });

  app.get("/api/wallet", async (req, res) => {
    const user = await requireUser(req);
    res.json(await walletOf(user.id));
  });

  /// Compra un artículo con RLC. Queda ligado a la cuenta para siempre.
  app.post("/api/store/buy", async (req, res) => {
    const user = await requireUser(req);
    limit(req, 20, 600);
    const item = catalog.find((i) => i.id === text(req.body?.item, 60));
    if (!item) throw problem(404, "Ese artículo no está en la tienda.");
    const [already] = await rows(`SELECT user_id FROM owned_items WHERE user_id = ? AND item_id = ?`, [user.id, item.id]);
    if (already) throw problem(409, "Ya tienes este artículo.");
    // Se apunta primero como tuyo: la clave única impide comprarlo dos veces aunque lleguen dos peticiones a la vez.
    try {
      await pool.query(`INSERT INTO owned_items (user_id, item_id, acquired_at) VALUES (?, ?, ?)`, [user.id, item.id, now()]);
    } catch {
      throw problem(409, "Ya tienes este artículo.");
    }
    const balance = await move(user.id, -item.price, "compra", item.name).catch(() => null);
    if (balance === null) {
      await pool.query(`DELETE FROM owned_items WHERE user_id = ? AND item_id = ?`, [user.id, item.id]);
      throw problem(402, "No tienes RLC suficientes para este artículo.");
    }
    // El saldo y lo comprado se ponen al día en el resto de ventanas de la cuenta (el programa, el teléfono).
    poke(user.id, "wallet");
    res.json(await walletOf(user.id));
  });

  /// El equipo da (o retira) RLC a una cuenta: regalos, premios y pruebas mientras no se venden.
  app.post("/api/admin/wallet", async (req, res) => {
    await requireAdmin(req);
    const email = text(req.body?.email, 190).toLowerCase();
    const amount = Math.trunc(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) throw problem(400, "Indica una cantidad de RLC distinta de cero.");
    const [found] = await rows(`SELECT id, name FROM users WHERE email = ?`, [email]);
    if (!found) throw problem(404, "No hay ninguna cuenta con ese correo.");
    const balance = await move(n(found.id), amount, amount > 0 ? "regalo" : "ajuste", text(req.body?.note, 160) || (amount > 0 ? "Regalo de Red Level" : "Ajuste de Red Level"));
    if (balance === null) throw problem(400, "Esa cuenta no tiene tantos RLC.");
    poke(n(found.id), "wallet");
    res.json({ name: String(found.name), balance });
  });
}
