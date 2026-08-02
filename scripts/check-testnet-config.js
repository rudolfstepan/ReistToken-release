import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { config as loadEnvironment, parse as parseEnvironment } from "dotenv";
import { formatEther, getAddress, Wallet, ZeroAddress } from "ethers";
import { CANONICAL_PAPER_DOI } from "./lib/project-identity.js";
import { readPasswordFromStandardInput } from "./lib/password-transport.js";

const checkWallets =
  process.argv.includes("--wallets") || process.argv.includes("--recovery");
const checkRecovery = process.argv.includes("--recovery");
const checkRpc = process.argv.includes("--rpc");

function fail(message) {
  throw new Error(message);
}

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) fail(`Lokale Testnet-Konfiguration fehlt: ${name}.`);
  return value;
}

function checkedAddress(name) {
  const value = requiredEnvironment(name);
  try {
    const address = getAddress(value);
    if (address === ZeroAddress) fail(`${name} darf nicht die Nulladresse sein.`);
    return address;
  } catch {
    fail(`${name} ist keine gültige Ethereum-Adresse.`);
  }
}

function assertRepositoryIgnore(path) {
  const result = spawnSync(
    "git",
    ["check-ignore", "-v", "--no-index", path],
    { encoding: "utf8", shell: false, windowsHide: true }
  );
  const repositoryRule = String(result.stdout || "")
    .split(/\r?\n/)
    .some((line) => line.startsWith(".gitignore:"));
  if (result.status !== 0 || !repositoryRule) {
    fail(`${path} ist nicht ausdrücklich durch die Repository-.gitignore geschützt.`);
  }
}

