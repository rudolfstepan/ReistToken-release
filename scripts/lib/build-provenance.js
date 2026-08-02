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

function normalizeBytecode(value) {
  return String(value || "").replace(/^0x/i, "").toLowerCase();
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
  const buildOutputPath = resolve(
    "artifacts",
    "build-info",
    `${tokenArtifact.buildInfoId}.output.json`
  );
  const buildOutput = readJson(buildOutputPath);
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

  if (buildOutput.id !== tokenArtifact.buildInfoId || !buildOutput.output?.contracts) {
    fail("Solidity-Build-Output gehoert nicht zum ausgewaehlten Build.");
  }
  for (const [artifact, sourceKey, label] of [
    [tokenArtifact, tokenSourceKey, "REISTToken"],
    [vestingArtifact, vestingSourceKey, "REISTFounderVesting"],
  ]) {
    const compiled = buildOutput.output.contracts?.[sourceKey]?.[artifact.contractName];
    if (!compiled?.evm) {
      fail(`${label}-Output fehlt im gebundenen Solidity-Build.`);
    }
    if (
      canonicalJsonSha256(artifact.abi) !== canonicalJsonSha256(compiled.abi) ||
      normalizeBytecode(artifact.bytecode) !==
        normalizeBytecode(compiled.evm.bytecode?.object) ||
      normalizeBytecode(artifact.deployedBytecode) !==
        normalizeBytecode(compiled.evm.deployedBytecode?.object) ||
      canonicalJsonSha256(artifact.linkReferences || {}) !==
        canonicalJsonSha256(compiled.evm.bytecode?.linkReferences || {}) ||
      canonicalJsonSha256(artifact.deployedLinkReferences || {}) !==
        canonicalJsonSha256(compiled.evm.deployedBytecode?.linkReferences || {}) ||
      canonicalJsonSha256(artifact.immutableReferences || {}) !==
        canonicalJsonSha256(compiled.evm.deployedBytecode?.immutableReferences || {})
    ) {
      fail(`${label}-Artefakt stimmt nicht mit dem Solidity-Build-Output ueberein.`);
    }
  }

  return {
    buildInfoId: tokenArtifact.buildInfoId,
    compilerLongVersion: buildInfo.solcLongVersion,
    input: buildInfo.input,
    inputSha256: canonicalJsonSha256(buildInfo.input),
    outputSha256: canonicalJsonSha256(buildOutput.output),
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
