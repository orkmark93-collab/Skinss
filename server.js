require("dotenv").config();
const { Telegraf } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// -------------------- Настройки --------------------
const BOT_TOKEN = process.env.BOT_TOKEN; // в .env
const PORT = process.env.PORT || 3000;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN не задан в .env");

// -------------------- HTTP сервер --------------------
const app = express();
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
app.use(express.raw({ type: "*/*", limit: "8mb" }));

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
const skinPath = uuid => path.join(DATA_DIR, `${uuid}.skin`);
const capePath = uuid => path.join(DATA_DIR, `${uuid}.cape`);
const metaPath = uuid => path.join(DATA_DIR, `${uuid}.json`);
function readMeta(uuid) { if(!fs.existsSync(metaPath(uuid))) return { hasSkin:false,hasCape:false,capeIsGif:false,model:"default",skinHash:"",capeHash:"" }; return JSON.parse(fs.readFileSync(metaPath(uuid),"utf8")); }
function writeMeta(uuid, meta) { fs.writeFileSync(metaPath(uuid), JSON.stringify(meta,null,2),"utf8"); }
function isPng(buf){return buf.length>=8 && buf[0]===0x89 && buf[1]===0x50 && buf[2]===0x4E && buf[3]===0x47;}
function isGif(buf){if(buf.length<6)return false;const s=buf.subarray(0,6).toString("ascii");return s==="GIF87a"||s==="GIF89a";}

// -------------------- HTTP API --------------------

// Загрузка скина
app.put("/v1/skin/:uuid",(req,res)=>{
  const uuid=req.params.uuid, buf=req.body;
  if(!Buffer.isBuffer(buf)||!isPng(buf)) return res.status(400).send("Invalid PNG");
  fs.writeFileSync(skinPath(uuid), buf);
  const meta=readMeta(uuid); meta.hasSkin=true; meta.skinHash=sha256(buf); writeMeta(uuid,meta);
  res.json({ok:true,skinHash:meta.skinHash});
});

// Загрузка плаща
app.put("/v1/cape/:uuid",(req,res)=>{
  const uuid=req.params.uuid, buf=req.body;
  if(!Buffer.isBuffer(buf)||(!isPng(buf)&&!isGif(buf))) return res.status(400).send("Invalid PNG/GIF");
  fs.writeFileSync(capePath(uuid), buf);
  const meta=readMeta(uuid); meta.hasCape=true; meta.capeIsGif=isGif(buf); meta.capeHash=sha256(buf); writeMeta(uuid,meta);
  res.json({ok:true,capeHash:meta.capeHash,capeIsGif:meta.capeIsGif});
});

// Получение скина
app.get("/v1/skin/:uuid",(req,res)=>{
  const uuid=req.params.uuid,p=skinPath(uuid);
  if(!fs.existsSync(p)) return res.sendStatus(404);
  const buf=fs.readFileSync(p);
  res.setHeader("Content-Type","image/png"); res.send(buf);
});

// Получение плаща
app.get("/v1/cape/:uuid",(req,res)=>{
  const uuid=req.params.uuid,p=capePath(uuid);
  if(!fs.existsSync(p)) return res.sendStatus(404);
  const buf=fs.readFileSync(p);
  const meta=readMeta(uuid);
  res.setHeader("Content-Type",meta.capeIsGif?"image/gif":"image/png"); res.send(buf);
});

// Получение мета
app.get("/v1/meta/:uuid",(req,res)=>{res.json(readMeta(req.params.uuid));});

// -------------------- Telegram бот --------------------
const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start((ctx)=>ctx.reply(`Сервер доступен!\nФайлы Skinss+ можно получить по: https://skinss-lf4w.onrender.com/`));

// Команда для загрузки скина
bot.on("document", async (ctx)=>{
  const file = ctx.message.document;
  const uuid = ctx.from.id; // Можно использовать id пользователя как UUID
  const url = await ctx.telegram.getFileLink(file.file_id);

  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());

  if(file.file_name.endsWith(".png")){
    if(file.file_name.toLowerCase().includes("cape")){
      fs.writeFileSync(capePath(uuid), buffer);
      const meta=readMeta(uuid); meta.hasCape=true; meta.capeIsGif=false; meta.capeHash=sha256(buffer); writeMeta(uuid,meta);
      ctx.reply("Плащ загружен!");
    }else{
      fs.writeFileSync(skinPath(uuid), buffer);
      const meta=readMeta(uuid); meta.hasSkin=true; meta.skinHash=sha256(buffer); writeMeta(uuid,meta);
      ctx.reply("Скин загружен!");
    }
  }else if(file.file_name.endsWith(".gif")){
    fs.writeFileSync(capePath(uuid), buffer);
    const meta=readMeta(uuid); meta.hasCape=true; meta.capeIsGif=true; meta.capeHash=sha256(buffer); writeMeta(uuid,meta);
    ctx.reply("Анимированный плащ загружен!");
  }else{
    ctx.reply("Неверный формат файла. Допустимы PNG и GIF.");
  }
});

// -------------------- Запуск --------------------
app.listen(PORT,()=>console.log(`HTTP сервис Skinss+ запущен на порту ${PORT}`));
bot.launch().then(()=>console.log("Telegram-бот запущен!"));
