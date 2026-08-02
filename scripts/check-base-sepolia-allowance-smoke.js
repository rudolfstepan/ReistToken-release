import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseEnvironment } from "dotenv";
import {
  Contract,
  FetchRequest,
  Interface,
  JsonRpcProvider,
  formatEther,
  getAddress,
  keccak256,
  parseUnits,
} from "ethers";
import {
  ALLOWANCE_JOURNAL_FILENAME,
  ALLOWANCE_TOTAL_FEE_CAP,
  BASELINE_ECOSYSTEM_TOKENS,
  BASELINE_RESEARCH_TOKENS,
  CLEAR_ALLOWANCE_CALLDATA,
  CLEAR_ALLOWANCE_GAS_LIMIT,
  PREPARED_PLAN_PATH,
  SET_ALLOWANCE_CALLDATA,
  SET_ALLOWANCE_GAS_LIMIT,
  assertAllowanceFeeCaps,
  assertFreshAllowanceBaseline,
  validateAllowanceJournal,
  validateAllowancePublicConfiguration,
  validatePreparedAllowancePlan,
} from "./lib/base-sepolia-allowance-plan.js";
import {
  BASE_SEPOLIA_CHAIN_ID,
  readJson,
} from "./lib/base-sepolia-smoke-plan.js";

const MANIFEST_PATH = resolve("deployments", "base-sepolia.json");
const ROLES_PATH = resolve("data", "testnet-roles.json");
const PROJECT_PATH = resolve("data", "project.json");
const PRIOR_OPERATION_PATH = resolve(
  "operations",
  "base-sepolia-smoke-transfer.json"
);
const PREPARED_PLAN_FILE = resolve(PREPARED_PLAN_PATH);
const COMPLETED_EVIDENCE_PATH = resolve(
  "operations",
  "base-sepolia-allowance-roundtrip.json"
);
const GAS_ORACLE = "0x420000000000000000000000000000000000000F";
const CONSERVATIVE_SIGNED_BYTE_LENGTH = 256n;
const ERC20_ABI = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function researchRewardsTreasury() view returns (address)",
  "function ecosystemTreasury() view returns (address)",
];
const FORBIDDEN_SECRET_ENVIRONMENT_NAMES = [
  "TESTNET_DEPLOYER_PRIVATE_KEY",
  "RESEARCH_TREASURY_PRIVATE_KEY",
  "REIST_WALLET_PASSWORD",
  "MNEMONIC",
  "SEED_PHRASE",
];

class AllowancePrecheckError extends Error {}

function fail(message) {
  throw new AllowancePrecheckError(message);
}

function configuredEnvironment() {
  const configuredPath = String(process.env.REIST_ALLOWANCE_ENV_FILE || "").trim();
  delete process.env.REIST_ALLOWANCE_ENV_FILE;
  const environmentPath = configuredPath ? resolve(configuredPath) : resolve(".env");
  if (configuredPath) {
    const relation = relative(resolve("."), environmentPath);
    if (
      !isAbsolute(configuredPath) ||
      !relation ||
      (!relation.startsWith("..") && !isAbsolute(relation))
    ) {
      fail("REIST_ALLOWANCE_ENV_FILE muss absolut außerhalb des Repositorys liegen.");
    }
  }
  if (!existsSync(environmentPath)) fail("Lokale .env-Konfiguration fehlt.");
  const source = readFileSync(environmentPath, "utf8");
  for (const name of [
    "BASE_SEPOLIA_RPC_URL",
    "REIST_KEYSTORE_DIRECTORY",
    "RESEARCH_REWARDS_TREASURY",
    "ECOSYSTEM_TREASURY",
  ]) {
    const entries = source
      .split(/\r?\n/)
      .filter((line) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line));
    if (entries.length !== 1) fail(`${name} muss in der lokalen .env exakt einmal vorkommen.`);
  }
  const environment = parseEnvironment(source);
  for (const forbidden of FORBIDDEN_SECRET_ENVIRONMENT_NAMES) {
    if (Object.hasOwn(environment, forbidden)) {
      fail("Private Keys, Passwörter, Mnemonics und Seed-Phrasen dürfen nicht in .env stehen.");
    }
  }
  let rpcUrl;
  try {
    rpcUrl = new URL(String(environment.BASE_SEPOLIA_RPC_URL || ""));
  } catch {
    fail("BASE_SEPOLIA_RPC_URL ist ungültig.");
  }
  if (rpcUrl.protocol !== "https:" || rpcUrl.username || rpcUrl.password) {
    fail("Base-Sepolia-RPC muss HTTPS ohne eingebettete Zugangsdaten verwenden.");
  }
  const keystoreValue = String(environment.REIST_KEYSTORE_DIRECTORY || "");
  if (!isAbsolute(keystoreValue)) fail("REIST_KEYSTORE_DIRECTORY muss absolut sein.");
  const keystoreDirectory = resolve(keystoreValue);
  const relation = relative(resolve("."), keystoreDirectory);
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation))) {
    fail("Keystore-Verzeichnis muss außerhalb des Repositorys liegen.");
  }
  return { environment, keystoreDirectory, rpcUrl };
}

