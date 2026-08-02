import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  AbiCoder,
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
  keccak256,
  parseUnits,
} from "ethers";
import {
  canonicalJsonSha256,
  loadCurrentReistBuild,
} from "./lib/build-provenance.js";
import {
  assertPublicCommitPublished,
  normalizePublicRepositoryUrl,
} from "./lib/repository-provenance.js";
import {
  CANONICAL_PAPER_DOI,
  PUBLIC_RELEASE_REPOSITORY,
} from "./lib/project-identity.js";

const API_URL = "https://api.etherscan.io/v2/api";
const CHAIN_ID = 84532n;
const POLL_INTERVAL_MS = 3_000;
const MAX_STATUS_POLLS = 20;
const MAX_PUBLICATION_POLLS = 10;
const MANIFEST_PATH = resolve("deployments", "base-sepolia.json");
const PROJECT_DATA_PATH = resolve("data", "project.json");

function fail(message) {
  throw new Error(message);
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} fehlt. Siehe .env.example.`);
  return value;
}

function readJson(path, missingMessage) {
  if (!existsSync(path)) fail(missingMessage);
  return JSON.parse(readFileSync(path, "utf8"));
}

function validatedAddress(value, label) {
  let address;
  try {
    address = getAddress(value);
  } catch {
    fail(`${label} ist keine gültige Adresse.`);
  }
  if (address === ZeroAddress) fail(`${label} darf nicht die Nulladresse sein.`);
  return address;
}

function normalizeHex(value) {
  return String(value || "").replace(/^0x/i, "").toLowerCase();
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(message);
}

function gitOutput(arguments_, description, trim = true) {
  const result = spawnSync("git", arguments_, {
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    fail(`${description} fehlgeschlagen: ${(result.stderr || result.stdout).trim()}`);
  }
  return trim ? result.stdout.trim() : result.stdout;
}

function repositoryPathForSourceKey(sourceKey) {
  const path = String(sourceKey || "").replace(/^project\//, "");
  const segments = path.split("/");
  if (
    !path.startsWith("contracts/") ||
    !path.endsWith(".sol") ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9_.-]+$/.test(segment)
    )
  ) {
    fail(`Unerwarteter lokaler Source-Key: ${sourceKey}`);
  }
  return path;
}

if (process.argv[2] !== "base-sepolia") {
  fail("Unterstützt wird derzeit ausschließlich: base-sepolia");
}

const apiKey = requiredEnvironment("ETHERSCAN_API_KEY");
const rpcUrl = requiredEnvironment("BASE_SEPOLIA_RPC_URL");
const manifest = readJson(
  MANIFEST_PATH,
  "Kein Deployment-Manifest gefunden. Zuerst das Testnet deployen."
);
if (manifest.schemaVersion !== 2 || manifest.chainId !== Number(CHAIN_ID)) {
  fail("Manifest entspricht nicht dem erwarteten Base-Sepolia-Schema v2.");
}

const inputFileName = manifest.source?.standardJsonInput;
if (inputFileName !== "base-sepolia-standard-input.json") {
  fail("Manifest verweist nicht auf das erwartete Verifikations-Bundle.");
}
const standardInputPath = resolve("deployments", inputFileName);
const standardInput = readJson(
  standardInputPath,
  "Das zum Deployment gehörende Standard-JSON-Bundle fehlt."
);
assertEqual(
  canonicalJsonSha256(standardInput),
  manifest.source.standardJsonInputSha256,
  "SHA-256 des Verifikations-Bundles stimmt nicht mit dem Manifest überein."
);

const tokenSourceKey = manifest.source?.sourceKeys?.token;
const vestingSourceKey = manifest.source?.sourceKeys?.founderVesting;
if (
  !standardInput.sources?.[tokenSourceKey] ||
  !standardInput.sources?.[vestingSourceKey]
) {
  fail("Manifest-Source-Keys fehlen im gebundenen Standard-JSON.");
}
assertEqual(
  manifest.source.contractNames?.token,
  "REISTToken",
  "Unerwarteter Token-Contractname im Manifest."
);
assertEqual(
  manifest.source.contractNames?.founderVesting,
  "REISTFounderVesting",
  "Unerwarteter Vesting-Contractname im Manifest."
);
assertEqual(
  manifest.source.solidity,
  "0.8.28+commit.7893614a",
  "Unerwartete Compiler-Version im Manifest."
);
const currentBuild = loadCurrentReistBuild();
assertEqual(
  currentBuild.buildInfoId,
  manifest.source.buildInfoId,
  "Lokaler Build und Deployment-Manifest verwenden verschiedene Build-IDs."
);
assertEqual(
  currentBuild.inputSha256,
  manifest.source.standardJsonInputSha256,
  "Lokaler Build stimmt nicht mit dem Deployment-Bundle überein."
);
assertEqual(
  currentBuild.outputSha256,
  manifest.source.buildOutputSha256,
  "Lokaler Compiler-Output stimmt nicht mit dem Deployment-Manifest überein."
);
assertEqual(
  currentBuild.sourceKeys.token,
  tokenSourceKey,
  "Lokaler Token-Source-Key weicht vom Manifest ab."
);
assertEqual(
  currentBuild.sourceKeys.founderVesting,
  vestingSourceKey,
  "Lokaler Vesting-Source-Key weicht vom Manifest ab."
);
const projectPackage = readJson(resolve("package.json"), "package.json fehlt.");
assertEqual(
  manifest.source.openZeppelin,
  projectPackage.dependencies?.["@openzeppelin/contracts"],
  "OpenZeppelin-Version im Manifest weicht vom Projekt ab."
);
assertEqual(
  manifest.source.hardhat,
  projectPackage.devDependencies?.hardhat,
  "Hardhat-Version im Manifest weicht vom Projekt ab."
);
assertEqual(
  manifest.source.ethers,
  projectPackage.devDependencies?.ethers,
  "Ethers-Version im Manifest weicht vom Projekt ab."
);
assertEqual(
  manifest.source.paperDoi,
  CANONICAL_PAPER_DOI,
  "Paper-DOI im Manifest ist nicht die freigegebene kanonische Version."
);
assertEqual(
  manifest.status,
  "testnet-pilot-no-economic-value",
  "Unerwarteter Deployment-Status im Manifest."
);
assertEqual(manifest.network, "Base Sepolia", "Unerwartetes Netzwerk im Manifest.");
assertEqual(manifest.token?.name, "REIST Research Token", "Falscher Tokenname im Manifest.");
assertEqual(manifest.token?.symbol, "REIST", "Falsches Tokensymbol im Manifest.");
assertEqual(manifest.token?.decimals, 18, "Falsche Dezimalstellen im Manifest.");
assertEqual(manifest.token?.totalSupply, "1000000", "Falsche Gesamtmenge im Manifest.");
assertEqual(
  manifest.allocations?.researchRewards?.amount,
  "700000",
  "Falsche Research-Zuteilung im Manifest."
);
assertEqual(
  manifest.allocations?.ecosystemTreasury?.amount,
  "200000",
  "Falsche Ecosystem-Zuteilung im Manifest."
);
assertEqual(
  manifest.allocations?.founderVesting?.amount,
  "100000",
  "Falsche Founder-Zuteilung im Manifest."
);
assertEqual(
  manifest.token?.deployedCodeHash,
  manifest.runtimeCodeHashes?.token,
  "Token-Codehash ist im Manifest widersprüchlich."
);

const sourceCommit = String(manifest.source?.sourceCommit || "");
if (!/^[a-f0-9]{40}$/i.test(sourceCommit)) {
  fail("Manifest enthält keinen vollständigen Git-Commit.");
}
const repositoryUrl = normalizePublicRepositoryUrl(
  manifest.source?.repositoryRemote
);
assertEqual(
  manifest.source.repositoryRemote,
  repositoryUrl,
  "Repository-URL im Manifest ist nicht kanonisch oder nicht öffentlich."
);
assertEqual(
  repositoryUrl,
  PUBLIC_RELEASE_REPOSITORY,
  "Deployment-Manifest verweist nicht auf das kanonische öffentliche Release-Repository."
);
const currentRemote = normalizePublicRepositoryUrl(
  gitOutput(["config", "--get", "remote.origin.url"], "Git-Remote-Ermittlung")
);
assertEqual(
  currentRemote,
  repositoryUrl,
  "Lokaler Git-Remote stimmt nicht mit dem Deployment-Manifest überein."
);
assertPublicCommitPublished(repositoryUrl, sourceCommit);
const projectSourceKeys = Object.keys(standardInput.sources).filter((sourceKey) =>
  sourceKey.startsWith("project/")
);
if (projectSourceKeys.length < 2) {
  fail("Standard-JSON enthält nicht beide lokalen REIST-Quellen.");
}
for (const sourceKey of projectSourceKeys) {
  const repositoryPath = repositoryPathForSourceKey(sourceKey);
  const committedSource = gitOutput(
    ["show", `${sourceCommit}:${repositoryPath}`],
    `Git-Quellprüfung für ${repositoryPath}`,
    false
  );
  assertEqual(
    committedSource,
    standardInput.sources[sourceKey].content,
    `${repositoryPath} stimmt nicht mit dem gebundenen Git-Commit überein.`
  );
}

const tokenAddress = validatedAddress(manifest.contracts?.token, "Tokenvertrag");
const vestingAddress = validatedAddress(
  manifest.contracts?.founderVesting,
  "Vesting-Vertrag"
);
const deployerAddress = validatedAddress(manifest.deployer, "Deployment-Adresse");
const founder = validatedAddress(
  manifest.allocations?.founderVesting?.beneficiary,
  "Founder-Beneficiary"
);
const research = validatedAddress(
  manifest.allocations?.researchRewards?.address,
  "Research-Treasury"
);
const ecosystem = validatedAddress(
  manifest.allocations?.ecosystemTreasury?.address,
  "Ecosystem-Treasury"
);
assertEqual(
  validatedAddress(
    manifest.allocations?.founderVesting?.vestingContract,
    "Vesting-Vertrag im Zuteilungsmanifest"
  ),
  vestingAddress,
  "Vesting-Adresse ist im Manifest widersprüchlich."
);
if (
  new Set([deployerAddress, founder, research, ecosystem].map((value) => value.toLowerCase()))
    .size !== 4
) {
  fail("Deployment- und Empfängeradressen im Manifest sind nicht verschieden.");
}

const provider = new JsonRpcProvider(rpcUrl);
const providerNetwork = await provider.getNetwork();
assertEqual(providerNetwork.chainId, CHAIN_ID, "RPC ist nicht Base Sepolia.");

const receipt = await provider.getTransactionReceipt(manifest.transactionHash);
if (
  !receipt ||
  receipt.status !== 1 ||
  !receipt.contractAddress ||
  getAddress(receipt.contractAddress) !== tokenAddress ||
  getAddress(receipt.from) !== deployerAddress ||
  receipt.blockNumber !== manifest.blockNumber
) {
  fail("Deployment-Transaktion stimmt nicht mit dem Manifest überein.");
}
const deploymentBlock = await provider.getBlock(receipt.blockNumber);
if (!deploymentBlock) fail("Deployment-Block ist nicht abrufbar.");
assertEqual(
  manifest.deployedAt,
  new Date(Number(deploymentBlock.timestamp) * 1000).toISOString(),
  "Deployment-Zeitpunkt stimmt nicht mit dem Block überein."
);

const [tokenCode, vestingCode] = await Promise.all([
  provider.getCode(tokenAddress),
  provider.getCode(vestingAddress),
]);
if (tokenCode === "0x" || vestingCode === "0x") {
  fail("Runtime-Bytecode eines Deployment-Vertrags fehlt.");
}
assertEqual(
  keccak256(tokenCode),
  manifest.runtimeCodeHashes?.token,
  "Token-Runtime-Codehash stimmt nicht mit dem Manifest überein."
);
assertEqual(
  keccak256(vestingCode),
  manifest.runtimeCodeHashes?.founderVesting,
  "Vesting-Runtime-Codehash stimmt nicht mit dem Manifest überein."
);

const token = new Contract(
  tokenAddress,
  [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function founderVesting() view returns (address)",
    "function researchRewardsTreasury() view returns (address)",
    "function ecosystemTreasury() view returns (address)",
  ],
  provider
);
const vesting = new Contract(
  vestingAddress,
  [
    "function owner() view returns (address)",
    "function start() view returns (uint64)",
    "function cliff() view returns (uint64)",
    "function end() view returns (uint64)",
  ],
  provider
);

const [
  tokenName,
  tokenSymbol,
  tokenDecimals,
  totalSupply,
  researchBalance,
  ecosystemBalance,
  vestingBalance,
  deployerBalance,
  onchainVestingAddress,
  onchainResearchAddress,
  onchainEcosystemAddress,
  vestingOwner,
  vestingStart,
  vestingCliff,
  vestingEnd,
] = await Promise.all([
  token.name(),
  token.symbol(),
  token.decimals(),
  token.totalSupply(),
  token.balanceOf(research),
  token.balanceOf(ecosystem),
  token.balanceOf(vestingAddress),
  token.balanceOf(deployerAddress),
  token.founderVesting(),
  token.researchRewardsTreasury(),
  token.ecosystemTreasury(),
  vesting.owner(),
  vesting.start(),
  vesting.cliff(),
  vesting.end(),
]);
const expectedSupply = parseUnits("1000000", 18);
const expectedResearch = parseUnits("700000", 18);
const expectedEcosystem = parseUnits("200000", 18);
const expectedFounder = parseUnits("100000", 18);
if (
  tokenName !== "REIST Research Token" ||
  tokenSymbol !== "REIST" ||
  tokenDecimals !== 18n ||
  totalSupply !== expectedSupply ||
  researchBalance !== expectedResearch ||
  ecosystemBalance !== expectedEcosystem ||
  vestingBalance !== expectedFounder ||
  deployerBalance !== 0n ||
  getAddress(onchainVestingAddress) !== vestingAddress ||
  getAddress(onchainResearchAddress) !== research ||
  getAddress(onchainEcosystemAddress) !== ecosystem ||
  getAddress(vestingOwner) !== founder ||
  vestingStart !== BigInt(manifest.allocations.founderVesting.start) ||
  vestingCliff !== BigInt(manifest.allocations.founderVesting.cliff) ||
  vestingEnd !== BigInt(manifest.allocations.founderVesting.end)
) {
  fail("On-chain-Zustand stimmt nicht mit Verteilung und Vesting-Manifest überein.");
}

async function etherscanPostRequest(parameters) {
  const body = new URLSearchParams({
    apikey: apiKey,
    module: "contract",
    ...parameters,
  });
  const response = await fetch(`${API_URL}?chainid=${CHAIN_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`Etherscan HTTP ${response.status}.`);
  return response.json();
}

