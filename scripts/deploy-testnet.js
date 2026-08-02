import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { config as loadEnvironment, parse as parseEnvironment } from "dotenv";
import { getAddress, Wallet } from "ethers";
import { readPasswordFromStandardInput } from "./lib/password-transport.js";

function fail(message) {
  throw new Error(message);
}

if (process.env.REIST_CONFIRM_BASE_SEPOLIA_DEPLOY !== "DEPLOY") {
  fail("Deployment verlangt die interaktive Bestätigung des PowerShell-Wrappers.");
}
delete process.env.REIST_CONFIRM_BASE_SEPOLIA_DEPLOY;

const environmentPath = resolve(".env");
if (!existsSync(environmentPath)) {
  fail("Lokale .env-Konfiguration fehlt.");
}
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

function environmentAddress(name) {
  try {
    return getAddress(String(process.env[name] || "").trim());
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

const roles = [
  ["deployer", "TESTNET_DEPLOYER_ADDRESS"],
  ["founder-beneficiary", "FOUNDER_BENEFICIARY"],
  ["research-treasury", "RESEARCH_REWARDS_TREASURY"],
  ["ecosystem-treasury", "ECOSYSTEM_TREASURY"],
];
const expectedAddresses = Object.fromEntries(
  roles.map(([id, environmentName]) => [id, environmentAddress(environmentName)])
);
const keystoreDirectory = externalKeystoreDirectory(
  String(process.env.REIST_KEYSTORE_DIRECTORY || "").trim()
);
if (
  new Set(
    Object.values(expectedAddresses).map((address) => address.toLowerCase())
  ).size !== roles.length
) {
  fail("Deployment- und Empfängeradressen müssen paarweise verschieden sein.");
}
const deploymentEnvironment = {};
for (const name of [
  "BASE_SEPOLIA_RPC_URL",
  "FOUNDER_BENEFICIARY",
  "RESEARCH_REWARDS_TREASURY",
  "ECOSYSTEM_TREASURY",
  "REIST_PAPER_DOI",
]) {
  const value = String(process.env[name] || "").trim();
  if (!value) fail(`${name} fehlt.`);
  deploymentEnvironment[name] = value;
}

let password = "";
let privateKey = "";
let recoveredWallet;
let childEnvironment;
try {
  password = readPasswordFromStandardInput();
  for (const [id] of roles) {
    const keystorePath = resolve(
      join(keystoreDirectory, `${id}.keystore.json`)
    );
    if (!existsSync(keystorePath)) {
      fail(`Verschlüsselter Keystore fehlt: ${id}.`);
    }
    try {
      recoveredWallet = await Wallet.fromEncryptedJson(
        readFileSync(keystorePath, "utf8"),
        password
      );
    } catch {
      fail(`Keystore konnte nicht entschlüsselt werden: ${id}.`);
    }
    if (getAddress(recoveredWallet.address) !== expectedAddresses[id]) {
      fail(`Entschlüsselter Keystore gehört nicht zur konfigurierten Rolle: ${id}.`);
    }
    if (id === "deployer") {
      privateKey = recoveredWallet.privateKey;
    }
    recoveredWallet = null;
  }
  password = "";

  const hardhatCli = resolve("node_modules/hardhat/dist/src/cli.js");
  if (!existsSync(hardhatCli)) {
    fail("Lokale Hardhat-CLI fehlt; zuerst npm ci ausführen.");
  }
  const allowedInheritedEnvironment = new Set([
    "APPDATA",
    "CI",
    "COMSPEC",
    "HARDHAT_TELEMETRY_DISABLED",
    "LOCALAPPDATA",
    "NO_COLOR",
    "OS",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "WINDIR",
  ]);
  childEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      allowedInheritedEnvironment.has(name.toUpperCase())
    )
  );
  Object.assign(childEnvironment, deploymentEnvironment, {
    TESTNET_DEPLOYER_PRIVATE_KEY: privateKey,
  });
  const result = spawnSync(
    process.execPath,
    [
      hardhatCli,
      "run",
      "scripts/deploy-reist.js",
      "--network",
      "baseSepolia",
      "--no-compile",
    ],
    {
      cwd: resolve("."),
      env: childEnvironment,
      shell: false,
      stdio: "inherit",
      windowsHide: false,
    }
  );
  if (result.error) {
    fail("Hardhat-Deployment-Prozess konnte nicht gestartet werden.");
  }
  if (result.status !== 0) {
    fail(`Hardhat-Deployment ist mit Exit-Code ${result.status} fehlgeschlagen.`);
  }
} finally {
  password = "";
  privateKey = "";
  recoveredWallet = null;
  if (childEnvironment) {
    delete childEnvironment.TESTNET_DEPLOYER_PRIVATE_KEY;
  }
}
