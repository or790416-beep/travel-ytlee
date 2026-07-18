const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const fs = require("node:fs");
const { handleSyncApi, isUuid, validateSyncPayload, hashSyncSecret, safeHashEqual } = require("./server.js");

const payload = { schemaVersion: 6, activeTripId: "trip-existing", trips: [{ id: "trip-existing", days: [{ id: "day-existing", timeline: [{ id: "timeline-existing" }], bookings: [{ id: "booking-existing" }] }] }] };
assert.equal(validateSyncPayload(payload), true);
assert.equal(validateSyncPayload({ schemaVersion: 5, trips: [] }), false);
assert.equal(validateSyncPayload({ schemaVersion: 6, trips: {} }), false);
assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
assert.equal(isUuid("not-a-uuid"), false);
assert.equal(hashSyncSecret("secret"), "2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b");
assert.equal(safeHashEqual(hashSyncSecret("secret"), hashSyncSecret("secret")), true);
assert.equal(safeHashEqual(hashSyncSecret("secret"), hashSyncSecret("wrong")), false);

class FakeSupabase {
  constructor() { this.rows = new Map(); }
  from() { return new FakeQuery(this); }
}
class FakeQuery {
  constructor(db) { this.db = db; this.filters = {}; this.action = "select"; }
  select() { return this; }
  eq(key, value) { this.filters[key] = value; return this; }
  insert(value) { this.action = "insert"; this.value = value; return this; }
  update(value) { this.action = "update"; this.value = value; return this; }
  single() { return this.run(true); }
  maybeSingle() { return this.run(false); }
  run(required) {
    if (this.action === "insert") {
      const row = { ...this.value, updated_at: new Date().toISOString() };
      this.db.rows.set(row.sync_id, row);
      return Promise.resolve({ data: row, error: null });
    }
    const row = this.db.rows.get(this.filters.sync_id);
    if (this.action === "update") {
      if (!row || row.revision !== this.filters.revision) return Promise.resolve({ data: null, error: null });
      Object.assign(row, this.value);
      return Promise.resolve({ data: row, error: null });
    }
    return Promise.resolve({ data: row || null, error: required && !row ? { message: "missing" } : null });
  }
}

const fake = new FakeSupabase();
function request(method, pathname, body, secret) {
  const data = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(data ? [Buffer.from(data)] : []);
  req.method = method;
  req.url = pathname;
  req.headers = { host: "example.test", origin: "http://example.test", "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) };
  req.socket = { remoteAddress: `test-${Math.random()}` };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(status, headers = {}) { this.statusCode = status; this.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])); return this; },
      end(value = "") { resolve({ status: this.statusCode, headers: this.headers, body: JSON.parse(String(value) || "{}") }); },
    };
    handleSyncApi(req, res, new URL(pathname, "http://example.test"), fake);
  });
}

(async () => {
    const created = await request("POST", "/api/sync/create", { payload });
    assert.equal(created.status, 201);
    assert.equal(isUuid(created.body.syncId), true);
    assert.ok(created.body.syncSecret.length >= 43);
    assert.equal(created.body.revision, 1);
    assert.equal(fake.rows.get(created.body.syncId).sync_secret, undefined);
    assert.equal(fake.rows.get(created.body.syncId).secret_hash, hashSyncSecret(created.body.syncSecret));
    assert.deepEqual(fake.rows.get(created.body.syncId).payload, payload);

    const wrong = await request("GET", `/api/sync/${created.body.syncId}`, undefined, "wrong");
    assert.equal(wrong.status, 404);
    const fetched = await request("GET", `/api/sync/${created.body.syncId}`, undefined, created.body.syncSecret);
    assert.equal(fetched.status, 200);
    assert.deepEqual(fetched.body.payload, payload);
    assert.equal(fetched.headers["cache-control"], "no-store");

    const changed = structuredClone(payload);
    changed.trips[0].days[0].timeline[0].title = "same IDs";
    const updated = await request("PUT", `/api/sync/${created.body.syncId}`, { payload: changed, baseRevision: 1 }, created.body.syncSecret);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.revision, 2);
    assert.equal(fake.rows.get(created.body.syncId).payload.trips[0].id, "trip-existing");
    assert.equal(fake.rows.get(created.body.syncId).payload.trips[0].days[0].timeline[0].id, "timeline-existing");

    const conflict = await request("PUT", `/api/sync/${created.body.syncId}`, { payload, baseRevision: 1 }, created.body.syncSecret);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error, "revision_conflict");
    assert.equal(conflict.body.remoteRevision, 2);

    const app = fs.readFileSync("app.js", "utf8");
    const worker = fs.readFileSync("sw.js", "utf8");
    assert.match(app, /applyingRemote = true[\s\S]*localStorage\.setItem\(STORAGE_KEY[\s\S]*applyingRemote = false/);
    assert.match(app, /if \(!applyingRemote\) scheduleSyncUpload\(\)/);
    assert.doesNotMatch(app.match(/function cancelEditModal\([\s\S]*?\n}/)?.[0] || "", /scheduleSyncUpload|uploadSync/);
    assert.match(worker, /pathname\.startsWith\("\/api\/"\)\) return/);
    for (const file of ["app.js", "index.html", "sw.js"]) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)/);
    console.log("PASS secure sync schema、UUID、hash、create/get/update、revision conflict、ID 保留與前端迴圈防護");
})().catch((error) => { console.error(error); process.exitCode = 1; });
