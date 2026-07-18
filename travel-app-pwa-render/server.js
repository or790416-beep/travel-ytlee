const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns").promises;
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_SYNC_BODY_BYTES = 2 * 1024 * 1024;
const SYNC_TABLE = "trip_sync";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_SECRET_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  : null;
const syncRateLimits = new Map();
const previewCache = new Map();
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };

function isBlockedIp(address) {
  if (!net.isIP(address)) return true;
  if (address === "::" || address === "::1" || address.toLowerCase().startsWith("fe80:") || address.toLowerCase().startsWith("fc") || address.toLowerCase().startsWith("fd")) return true;
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isBlockedIp(mapped);
  if (net.isIPv6(address)) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}

async function resolvePublic(url) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("只允許 http/https URL");
  if (url.username || url.password) throw new Error("URL 不得包含帳號密碼");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("不允許本機網址");
  const records = net.isIP(hostname) ? [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }] : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isBlockedIp(record.address))) throw new Error("不允許私有或保留網路位址");
  return records[0];
}

async function fetchHtml(url, redirects = 0, deadline = Date.now() + 5000) {
  if (redirects > 3) throw new Error("重新導向次數超過上限");
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("取得網站預覽逾時");
  const resolved = await resolvePublic(url);
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.request({ protocol: url.protocol, hostname: resolved.address, family: resolved.family, port: url.port || undefined, path: `${url.pathname}${url.search}`, method: "GET", servername: url.hostname, headers: { Host: url.host, Accept: "text/html,application/xhtml+xml", "User-Agent": "TravelPreviewBot/1.0" }, timeout: remaining }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume();
        let next;
        try { next = new URL(response.headers.location, url); } catch { reject(new Error("無效的重新導向網址")); return; }
        fetchHtml(next, redirects + 1, deadline).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) { response.resume(); reject(new Error(`目標網站回傳 HTTP ${status}`)); return; }
      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) { response.resume(); reject(new Error("目標內容不是 HTML")); return; }
      let size = 0;
      const chunks = [];
      response.on("data", (chunk) => { size += chunk.length; if (size > MAX_HTML_BYTES) request.destroy(new Error("HTML 超過大小上限")); else chunks.push(chunk); });
      response.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8"), finalUrl: url.href }));
    });
    request.on("timeout", () => request.destroy(new Error("取得網站預覽逾時")));
    request.on("error", reject);
    request.end();
  });
}

function decode(value = "") {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();
}

function metaMap(html) {
  const result = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? "");
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content && !result[key]) result[key] = attrs.content;
  }
  return result;
}

function parsePreview(html, finalUrl) {
  const meta = metaMap(html);
  const title = meta["og:title"] || meta["twitter:title"] || decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = meta["og:description"] || meta["twitter:description"] || meta.description || "";
  const rawImage = meta["og:image:secure_url"] || meta["og:image"] || meta["twitter:image"] || "";
  let imageUrl = "";
  try { if (rawImage) { const parsed = new URL(rawImage, finalUrl); if (["http:", "https:"].includes(parsed.protocol)) imageUrl = parsed.href; } } catch {}
  return { title, description, siteName: meta["og:site_name"] || new URL(finalUrl).hostname.replace(/^www\./, ""), imageUrl, finalUrl };
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(payload));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

function validateSyncPayload(payload) {
  return Boolean(payload && payload.schemaVersion === 6 && Array.isArray(payload.trips));
}

function hashSyncSecret(secret) {
  return crypto.createHash("sha256").update(String(secret), "utf8").digest("hex");
}

function safeHashEqual(storedHash, suppliedHash) {
  if (!/^[0-9a-f]{64}$/i.test(storedHash || "") || !/^[0-9a-f]{64}$/i.test(suppliedHash || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(suppliedHash, "hex"));
}

function bearerSecret(request) {
  const match = String(request.headers.authorization || "").match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || "";
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; } catch { return false; }
}

function allowSyncRequest(request) {
  const now = Date.now();
  const ip = request.socket.remoteAddress || "unknown";
  const current = syncRateLimits.get(ip);
  if (!current || now - current.startedAt >= 60000) { syncRateLimits.set(ip, { startedAt: now, count: 1 }); return true; }
  current.count += 1;
  return current.count <= 60;
}

function readJsonBody(request, limit = MAX_SYNC_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { const error = new Error("body_too_large"); error.statusCode = 413; reject(error); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { const error = new Error("invalid_json"); error.statusCode = 400; reject(error); }
    });
    request.on("error", reject);
  });
}

function publicSyncRow(row) {
  return { payload: row.payload, revision: row.revision, updatedAt: row.updated_at };
}

async function authenticatedSyncRow(client, syncId, secret) {
  const { data, error } = await client.from(SYNC_TABLE).select("sync_id,secret_hash,payload,revision,updated_at").eq("sync_id", syncId).maybeSingle();
  if (error || !data || !safeHashEqual(data.secret_hash, hashSyncSecret(secret))) return null;
  return data;
}