async function etherscanGetRequest(parameters) {
  const query = new URLSearchParams({
    apikey: apiKey,
    chainid: String(CHAIN_ID),
    module: "contract",
    ...parameters,
  });
  const response = await fetch(`${API_URL}?${query}`, {
    method: "GET",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`Etherscan HTTP ${response.status}.`);
  return response.json();
}

function parsePublishedInput(sourceCode) {
  let source = String(sourceCode || "").trim();
  if (source.startsWith("{{") && source.endsWith("}}")) {
    source = source.slice(1, -1);
  }
  try {
    return JSON.parse(source);
  } catch {
    fail("Etherscan liefert kein lesbares Solidity-Standard-JSON.");
  }
}

function assertPublishedInputMatches(publishedInput, label) {
  if (
    canonicalJsonSha256(publishedInput) ===
    manifest.source.standardJsonInputSha256
  ) {
    return;
  }

  if (
    !publishedInput ||
    typeof publishedInput !== "object" ||
    Array.isArray(publishedInput)
  ) {
    fail(`${label}: Etherscan-Standard-JSON ist kein Objekt.`);
  }
  const unexpectedRootKeys = Object.keys(publishedInput).filter(
    (key) => !new Set(["language", "sources", "settings"]).has(key)
  );
  if (unexpectedRootKeys.length > 0) {
    fail(`${label}: Etherscan-Standard-JSON enthaelt unerwartete Felder.`);
  }
  if (
    !publishedInput.sources ||
    typeof publishedInput.sources !== "object" ||
    Array.isArray(publishedInput.sources)
  ) {
    fail(`${label}: Etherscan-Standard-JSON enthaelt keine Quellen.`);
  }

  const publishedSources = { ...publishedInput.sources };
  let publishedSettings = publishedInput.settings;
  if (Object.hasOwn(publishedSources, "settings.json")) {
    if (publishedSettings !== undefined) {
      fail(`${label}: Etherscan liefert widerspruechliche Compiler-Einstellungen.`);
    }
    const settingsSource = publishedSources["settings.json"];
    if (
      !settingsSource ||
      typeof settingsSource !== "object" ||
      Array.isArray(settingsSource) ||
      Object.keys(settingsSource).length !== 1 ||
      typeof settingsSource.content !== "string"
    ) {
      fail(`${label}: Etherscan-settings.json hat ein unerwartetes Format.`);
    }
    try {
      publishedSettings = JSON.parse(settingsSource.content);
    } catch {
      fail(`${label}: Etherscan-settings.json ist kein gueltiges JSON.`);
    }
    delete publishedSources["settings.json"];
  }

  assertEqual(
    publishedInput.language,
    standardInput.language,
    `${label}: veroeffentlichte Sprache weicht ab.`
  );
  assertEqual(
    canonicalJsonSha256(publishedSources),
    canonicalJsonSha256(standardInput.sources),
    `${label}: veroeffentlichte Quellen weichen vom Deployment-Bundle ab.`
  );
  assertEqual(
    canonicalJsonSha256(publishedSettings),
    canonicalJsonSha256(standardInput.settings),
    `${label}: veroeffentlichte Compiler-Einstellungen weichen ab.`
  );
}

async function publishedRecord(address) {
  const response = await etherscanGetRequest({
    action: "getsourcecode",
    address,
  });
  if (response.status !== "1" || !Array.isArray(response.result)) {
    fail(`Etherscan-Quellcodeabfrage fehlgeschlagen: ${response.result}`);
  }
  const record = response.result[0];
  if (!record?.SourceCode || /not verified/i.test(String(record.ABI))) return null;
  return record;
}

function validatePublishedRecord(record, specification) {
  const publishedInput = parsePublishedInput(record.SourceCode);
  assertPublishedInputMatches(publishedInput, specification.label);
  assertEqual(
    record.ContractName,
    specification.contractName,
    `${specification.label}: falscher Contractname im Explorer.`
  );
  assertEqual(
    record.CompilerVersion,
    `v${manifest.source.solidity}`,
    `${specification.label}: falsche Compiler-Version im Explorer.`
  );
  assertEqual(
    normalizeHex(record.ConstructorArguments),
    normalizeHex(specification.constructorArguments),
    `${specification.label}: falsche Konstruktorargumente im Explorer.`
  );
  if (
    record.OptimizationUsed !== "1" ||
    Number(record.Runs) !== 200 ||
    !publishedInput.sources?.[specification.sourceKey]
  ) {
    fail(`${specification.label}: Explorer-Metadaten sind nicht deployment-identisch.`);
  }
}

async function waitForStatus(guid, label) {
  for (let attempt = 1; attempt <= MAX_STATUS_POLLS; attempt += 1) {
    if (attempt > 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_INTERVAL_MS));
    }
    const response = await etherscanPostRequest({
      action: "checkverifystatus",
      guid,
    });
    if (response.status === "1" && /pass/i.test(String(response.result))) return;
    if (/pending|queue/i.test(String(response.result))) continue;
    fail(`${label}: Verifikation fehlgeschlagen: ${response.result}`);
  }
  fail(`${label}: Zeitlimit der Verifikationsabfrage erreicht.`);
}

