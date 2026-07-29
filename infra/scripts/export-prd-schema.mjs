import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  androidBuildReadyPrdJsonSchema,
  androidBuildReadyPrdMarkdownTemplate,
} from "../../packages/contracts/dist/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaPath = resolve(repositoryRoot, "schemas/prd/android-build-ready-v1.schema.json");
const templatePath = resolve(repositoryRoot, "docs/templates/android-build-ready-prd.md");

await Promise.all([
  mkdir(dirname(schemaPath), { recursive: true }),
  mkdir(dirname(templatePath), { recursive: true }),
]);
await Promise.all([
  writeFile(schemaPath, `${JSON.stringify(androidBuildReadyPrdJsonSchema, null, 2)}\n`, "utf8"),
  writeFile(templatePath, androidBuildReadyPrdMarkdownTemplate, "utf8"),
]);

console.log(`Generated ${schemaPath}`);
console.log(`Generated ${templatePath}`);
