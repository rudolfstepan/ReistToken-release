import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { config as loadEnvironment, parse as parseEnvironment } from "dotenv";
import { getAddress, ZeroAddress } from "ethers";

function fail(message) {
  throw new Error(message);
}

function environmentAddress(name) {
  try {
    const address = getAddress(String(process.env[name] || "").trim());
    if (address === ZeroAddress) fail(`${name} darf nicht die Nulladresse sein.`);
    return address;
  } catch {
    fail(`${name} fehlt oder ist ungültig.`);
  }
}

function externalKeystoreDirectory(value) {
  if (!isAbsolute(value)) {
    fail("REIST_KEYSTORE_DIRECTORY muss ein absoluter Pfad sein.");
  }
  const directory = resolve(value);
  const relation = relative(resolve("."), directory);
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation))) {
    fail("Keystore-Verzeichnis muss außerhalb des Repositorys liegen.");
  }
  return directory;
}

const environmentPath = resolve(".env");
if (!existsSync(environmentPath)) fail("Lokale .env-Konfiguration fehlt.");
const environmentSource = readFileSync(environmentPath, "utf8");
const parsedEnvironment = parseEnvironment(environmentSource);
if (
  Object.prototype.hasOwnProperty.call(
    parsedEnvironment,
    "TESTNET_DEPLOYER_PRIVATE_KEY"
  )
) {
  fail(".env darf keinen dauerhaft gespeicherten Deployer-Private-Key enthalten.");
}
loadEnvironment({ quiet: true });
delete process.env.TESTNET_DEPLOYER_PRIVATE_KEY;

const addresses = {
  deployer: environmentAddress("TESTNET_DEPLOYER_ADDRESS"),
  "founder-beneficiary": environmentAddress("FOUNDER_BENEFICIARY"),
  "research-treasury": environmentAddress("RESEARCH_REWARDS_TREASURY"),
  "ecosystem-treasury": environmentAddress("ECOSYSTEM_TREASURY"),
};
const keystoreDirectory = externalKeystoreDirectory(
  String(process.env.REIST_KEYSTORE_DIRECTORY || "").trim()
);
if (
  new Set(Object.values(addresses).map((address) => address.toLowerCase())).size !==
  Object.keys(addresses).length
) {
  fail("Die vier öffentlichen Rollenadressen sind nicht paarweise verschieden.");
}

const sourcePath = join(keystoreDirectory, "addresses.json");
if (!existsSync(sourcePath)) fail("Geschütztes Keystore-Adressdokument fehlt.");
let sourceDocument;
try {
  sourceDocument = JSON.parse(readFileSync(sourcePath, "utf8"));
} catch {
  fail("Geschütztes Keystore-Adressdokument ist nicht lesbar.");
}
if (
  sourceDocument.schemaVersion !== 1 ||
  sourceDocument.chainId !== 84532 ||
  sourceDocument.network !== "Base Sepolia"
) {
  fail("Geschütztes Keystore-Adressdokument besitzt das falsche Netzwerk.");
}
for (const [id, address] of Object.entries(addresses)) {
  let documentedAddress;
  try {
    documentedAddress = getAddress(sourceDocument.addresses?.[id] || ZeroAddress);
  } catch {
    fail(`Geschütztes Keystore-Adressdokument ist für ${id} ungültig.`);
  }
  if (documentedAddress !== address) {
    fail(`Geschütztes Keystore-Adressdokument widerspricht .env: ${id}.`);
  }
}

const outputDirectory = resolve("dist");
const outputPath = resolve(outputDirectory, "base-sepolia-addresses.local.json");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      network: "Base Sepolia",
      chainId: 84532,
      sourceCreatedAt: sourceDocument.createdAt,
      exportedAt: new Date().toISOString(),
      addresses,
    },
    null,
    2
  )}\n`,
  { encoding: "utf8", flag: "wx" }
);

console.log("Öffentliche Base-Sepolia-Rollenadressen:");
for (const [id, address] of Object.entries(addresses)) {
  console.log(`${id}: ${address}`);
}
console.log("Lokaler öffentlicher Export: dist/base-sepolia-addresses.local.json");
