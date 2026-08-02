import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseEnvironment } from "dotenv";
import {
  Contract,
  ContractFactory,
  FetchRequest,
  JsonRpcProvider,
  Transaction,
  ZeroAddress,
  formatEther,
  formatUnits,
  getAddress,
} from "ethers";
import {
  assertNoAmbiguousBuildInfo,
  loadCurrentReistBuild,
} from "./lib/build-provenance.js";
import { CANONICAL_PAPER_DOI } from "./lib/project-identity.js";

const EXPECTED_CHAIN_ID = 84532n;
const FUNDED_STATUS = "wallets-created-recovery-checked-funded-not-deployed";
const GAS_BUFFER_PERCENT = 20n;
const GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000F";
const TOKEN_ARTIFACT = resolve(
  "artifacts",
  "contracts",
  "REISTToken.sol",
  "REISTToken.json"
);

function fail(message) {
  throw new Error(message);
}

function readJson(path, description) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${description} ist nicht als gültiges JSON lesbar.`);
  }
}

function requiredConfiguration(environment, name) {
  const value = String(environment[name] || "").trim();
  if (!value) fail(`Lokale Testnet-Konfiguration fehlt: ${name}.`);
  return value;
}

function checkedAddress(environment, name) {
  try {
    const address = getAddress(requiredConfiguration(environment, name));
    if (address === ZeroAddress) fail(`${name} darf nicht die Nulladresse sein.`);
    return address;
  } catch {
    fail(`${name} ist keine gültige Ethereum-Adresse.`);
  }
}

function formatRatio(numerator, denominator) {
  if (denominator === 0n) return "unbegrenzt";
  const hundredths = (numerator * 100n) / denominator;
  return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}`;
}

const environmentPath = resolve(".env");
if (!existsSync(environmentPath)) fail("Lokale .env-Konfiguration fehlt.");
let environment;
try {
  environment = parseEnvironment(readFileSync(environmentPath));
} catch {
  fail("Lokale .env-Konfiguration ist nicht lesbar.");
}
if (Object.hasOwn(environment, "TESTNET_DEPLOYER_PRIVATE_KEY")) {
  fail(".env darf keinen dauerhaft gespeicherten Deployer-Private-Key enthalten.");
}

const rpcUrl = requiredConfiguration(environment, "BASE_SEPOLIA_RPC_URL");
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

if (
  requiredConfiguration(environment, "REIST_PAPER_DOI") !==
  CANONICAL_PAPER_DOI
) {
  fail(`REIST_PAPER_DOI muss ${CANONICAL_PAPER_DOI} entsprechen.`);
}

const deployer = checkedAddress(environment, "TESTNET_DEPLOYER_ADDRESS");
const founder = checkedAddress(environment, "FOUNDER_BENEFICIARY");
const research = checkedAddress(environment, "RESEARCH_REWARDS_TREASURY");
const ecosystem = checkedAddress(environment, "ECOSYSTEM_TREASURY");
if (
  new Set([deployer, founder, research, ecosystem].map((value) => value.toLowerCase()))
    .size !== 4
) {
  fail("Deployment- und Empfängeradressen müssen paarweise verschieden sein.");
}

const publicRoles = readJson(
  resolve("data", "testnet-roles.json"),
  "Öffentliches Testnet-Rollenregister"
);
if (
  publicRoles.chainId !== Number(EXPECTED_CHAIN_ID) ||
  publicRoles.network !== "Base Sepolia" ||
  publicRoles.status !== FUNDED_STATUS
) {
  fail("Öffentliches Testnet-Rollenregister ist nicht finanziert und deploymentbereit.");
}
for (const [roleName, configuredAddress] of [
  ["deployer", deployer],
  ["founderBeneficiary", founder],
  ["researchRewardsTreasury", research],
  ["ecosystemTreasury", ecosystem],
]) {
  let publicAddress;
  try {
    publicAddress = getAddress(publicRoles.roles?.[roleName]);
  } catch {
    fail(`Öffentliches Testnet-Rollenregister enthält ${roleName} nicht korrekt.`);
  }
  if (publicAddress !== configuredAddress) {
    fail(`Lokale Konfiguration widerspricht dem Rollenregister: ${roleName}.`);
  }
}

assertNoAmbiguousBuildInfo();
loadCurrentReistBuild();
const artifact = readJson(TOKEN_ARTIFACT, "REISTToken-Artefakt");
if (!/^0x[0-9a-f]+$/i.test(artifact.bytecode || "")) {
  fail("REISTToken-Artefakt enthält keinen Deployment-Bytecode.");
}

const rpcRequest = new FetchRequest(rpcUrl);
rpcRequest.timeout = 10_000;
const provider = new JsonRpcProvider(rpcRequest, EXPECTED_CHAIN_ID, {
  staticNetwork: true,
});

