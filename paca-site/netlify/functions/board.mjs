import { getStore } from "@netlify/blobs";

const KEY = "posts";

export default async (req) => {
  const expected = process.env.BOARD_PASSWORD || "";
  const given = req.headers.get("x-board-key") || "";
  if (!expected || given !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  let store;
  try {
    store = getStore("paca-board");
  } catch (e) {
    return json({ error: "storage unavailable" }, 500);
  }

  try {
    if (req.method === "GET") {
      const posts = (await store.get(KEY, { type: "json" })) || [];
      return json({ posts });
    }

    if (req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch (e) {}
      const name = String(body.name || "").trim().slice(0, 40) || "anonymous";
      const message = String(body.message || "").trim().slice(0, 2000);
      if (!message) return json({ error: "empty message" }, 400);
      const posts = (await store.get(KEY, { type: "json" })) || [];
      posts.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name, message, ts: new Date().toISOString()
      });
      const trimmed = posts.slice(-500);
      await store.setJSON(KEY, trimmed);
      return json({ posts: trimmed });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    return json({ error: "server error" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
