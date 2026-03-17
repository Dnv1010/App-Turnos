import { writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

// SVG con fondo azul y texto BIA
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="80" fill="#2563eb"/>
  <text x="256" y="320" font-family="Arial" font-size="220" font-weight="bold" fill="white" text-anchor="middle">BIA</text>
</svg>`;

writeFileSync(join(publicDir, "icon.svg"), svg);
console.log("SVG generado");

const sizes = [
  { name: "icon-192.png", w: 192 },
  { name: "icon-512.png", w: 512 },
  { name: "apple-touch-icon.png", w: 180 },
];

for (const { name, w } of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: w } });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  writeFileSync(join(publicDir, name), pngBuffer);
  console.log("Written", name, pngBuffer.length, "bytes");
}
