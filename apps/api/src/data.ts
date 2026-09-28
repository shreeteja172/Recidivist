import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo-root data/ folder with the synthetic dataset. */
export const DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL("../../../data", import.meta.url));

export async function readDataJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(DATA_DIR, relativePath), "utf8"));
}
