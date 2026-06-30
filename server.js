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


function isValidCoordinate(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function decodeGoogleMapsText(value) {
  let text = String(value || "").trim();
  if (!text) return "";

  const percentMap = {
    "%21": "!",
    "%22": "\"",
    "%23": "#",
    "%24": "$",
    "%25": "%",
    "%26": "&",
    "%27": "'",
    "%28": "(",
    "%29": ")",
    "%2A": "*",
    "%2B": "+",
    "%2C": ",",
    "%2F": "/",
    "%3A": ":",
    "%3B": ";",
    "%3D": "=",
    "%3F": "?",
    "%40": "@",
    "%5B": "[",
    "%5D": "]",
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let decoded = text
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, "\"")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_match, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/%(21|22|23|24|25|26|27|28|29|2a|2b|2c|2f|3a|3b|3d|3f|40|5b|5d)/gi, (match) => percentMap[match.toUpperCase()] || match);

    try {
      decoded = decodeURIComponent(decoded);
    } catch (error) {
      try {
        decoded = decodeURI(decoded);
      } catch (innerError) {
        // The full Google HTML can contain stray percent signs. The targeted replacements above are enough for map data.
      }
    }

    if (decoded === text) break;
    text = decoded;
  }

  return text;
}

function normalizeCoordinate(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) {
    return null;
  }

  return {
    lat: Number(latitude.toFixed(6)),
    lng: Number(longitude.toFixed(6)),
  };
}

function extractGoogleMapsCoordinates(value, options = {}) {
  const { allowLoosePair = true, allowBodyData = true } = options;
  const text = decodeGoogleMapsText(value);
  if (!text) return null;

  const number = "([+-]?\\d{1,3}(?:\\.\\d+)?)";
  const preciseNumber = "([+-]?\\d{1,3}\\.\\d{3,})";
  const patterns = [
    { regex: new RegExp("@" + preciseNumber + "\\s*,\\s*" + preciseNumber) },
    { regex: new RegExp("!3d" + preciseNumber + "!4d" + preciseNumber) },
    { regex: new RegExp("!2d" + preciseNumber + "!3d" + preciseNumber), reverse: true },
    { regex: new RegExp("[?&](?:query|q|ll|center|destination|daddr|saddr)=loc:" + number + "\\s*,\\s*" + number) },
    { regex: new RegExp("[?&](?:query|q|ll|center|destination|daddr|saddr)=" + number + "\\s*,\\s*" + number) },
  ];

  if (allowBodyData) {
    patterns.push(
      { regex: new RegExp("!1d\\d+(?:\\.\\d+)?!2d" + preciseNumber + "!3d" + preciseNumber), reverse: true },
      { regex: new RegExp("\\[\\s*\\d{3,}(?:\\.\\d+)?\\s*,\\s*" + preciseNumber + "\\s*,\\s*" + preciseNumber + "\\s*\\]"), reverse: true }
    );
  }

  if (allowLoosePair) {
    patterns.push({ regex: new RegExp(number + "\\s*,\\s*" + number) });
  }

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) continue;

    let lat = match[1];
    let lng = match[2];
    if (pattern.reverse) [lat, lng] = [lng, lat];

    const coordinate = normalizeCoordinate(lat, lng);
    if (coordinate) return coordinate;
  }

  return null;
}

function isAllowedGoogleMapsHost(hostname) {
  const host = hostname.toLowerCase();
  return (
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host === "g.co" ||
    host === "google.com" ||
    host.endsWith(".google.com") ||
    /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host)
  );
}

function toAllowedGoogleMapsUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch (error) {
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  if (!isAllowedGoogleMapsHost(parsed.hostname)) return null;
  return parsed;
}

function extractGoogleMapsRedirect(value, baseUrl) {
  const text = decodeGoogleMapsText(value);
  const patterns = [
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"']+)["']/i,
    /<meta[^>]+content=["'][^"']*url=([^"']+)["'][^>]+http-equiv=["']?refresh["']?/i,
    /(?:window\.)?location\.(?:href|replace|assign)\s*(?:=|\()\s*["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const redirectUrl = toAllowedGoogleMapsUrl(new URL(match[1], baseUrl).href);
    if (redirectUrl) return redirectUrl;
  }

  return null;
}

async function resolveGoogleMapsCoordinates(value) {
  const direct = extractGoogleMapsCoordinates(value, { allowLoosePair: true, allowBodyData: false });
  if (direct) return { ...direct, resolvedUrl: String(value).trim() };

  let currentUrl = toAllowedGoogleMapsUrl(value);
  if (!currentUrl) throw new Error("Unsupported Google Maps link.");

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(currentUrl.href, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FamilyLocationSite/1.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      const fromResponseUrl = extractGoogleMapsCoordinates(response.url, { allowLoosePair: true, allowBodyData: false });
      if (fromResponseUrl) return { ...fromResponseUrl, resolvedUrl: response.url };

      const location = response.headers.get("location");
      if (location) {
        const nextUrl = toAllowedGoogleMapsUrl(new URL(location, currentUrl).href);
        if (!nextUrl) throw new Error("Unsupported Google Maps redirect.");

        const fromRedirect = extractGoogleMapsCoordinates(nextUrl.href, { allowLoosePair: true, allowBodyData: false });
        if (fromRedirect) return { ...fromRedirect, resolvedUrl: nextUrl.href };

        currentUrl = nextUrl;
        continue;
      }

      const text = (await response.text()).slice(0, 1000000);
      const redirectUrl = extractGoogleMapsRedirect(text, currentUrl);
      if (redirectUrl) {
        const fromRedirectBody = extractGoogleMapsCoordinates(redirectUrl.href, { allowLoosePair: true, allowBodyData: false });
        if (fromRedirectBody) return { ...fromRedirectBody, resolvedUrl: redirectUrl.href };

        currentUrl = redirectUrl;
        continue;
      }

      break;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Could not read coordinates from this Google Maps link.");
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

      if (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
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


  if (req.method === "POST" && pathname === "/api/resolve-map-link") {
    try {
      const payload = JSON.parse(await readBody(req));
      const mapUrl = typeof payload.url === "string" ? payload.url.trim() : "";

      if (!mapUrl || mapUrl.length > 3000) {
        return sendJson(res, 400, { error: "Please paste a valid Google Maps link." });
      }

      const coordinates = await resolveGoogleMapsCoordinates(mapUrl);
      return sendJson(res, 200, coordinates);
    } catch (error) {
      return sendJson(res, 422, { error: "Could not read this Google Maps link." });
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

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(resolved)] || "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    });
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
