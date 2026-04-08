import sharp from "sharp";
import fs from "fs";

const sizes = [
  { size: 512, name: "public/icon-512.png" },
  { size: 192, name: "public/icon-192.png" },
  { size: 180, name: "public/apple-touch-icon.png" },
  { size: 72,  name: "public/icon-72.png" },
];

// SVG del icono
const svg = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6C5CE7"/>
      <stop offset="100%" stop-color="#4834D4"/>
    </linearGradient>
    <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7DFFF5"/>
      <stop offset="100%" stop-color="#00D4C8"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${s*0.18}" fill="url(#bg)"/>
  <circle cx="${s/2}" cy="${s/2}" r="${s*0.39}" fill="#0d1117"/>
  <path transform="translate(${s/2 - s*0.3},${s/2 - s*0.35}) scale(${s/40})"
    d="M13 10V3L4 14h7v7l9-11h-7z" fill="url(#bolt)"/>
</svg>`;

for (const {size, name} of sizes) {
  await sharp(Buffer.from(svg(size))).png().toFile(name);
  console.log("Generado:", name);
}
console.log("Listo!");
