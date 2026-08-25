import { readFile } from "node:fs/promises";

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const source = await readJson("app.json");
const published = await readJson(".anna/app.json");
const dev = await readJson(".anna/dev-app.json");

if (!source?.slug || !source?.version) {
  throw new Error("app.json must declare a slug and version.");
}

if (!published && !dev) {
  console.log(`Anna identity cache is absent; source identity is ${source.slug} v${source.version}.`);
  process.exit(0);
}

if (!published || !dev) {
  throw new Error("Anna identity is incomplete: both .anna/app.json and .anna/dev-app.json must exist locally.");
}

const mismatches = [];
if (published.slug !== source.slug) mismatches.push(`published slug ${published.slug} != ${source.slug}`);
if (dev.slug !== source.slug) mismatches.push(`dev slug ${dev.slug} != ${source.slug}`);
if (published.app_id !== dev.app_id) mismatches.push(`published app ${published.app_id} != dev app ${dev.app_id}`);
if (published.host !== dev.host) mismatches.push(`published host ${published.host} != dev host ${dev.host}`);

if (mismatches.length) {
  throw new Error(`Anna identity mismatch: ${mismatches.join("; ")}`);
}

console.log(`Anna identity verified: ${source.slug} v${source.version}, app ${published.app_id}.`);
