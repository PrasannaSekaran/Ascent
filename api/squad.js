// Vercel Serverless Function — squad progress sync.
// Storage: Upstash Redis (Vercel Marketplace). Uses the REST API directly, so no npm deps.
// Env vars (added automatically when you connect the store to the project):
//   KV_REST_API_URL / KV_REST_API_TOKEN   or   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN

const MAX_BYTES = 256 * 1024; // per learner blob
const CODE_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function creds() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(c, command) {
  const r = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).result;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const c = creds();
  if (!c) return res.status(501).json({ error: "storage-not-configured" });

  const code = String(req.query.code || "");
  if (!CODE_RE.test(code)) return res.status(400).json({ error: "invalid-code" });
  const key = (id) => `ascent:squad:${code}:${id}`;

  try {
    if (req.method === "GET") {
      const [a, b] = await redis(c, ["MGET", key("a"), key("b")]);
      return res.status(200).json({ a: a ? JSON.parse(a) : null, b: b ? JSON.parse(b) : null });
    }

    if (req.method === "PUT") {
      const learner = String(req.query.learner || "");
      if (learner !== "a" && learner !== "b") return res.status(400).json({ error: "invalid-learner" });
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "invalid-body" });
      const json = JSON.stringify(body);
      if (json.length > MAX_BYTES) return res.status(413).json({ error: "too-large" });
      // keep squads for a year after last activity
      await redis(c, ["SET", key(learner), json, "EX", 60 * 60 * 24 * 365]);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "method-not-allowed" });
  } catch (e) {
    return res.status(502).json({ error: "storage-error" });
  }
}
