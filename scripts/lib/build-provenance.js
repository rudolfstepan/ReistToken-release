import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN_ARTIFACT = resolve(
  "artifacts",
  "contracts",
  "REISTToken.sol",
  "REISTToken.json"
);
const VESTING_ARTIFACT = resolve(
  "artifacts",
  "contracts",
  "REISTFounderVesting.sol",
  "REISTFounderVesting.json"
);

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  if (!existsSync(path)) fail(`Datei fehlt: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])])
    );
  }
  return value;
}

export function canonicalJsonSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(value)))
    .digest("hex")
    .toUpperCase();
}

export function loadCurrentReistBuild() {
  const tokenArtifact = readJson(TOKEN_ARTIFACT);
  const vestingArtifact = readJson(VESTING_ARTIFACT);

  if (!tokenArtifact.buildInfoId || tokenArtifact.buildInfoId !== vestingArtifact.buildInfoId) {
    fail("Token und Vesting stammen nicht aus demselben Solidity-Build.");
  }

  const buildInfoPath = resolve(
    "artifacts",
    "build-info",
    `${tokenArtifact.buildInfoId}.json`
  );
  const buildInfo = readJson(buildInfoPath);
  const tokenSourceKey = tokenArtifact.inputSourceName;
  const vestingSourceKey = vestingArtifact.inputSourceName;

  if (!tokenSourceKey || !buildInfo.input?.sources?.[tokenSourceKey]) {
    fail("REISTToken-Source-Key fehlt im Solidity-Standard-JSON.");
  }
  if (!vestingSourceKey || !buildInfo.input?.sources?.[vestingSourceKey]) {
    fail("Vesting-Source-Key fehlt im Solidity-Standard-JSON.");
  }
  if (
    Object.keys(buildInfo.input.sources).some((sourceKey) =>
      /nomicfoundationcoverage/i.test(sourceKey)
    )
  ) {
    fail("Coverage-instrumentierter Build ist nicht deploybar; clean + compile ausführen.");
  }
  if (buildInfo.solcLongVersion !== "0.8.28+commit.7893614a") {
    fail(`Unerwartete Compiler-Version: ${buildInfo.solcLongVersion}`);
  }
  if (
    buildInfo.input.settings?.optimizer?.enabled !== true ||
    buildInfo.input.settings?.optimizer?.runs !== 200 ||
    buildInfo.input.settings?.evmVersion !== "cancun" ||
    buildInfo.input.settings?.metadata?.bytecodeHash !== "ipfs"
  ) {
    fail("Solidity-Build entspricht nicht den freigegebenen Compiler-Einstellungen.");
  }

  return {
    buildInfoId: tokenArtifact.buildInfoId,
    compilerLongVersion: buildInfo.solcLongVersion,
    input: buildInfo.input,
    inputSha256: canonicalJsonSha256(buildInfo.input),
    sourceKeys: {
      token: tokenSourceKey,
      founderVesting: vestingSourceKey,
    },
    contractNames: {
      token: tokenArtifact.contractName,
      founderVesting: vestingArtifact.contractName,
    },
  };
}

export function assertNoAmbiguousBuildInfo() {
  const directory = resolve("artifacts", "build-info");
  const inputFiles = readdirSync(directory).filter(
    (name) => name.endsWith(".json") && !name.endsWith(".output.json")
  );
  if (inputFiles.length !== 1) {
    fail(`Genau ein sauberer Build erwartet, gefunden: ${inputFiles.length}.`);
  }
}
