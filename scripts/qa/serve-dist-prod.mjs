// Prod-representative static server for dist/ — mirrors how Vercel serves the
// app to real users, which `vite preview` does NOT: it negotiates br/gzip
// compression (Vercel compresses all text assets) and does SPA fallback to
// index.html. Vite preview ships assets UNCOMPRESSED, which makes a Slow-3G
// cold-start measurement far more pessimistic than production (a 161KB CSS file
// is ~25KB over brotli). Use THIS for the P6 cold-start filmstrip so the numbers
// reflect what a first-time visitor actually gets.
//
//   node scripts/qa/serve-dist-prod.mjs [port]   (default 4188)
//
import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import { gzipSync, brotliCompressSync, constants as zc } from "zlib";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "../../dist");
const PORT = Number(process.argv[2]) || 4188;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};
// Text assets Vercel compresses on the wire.
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".txt", ".xml"]);

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.join(DIST, urlPath);
    if (!filePath.startsWith(DIST)) return send(res, 403, "forbidden");

    let ext = path.extname(filePath);
    let exists = ext ? await stat(filePath).then((s) => s.isFile()).catch(() => false) : false;

    // SPA fallback: any non-asset path serves index.html (mirrors vercel.json rewrite).
    if (!exists) {
      filePath = path.join(DIST, "index.html");
      ext = ".html";
    }

    const type = TYPES[ext] || "application/octet-stream";
    const cacheControl = urlPath.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";

    if (COMPRESSIBLE.has(ext)) {
      const raw = await readFile(filePath);
      const accept = req.headers["accept-encoding"] || "";
      let encoding = null;
      let out = raw;
      if (/\bbr\b/.test(accept)) {
        encoding = "br";
        out = brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } });
      } else if (/\bgzip\b/.test(accept)) {
        encoding = "gzip";
        out = gzipSync(raw, { level: 9 });
      }
      const headers = { "Content-Type": type, "Cache-Control": cacheControl, "Content-Length": out.length };
      if (encoding) headers["Content-Encoding"] = encoding;
      headers["Vary"] = "Accept-Encoding";
      return send(res, 200, out, headers);
    }

    // Binary assets (fonts/images) stream as-is (already compressed formats).
    const s = await stat(filePath);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cacheControl, "Content-Length": s.size });
    createReadStream(filePath).pipe(res);
  } catch (e) {
    send(res, 500, String(e));
  }
});

server.listen(PORT, () => {
  console.log(`prod-representative dist server (br/gzip + SPA fallback) on http://localhost:${PORT}`);
});
