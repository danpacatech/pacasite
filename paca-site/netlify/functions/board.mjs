import { getStore } from "@netlify/blobs";

const j = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clean = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

export default async (req) => {
  const expected = process.env.BOARD_PASSWORD || "";
  if (!expected || (req.headers.get("x-board-key") || "") !== expected) {
    return j({ error: "unauthorized" }, 401);
  }

  let store;
  try { store = getStore("paca-board"); }
  catch (e) { return j({ error: "storage unavailable" }, 500); }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "threads";
  const qp = (k) => url.searchParams.get(k) || "";
  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch (e) {} }
  const get = async (k, d) => { const v = await store.get(k, { type: "json" }); return v == null ? d : v; };

  try {
    if (action === "threads") {
      const boardId = clean(qp("boardId"), 80);
      const threads = (await get("threads", []))
        .filter((t) => t.boardId === boardId)
        .map((t) => ({ ...t, archived: !!t.archived }))
        .sort((a, b) => (b.lastTs || b.ts).localeCompare(a.lastTs || a.ts));
      return j({ threads });
    }

    if (action === "createThread") {
      const boardId = clean(body.boardId, 80);
      const title = clean(body.title, 120);
      const name = clean(body.name, 40) || "anonymous";
      const message = clean(body.message, 4000);
      if (!boardId || !title || !message) return j({ error: "missing fields" }, 400);
      const id = uid(), ts = new Date().toISOString();
      await store.setJSON("thread:" + id, { id, boardId, title, archived: false, posts: [{ name, message, ts }] });
      const threads = await get("threads", []);
      threads.push({ id, boardId, title, author: name, ts, lastTs: ts, replyCount: 0, archived: false });
      await store.setJSON("threads", threads);
      return j({ id });
    }

    if (action === "thread") {
      const t = await get("thread:" + clean(qp("id"), 40), null);
      if (!t) return j({ error: "not found" }, 404);
      t.archived = !!t.archived;
      return j({ thread: t });
    }

    if (action === "reply") {
      const id = clean(body.id, 40);
      const name = clean(body.name, 40) || "anonymous";
      const message = clean(body.message, 4000);
      if (!id || !message) return j({ error: "missing fields" }, 400);
      const t = await get("thread:" + id, null);
      if (!t) return j({ error: "not found" }, 404);
      if (t.archived) return j({ error: "topic is archived (read only)" }, 403);
      const ts = new Date().toISOString();
      t.posts.push({ name, message, ts });
      t.posts = t.posts.slice(-1000);
      await store.setJSON("thread:" + id, t);
      const threads = await get("threads", []);
      const idx = threads.find((x) => x.id === id);
      if (idx) { idx.lastTs = ts; idx.replyCount = (idx.replyCount || 0) + 1; await store.setJSON("threads", threads); }
      return j({ thread: t });
    }

    if (action === "archiveThread") {
      const id = clean(body.id, 40);
      const archived = !!body.archived;
      const t = await get("thread:" + id, null);
      if (!t) return j({ error: "not found" }, 404);
      t.archived = archived;
      await store.setJSON("thread:" + id, t);
      const threads = await get("threads", []);
      const idx = threads.find((x) => x.id === id);
      if (idx) { idx.archived = archived; await store.setJSON("threads", threads); }
      return j({ thread: t });
    }

    return j({ error: "unknown action" }, 400);
  } catch (e) {
    return j({ error: "server error" }, 500);
  }
};
