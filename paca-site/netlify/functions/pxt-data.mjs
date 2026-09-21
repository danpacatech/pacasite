import { getStore } from "@netlify/blobs";

/* Shared store for the production expense tracker at /pxt/.
 *
 * Set PXT_PASSPHRASE in Netlify's environment variables to lock it down.
 * Leave it unset and anyone who finds the page can read and write. */

const STORE = "paca-production-expenses";
const KEY = "state";
const PASS = process.env.PXT_PASSPHRASE || "";

const blank = () => ({ shows: {}, expenses: {}, config: { people: [] }, version: 0 });

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });

export default async (req) => {
  /* Strong consistency matters here: this function reads the whole state,
   * edits one record and writes it back. On the default eventually
   * consistent read, two saves a few seconds apart could read stale data
   * and drop the first one. */
  const store = getStore({ name: STORE, consistency: "strong" });
  const url = new URL(req.url);

  if (PASS) {
    const given = req.headers.get("x-pxt-key") || url.searchParams.get("k") || "";
    if (given !== PASS) return json({ error: "locked" }, 401);
  }

  /* A receipt photo, served back to the page. */
  const receiptId = url.searchParams.get("receipt");
  if (receiptId) {
    if (!/^[a-z0-9]+$/i.test(receiptId)) return new Response("Bad id", { status: 400 });
    const bytes = await store.get("receipt-" + receiptId, { type: "arrayBuffer" });
    if (!bytes) return new Response("Not found", { status: 404 });
    return new Response(bytes, {
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=604800" }
    });
  }

  if (req.method === "GET") {
    const data = (await store.get(KEY, { type: "json" })) || blank();
    return json(data);
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body;
  try { body = await req.json(); }
  catch { return json({ error: "bad body" }, 400); }

  /* Receipt upload: kept out of the state document so it stays small. */
  if (body.op === "receipt") {
    if (!/^[a-z0-9]+$/i.test(body.id || "")) return json({ error: "bad id" }, 400);
    const bytes = Buffer.from(String(body.b64 || ""), "base64");
    if (!bytes.length || bytes.length > 6_000_000) return json({ error: "bad image" }, 400);
    await store.set("receipt-" + body.id, bytes);
    return json({ ok: true, id: body.id });
  }

  /* Everything else edits one record inside the state document, server side,
   * so two people saving at once cannot overwrite each other's rows. */
  const cur = (await store.get(KEY, { type: "json" })) || blank();
  cur.shows = cur.shows || {};
  cur.expenses = cur.expenses || {};
  cur.config = cur.config || { people: [] };

  const bucket = (kind) => (kind === "shows" ? cur.shows : kind === "expenses" ? cur.expenses : null);

  switch (body.op) {
    case "put": {
      const b = bucket(body.kind);
      if (!b || !body.id || typeof body.record !== "object") return json({ error: "bad put" }, 400);
      b[body.id] = body.record;
      break;
    }
    case "putMany": {
      const b = bucket(body.kind);
      if (!b || !body.records || typeof body.records !== "object") return json({ error: "bad putMany" }, 400);
      for (const [id, rec] of Object.entries(body.records)) b[id] = rec;
      break;
    }
    case "del": {
      const b = bucket(body.kind);
      if (!b || !body.id) return json({ error: "bad del" }, 400);
      delete b[body.id];
      break;
    }
    case "delShow": {
      if (!body.id) return json({ error: "bad delShow" }, 400);
      delete cur.shows[body.id];
      for (const [id, e] of Object.entries(cur.expenses)) {
        if (e && e.showId === body.id) delete cur.expenses[id];
      }
      break;
    }
    case "config": {
      if (typeof body.config !== "object") return json({ error: "bad config" }, 400);
      cur.config = body.config;
      break;
    }
    default:
      return json({ error: "unknown op" }, 400);
  }

  cur.version = (Number(cur.version) || 0) + 1;
  cur.updatedAt = Date.now();
  await store.setJSON(KEY, cur);
  return json(cur);
};
