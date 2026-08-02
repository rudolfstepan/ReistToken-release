import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseEnvironment } from "dotenv";
import {
  Contract,
  FetchRequest,
  Interface,
  JsonRpcProvider,
  Transaction,
  Wallet,
  getAddress,
  keccak256,
  parseUnits,
} from "ethers";
import { readPasswordFromStandardInput } from "./lib/password-transport.js";
import {
  ALLOWANCE_EVIDENCE_PATH,
  ALLOWANCE_JOURNAL_FILENAME,
  ALLOWANCE_OPERATION_ID,
  ALLOWANCE_TOTAL_FEE_CAP,
  ALLOWANCE_VALUE,
  BASELINE_ECOSYSTEM_TOKENS,
  BASELINE_RESEARCH_TOKENS,
  CLEAR_ALLOWANCE_CALLDATA,
  CLEAR_ALLOWANCE_FEE_CAP,
  CLEAR_ALLOWANCE_GAS_LIMIT,
  CLEAR_ALLOWANCE_NONCE,
  PREPARED_PLAN_PATH,
  REQUIRED_ALLOWANCE_CONFIRMATION_BLOCKS,
  SET_ALLOWANCE_CALLDATA,
  SET_ALLOWANCE_FEE_CAP,
  SET_ALLOWANCE_GAS_LIMIT,
  SET_ALLOWANCE_NONCE,
  allowanceTransactionFromFields,
  assertAllowanceFeeCaps,
  assertFinalAllowanceRoundtrip,
  assertFreshAllowanceBaseline,
  createAllowanceJournal,
  validateAllowanceJournal,
  validateAllowancePublicConfiguration,
  validatePreparedAllowancePlan,
} from "./lib/base-sepolia-allowance-plan.js";
import {
  BASE_SEPOLIA_CHAIN_ID,
  readJson,
  signAndBind,
  writeJsonAtomically,
} from "./lib/base-sepolia-smoke-plan.js";
import { PUBLIC_RELEASE_REPOSITORY } from "./lib/project-identity.js";
import { assertPublicCommitPublished } from "./lib/repository-provenance.js";

const MANIFEST_PATH = resolve("deployments", "base-sepolia.json");
const ROLES_PATH = resolve("data", "testnet-roles.json");
const PROJECT_PATH = resolve("data", "project.json");
const PRIOR_OPERATION_PATH = resolve(
  "operations",
  "base-sepolia-smoke-transfer.json"
);
const PREPARED_PLAN_FILE = resolve(PREPARED_PLAN_PATH);
const OUTPUT_PATH = resolve(ALLOWANCE_EVIDENCE_PATH);
const GAS_ORACLE = "0x420000000000000000000000000000000000000F";
const ERC20_ABI = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function researchRewardsTreasury() view returns (address)",
  "function ecosystemTreasury() view returns (address)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
];
const FORBIDDEN_SECRET_ENVIRONMENT_NAMES = [
  "TESTNET_DEPLOYER_PRIVATE_KEY",
  "RESEARCH_TREASURY_PRIVATE_KEY",
  "REIST_WALLET_PASSWORD",
  "MNEMONIC",
  "SEED_PHRASE",
];

class AllowanceOperationalError extends Error {}

function fail(message) {
  throw new AllowanceOperationalError(message);
}

function sameHex(actual, expected) {
  return String(actual || "").toLowerCase() === String(expected || "").toLowerCase();
}

function gitOutput(args) {
  const childEnvironment = { ...process.env };
  for (const name of FORBIDDEN_SECRET_ENVIRONMENT_NAMES) {
    delete childEnvironment[name];
  }
  const result = spawnSync("git", args, {
    cwd: resolve("."),
    encoding: "utf8",
    env: childEnvironment,
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) fail("Lokale Git-Provenienz konnte nicht geprüft werden.");
  return result.stdout.trim();
}

function toolingCommit() {
  const commit = gitOutput(["rev-parse", "HEAD"]).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commit)) fail("Git-HEAD ist ungültig.");
  if (gitOutput(["status", "--porcelain", "--untracked-files=no"])) {
    fail("Getrackte Dateien sind nicht sauber; Allowance-Tooling zuerst committen.");
  }
  assertPublicCommitPublished(PUBLIC_RELEASE_REPOSITORY, commit);
  return commit;
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

