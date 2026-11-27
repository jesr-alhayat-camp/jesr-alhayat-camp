const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const test = require("node:test");
const assert = require("node:assert/strict");

test("Admin Excel round-trips and family history search in Chrome", async () => {
  const root = path.resolve(__dirname, "../public");
  const page = fs.readdirSync(root).find((name) => name.startsWith("admin_"));
  const html = fs
    .readFileSync(path.join(root, page), "utf8")
    .replace(/<meta[^>]+Content-Security-Policy[^>]*>|<link[^>]*>/gi, "")
    .replace(/<script[^>]*src="https:[^"]+"[^>]*><\/script>/g, "")
    .replace("</head>", '<script src="/fixture.js"></script></head>');
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost").pathname;
    if (url === "/") return res.end(html);
    if (url === "/fixture.js")
      return res.end(fs.readFileSync(path.join(__dirname, "excel-fixture.js")));
    const file = path.resolve(root, "." + url);
    if (
      !url.startsWith("/assets/") ||
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file)
    ) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "application/javascript"
        : "application/octet-stream",
    );
    fs.createReadStream(file).pipe(res);
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "camp-excel-"));
  const chrome =
    process.env.CHROME_BIN ||
    (process.platform === "win32"
      ? path.join(
          process.env.ProgramFiles,
          "Google/Chrome/Application/chrome.exe",
        )
      : "google-chrome");
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { stdout } = await promisify(execFile)(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--disable-background-networking",
        "--no-first-run",
        "--user-data-dir=" + profile,
        "--virtual-time-budget=20000",
        "--dump-dom",
        "http://127.0.0.1:" + server.address().port + "/",
      ],
      { maxBuffer: 8e6, timeout: 60000 },
    );
    assert.equal(
      stdout.match(/<body[^>]*data-test-result="([^"]*)"/)?.[1],
      "PASS",
    );
  } finally {
    server.closeAllConnections();
    server.close();
    fs.rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
});