async function waitForPublishedRecord(specification) {
  for (let attempt = 1; attempt <= MAX_PUBLICATION_POLLS; attempt += 1) {
    const record = await publishedRecord(specification.address);
    if (record) {
      validatePublishedRecord(record, specification);
      return;
    }
    if (attempt < MAX_PUBLICATION_POLLS) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, POLL_INTERVAL_MS));
    }
  }
  fail(`${specification.label}: verifizierter Quellcode ist nicht abrufbar.`);
}

async function verifyContract(specification) {
  const existing = await publishedRecord(specification.address);
  if (existing) {
    validatePublishedRecord(existing, specification);
    console.log(`${specification.label}: bereits exakt verifiziert.`);
    return;
  }

  const submission = await etherscanPostRequest({
    action: "verifysourcecode",
    contractaddress: specification.address,
    sourceCode: JSON.stringify(standardInput),
    codeformat: "solidity-standard-json-input",
    contractname: `${specification.sourceKey}:${specification.contractName}`,
    compilerversion: `v${manifest.source.solidity}`,
    optimizationUsed: "1",
    runs: "200",
    constructorArguments: specification.constructorArguments,
    evmVersion: "cancun",
    licenseType: "3",
  });
  if (submission.status === "1") {
    await waitForStatus(submission.result, specification.label);
  } else if (!/already verified/i.test(String(submission.result))) {
    fail(`${specification.label}: Anfrage abgelehnt: ${submission.result}`);
  }

  await waitForPublishedRecord(specification);
  console.log(`${specification.label}: deployment-identisch verifiziert.`);
}

