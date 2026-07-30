import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleFaq } from "../src/catalog/faqBundle.ts";

const sourcePath = fileURLToPath(new URL("../data/faq.json", import.meta.url));
const outputPath = resolve(process.argv[2] ?? "dist/faq.json");

if (outputPath === sourcePath) {
  throw new Error("FAQ bundle output must not overwrite data/faq.json.");
}

const result = await bundleFaq(sourcePath, outputPath);
console.log(`Bundled FAQ ${result.version} to ${result.outputPath}`);
