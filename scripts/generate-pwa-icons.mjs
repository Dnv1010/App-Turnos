/**
 * Generates PWA PNG icons from public/icon.svg
 * Requires: npm install sharp (dev)
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const svgPath = join(publicDir, "icon.svg");
const sizes = [
  { name: "icon-192.png", w: 192, h: 192 },
  { name: "icon-512.png", w: 512, h: 512 },
  { name: "apple-touch-icon.png", w: 180, h: 180 },
];

const svg = readFileSync(svgPath);
for (const { name, w, h } of sizes) {
  await sharp(svg).resize(w, h).png().toFile(join(publicDir, name));
  console.log("Written", name);
}
