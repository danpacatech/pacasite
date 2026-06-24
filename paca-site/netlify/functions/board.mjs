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
  const action = url.searchParams.get("action") || "boards";
  const qp = (k) => url.searchParams.get(k) || "";
  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch (e) {} }
  const get = async (k, d) => { const v = await store.get(k, { type: "json" }); return v == null ? d : v; };

  try {
    if (action === "boards") {
      return j({ boards: await get("boards", []) });
    }

    if (action === "createBoard") {
      const name = clean(body.name, 60);
      if (!name) return j({ error: "name required" }, 400);
      const boards = await get("boards", []);
      boards.push({ id: uid(), name, ts: new Date().toISOString() });
      await store.setJSON("boards", boards);
      return j({ boards });
    }

    if (action === "deleteBoard") {
      const id = clean(body.id, 40);
      let boards = await get("boards", []);
      boards = boards.filter((b) => b.id !== id);
      await store.setJSON("boards", boards);
      let threads = await get("threads", []);
      const removed = threads.filter((t) => t.boardId === id).map((t) => t.id);
      threads = threads.filter((t) => t.boardId !== id);
      await store.setJSON("threads", threads);
      for (const tid of removed) { try { await store.delete("thread:" + tid); } catch (e) {} }
      return j({ boards });
    }

    if (action === "threads") {
      const boardId = clean(qp("boardId"), 40);
      const threads = (await get("threads", []))
        .filter((t) => t.boardId === boardId)
        .sort((a, b) => (b.lastTs || b.ts).localeCompare(a.lastTs || a.ts));
      return j({ threads });
    }

    if (action === "createThread") {
      const boardId = clean(body.boardId, 40);
      const title = clean(body.title, 120);
      const name = clean(body.name, 40) || "anonymous";
      const message = clean(body.message, 4000);
      if (!boardId || !title || !message) return j({ error: "missing fields" }, 400);
      const id = uid(), ts = new Date().toISOString();
      await store.setJSON("thread:" + id, { id, boardId, title, posts: [{ name, message, ts }] });
      const threads = await get("threads", []);
      threads.push({ id, boardId, title, author: name, ts, lastTs: ts, replyCount: 0 });
      await store.setJSON("threads", threads);
      return j({ id });
    }

    if (action === "thread") {
      const t = await get("thread:" + clean(qp("id"), 40), null);
      return t ? j({ thread: t }) : j({ error: "not found" }, 404);
    }

    if (action === "reply") {
      const id = clean(body.id, 40);
      const name = clean(body.name, 40) || "anonymous";
      const message = clean(body.message, 4000);
      if (!id || !message) return j({ error: "missing fields" }, 400);
      const t = await get("thread:" + id, null);
      if (!t) return j({ error: "not found" }, 404);
      const ts = new Date().toISOString();
      t.posts.push({ name, message, ts });
      t.posts = t.posts.slice(-1000);
      await store.setJSON("thread:" + id, t);
      const threads = await get("threads", []);
      const idx = threads.find((x) => x.id === id);
      if (idx) { idx.lastTs = ts; idx.replyCount = (idx.replyCount || 0) + 1; await store.setJSON("threads", threads); }
      return j({ thread: t });
    }

    return j({ error: "unknown action" }, 400);
  } catch (e) {
    return j({ error: "server error" }, 500);
  }
};