async function feeUpperBound(oracle, gasLimit, maxFeePerGas) {
  const [l1, operator] = await Promise.all([
    oracle.getL1FeeUpperBound(CONSERVATIVE_SIGNED_BYTE_LENGTH),
    oracle.getOperatorFee(gasLimit),
  ]);
  return gasLimit * maxFeePerGas + (l1 + operator) * 4n;
}

async function main() {
  if (process.argv.length !== 2) fail("Dieser Read-only-Precheck akzeptiert keine Parameter.");
  delete process.env.NODE_OPTIONS;
  delete process.env.NODE_PATH;
  for (const name of FORBIDDEN_SECRET_ENVIRONMENT_NAMES) {
    delete process.env[name];
  }

  if (existsSync(COMPLETED_EVIDENCE_PATH)) {
    fail("Allowance-Operationsnachweis existiert bereits; keine erneute Ausführung vorbereiten.");
  }
  const plan = readJson(PREPARED_PLAN_FILE, "Vorbereiteter Allowance-Plan");
  validatePreparedAllowancePlan(plan);
  const { environment, keystoreDirectory, rpcUrl } = configuredEnvironment();
  const publicConfig = validateAllowancePublicConfiguration(
    readJson(MANIFEST_PATH, "Deployment-Manifest"),
    readJson(ROLES_PATH, "Rollenregister"),
    readJson(PROJECT_PATH, "Projektstatus"),
    readJson(PRIOR_OPERATION_PATH, "Treasury-Operationsnachweis")
  );
  for (const [name, expected] of [
    ["RESEARCH_REWARDS_TREASURY", publicConfig.research],
    ["ECOSYSTEM_TREASURY", publicConfig.ecosystem],
  ]) {
    if (getAddress(String(environment[name] || "")) !== expected) {
      fail(`Lokale Konfiguration widerspricht ${name}.`);
    }
  }

  const request = new FetchRequest(rpcUrl.toString());
  request.timeout = 10_000;
  const provider = new JsonRpcProvider(request, BASE_SEPOLIA_CHAIN_ID, {
    staticNetwork: true,
  });
  try {
    if ((await provider.getNetwork()).chainId !== BASE_SEPOLIA_CHAIN_ID) {
      fail("RPC ist nicht Base Sepolia.");
    }
    const journalPath = join(keystoreDirectory, ALLOWANCE_JOURNAL_FILENAME);
    if (existsSync(journalPath)) {
      const journal = readJson(journalPath, "Allowance-Recovery-Journal");
      validateAllowanceJournal(journal);
      console.log("Allowance-Precheck: gültiges Recovery-Journal vorhanden.");
      console.log("Der Executor darf ausschließlich die darin gebundenen Hashes fortsetzen.");
      console.log("Keine Transaktion wurde durch diesen Precheck signiert oder gesendet.");
      return;
    }

    const baselineNumber = await provider.getBlockNumber();
    const baselineBlock = await provider.getBlock(baselineNumber);
    if (!baselineBlock?.hash) fail("Kanonischer Baseline-Block ist nicht abrufbar.");
    const tokenCode = await provider.getCode(publicConfig.token, baselineNumber);
    const deployment = readJson(MANIFEST_PATH, "Deployment-Manifest");
    if (
      tokenCode === "0x" ||
      keccak256(tokenCode) !== deployment.runtimeCodeHashes.token
    ) {
      fail("REISTToken-Runtime stimmt nicht mit dem verifizierten Deployment überein.");
    }
    for (const address of [publicConfig.research, publicConfig.ecosystem]) {
      if ((await provider.getCode(address, baselineNumber)) !== "0x") {
        fail("Eine feste Treasury-Rolle ist keine EOA.");
      }
    }

    const token = new Contract(publicConfig.token, ERC20_ABI, provider);
    const blockTag = { blockTag: baselineNumber };
    const [
      decimals,
      totalSupply,
      onchainResearch,
      onchainEcosystem,
      researchTokens,
      ecosystemTokens,
      allowance,
      researchEth,
      latestNonce,
      pendingNonce,
    ] = await Promise.all([
      token.decimals(blockTag),
      token.totalSupply(blockTag),
      token.researchRewardsTreasury(blockTag),
      token.ecosystemTreasury(blockTag),
      token.balanceOf(publicConfig.research, blockTag),
      token.balanceOf(publicConfig.ecosystem, blockTag),
      token.allowance(publicConfig.research, publicConfig.ecosystem, blockTag),
      provider.getBalance(publicConfig.research, baselineNumber),
      provider.getTransactionCount(publicConfig.research, baselineNumber),
      provider.getTransactionCount(publicConfig.research, "pending"),
    ]);
    if (
      decimals !== 18n ||
      totalSupply !== parseUnits("1000000", 18) ||
      getAddress(onchainResearch) !== publicConfig.research ||
      getAddress(onchainEcosystem) !== publicConfig.ecosystem
    ) {
      fail("On-chain Token-Invarianten widersprechen dem verifizierten Deployment.");
    }
    assertFreshAllowanceBaseline({
      latestNonce,
      pendingNonce,
      researchTokens,
      ecosystemTokens,
      allowance,
      researchEth,
    });
    if (
      researchTokens !== BASELINE_RESEARCH_TOKENS ||
      ecosystemTokens !== BASELINE_ECOSYSTEM_TOKENS
    ) {
      fail("Allowance-Plan verwendet nicht die bestätigten Treasury-Endstände.");
    }

    const tokenInterface = new Interface(ERC20_ABI);
    const expectedSet = tokenInterface.encodeFunctionData("approve", [
      publicConfig.ecosystem,
      parseUnits("1", 18),
    ]);
    const expectedClear = tokenInterface.encodeFunctionData("approve", [
      publicConfig.ecosystem,
      0n,
    ]);
    if (
      expectedSet.toLowerCase() !== SET_ALLOWANCE_CALLDATA ||
      expectedClear.toLowerCase() !== CLEAR_ALLOWANCE_CALLDATA
    ) {
      fail("ABI-kodierte Approval-Aufrufe weichen vom öffentlichen Plan ab.");
    }
    for (const [label, data] of [
      ["Allowance-Setzen", SET_ALLOWANCE_CALLDATA],
      ["Allowance-Widerruf", CLEAR_ALLOWANCE_CALLDATA],
    ]) {
      const simulated = await provider.call({
        from: publicConfig.research,
        to: publicConfig.token,
        value: 0n,
        data,
        blockTag: baselineNumber,
      });
      if (!tokenInterface.decodeFunctionResult("approve", simulated)[0]) {
        fail(`${label}-Simulation gab nicht true zurück.`);
      }
    }
    const [setGasEstimate, clearGasEstimate, feeData] = await Promise.all([
      provider.estimateGas({
        from: publicConfig.research,
        to: publicConfig.token,
        value: 0n,
        data: SET_ALLOWANCE_CALLDATA,
      }),
      provider.estimateGas({
        from: publicConfig.research,
        to: publicConfig.token,
        value: 0n,
        data: CLEAR_ALLOWANCE_CALLDATA,
      }),
      provider.getFeeData(),
    ]);
    if (feeData.maxFeePerGas == null || feeData.maxPriorityFeePerGas == null) {
      fail("RPC liefert keine EIP-1559-Gebühren.");
    }
    if (
      setGasEstimate > SET_ALLOWANCE_GAS_LIMIT ||
      clearGasEstimate > CLEAR_ALLOWANCE_GAS_LIMIT
    ) {
      fail("Aktuelle Approval-Gasschätzung überschreitet die gebundenen Gaslimits.");
    }
    const oracle = new Contract(
      GAS_ORACLE,
      [
        "function getL1FeeUpperBound(uint256) view returns (uint256)",
        "function getOperatorFee(uint256) view returns (uint256)",
      ],
      provider
    );
    const [setUpper, clearUpper] = await Promise.all([
      feeUpperBound(oracle, SET_ALLOWANCE_GAS_LIMIT, feeData.maxFeePerGas),
      feeUpperBound(oracle, CLEAR_ALLOWANCE_GAS_LIMIT, feeData.maxFeePerGas),
    ]);
    assertAllowanceFeeCaps(setUpper, clearUpper);
    const confirmationBlock = await provider.getBlock(baselineNumber);
    if (!confirmationBlock || confirmationBlock.hash !== baselineBlock.hash) {
      fail("Baseline-Block änderte sich während des Read-only-Prechecks.");
    }

    console.log("Allowance-Precheck erfolgreich (ausschließlich lesend).");
    console.log(`Baseline: Block ${baselineNumber}, Research-Nonce 1.`);
    console.log("Plan: 1 Testnet-REIST erlauben und unmittelbar wieder auf 0 widerrufen.");
    console.log(`Research-Test-ETH: ${formatEther(researchEth)} ETH.`);
    console.log(
      `Konservative Pre-Broadcast-Freigabegrenze: ${formatEther(ALLOWANCE_TOTAL_FEE_CAP)} ETH.`
    );
    console.log(
      `Gebundene Gaslimits: ${SET_ALLOWANCE_GAS_LIMIT} / ${CLEAR_ALLOWANCE_GAS_LIMIT}.`
    );
    console.log("Keine Tokenbewegung; keine Signatur; kein Broadcast.");
  } finally {
    await provider.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    const message =
      error instanceof AllowancePrecheckError
        ? error.message
        : "Unerwarteter Fehler; Details wurden zum Schutz lokaler RPC-Zugangsdaten unterdrückt.";
    console.error(`Fehler: ${message}`);
    process.exitCode = 1;
  }
}