function transactionFields(transaction) {
  return {
    type: 2,
    chainId: transaction.chainId.toString(),
    nonce: transaction.nonce.toString(),
    to: transaction.to,
    valueWei: transaction.value.toString(),
    data: transaction.data,
    gasLimit: transaction.gasLimit.toString(),
    maxFeePerGas: transaction.maxFeePerGas.toString(),
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas.toString(),
    accessList: [],
  };
}

function assertBoundTransaction(transaction, entry, from, label) {
  const expected = allowanceTransactionFromFields(entry.fields, label);
  const accessList = transaction.accessList || [];
  if (
    !sameHex(transaction.hash, entry.hash) ||
    transaction.type !== 2 ||
    BigInt(transaction.chainId) !== BASE_SEPOLIA_CHAIN_ID ||
    getAddress(transaction.from) !== from ||
    getAddress(transaction.to) !== expected.to ||
    Number(transaction.nonce) !== expected.nonce ||
    BigInt(transaction.value) !== expected.value ||
    !sameHex(transaction.data, expected.data) ||
    BigInt(transaction.gasLimit) !== expected.gasLimit ||
    BigInt(transaction.maxFeePerGas) !== expected.maxFeePerGas ||
    BigInt(transaction.maxPriorityFeePerGas) !== expected.maxPriorityFeePerGas ||
    !Array.isArray(accessList) ||
    accessList.length !== 0
  ) {
    fail(`${label} widerspricht dem atomaren Recovery-Journal.`);
  }
}

function beginExactBroadcast(provider, signed) {
  try {
    return Promise.resolve(provider.broadcastTransaction(signed.raw));
  } catch (error) {
    return Promise.reject(error);
  }
}

function assertBroadcastResponse(result, signed, label) {
  if (
    result.status === "fulfilled" &&
    result.value &&
    !sameHex(result.value.hash, signed.hash)
  ) {
    fail(`${label}: RPC meldet einen fremden Transaktionshash.`);
  }
}

export async function ensureExactPairBroadcast(
  provider,
  setSigned,
  clearSigned,
  journal,
  from
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [setTransaction, setReceipt, clearTransaction, clearReceipt] =
      await Promise.all([
        provider.getTransaction(setSigned.hash),
        provider.getTransactionReceipt(setSigned.hash),
        provider.getTransaction(clearSigned.hash),
        provider.getTransactionReceipt(clearSigned.hash),
      ]);
    if (setTransaction) {
      assertBoundTransaction(
        setTransaction,
        journal.transactions.setAllowance,
        from,
        "Allowance-Setzen"
      );
    }
    if (clearTransaction) {
      assertBoundTransaction(
        clearTransaction,
        journal.transactions.clearAllowance,
        from,
        "Allowance-Widerruf"
      );
    }
    const setKnown = Boolean(setTransaction || setReceipt);
    const clearKnown = Boolean(clearTransaction || clearReceipt);
    if (setKnown && clearKnown) {
      return;
    }

    // Beide Requests werden vor dem ersten Await gestartet. Eine verlorene oder
    // verzögerte Set-Antwort kann den ersten Widerrufs-Broadcast daher nicht
    // aufhalten. Wiederholungen verwenden ausschließlich dieselben Raw-Hashes.
    const setAttempt = setKnown
      ? Promise.resolve(null)
      : beginExactBroadcast(provider, setSigned);
    const clearAttempt = clearKnown
      ? Promise.resolve(null)
      : beginExactBroadcast(provider, clearSigned);
    const [setResult, clearResult] = await Promise.allSettled([
      setAttempt,
      clearAttempt,
    ]);
    assertBroadcastResponse(setResult, setSigned, "Allowance-Setzen");
    assertBroadcastResponse(clearResult, clearSigned, "Allowance-Widerruf");
    await new Promise((done) => setTimeout(done, 750));
  }
  fail(
    "KRITISCH: Nicht beide gebundenen Hashes sind beim RPC sichtbar. " +
    "Recovery-Journal behalten und ausschließlich denselben Executor erneut starten."
  );
}

