import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createBareServer } from "@nebula-services/bare-server-node";
import chalk from "chalk";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import basicAuth from "express-basic-auth";
import mime from "mime";
import fetch from "node-fetch";

import config from "./config.js";

console.log(chalk.yellow("🚀 Starting Interstellar server..."));

/* ------------------ Setup ------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer();
const bareServer = createBareServer("/fq/");
const PORT = process.env.PORT || 8080;

const cache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/* ------------------ Security ------------------ */

if (config.challenge !== false) {
  console.log(chalk.green("🔒 Password protection enabled"));

  Object.entries(config.users).forEach(([u, p]) => {
    console.log(chalk.blue(`User: ${u} | Pass: ${p}`));
  });

  app.use(basicAuth({
    users: config.users,
    challenge: true
  }));
}

/* ------------------ Middleware ------------------ */

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/fq", cors({ origin: true }));

/* ------------------ Asset Proxy + Cache ------------------ */

app.get("/e/*", async (req, res, next) => {
  try {
    if (cache.has(req.path)) {
      const { data, contentType, timestamp } = cache.get(req.path);

      if (Date.now() - timestamp <= CACHE_TTL) {
        res.writeHead(200, { "Content-Type": contentType });
        return res.end(data);
      }

      cache.delete(req.path);
    }

    const baseUrls = {
      "/e/1/": "https://raw.githubusercontent.com/qrs/x/fixy/",
      "/e/2/": "https://raw.githubusercontent.com/3v1/V5-Assets/main/",
      "/e/3/": "https://raw.githubusercontent.com/3v1/V5-Retro/master/"
    };

    let target;
    for (const [prefix, base] of Object.entries(baseUrls)) {
      if (req.path.startsWith(prefix)) {
        target = base + req.path.slice(prefix.length);
        break;
      }
    }

    if (!target) return next();

    const response = await fetch(target);
    if (!response.ok) return next();

    const data = Buffer.from(await response.arrayBuffer());
    const ext = path.extname(target);
    const contentType = [".unityweb"].includes(ext)
      ? "application/octet-stream"
      : mime.getType(ext) || "application/octet-stream";

    cache.set(req.path, {
      data,
      contentType,
      timestamp: Date.now()
    });

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (err) {
    console.error("Asset error:", err);
    res.status(500).send("Asset fetch failed");
  }
});

/* ------------------ Static + Routes ------------------ */

app.use(express.static(path.join(__dirname, "static")));

const routes = [
  { path: "/", file: "index.html" },
  { path: "/yz", file: "apps.html" },
  { path: "/up", file: "games.html" },
  { path: "/vk", file: "settings.html" },
  { path: "/rx", file: "tabs.html" }
];

routes.forEach(({ path: route, file }) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, "static", file));
  });
});

/* ------------------ Errors ------------------ */

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, "static", "404.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).sendFile(path.join(__dirname, "static", "404.html"));
});

/* ------------------ Bare Server Routing ------------------ */

server.on("request", (req, res) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

server.on("upgrade", (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  } else {
    socket.end();
  }
});

/* ------------------ Start Server ------------------ */

server.listen(PORT, "0.0.0.0", () => {
  console.log(chalk.green(`🌍 Interstellar running on port ${PORT}`));
});