const abiCoder = AbiCoder.defaultAbiCoder();
await verifyContract({
  address: tokenAddress,
  constructorArguments: abiCoder
    .encode(["address", "address", "address"], [founder, research, ecosystem])
    .slice(2),
  contractName: "REISTToken",
  sourceKey: tokenSourceKey,
  label: "REISTToken",
});
await verifyContract({
  address: vestingAddress,
  constructorArguments: abiCoder
    .encode(
      ["address", "uint64"],
      [founder, BigInt(manifest.allocations.founderVesting.start)]
    )
    .slice(2),
  contractName: "REISTFounderVesting",
  sourceKey: vestingSourceKey,
  label: "REISTFounderVesting",
});

manifest.verification = {
  ...manifest.verification,
  sourceVerified: true,
  provider: "Etherscan V2",
  verifiedAt: new Date().toISOString(),
};
writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const projectData = readJson(PROJECT_DATA_PATH, "Projektstatus-Datei fehlt.");
projectData.lastUpdated = new Date().toISOString().slice(0, 10);
projectData.status.sourceVerified = true;
writeFileSync(PROJECT_DATA_PATH, `${JSON.stringify(projectData, null, 2)}\n`, "utf8");

console.log("Beide Quellcodes und Runtime-Bytecodes sind verifiziert.");
