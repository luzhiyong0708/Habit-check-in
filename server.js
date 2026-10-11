/**
 * 手机访问用的本地小服务器（无需任何依赖）。
 * 用法：双击「启动手机版.cmd」，或在文件夹里执行 node server.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/" || rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const addrs = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((net) => {
      if (net.family === "IPv4" && !net.internal) addrs.push(net.address);
    });
  });
  console.log("");
  console.log("  习惯打卡 —— 已启动，手机请连同一个 Wi-Fi，然后打开：");
  console.log("");
  addrs.forEach((a) => console.log("     http://" + a + ":" + PORT + "/"));
  console.log("     http://localhost:" + PORT + "/   （本机预览）");
  console.log("");
  console.log("  关闭这个窗口即停止服务。");
  console.log("");
});
