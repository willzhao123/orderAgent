import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseRestaurantFaq } from "./restaurantFaq.ts";

export async function bundleFaq(
  sourcePath: string,
  outputPath: string
): Promise<{ version: string; outputPath: string }> {
  const contents = await readFile(sourcePath, "utf8");
  const faq = parseRestaurantFaq(sourcePath, contents);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, "utf8");

  return {
    version: faq.version,
    outputPath
  };
}
