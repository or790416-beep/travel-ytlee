const assert = require("node:assert/strict");
const { isBlockedIp, resolvePublic, parsePreview } = require("./server.js");

assert.equal(isBlockedIp("127.0.0.1"), true);
assert.equal(isBlockedIp("10.1.2.3"), true);
assert.equal(isBlockedIp("172.16.2.3"), true);
assert.equal(isBlockedIp("192.168.1.2"), true);
assert.equal(isBlockedIp("169.254.169.254"), true);
assert.equal(isBlockedIp("::1"), true);
assert.equal(isBlockedIp("8.8.8.8"), false);

const og = parsePreview(`<html><head><title>Fallback title</title><meta property="og:title" content="OG title"><meta property="og:description" content="OG summary"><meta property="og:image" content="/image.jpg"><meta property="og:site_name" content="Example Site"></head></html>`, "https://example.com/article");
assert.deepEqual(og, { title: "OG title", description: "OG summary", siteName: "Example Site", imageUrl: "https://example.com/image.jpg", finalUrl: "https://example.com/article" });

const fallback = parsePreview(`<html><head><title>Plain title</title><meta name="description" content="Plain summary"></head></html>`, "https://example.org/page");
assert.equal(fallback.title, "Plain title");
assert.equal(fallback.description, "Plain summary");
assert.equal(fallback.siteName, "example.org");

Promise.all([
  resolvePublic(new URL("http://localhost")).then(() => assert.fail("localhost should be rejected"), () => {}),
  resolvePublic(new URL("http://127.0.0.1")).then(() => assert.fail("loopback should be rejected"), () => {}),
  resolvePublic(new URL("ftp://example.com")).then(() => assert.fail("ftp should be rejected"), () => {}),
]).then(() => console.log("PASS 預覽解析 fallback／相對圖片、安全 URL 與私有 IP 阻擋"));
