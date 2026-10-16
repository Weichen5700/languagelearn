// 由 apps/extension/icons/icon.svg 產生 Chrome 擴充所需的 PNG 圖示（16/32/48/128）。
// 執行：cd apps/web && npm run icons   （使用 web workspace 既有的 sharp 相依）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const iconDir = join(here, "..", "..", "extension", "icons");
const svg = readFileSync(join(iconDir, "icon.svg"));

for (const size of [16, 32, 48, 128]) {
  const out = join(iconDir, `icon${size}.png`);
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
  console.log(`✓ ${out.replace(here + "/", "")}`);
}
