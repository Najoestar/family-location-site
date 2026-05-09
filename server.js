const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = process.env.PUBLIC_DIR ? path.join(__dirname, process.env.PUBLIC_DIR) : __dirname;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "submissions.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]\n");
}

function readSubmissions() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeSubmissions(submissions) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(submissions, null, 2)}\n`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function isValidCoordinate(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function cleanNote(note) {
  if (typeof note !== "string") return "";
  return note.replace(/[<>]/g, "").trim().slice(0, 120);
}

function getBaseUrl(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : "http";
  return `${proto}://${host}`;
}

function getNetworkBaseUrl(req) {
  const host = req.headers.host || "";
  if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    return getBaseUrl(req);
  }

  const network = Object.values(os.networkInterfaces())
    .flat()
    .find((item) => item && item.family === "IPv4" && !item.internal);

  return network ? `http://${network.address}:${PORT}` : getBaseUrl(req);
}

function makeQrSvg(text) {
  const safeText = text.replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  }[char]));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420" role="img" aria-label="QR code placeholder">
  <rect width="420" height="420" fill="#ffffff"/>
  <rect x="34" y="34" width="108" height="108" fill="#111827"/>
  <rect x="60" y="60" width="56" height="56" fill="#ffffff"/>
  <rect x="278" y="34" width="108" height="108" fill="#111827"/>
  <rect x="304" y="60" width="56" height="56" fill="#ffffff"/>
  <rect x="34" y="278" width="108" height="108" fill="#111827"/>
  <rect x="60" y="304" width="56" height="56" fill="#ffffff"/>
  <g fill="#111827">
    <rect x="178" y="50" width="22" height="22"/><rect x="212" y="50" width="22" height="22"/>
    <rect x="178" y="84" width="56" height="22"/><rect x="246" y="84" width="22" height="22"/>
    <rect x="164" y="154" width="22" height="22"/><rect x="198" y="154" width="56" height="22"/><rect x="288" y="154" width="22" height="22"/>
    <rect x="50" y="178" width="22" height="22"/><rect x="84" y="178" width="56" height="22"/><rect x="178" y="188" width="22" height="22"/><rect x="236" y="188" width="22" height="22"/><rect x="304" y="188" width="56" height="22"/>
    <rect x="154" y="224" width="56" height="22"/><rect x="246" y="224" width="22" height="22"/><rect x="314" y="224" width="22" height="22"/>
    <rect x="178" y="270" width="22" height="22"/><rect x="224" y="270" width="56" height="22"/><rect x="314" y="270" width="22" height="22"/>
    <rect x="164" y="318" width="22" height="22"/><rect x="210" y="318" width="22" height="22"/><rect x="258" y="318" width="80" height="22"/>
    <rect x="176" y="360" width="56" height="22"/><rect x="270" y="360" width="22" height="22"/><rect x="326" y="360" width="22" height="22"/>
  </g>
  <text x="210" y="207" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="#475569">Open</text>
  <title>${safeText}</title>
</svg>`;
}

async function handleApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/location") {
    try {
      const payload = JSON.parse(await readBody(req));
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);

      if (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
        return sendJson(res, 400, { error: "Please provide a valid location." });
      }

      const submissions = readSubmissions();
      const submission = {
        id: crypto.randomUUID(),
        label: `Home ${submissions.length + 1}`,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        note: cleanNote(payload.note),
        createdAt: new Date().toISOString(),
      };

      submissions.unshift(submission);
      writeSubmissions(submissions);
      return sendJson(res, 201, { ok: true, id: submission.id });
    } catch (error) {
      return sendJson(res, 400, { error: "The location could not be saved." });
    }
  }

  if (req.method === "GET" && pathname === "/api/locations") {
    return sendJson(res, 200, {
      locations: readSubmissions().map(({ id, label, lat, lng, note, createdAt }) => ({
        id,
        label,
        lat,
        lng,
        note,
        createdAt,
      })),
    });
  }

  if (req.method === "GET" && pathname === "/api/share-url") {
    return sendJson(res, 200, { url: `${getNetworkBaseUrl(req)}/` });
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveFile(req, res, pathname) {
  let filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  if (pathname === "/admin") filePath = path.join(PUBLIC_DIR, "admin.html");

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(resolved, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const type = mimeTypes[path.extname(resolved)] || "text/plain; charset=utf-8";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, getBaseUrl(req));

  if (url.pathname === "/qr.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
    return res.end(makeQrSvg(`${getBaseUrl(req)}/`));
  }

  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname);
  return serveFile(req, res, decodeURIComponent(url.pathname));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Relative location site: http://localhost:${PORT}`);
  console.log(`Admin view: http://localhost:${PORT}/admin`);

  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => network && network.family === "IPv4" && !network.internal)
    .map((network) => network.address);

  addresses.forEach((address) => {
    console.log(`Phone QR admin: http://${address}:${PORT}/admin`);
  });
});

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "submissions.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]\n");
}

