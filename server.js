const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function isPng(buf) {
  return buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
    buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
}

function isGif(buf) {
  if (buf.length < 6) return false;
  const s = buf.subarray(0, 6).toString("ascii");
  return s === "GIF87a" || s === "GIF89a";
}

function metaPath(uuid) { return path.join(DATA_DIR, `${uuid}.json`); }
function skinPath(uuid) { return path.join(DATA_DIR, `${uuid}.skin`); }
function capePath(uuid) { return path.join(DATA_DIR, `${uuid}.cape`); }

function readMeta(uuid) {
  const p = metaPath(uuid);
  if (!fs.existsSync(p)) return {
    hasSkin: false,
    hasCape: false,
    capeIsGif: false,
    model: "default",
    skinHash: "",
    capeHash: ""
  };
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeMeta(uuid, meta) {
  fs.writeFileSync(metaPath(uuid), JSON.stringify(meta, null, 2), "utf8");
}

// raw body parser for binary uploads
app.put("/v1/skin/:uuid", express.raw({ type: "*/*", limit: "2mb" }), (req, res) => {
  const uuid = req.params.uuid;
  const buf = req.body;

  if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).send("empty body");
  if (!isPng(buf)) return res.status(415).send("skin must be PNG");

  const model = (req.header("X-Skinss-Model") || "default").toLowerCase();
  const fixedModel = (model === "slim") ? "slim" : "default";

  fs.writeFileSync(skinPath(uuid), buf);
  const meta = readMeta(uuid);
  meta.hasSkin = true;
  meta.model = fixedModel;
  meta.skinHash = sha256(buf);
  writeMeta(uuid, meta);

  res.json({ ok: true, skinHash: meta.skinHash, model: meta.model });
});

app.put("/v1/cape/:uuid", express.raw({ type: "*/*", limit: "8mb" }), (req, res) => {
  const uuid = req.params.uuid;
  const buf = req.body;

  if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).send("empty body");
  const gif = isGif(buf);
  const png = isPng(buf);
  if (!gif && !png) return res.status(415).send("cape must be PNG or GIF");

  fs.writeFileSync(capePath(uuid), buf);
  const meta = readMeta(uuid);
  meta.hasCape = true;
  meta.capeIsGif = gif;
  meta.capeHash = sha256(buf);
  writeMeta(uuid, meta);

  res.json({ ok: true, capeHash: meta.capeHash, capeIsGif: meta.capeIsGif });
});

app.delete("/v1/skin/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  if (fs.existsSync(skinPath(uuid))) fs.unlinkSync(skinPath(uuid));

  const meta = readMeta(uuid);
  meta.hasSkin = false;
  meta.skinHash = "";
  writeMeta(uuid, meta);

  res.json({ ok: true });
});

app.delete("/v1/cape/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  if (fs.existsSync(capePath(uuid))) fs.unlinkSync(capePath(uuid));

  const meta = readMeta(uuid);
  meta.hasCape = false;
  meta.capeIsGif = false;
  meta.capeHash = "";
  writeMeta(uuid, meta);

  res.json({ ok: true });
});

app.get("/v1/meta/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  const meta = readMeta(uuid);
  res.json(meta);
});

app.get("/v1/skin/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  const p = skinPath(uuid);
  if (!fs.existsSync(p)) return res.sendStatus(404);
  const buf = fs.readFileSync(p);

  const meta = readMeta(uuid);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("X-Skinss-Model", meta.model || "default");
  res.send(buf);
});

app.get("/v1/cape/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  const p = capePath(uuid);
  if (!fs.existsSync(p)) return res.sendStatus(404);
  const buf = fs.readFileSync(p);

  const meta = readMeta(uuid);
  res.setHeader("Content-Type", meta.capeIsGif ? "image/gif" : "image/png");
  res.send(buf);
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Skinss HTTP running on port", port));
