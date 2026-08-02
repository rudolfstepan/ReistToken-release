import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import {
  publicDocumentBuilds,
  renderPublicDocuments,
} from "./lib/render-markdown.js";
import { writeDiscoveryFiles } from "./lib/site-publication.js";

const output = resolve("dist");
if (basename(output) !== "dist" || !output.startsWith(resolve("."))) {
  throw new Error("Unsicheres Ausgabeziel für Website-Build.");
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ["404.html", "app.js", "index.html", "language.js", "styles.css"]) {
  copyFileSync(resolve("site", file), resolve(output, file));
}
mkdirSync(resolve(output, "en"), { recursive: true });
copyFileSync(resolve("site", "en", "index.html"), resolve(output, "en", "index.html"));
cpSync(resolve("site", "assets"), resolve(output, "assets"), { recursive: true });
cpSync(resolve("data"), resolve(output, "data"), { recursive: true });
cpSync(resolve("contracts"), resolve(output, "contracts"), { recursive: true });
copyFileSync(resolve("LICENSE"), resolve(output, "LICENSE.txt"));
mkdirSync(resolve(output, "deployments"), { recursive: true });

const deploymentManifest = resolve("deployments", "base-sepolia.json");
if (existsSync(deploymentManifest)) {
  copyFileSync(
    deploymentManifest,
    resolve(output, "deployments", "base-sepolia.json")
  );
}

const smokeOperation = resolve(
  "operations",
  "base-sepolia-smoke-transfer.json"
);
mkdirSync(resolve(output, "operations"), { recursive: true });
copyFileSync(
  smokeOperation,
  resolve(output, "operations", "base-sepolia-smoke-transfer.json")
);
mkdirSync(resolve(output, "plans"), { recursive: true });
copyFileSync(
  resolve("plans", "base-sepolia-allowance-smoke.json"),
  resolve(output, "plans", "base-sepolia-allowance-smoke.json")
);

renderPublicDocuments(output);
const projectData = JSON.parse(readFileSync(resolve("data", "project.json"), "utf8"));
writeDiscoveryFiles(output, publicDocumentBuilds, projectData.lastUpdated);

console.log(`Statische Website erzeugt: ${output}`);