async function waitCanonical(provider, signedHash, entry, from, label) {
  let receipt;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    receipt = await provider.getTransactionReceipt(signedHash);
    if (receipt) {
      if (receipt.status !== 1) {
        fail(
          `${label} ist on-chain fehlgeschlagen. KRITISCH: Allowance-Zustand sofort read-only prüfen.`
        );
      }
      const height = await provider.getBlockNumber();
      if (height >= receipt.blockNumber + REQUIRED_ALLOWANCE_CONFIRMATION_BLOCKS) break;
    }
    await new Promise((done) => setTimeout(done, 2_000));
  }
  if (!receipt) fail(`${label}-Receipt wurde nicht rechtzeitig gefunden.`);
  const height = await provider.getBlockNumber();
  if (height < receipt.blockNumber + REQUIRED_ALLOWANCE_CONFIRMATION_BLOCKS) {
    fail(`${label}-Receipt erhielt nicht rechtzeitig zwei Bestätigungsblöcke.`);
  }
  const transaction = await provider.getTransaction(signedHash);
  if (!transaction) fail(`${label}-Transaktion ist nicht abrufbar.`);
  assertBoundTransaction(transaction, entry, from, label);
  if (
    !sameHex(receipt.hash, signedHash) ||
    getAddress(receipt.from) !== from ||
    getAddress(receipt.to) !== getAddress(entry.fields.to) ||
    !receipt.blockHash
  ) {
    fail(`${label}-Receipt widerspricht dem Recovery-Journal.`);
  }
  const [block, secondReceipt] = await Promise.all([
    provider.getBlock(receipt.blockNumber),
    provider.getTransactionReceipt(signedHash),
  ]);
  if (
    !block ||
    !sameHex(block.hash, receipt.blockHash) ||
    !block.transactions.some((hash) => sameHex(hash, signedHash)) ||
    !secondReceipt ||
    secondReceipt.blockNumber !== receipt.blockNumber ||
    !sameHex(secondReceipt.blockHash, receipt.blockHash)
  ) {
    fail(`${label} ist nach zwei Bestätigungsblöcken nicht kanonisch.`);
  }
  return receipt;
}

async function feeUpperBound(oracle, transaction, signedByteLength) {
  const [l1, operator] = await Promise.all([
    oracle.getL1FeeUpperBound(signedByteLength),
    oracle.getOperatorFee(transaction.gasLimit),
  ]);
  return transaction.gasLimit * transaction.maxFeePerGas + (l1 + operator) * 4n;
}

function assertReceiptEvent(
  tokenInterface,
  receipt,
  tokenAddress,
  owner,
  spender,
  expectedValue,
  label
) {
  const approvalTopic = tokenInterface.getEvent("Approval").topicHash;
  const transferTopic = tokenInterface.getEvent("Transfer").topicHash;
  const tokenLogs = receipt.logs.filter((log) => getAddress(log.address) === tokenAddress);
  const approvalLogs = tokenLogs.filter((log) => sameHex(log.topics?.[0], approvalTopic));
  const transferLogs = tokenLogs.filter((log) => sameHex(log.topics?.[0], transferTopic));
  if (approvalLogs.length !== 1 || transferLogs.length !== 0) {
    fail(`${label}-Receipt enthält nicht exakt ein Approval- und null Transfer-Events.`);
  }
  const parsed = tokenInterface.parseLog(approvalLogs[0]);
  if (
    getAddress(parsed.args.owner) !== owner ||
    getAddress(parsed.args.spender) !== spender ||
    BigInt(parsed.args.value) !== expectedValue
  ) {
    fail(`${label}-Approval-Event weicht vom autorisierten Wert ab.`);
  }
}

function assertSameCanonicalReceipt(initial, revalidated, label) {
  if (
    !sameHex(initial.hash, revalidated.hash) ||
    initial.status !== revalidated.status ||
    initial.blockNumber !== revalidated.blockNumber ||
    !sameHex(initial.blockHash, revalidated.blockHash) ||
    initial.index !== revalidated.index
  ) {
    fail(`${label}-Receipt änderte sich vor Erzeugung des Operationsnachweises.`);
  }
}