function parseJsonFile(path, description) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${description} ist nicht als gültiges JSON lesbar.`);
  }
}

function rpcQuantity(value, description) {
  if (!/^0x[0-9a-f]+$/i.test(String(value || ""))) {
    fail(`RPC lieferte für ${description} keine gültige Hex-Zahl.`);
  }
  return BigInt(value);
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
if (!existsSync(environmentPath)) {
  fail("Lokale .env-Konfiguration fehlt.");
}
let parsedEnvironment;
try {
  parsedEnvironment = parseEnvironment(readFileSync(environmentPath));
} catch {
  fail("Lokale .env-Konfiguration ist nicht lesbar.");
}
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

const deployer = checkedAddress("TESTNET_DEPLOYER_ADDRESS");
const founderBeneficiary = checkedAddress("FOUNDER_BENEFICIARY");
const researchTreasury = checkedAddress("RESEARCH_REWARDS_TREASURY");
const ecosystemTreasury = checkedAddress("ECOSYSTEM_TREASURY");
const addresses = {
  deployer,
  "founder-beneficiary": founderBeneficiary,
  "research-treasury": researchTreasury,
  "ecosystem-treasury": ecosystemTreasury,
};
if (
  new Set(Object.values(addresses).map((address) => address.toLowerCase())).size !==
  Object.keys(addresses).length
) {
  fail("Deployment- und Empfängeradressen müssen paarweise verschieden sein.");
}
if (requiredEnvironment("REIST_PAPER_DOI") !== CANONICAL_PAPER_DOI) {
  fail(`REIST_PAPER_DOI muss ${CANONICAL_PAPER_DOI} entsprechen.`);
}

const rpcUrl = requiredEnvironment("BASE_SEPOLIA_RPC_URL");
const configuredKeystoreDirectory = externalKeystoreDirectory(
  requiredEnvironment("REIST_KEYSTORE_DIRECTORY")
);
let parsedRpcUrl;
try {
  parsedRpcUrl = new URL(rpcUrl);
} catch {
  fail("BASE_SEPOLIA_RPC_URL ist keine gültige URL.");
}
if (
  parsedRpcUrl.protocol !== "https:" ||
  parsedRpcUrl.username ||
  parsedRpcUrl.password
) {
  fail("BASE_SEPOLIA_RPC_URL muss HTTPS ohne eingebettete Zugangsdaten verwenden.");
}

assertRepositoryIgnore(".env");

const encryptedKeystores = new Map();
if (checkWallets) {
  const requestedRecoveryDirectory = checkRecovery
    ? String(process.env.REIST_RECOVERY_WALLET_DIRECTORY || "").trim()
    : "";
  delete process.env.REIST_RECOVERY_WALLET_DIRECTORY;
  const keystoreDirectory = requestedRecoveryDirectory
    ? externalKeystoreDirectory(requestedRecoveryDirectory)
    : configuredKeystoreDirectory;
  const addressDocumentPath = join(keystoreDirectory, "addresses.json");
  if (!existsSync(addressDocumentPath)) {
    fail("Lokales Keystore-Adressdokument fehlt.");
  }
  const addressDocument = parseJsonFile(
    addressDocumentPath,
    "Keystore-Adressdokument"
  );
  if (
    addressDocument.schemaVersion !== 1 ||
    addressDocument.chainId !== 84532 ||
    addressDocument.network !== "Base Sepolia"
  ) {
    fail("Keystore-Adressdokument besitzt falsches Schema oder Netzwerk.");
  }

  for (const [id, address] of Object.entries(addresses)) {
    let documentedAddress;
    try {
      documentedAddress = getAddress(
        addressDocument.addresses?.[id] || ZeroAddress
      );
    } catch {
      fail(`Keystore-Adressdokument enthält keine gültige Adresse für ${id}.`);
    }
    if (documentedAddress !== address) {
      fail(`Keystore-Adressdokument widerspricht der lokalen Konfiguration: ${id}.`);
    }

    const absoluteKeystorePath = join(
      keystoreDirectory,
      `${id}.keystore.json`
    );
    if (!existsSync(absoluteKeystorePath)) {
      fail(`Verschlüsselter Keystore fehlt: ${id}.`);
    }
    const encryptedKeystore = readFileSync(absoluteKeystorePath, "utf8");
    const keystore = parseJsonFile(
      absoluteKeystorePath,
      `Verschlüsselter Keystore ${id}`
    );
    let keystoreAddress;
    try {
      keystoreAddress = getAddress(
        `0x${String(keystore.address || "").replace(/^0x/i, "")}`
      );
    } catch {
      fail(`Verschlüsselter Keystore enthält keine gültige Adresse: ${id}.`);
    }
    if (
      keystore.version !== 3 ||
      !(keystore.crypto || keystore.Crypto) ||
      keystoreAddress !== address
    ) {
      fail(`Verschlüsselter Keystore ist strukturell ungültig: ${id}.`);
    }
    encryptedKeystores.set(id, encryptedKeystore);
  }
}

if (checkRecovery) {
  if (process.env.REIST_CONFIRM_TESTNET_RECOVERY !== "CHECK") {
    fail("Recovery-Prüfung verlangt den interaktiven PowerShell-Wrapper.");
  }
  delete process.env.REIST_CONFIRM_TESTNET_RECOVERY;
  let password = "";
  try {
    password = readPasswordFromStandardInput();
    for (const [id, encryptedKeystore] of encryptedKeystores) {
      let recoveredWallet;
      try {
        recoveredWallet = await Wallet.fromEncryptedJson(
          encryptedKeystore,
          password
        );
      } catch {
        fail(`Recovery-Prüfung ist für ${id} fehlgeschlagen.`);
      }
      if (getAddress(recoveredWallet.address) !== addresses[id]) {
        fail(`Recovery-Prüfung lieferte eine falsche Adresse für ${id}.`);
      }
      recoveredWallet = null;
    }
  } finally {
    password = "";
  }
}

console.log("Lokale Base-Sepolia-Konfiguration ist intern konsistent.");
for (const [id, address] of Object.entries(addresses)) {
  console.log(`${id}: ${address}`);
}
if (checkWallets) {
  console.log("Vier verschlüsselte Testnet-Keystores sind strukturell konsistent.");
}
if (checkRecovery) {
  console.log("Alle vier Keystores wurden erfolgreich entschlüsselt und zugeordnet.");
}
console.log(
  `Etherscan-API-Key: ${String(process.env.ETHERSCAN_API_KEY || "").trim() ? "konfiguriert" : "fehlt noch"}`
);

async function rpcRequest(method, parameters) {
  let response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: method,
        method,
        params: parameters,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail(`Base-Sepolia-RPC ist für ${method} nicht erreichbar.`);
  }
  if (!response.ok) {
    fail(`Base-Sepolia-RPC antwortete für ${method} mit HTTP ${response.status}.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(`Base-Sepolia-RPC lieferte für ${method} kein JSON.`);
  }
  if (payload.error || payload.result === undefined) {
    fail(`Base-Sepolia-RPC lehnte ${method} ab.`);
  }
  return payload.result;
}

if (checkRpc) {
  const chainIdValue = await rpcRequest("eth_chainId", []);
  const chainId = rpcQuantity(chainIdValue, "Chain-ID");
  if (chainId !== 84532n) {
    fail(`RPC meldet Chain-ID ${chainId} statt 84532.`);
  }
  const [blockNumberValue, balanceValue] = await Promise.all([
    rpcRequest("eth_blockNumber", []),
    rpcRequest("eth_getBalance", [deployer, "latest"]),
  ]);
  const blockNumber = rpcQuantity(blockNumberValue, "Blocknummer");
  const balance = rpcQuantity(balanceValue, "Deployer-Bestand");
  console.log(`Base-Sepolia-RPC: Block ${blockNumber}, Chain-ID 84532.`);
  console.log(`Deployer-Test-ETH: ${formatEther(balance)} ETH.`);
  if (balance === 0n) {
    console.log("Hinweis: Deployment-Wallet muss noch über einen Faucet finanziert werden.");
  }
}
