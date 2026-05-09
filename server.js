const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "submissions.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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
  fs.writeFileSync(DATA_FILE, JSON.stringify(submissions, null, 2) + "\n");
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
      if (body.length > 20000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function cleanNote(note) {
  if (typeof note !== "string") return "";
  return note.replace(/[<>]/g, "").trim().slice(0, 120);
}

function getBaseUrl(req) {
  const proto = typeof req.headers["x-forwarded-proto"] === "string"
    ? req.headers["x-forwarded-proto"].split(",")[0]
    : "http";
  return proto + "://" + (req.headers.host || "localhost:" + PORT);
}

async function handleApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/location") {
    try {
      const payload = JSON.parse(await readBody(req));
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);

      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return sendJson(res, 400, { error: "Please provide a valid location." });
      }

      const submissions = readSubmissions();
      submissions.unshift({
        id: crypto.randomUUID(),
        label: "Home " + (submissions.length + 1),
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        note: cleanNote(payload.note),
        createdAt: new Date().toISOString(),
      });

      writeSubmissions(submissions);
      return sendJson(res, 201, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: "The location could not be saved." });
    }
  }

  if (req.method === "GET" && pathname === "/api/locations") {
    return sendJson(res, 200, { locations: readSubmissions() });
  }

  if (req.method === "GET" && pathname === "/api/share-url") {
    return sendJson(res, 200, { url: getBaseUrl(req) + "/" });
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveFile(res, pathname) {
  const safePath = pathname === "/" ? "index.html" : pathname === "/admin" ? "admin.html" : pathname.slice(1);
  const resolved = path.resolve(ROOT_DIR, safePath);

  if (!resolved.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(resolved, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }

    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(resolved)] || "text/plain; charset=utf-8" });
    res.end(content);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, getBaseUrl(req));
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname);
  return serveFile(res, decodeURIComponent(url.pathname));
}).listen(PORT, "0.0.0.0", () => {
  console.log("Family location site running on port " + PORT);
});
