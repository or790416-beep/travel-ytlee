const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const index = fs.readFileSync("index.html", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const worker = fs.readFileSync("sw.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));

assert.match(index, /viewport-fit=cover/);
assert.match(index, /apple-mobile-web-app-capable" content="yes"/);
assert.match(index, /apple-touch-icon/);
assert.equal(manifest.display, "standalone");
assert.equal(manifest.scope, "./");
assert.match(manifest.start_url, /^\.\//);
assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
for (const icon of manifest.icons) {
  assert.equal(fs.existsSync(path.resolve(icon.src.replace(/^\.\//, ""))), true, `missing ${icon.src}`);
}
assert.equal(fs.existsSync("icons/apple-touch-icon.png"), true);
assert.equal(fs.existsSync("icons/favicon-32.png"), true);

assert.match(worker, /travel-app-v6-ui-14-sync-4/);
assert.match(worker, /requestUrl\.pathname\.startsWith\("\/api\/"\)/);
assert.match(worker, /event\.request\.mode === "navigate"/);
assert.match(worker, /SKIP_WAITING/);
assert.match(app, /data-install-app/);
assert.match(app, /data-export-trip-data/);
assert.match(app, /data-import-trip-data/);
assert.match(app, /beforeinstallprompt/);
assert.match(app, /controllerchange/);
assert.match(styles, /safe-area-inset-top/);
assert.match(styles, /display-mode: standalone/);
assert.match(styles, /pwa-update-toast/);

console.log("PASS PWA manifest、圖示、離線 App Shell、安裝、更新與資料備份入口");