function readSubmissions() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeSubmissions(submissions) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(submissions, null, 2)}\n`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function isValidCoordinate(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function cleanNote(note) {
  if (typeof note !== "string") return "";
  return note.replace(/[<>]/g, "").trim().slice(0, 120);
}

function getBaseUrl(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : "http";
  return `${proto}://${host}`;
}

function getNetworkBaseUrl(req) {
  const host = req.headers.host || "";
  if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    return getBaseUrl(req);
  }

  const network = Object.values(os.networkInterfaces())
    .flat()
    .find((item) => item && item.family === "IPv4" && !item.internal);

  return network ? `http://${network.address}:${PORT}` : getBaseUrl(req);
}

function makeQrSvg(text) {
  const safeText = text.replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  }[char]));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420" role="img" aria-label="QR code placeholder">
  <rect width="420" height="420" fill="#ffffff"/>
  <rect x="34" y="34" width="108" height="108" fill="#111827"/>
  <rect x="60" y="60" width="56" height="56" fill="#ffffff"/>
  <rect x="278" y="34" width="108" height="108" fill="#111827"/>
  <rect x="304" y="60" width="56" height="56" fill="#ffffff"/>
  <rect x="34" y="278" width="108" height="108" fill="#111827"/>
  <rect x="60" y="304" width="56" height="56" fill="#ffffff"/>
  <g fill="#111827">
    <rect x="178" y="50" width="22" height="22"/><rect x="212" y="50" width="22" height="22"/>
    <rect x="178" y="84" width="56" height="22"/><rect x="246" y="84" width="22" height="22"/>
    <rect x="164" y="154" width="22" height="22"/><rect x="198" y="154" width="56" height="22"/><rect x="288" y="154" width="22" height="22"/>
    <rect x="50" y="178" width="22" height="22"/><rect x="84" y="178" width="56" height="22"/><rect x="178" y="188" width="22" height="22"/><rect x="236" y="188" width="22" height="22"/><rect x="304" y="188" width="56" height="22"/>
    <rect x="154" y="224" width="56" height="22"/><rect x="246" y="224" width="22" height="22"/><rect x="314" y="224" width="22" height="22"/>
    <rect x="178" y="270" width="22" height="22"/><rect x="224" y="270" width="56" height="22"/><rect x="314" y="270" width="22" height="22"/>
    <rect x="164" y="318" width="22" height="22"/><rect x="210" y="318" width="22" height="22"/><rect x="258" y="318" width="80" height="22"/>
    <rect x="176" y="360" width="56" height="22"/><rect x="270" y="360" width="22" height="22"/><rect x="326" y="360" width="22" height="22"/>
  </g>
  <text x="210" y="207" font-family="Arial, sans-serif" font-size="13" text-anchor="middle" fill="#475569">Open</text>
  <title>${safeText}</title>
</svg>`;
}

async function handleApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/location") {
    try {
      const payload = JSON.parse(await readBody(req));
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);

      if (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
        return sendJson(res, 400, { error: "Please provide a valid location." });
      }

      const submissions = readSubmissions();
      const submission = {
        id: crypto.randomUUID(),
        label: `Home ${submissions.length + 1}`,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        note: cleanNote(payload.note),
        createdAt: new Date().toISOString(),
      };

      submissions.unshift(submission);
      writeSubmissions(submissions);
      return sendJson(res, 201, { ok: true, id: submission.id });
    } catch (error) {
      return sendJson(res, 400, { error: "The location could not be saved." });
    }
  }

  if (req.method === "GET" && pathname === "/api/locations") {
    return sendJson(res, 200, {
      locations: readSubmissions().map(({ id, label, lat, lng, note, createdAt }) => ({
        id,
        label,
        lat,
        lng,
        note,
        createdAt,
      })),
    });
  }

  if (req.method === "GET" && pathname === "/api/share-url") {
    return sendJson(res, 200, { url: `${getNetworkBaseUrl(req)}/` });
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveFile(req, res, pathname) {
  let filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  if (pathname === "/admin") filePath = path.join(PUBLIC_DIR, "admin.html");

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(resolved, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const type = mimeTypes[path.extname(resolved)] || "text/plain; charset=utf-8";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, getBaseUrl(req));

  if (url.pathname === "/qr.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
    return res.end(makeQrSvg(`${getBaseUrl(req)}/`));
  }

  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname);
  return serveFile(req, res, decodeURIComponent(url.pathname));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Relative location site: http://localhost:${PORT}`);
  console.log(`Admin view: http://localhost:${PORT}/admin`);

  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => network && network.family === "IPv4" && !network.internal)
    .map((network) => network.address);

  addresses.forEach((address) => {
    console.log(`Phone QR admin: http://${address}:${PORT}/admin`);
  });
});