try {
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    fail(`RPC meldet Chain-ID ${network.chainId} statt ${EXPECTED_CHAIN_ID}.`);
  }

  const deployTransaction = await new ContractFactory(
    artifact.abi,
    artifact.bytecode
  ).getDeployTransaction(founder, research, ecosystem);
  const [gasEstimate, feeData, nonce, balance, block] = await Promise.all([
    provider.estimateGas({ from: deployer, data: deployTransaction.data }),
    provider.getFeeData(),
    provider.getTransactionCount(deployer, "pending"),
    provider.getBalance(deployer),
    provider.getBlock("latest"),
  ]);
  if (!block) fail("Aktueller Base-Sepolia-Block ist nicht abrufbar.");

  const gasPrice = feeData.gasPrice;
  const maxFeePerGas = feeData.maxFeePerGas ?? gasPrice;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
  if (gasPrice == null || maxFeePerGas == null) {
    fail("RPC liefert keine vollständigen EIP-1559-Gebührendaten.");
  }

  const bufferedGas =
    (gasEstimate * (100n + GAS_BUFFER_PERCENT) + 99n) / 100n;
  const baseTransaction = {
    type: 2,
    chainId: EXPECTED_CHAIN_ID,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
    value: 0n,
    data: deployTransaction.data,
  };
  const estimatedUnsigned = Transaction.from({
    ...baseTransaction,
    gasLimit: gasEstimate,
  }).unsignedSerialized;
  const bufferedUnsigned = Transaction.from({
    ...baseTransaction,
    gasLimit: bufferedGas,
  }).unsignedSerialized;
  const bufferedUnsignedBytes = (bufferedUnsigned.length - 2) / 2;

  const oracle = new Contract(
    GAS_PRICE_ORACLE,
    [
      "function getL1Fee(bytes) view returns (uint256)",
      "function getL1FeeUpperBound(uint256) view returns (uint256)",
      "function getOperatorFee(uint256) view returns (uint256)",
    ],
    provider
  );
  const [l1FeeEstimate, l1FeeUpperBound, operatorFee, operatorFeeBuffered] =
    await Promise.all([
      oracle.getL1Fee(estimatedUnsigned),
      oracle.getL1FeeUpperBound(bufferedUnsignedBytes),
      oracle.getOperatorFee(gasEstimate),
      oracle.getOperatorFee(bufferedGas),
    ]);

  const expectedTotal =
    gasEstimate * gasPrice + l1FeeEstimate + operatorFee;
  const conservativeTotal =
    bufferedGas * maxFeePerGas + l1FeeUpperBound + operatorFeeBuffered;
  const checkedAt = new Date().toISOString();
  const result = {
    checkedAt,
    network: "Base Sepolia",
    chainId: Number(network.chainId),
    blockNumber: block.number,
    deployer,
    deployerBalanceWei: balance.toString(),
    deployerBalanceEth: formatEther(balance),
    gasEstimate: gasEstimate.toString(),
    bufferedGas: bufferedGas.toString(),
    gasPriceGwei: formatUnits(gasPrice, "gwei"),
    maxFeePerGasGwei: formatUnits(maxFeePerGas, "gwei"),
    l1FeeEstimateEth: formatEther(l1FeeEstimate),
    l1FeeUpperBoundEth: formatEther(l1FeeUpperBound),
    operatorFeeBufferedEth: formatEther(operatorFeeBuffered),
    expectedTotalEth: formatEther(expectedTotal),
    conservativeTotalEth: formatEther(conservativeTotal),
    balanceCoverage: formatRatio(balance, conservativeTotal),
    sufficientForConservativeEstimate: balance >= conservativeTotal,
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("REIST Research Token — Base-Sepolia-Kostenschätzung");
    console.log(`Stand: ${checkedAt}, Block ${block.number}`);
    console.log(`Deployment-Gas: ${gasEstimate} (mit 20 % Puffer: ${bufferedGas})`);
    console.log(`Aktuelle Gesamtschätzung: ${result.expectedTotalEth} ETH`);
    console.log(
      `Konservative aktuelle Kostenschätzung: ${result.conservativeTotalEth} ETH`
    );
    console.log(`Deployer-Bestand: ${result.deployerBalanceEth} ETH`);
    console.log(`Deckung dieser Schätzung: ${result.balanceCoverage}-fach`);
    console.log("Nur Lesefunktionen verwendet; kein Schlüssel, keine Signatur, keine Transaktion.");
  }

  if (!result.sufficientForConservativeEstimate) {
    fail("Deployer-Bestand deckt die konservative Kostenschätzung nicht.");
  }
} catch (error) {
  if (error?.code === "TIMEOUT") {
    fail("Base-Sepolia-RPC antwortet nicht innerhalb von 10 Sekunden.");
  }
  throw error;
} finally {
  await provider.destroy();
}