async function handleSyncApi(request, response, requestUrl, client = supabase) {
  if (!sameOrigin(request)) { json(response, 403, { error: "forbidden" }); return; }
  if (!allowSyncRequest(request)) { json(response, 429, { error: "rate_limited" }); return; }
  if (request.method === "GET" && requestUrl.pathname === "/api/sync/status") { json(response, 200, { enabled: Boolean(client) }); return; }
  if (!client) { json(response, 503, { error: "sync_unavailable" }); return; }

  try {
    if (request.method === "POST" && requestUrl.pathname === "/api/sync/create") {
      const body = await readJsonBody(request);
      if (!validateSyncPayload(body.payload)) { json(response, 400, { error: "invalid_payload" }); return; }
      const syncId = crypto.randomUUID();
      const secretBytes = new Uint8Array(32);
      crypto.webcrypto.getRandomValues(secretBytes);
      const syncSecret = Buffer.from(secretBytes).toString("base64url");
      const { data, error } = await client.from(SYNC_TABLE).insert({ sync_id: syncId, secret_hash: hashSyncSecret(syncSecret), payload: body.payload, revision: 1 }).select("revision,updated_at").single();
      if (error || !data) throw new Error("database_create_failed");
      json(response, 201, { syncId, syncSecret, revision: data.revision, updatedAt: data.updated_at });
      return;
    }

    const match = requestUrl.pathname.match(/^\/api\/sync\/([^/]+)$/);
    if (!match || !["GET", "PUT"].includes(request.method)) { json(response, 404, { error: "not_found" }); return; }
    const syncId = match[1];
    if (!isUuid(syncId)) { json(response, 404, { error: "not_found" }); return; }
    const row = await authenticatedSyncRow(client, syncId, bearerSecret(request));
    if (!row) { json(response, 404, { error: "not_found" }); return; }
    if (request.method === "GET") { json(response, 200, publicSyncRow(row)); return; }

    const body = await readJsonBody(request);
    if (!validateSyncPayload(body.payload) || !Number.isInteger(body.baseRevision) || body.baseRevision < 1) { json(response, 400, { error: "invalid_payload" }); return; }
    const nextRevision = body.baseRevision + 1;
    const updatedAt = new Date().toISOString();
    const { data, error } = await client.from(SYNC_TABLE).update({ payload: body.payload, revision: nextRevision, updated_at: updatedAt }).eq("sync_id", syncId).eq("revision", body.baseRevision).select("revision,updated_at").maybeSingle();
    if (error) throw new Error("database_update_failed");
    if (data) { json(response, 200, { revision: data.revision, updatedAt: data.updated_at }); return; }
    const remote = await authenticatedSyncRow(client, syncId, bearerSecret(request));
    if (!remote) { json(response, 404, { error: "not_found" }); return; }
    json(response, 409, { error: "revision_conflict", remoteRevision: remote.revision, remotePayload: remote.payload, updatedAt: remote.updated_at });
  } catch (error) {
    json(response, error.statusCode || 500, { error: error.statusCode === 413 ? "body_too_large" : error.statusCode === 400 ? "invalid_json" : "sync_request_failed" });
  }
}

async function handlePreview(requestUrl, response) {
  const value = requestUrl.searchParams.get("url") || "";
  let target;
  try { target = new URL(value); } catch { json(response, 400, { error: "URL 格式不正確" }); return; }
  const key = target.href;
  if (previewCache.has(key)) { json(response, 200, previewCache.get(key)); return; }
  try { const fetched = await fetchHtml(target); const preview = parsePreview(fetched.html, fetched.finalUrl); previewCache.set(key, preview); json(response, 200, preview); }
  catch (error) { json(response, 400, { error: error.message || "無法取得網站預覽" }); }
}

function serveStatic(requestUrl, response, method) {
  let pathname;
  try { pathname = decodeURIComponent(requestUrl.pathname); } catch { response.writeHead(400).end(); return; }
  if (pathname === "/") pathname = "/index.html";
  const file = path.resolve(ROOT, `.${pathname}`);
  if (!file.startsWith(`${ROOT}${path.sep}`)) { response.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { response.writeHead(404).end("Not found"); return; }
    const extension = path.extname(file).toLowerCase();
    const headers = { "Content-Type": MIME[extension] || "application/octet-stream", "Content-Length": stat.size, "X-Content-Type-Options": "nosniff" };
    if (["/index.html", "/sw.js", "/manifest.webmanifest"].includes(pathname)) headers["Cache-Control"] = "no-cache";
    else headers["Cache-Control"] = "public, max-age=3600";
    if (pathname === "/sw.js") headers["Service-Worker-Allowed"] = "/";
    response.writeHead(200, headers);
    if (method === "HEAD") response.end(); else fs.createReadStream(file).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname.startsWith("/api/sync")) return handleSyncApi(request, response, requestUrl);
  if (request.method === "GET" && requestUrl.pathname === "/api/link-preview") return handlePreview(requestUrl, response);
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
  serveStatic(requestUrl, response, request.method);
});

if (require.main === module) server.listen(PORT, "0.0.0.0", () => console.log(`Travel SPA server: http://localhost:${PORT}`));

module.exports = { isBlockedIp, resolvePublic, metaMap, parsePreview, fetchHtml, isUuid, validateSyncPayload, hashSyncSecret, safeHashEqual, handleSyncApi, server };
