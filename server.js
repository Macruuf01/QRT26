const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const accessPassword = process.env.ACCESS_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");
const dataFile = process.env.DATA_FILE || path.join(__dirname, "data", "qaaraan.sqlite");
if (!accessPassword || accessPassword.length < 8) throw new Error("Set ACCESS_PASSWORD to a password with at least 8 characters.");

fs.mkdirSync(path.dirname(dataFile), { recursive: true });
const db = new Database(dataFile);
db.pragma("journal_mode = WAL");
db.exec("CREATE TABLE IF NOT EXISTS shared_data (id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL, revision INTEGER NOT NULL)");
db.prepare("INSERT OR IGNORE INTO shared_data (id, payload, revision) VALUES (1, ?, 0)").run(JSON.stringify({ people: [], admins: [] }));

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
const loginAttempts = new Map();
const COOKIE = "qaaraan_session";
const SESSION_SECONDS = 12 * 60 * 60;

function tokenFor(expiry) {
  const payload = Buffer.from(JSON.stringify({ exp: expiry })).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function validToken(token) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", sessionSecret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}
function readCookie(req, name) {
  const prefix = `${name}=`;
  const item = (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${isProduction ? "; Secure" : ""}`);
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProduction ? "; Secure" : ""}`);
}
function requireAuth(req, res, next) {
  if (!validToken(readCookie(req, COOKIE))) return res.status(401).json({ message: "Fadlan mar kale gal." });
  next();
}
function safePasswordMatch(candidate) {
  const salt = "qaaraan-shared-access-v1";
  const expected = crypto.scryptSync(accessPassword, salt, 64);
  const actual = crypto.scryptSync(String(candidate || ""), salt, 64);
  return crypto.timingSafeEqual(expected, actual);
}

app.post("/api/login", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const state = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (state.until > now) return res.status(429).json({ message: "Isku dayo badan ayaa dhacay. Sug dhowr daqiiqo." });
  if (safePasswordMatch(req.body.password)) {
    loginAttempts.delete(ip);
    setSessionCookie(res, tokenFor(now + SESSION_SECONDS * 1000));
    return res.json({ ok: true });
  }
  state.count += 1;
  if (state.count >= 8) { state.count = 0; state.until = now + 5 * 60 * 1000; }
  loginAttempts.set(ip, state);
  return res.status(401).json({ message: "Password-ku sax ma aha." });
});
app.get("/api/me", requireAuth, (_req, res) => res.json({ authenticated: true }));
app.post("/api/logout", (_req, res) => { clearSessionCookie(res); res.json({ ok: true }); });
app.get("/api/data", requireAuth, (_req, res) => {
  const row = db.prepare("SELECT payload, revision FROM shared_data WHERE id = 1").get();
  res.json({ ...JSON.parse(row.payload), revision: row.revision });
});
app.put("/api/data", requireAuth, (req, res) => {
  const { people, admins, revision } = req.body || {};
  const validRows = rows => rows.every(row => row && /^\d{1,20}$/.test(String(row.id || "")));
  if (!Array.isArray(people) || !Array.isArray(admins) || people.length > 20000 || admins.length > 1000 || !validRows(people) || !validRows(admins)) {
    return res.status(400).json({ message: "Xogta la soo diray sax ma aha." });
  }
  const current = db.prepare("SELECT revision FROM shared_data WHERE id = 1").get();
  if (Number(revision) !== current.revision) return res.status(409).json({ message: "Xogta way is beddeshay browser kale." });
  const payload = JSON.stringify({ people, admins });
  if (payload.length > 900000) return res.status(413).json({ message: "Xogtu way ka weyn tahay xadka la oggol yahay." });
  const nextRevision = current.revision + 1;
  const saved = db.prepare("UPDATE shared_data SET payload = ?, revision = ? WHERE id = 1 AND revision = ?").run(payload, nextRevision, current.revision);
  if (!saved.changes) return res.status(409).json({ message: "Xogta way is beddeshay browser kale." });
  res.json({ ok: true, revision: nextRevision });
});
app.use(express.static(__dirname, { index: "index.html", etag: true, maxAge: isProduction ? "1h" : 0 }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ message: "Codsiga lama akhrin karin." });
});
app.listen(port, "0.0.0.0", () => console.log(`Qaaraanka site listening on ${port}`));





