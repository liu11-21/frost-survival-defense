import puppeteer from "puppeteer-core";

const b = await puppeteer.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: "new",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  defaultViewport: { width: 640, height: 360 },
  protocolTimeout: 180000,
});
const pg = await b.newPage();
pg.on("console", (m) => console.log(`[${m.type()}] ${m.text().slice(0, 400)}`));
pg.on("pageerror", (e) => console.log(`[pageerror] ${e.stack ?? e.message}`));
await pg.goto(process.argv[2] ?? "http://localhost:5173", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 15000));
console.log("hook present:", await pg.evaluate(() => Boolean(window.frostbound)));
console.log(
  "loading screen:",
  await pg.evaluate(() => document.getElementById("loadingScreen")?.className ?? "removed"),
);
await b.close();