async function currentFreshBaseline(provider, token, publicConfig) {
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  if (!block?.hash) fail("Kanonischer Baseline-Block ist nicht abrufbar.");
  const blockTag = { blockTag: blockNumber };
  const [
    researchTokens,
    ecosystemTokens,
    allowance,
    researchEth,
    latestNonce,
    pendingNonce,
  ] = await Promise.all([
    token.balanceOf(publicConfig.research, blockTag),
    token.balanceOf(publicConfig.ecosystem, blockTag),
    token.allowance(publicConfig.research, publicConfig.ecosystem, blockTag),
    provider.getBalance(publicConfig.research, blockNumber),
    provider.getTransactionCount(publicConfig.research, blockNumber),
    provider.getTransactionCount(publicConfig.research, "pending"),
  ]);
  assertFreshAllowanceBaseline({
    latestNonce,
    pendingNonce,
    researchTokens,
    ecosystemTokens,
    allowance,
    researchEth,
  });
  const confirmation = await provider.getBlock(blockNumber);
  if (!confirmation || !sameHex(confirmation.hash, block.hash)) {
    fail("Baseline-Block änderte sich während der Vorbereitung.");
  }
  return { block, researchEth };
}

async function main() {
  if (process.argv.length !== 2) fail("Dieser Executor akzeptiert keine Parameter.");
  if (
    process.env.REIST_CONFIRM_BASE_SEPOLIA_ALLOWANCE !==
    "EXECUTE_EXACT_ALLOWANCE_ROUNDTRIP"
  ) {
    fail("Ausführung verlangt den interaktiven Allowance-PowerShell-Wrapper.");
  }
  delete process.env.REIST_CONFIRM_BASE_SEPOLIA_ALLOWANCE;
  delete process.env.NODE_OPTIONS;
  delete process.env.NODE_PATH;
  for (const name of FORBIDDEN_SECRET_ENVIRONMENT_NAMES) {
    delete process.env[name];
  }

  const commit = toolingCommit();
  if (existsSync(OUTPUT_PATH)) {
    fail("Öffentlicher Allowance-Operationsnachweis existiert bereits; keine Wiederholung.");
  }
  validatePreparedAllowancePlan(
    readJson(PREPARED_PLAN_FILE, "Vorbereiteter Allowance-Plan")
  );
  const { environment, keystoreDirectory, rpcUrl } = configuredEnvironment();
  const deployment = readJson(MANIFEST_PATH, "Deployment-Manifest");
  const publicConfig = validateAllowancePublicConfiguration(
    deployment,
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

  let password = "";
  let researchWallet;
  let setRaw = "";
  let clearRaw = "";
  try {
    password = readPasswordFromStandardInput();
    const researchKeystorePath = join(
      keystoreDirectory,
      "research-treasury.keystore.json"
    );
    if (!existsSync(researchKeystorePath)) {
      fail("Verschlüsselter Keystore fehlt: research-treasury.");
    }
    try {
      researchWallet = await Wallet.fromEncryptedJson(
        readFileSync(researchKeystorePath, "utf8"),
        password
      );
    } catch {
      fail("Research-Treasury-Keystore konnte nicht entschlüsselt werden.");
    }
    password = "";
    if (getAddress(researchWallet.address) !== publicConfig.research) {
      fail("Research-Treasury-Keystore besitzt die falsche Adresse.");
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
      const tokenCode = await provider.getCode(publicConfig.token);
      if (
        tokenCode === "0x" ||
        keccak256(tokenCode) !== deployment.runtimeCodeHashes.token
      ) {
        fail("REISTToken-Runtime stimmt nicht mit dem verifizierten Deployment überein.");
      }
      for (const address of [publicConfig.research, publicConfig.ecosystem]) {
        if ((await provider.getCode(address)) !== "0x") {
          fail("Eine feste Treasury-Rolle ist keine EOA.");
        }
      }

      const tokenInterface = new Interface(ERC20_ABI);
      if (
        tokenInterface
          .encodeFunctionData("approve", [publicConfig.ecosystem, ALLOWANCE_VALUE])
          .toLowerCase() !== SET_ALLOWANCE_CALLDATA ||
        tokenInterface
          .encodeFunctionData("approve", [publicConfig.ecosystem, 0n])
          .toLowerCase() !== CLEAR_ALLOWANCE_CALLDATA
      ) {
        fail("ABI-kodierte Approval-Aufrufe weichen vom öffentlichen Plan ab.");
      }
      const token = new Contract(publicConfig.token, ERC20_ABI, provider);
      const [decimals, totalSupply, onchainResearch, onchainEcosystem] =
        await Promise.all([
          token.decimals(),
          token.totalSupply(),
          token.researchRewardsTreasury(),
          token.ecosystemTreasury(),
        ]);
      if (
        decimals !== 18n ||
        totalSupply !== parseUnits("1000000", 18) ||
        getAddress(onchainResearch) !== publicConfig.research ||
        getAddress(onchainEcosystem) !== publicConfig.ecosystem
      ) {
        fail("On-chain Token-Invarianten widersprechen dem verifizierten Deployment.");
      }

      const journalPath = join(keystoreDirectory, ALLOWANCE_JOURNAL_FILENAME);
      let journal;
      if (existsSync(journalPath)) {
        journal = readJson(journalPath, "Allowance-Recovery-Journal");
        validateAllowanceJournal(journal);
        if (journal.toolingCommit !== commit) {
          fail("Recovery-Journal gehört zu einem anderen veröffentlichten Tooling-Commit.");
        }
      } else {
        const baseline = await currentFreshBaseline(provider, token, publicConfig);
        for (const [label, data] of [
          ["Allowance-Setzen", SET_ALLOWANCE_CALLDATA],
          ["Allowance-Widerruf", CLEAR_ALLOWANCE_CALLDATA],
        ]) {
          const simulated = await provider.call({
            from: publicConfig.research,
            to: publicConfig.token,
            value: 0n,
            data,
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
        const common = {
          type: 2,
          chainId: BASE_SEPOLIA_CHAIN_ID,
          to: publicConfig.token,
          value: 0n,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          accessList: [],
        };
        const setTransaction = Transaction.from({
          ...common,
          nonce: SET_ALLOWANCE_NONCE,
          data: SET_ALLOWANCE_CALLDATA,
          gasLimit: SET_ALLOWANCE_GAS_LIMIT,
        });
        const clearTransaction = Transaction.from({
          ...common,
          nonce: CLEAR_ALLOWANCE_NONCE,
          data: CLEAR_ALLOWANCE_CALLDATA,
          gasLimit: CLEAR_ALLOWANCE_GAS_LIMIT,
        });
        setRaw = await researchWallet.signTransaction(setTransaction);
        clearRaw = await researchWallet.signTransaction(clearTransaction);
        const oracle = new Contract(
          GAS_ORACLE,
          [
            "function getL1FeeUpperBound(uint256) view returns (uint256)",
            "function getOperatorFee(uint256) view returns (uint256)",
          ],
          provider
        );
        const [setUpper, clearUpper] = await Promise.all([
          feeUpperBound(oracle, setTransaction, (setRaw.length - 2) / 2),
          feeUpperBound(oracle, clearTransaction, (clearRaw.length - 2) / 2),
        ]);
        assertAllowanceFeeCaps(setUpper, clearUpper);
        journal = createAllowanceJournal({
          createdAt: new Date().toISOString(),
          toolingCommit: commit,
          baselineBlock: baseline.block,
          setFields: transactionFields(setTransaction),
          setHash: keccak256(setRaw),
          setFeeUpperBound: setUpper,
          clearFields: transactionFields(clearTransaction),
          clearHash: keccak256(clearRaw),
          clearFeeUpperBound: clearUpper,
        });
        writeJsonAtomically(journalPath, journal);
        setRaw = "";
        clearRaw = "";
      }

      validateAllowanceJournal(journal);
      const baselineBlock = await provider.getBlock(journal.baseline.blockNumber);
      if (!baselineBlock || !sameHex(baselineBlock.hash, journal.baseline.blockHash)) {
        fail("Gebundener Baseline-Block ist nicht mehr kanonisch.");
      }
      const setSigned = await signAndBind(
        researchWallet,
        journal.transactions.setAllowance.fields,
        journal.transactions.setAllowance.hash,
        "Allowance-Setzen"
      );
      const clearSigned = await signAndBind(
        researchWallet,
        journal.transactions.clearAllowance.fields,
        journal.transactions.clearAllowance.hash,
        "Allowance-Widerruf"
      );
      setRaw = setSigned.raw;
      clearRaw = clearSigned.raw;

      // Bei einem Recovery-Journal zählt ausschließlich die unveränderte,
      // bereits geprüfte Transaktionspaarung. Neue Gebühren- oder
      // Baseline-Gates dürfen den exakt vor-signierten Widerruf nicht aufhalten.
      await ensureExactPairBroadcast(
        provider,
        setSigned,
        clearSigned,
        journal,
        publicConfig.research
      );
      setRaw = "";
      clearRaw = "";

      const [setReceipt, clearReceipt] = await Promise.all([
        waitCanonical(
          provider,
          setSigned.hash,
          journal.transactions.setAllowance,
          publicConfig.research,
          "Allowance-Setzen"
        ),
        waitCanonical(
          provider,
          clearSigned.hash,
          journal.transactions.clearAllowance,
          publicConfig.research,
          "Allowance-Widerruf"
        ),
      ]);
      if (
        setReceipt.blockNumber > clearReceipt.blockNumber ||
        (setReceipt.blockNumber === clearReceipt.blockNumber &&
          setReceipt.index >= clearReceipt.index)
      ) {
        fail("Allowance-Receipts besitzen nicht die gebundene Setzen-Widerruf-Reihenfolge.");
      }
      assertReceiptEvent(
        tokenInterface,
        setReceipt,
        publicConfig.token,
        publicConfig.research,
        publicConfig.ecosystem,
        ALLOWANCE_VALUE,
        "Allowance-Setzen"
      );
      assertReceiptEvent(
        tokenInterface,
        clearReceipt,
        publicConfig.token,
        publicConfig.research,
        publicConfig.ecosystem,
        0n,
        "Allowance-Widerruf"
      );

      const baselineNumber = journal.baseline.blockNumber;
      const finalNumber = clearReceipt.blockNumber;
      if (finalNumber <= baselineNumber) {
        fail("Allowance-Receipts liegen nicht nach dem gebundenen Baseline-Block.");
      }
      const baselineTag = { blockTag: baselineNumber };
      const finalTag = { blockTag: finalNumber };
      const [
        baselineAllowance,
        finalAllowance,
        latestAllowance,
        researchTokensBefore,
        researchTokensAfter,
        ecosystemTokensBefore,
        ecosystemTokensAfter,
        totalSupplyBefore,
        totalSupplyAfter,
        researchEthBefore,
        researchEthAfter,
        finalLatestNonce,
        finalPendingNonce,
      ] = await Promise.all([
        token.allowance(publicConfig.research, publicConfig.ecosystem, baselineTag),
        token.allowance(publicConfig.research, publicConfig.ecosystem, finalTag),
        token.allowance(publicConfig.research, publicConfig.ecosystem),
        token.balanceOf(publicConfig.research, baselineTag),
        token.balanceOf(publicConfig.research, finalTag),
        token.balanceOf(publicConfig.ecosystem, baselineTag),
        token.balanceOf(publicConfig.ecosystem, finalTag),
        token.totalSupply(baselineTag),
        token.totalSupply(finalTag),
        provider.getBalance(publicConfig.research, baselineNumber),
        provider.getBalance(publicConfig.research, finalNumber),
        provider.getTransactionCount(publicConfig.research, "latest"),
        provider.getTransactionCount(publicConfig.research, "pending"),
      ]);
      assertFinalAllowanceRoundtrip({
        baselineAllowance,
        finalAllowance,
        latestAllowance,
        researchTokensBefore,
        researchTokensAfter,
        ecosystemTokensBefore,
        ecosystemTokensAfter,
        totalSupplyBefore,
        totalSupplyAfter,
      });
      const netResearchEthBalanceChange = researchEthAfter - researchEthBefore;
      const receiptReportedExecutionFeeTotal = setReceipt.fee + clearReceipt.fee;
      if (
        finalLatestNonce !== CLEAR_ALLOWANCE_NONCE + 1 ||
        finalPendingNonce !== CLEAR_ALLOWANCE_NONCE + 1
      ) {
        fail("Research-Treasury besitzt nach Abschluss nicht exakt Nonce 3.");
      }

      const [revalidatedSetReceipt, revalidatedClearReceipt] = await Promise.all([
        waitCanonical(
          provider,
          setSigned.hash,
          journal.transactions.setAllowance,
          publicConfig.research,
          "Allowance-Setzen"
        ),
        waitCanonical(
          provider,
          clearSigned.hash,
          journal.transactions.clearAllowance,
          publicConfig.research,
          "Allowance-Widerruf"
        ),
      ]);
      assertSameCanonicalReceipt(
        setReceipt,
        revalidatedSetReceipt,
        "Allowance-Setzen"
      );
      assertSameCanonicalReceipt(
        clearReceipt,
        revalidatedClearReceipt,
        "Allowance-Widerruf"
      );
      const transferTopic = tokenInterface.getEvent("Transfer").topicHash;
      const [completionBlock, revalidatedBaselineBlock, transferLogs] =
        await Promise.all([
          provider.getBlock(revalidatedClearReceipt.blockNumber),
          provider.getBlock(baselineNumber),
          provider.getLogs({
            address: publicConfig.token,
            topics: [transferTopic],
            fromBlock: baselineNumber + 1,
            toBlock: revalidatedClearReceipt.blockNumber,
          }),
        ]);
      if (
        !completionBlock ||
        !sameHex(completionBlock.hash, revalidatedClearReceipt.blockHash) ||
        !completionBlock.transactions.some((hash) =>
          sameHex(hash, clearSigned.hash)
        )
      ) {
        fail("Abschlussblock ist nicht an den kanonischen Widerrufs-Hash gebunden.");
      }
      if (
        !revalidatedBaselineBlock ||
        !sameHex(revalidatedBaselineBlock.hash, journal.baseline.blockHash)
      ) {
        fail("Gebundener Baseline-Block änderte sich vor Erzeugung des Operationsnachweises.");
      }
      if (transferLogs.length !== 0) {
        fail(
          "Der gebundene Blockbereich enthält mindestens ein REIST-Transfer-Event; " +
          "kein Allowance-Nachweis wird erzeugt."
        );
      }
      const [finalBaselineBlock, finalCompletionBlock, finalSetReceipt, finalClearReceipt] =
        await Promise.all([
          provider.getBlock(baselineNumber),
          provider.getBlock(revalidatedClearReceipt.blockNumber),
          provider.getTransactionReceipt(setSigned.hash),
          provider.getTransactionReceipt(clearSigned.hash),
        ]);
      if (
        !finalBaselineBlock ||
        !sameHex(finalBaselineBlock.hash, journal.baseline.blockHash) ||
        !finalCompletionBlock ||
        !sameHex(finalCompletionBlock.hash, completionBlock.hash) ||
        !finalSetReceipt ||
        !finalClearReceipt
      ) {
        fail("Kanonische Blockbindung änderte sich unmittelbar vor dem Operationsnachweis.");
      }
      assertSameCanonicalReceipt(
        revalidatedSetReceipt,
        finalSetReceipt,
        "Allowance-Setzen"
      );
      assertSameCanonicalReceipt(
        revalidatedClearReceipt,
        finalClearReceipt,
        "Allowance-Widerruf"
      );
      const evidence = {
        schemaVersion: 1,
        operationId: ALLOWANCE_OPERATION_ID,
        status: "completed",
        network: "Base Sepolia",
        chainId: Number(BASE_SEPOLIA_CHAIN_ID),
        toolingCommit: commit,
        completedAt: new Date(Number(completionBlock.timestamp) * 1000).toISOString(),
        purpose:
          "Technical ERC-20 allowance and revocation smoke test; no token transfer, bounty, contribution, sale, or mainnet operation.",
        plan: PREPARED_PLAN_PATH,
        priorOperation: "operations/base-sepolia-smoke-transfer.json",
        addresses: {
          owner: publicConfig.research,
          spender: publicConfig.ecosystem,
          token: publicConfig.token,
        },
        amount: {
          temporaryAllowanceBaseUnits: ALLOWANCE_VALUE.toString(),
          finalAllowanceBaseUnits: "0",
        },
        preBroadcastFeeThresholdsWei: {
          setAllowance: SET_ALLOWANCE_FEE_CAP.toString(),
          clearAllowance: CLEAR_ALLOWANCE_FEE_CAP.toString(),
          total: ALLOWANCE_TOTAL_FEE_CAP.toString(),
        },
        transactions: {
          setAllowance: {
            hash: setSigned.hash,
            nonce: SET_ALLOWANCE_NONCE,
            blockNumber: setReceipt.blockNumber,
            blockHash: setReceipt.blockHash,
            transactionIndex: setReceipt.index,
            feeUpperBoundWei: journal.transactions.setAllowance.feeUpperBoundWei,
            receiptReportedExecutionFeeWei: setReceipt.fee.toString(),
          },
          clearAllowance: {
            hash: clearSigned.hash,
            nonce: CLEAR_ALLOWANCE_NONCE,
            blockNumber: clearReceipt.blockNumber,
            blockHash: clearReceipt.blockHash,
            transactionIndex: clearReceipt.index,
            feeUpperBoundWei: journal.transactions.clearAllowance.feeUpperBoundWei,
            receiptReportedExecutionFeeWei: clearReceipt.fee.toString(),
          },
        },
        validation: {
          confirmationsAfterEach: REQUIRED_ALLOWANCE_CONFIRMATION_BLOCKS,
          canonicalReceipts: true,
          approvalEvents: [ALLOWANCE_VALUE.toString(), "0"],
          receiptTransferEvents: 0,
          tokenTransferEventsInBoundBlockRange: 0,
          transferLogRange: {
            token: publicConfig.token,
            topic: transferTopic,
            fromBlock: baselineNumber + 1,
            toBlock: revalidatedClearReceipt.blockNumber,
            baselineBlockHash: journal.baseline.blockHash,
            completionBlockHash: completionBlock.hash,
          },
          finalAllowanceBaseUnits: "0",
          unchangedTokenBalances: true,
          unchangedTotalSupply: true,
          preBroadcastFeePolicySatisfied: true,
          actualTotalNetworkFeeWei: null,
          actualTotalNetworkFeeStatus:
            "not-derived-from-account-balance-delta-or-receipt-execution-fee",
          receiptReportedExecutionFeeTotalWei:
            receiptReportedExecutionFeeTotal.toString(),
          netResearchEthBalanceChangeWei: netResearchEthBalanceChange.toString(),
        },
        finalBalances: {
          researchEthWei: researchEthAfter.toString(),
          researchTokenBaseUnits: researchTokensAfter.toString(),
          ecosystemTokenBaseUnits: ecosystemTokensAfter.toString(),
        },
        economicValue: "none-promised-testnet-only",
      };
      if (existsSync(OUTPUT_PATH)) {
        fail("Öffentlicher Allowance-Operationsnachweis existiert bereits; nicht überschrieben.");
      }
      writeJsonAtomically(OUTPUT_PATH, evidence);
      unlinkSync(journalPath);
      console.log("Base-Sepolia-Allowance-Roundtrip vollständig kanonisch validiert.");
      console.log(`Allowance setzen: ${setSigned.hash}`);
      console.log(`Allowance widerrufen: ${clearSigned.hash}`);
      console.log("Finale Allowance: 0; Tokenbewegungen: 0.");
    } finally {
      await provider.destroy();
    }
  } finally {
    password = "";
    setRaw = "";
    clearRaw = "";
    researchWallet = undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    const message =
      error instanceof AllowanceOperationalError
        ? error.message
        : "Unerwarteter Fehler; Details wurden zum Schutz lokaler RPC-Zugangsdaten " +
          "unterdrückt. Recovery-Journal nicht löschen, Allowance read-only prüfen und " +
          "ausschließlich denselben Executor fortsetzen.";
    console.error(`Fehler: ${message}`);
    process.exitCode = 1;
  }
}
