// 由 SVG 生成 PWA 需要嘅 PNG icon(用 sharp,Next.js 已經帶咗)。
// 用純 vector(對話氣泡 + 三點),唔靠字型,喺任何環境都 render 到一樣。
//   node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(outDir, { recursive: true });

// 對話氣泡 + 三點,設計喺 512 viewBox 內。
const content = `
  <rect x="96" y="112" width="320" height="184" rx="52" fill="#ffffff"/>
  <path d="M168 296 L168 360 L236 296 Z" fill="#ffffff"/>
  <circle cx="196" cy="204" r="22" fill="#2b5fd0"/>
  <circle cx="256" cy="204" r="22" fill="#2b5fd0"/>
  <circle cx="316" cy="204" r="22" fill="#2b5fd0"/>
`;

const gradient = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f8cff"/>
      <stop offset="1" stop-color="#2b5fd0"/>
    </linearGradient>
  </defs>`;

// 圓角版(Android manifest "any" 用):有圓角、內容大。
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${gradient}
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  ${content}
</svg>`;

// 全出血版(maskable + iOS apple-touch 用):方形滿版底,內容縮到安全區(~68%)。
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${gradient}
  <rect width="512" height="512" fill="url(#g)"/>
  <g transform="translate(256 256) scale(0.66) translate(-256 -236)">
    ${content}
  </g>
</svg>`;

const jobs = [
  { svg: rounded, size: 192, name: "icon-192.png" },
  { svg: rounded, size: 512, name: "icon-512.png" },
  { svg: fullBleed, size: 192, name: "icon-maskable-192.png" },
  { svg: fullBleed, size: 512, name: "icon-maskable-512.png" },
  { svg: fullBleed, size: 180, name: "apple-touch-icon.png" },
  { svg: rounded, size: 32, name: "favicon-32.png" },
];

for (const j of jobs) {
  await sharp(Buffer.from(j.svg)).resize(j.size, j.size).png().toFile(join(outDir, j.name));
  console.log("wrote", j.name, `${j.size}x${j.size}`);
}
console.log("done");
