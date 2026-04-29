import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "assets", "graphql-logo.svg");

const input = await readFile(svgPath);
for (const size of [16, 48, 128]) {
  await sharp(input).resize(size, size).png().toFile(join(root, "icons", `icon${size}.png`));
  console.log("wrote", size);
}
