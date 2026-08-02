import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
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
  BASE_SEPOLIA_CHAIN_ID,
  DEPLOYER_NONCE,
  FIXED_SMOKE_ADDRESSES,
  FUNDING_FEE_CAP,
  FUNDING_VALUE,
  JOURNAL_FILENAME,
  OPERATION_ID,
  PUBLIC_MANIFEST_PATH,
  REQUIRED_CONFIRMATION_BLOCKS,
  RESEARCH_NONCE,
  TOKEN_FEE_CAP,
  TOKEN_VALUE,
  TOTAL_FEE_CAP,
  assertFeeCaps,
  assertFundingDeltas,
  assertTokenDeltas,
  assertTransactionIdentity,
  createJournal,
  readJson,
  signAndBind,
  validateJournal,
  validatePublicSmokeConfiguration,
  writeJsonAtomically,
} from "./lib/base-sepolia-smoke-plan.js";

const MANIFEST_PATH = resolve("deployments", "base-sepolia.json");
const ROLES_PATH = resolve("data", "testnet-roles.json");
const PROJECT_PATH = resolve("data", "project.json");
const OUTPUT_PATH = resolve(PUBLIC_MANIFEST_PATH);
const GAS_ORACLE = "0x420000000000000000000000000000000000000F";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function researchRewardsTreasury() view returns (address)",
  "function ecosystemTreasury() view returns (address)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
];

function fail(message) {
  throw new Error(message);
}

function gitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: resolve("."),
    encoding: "utf8",
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
    fail("Getrackte Dateien sind nicht sauber; Smoke-Tooling zuerst committen.");
  }
  return commit;
}

function environmentPathOutsideRepository(value) {
  if (!isAbsolute(value)) fail("REIST_KEYSTORE_DIRECTORY muss absolut sein.");
  const path = resolve(value);
  const relation = relative(resolve("."), path);
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation))) {
    fail("Keystore-Verzeichnis muss außerhalb des Repositorys liegen.");
  }
  return path;
}

function transactionFields(transaction) {
  return {
    chainId: transaction.chainId.toString(),
    nonce: transaction.nonce.toString(),
    to: transaction.to,
    valueWei: transaction.value.toString(),
    data: transaction.data,
    gasLimit: transaction.gasLimit.toString(),
    maxFeePerGas: transaction.maxFeePerGas.toString(),
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas.toString(),
  };
}

async function waitCanonical(provider, hash, expected) {
  let receipt;
  let confirmed = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    receipt = await provider.getTransactionReceipt(hash);
    if (receipt) {
      if (receipt.status !== 1) fail(`${expected.label} ist on-chain fehlgeschlagen.`);
      const height = await provider.getBlockNumber();
      if (height >= receipt.blockNumber + REQUIRED_CONFIRMATION_BLOCKS) {
        confirmed = true;
        break;
      }
    }
    await new Promise((done) => setTimeout(done, 2_000));
  }
  if (!receipt || !confirmed) fail(`${expected.label}-Receipt erhielt nicht rechtzeitig zwei Bestätigungsblöcke.`);
  const transaction = await provider.getTransaction(hash);
  assertTransactionIdentity(transaction, expected, expected.label);
  if (
    String(receipt.hash).toLowerCase() !== hash.toLowerCase() ||
    getAddress(receipt.from) !== expected.from ||
    getAddress(receipt.to) !== expected.to ||
    !receipt.blockHash
  ) {
    fail(`${expected.label}-Receipt widerspricht dem Recovery-Journal.`);
  }
  const block = await provider.getBlock(receipt.blockNumber);
  const secondReceipt = await provider.getTransactionReceipt(hash);
  if (
    !block ||
    String(block.hash).toLowerCase() !== receipt.blockHash.toLowerCase() ||
    !block.transactions.some((item) => item.toLowerCase() === hash.toLowerCase()) ||
    !secondReceipt ||
    secondReceipt.blockNumber !== receipt.blockNumber ||
    secondReceipt.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()
  ) {
    fail(`${expected.label} ist nach zwei Bestätigungsblöcken nicht kanonisch.`);
  }
  return receipt;
}

async function broadcastOrRecover(provider, signed, expected) {
  const knownReceipt = await provider.getTransactionReceipt(signed.hash);
  if (knownReceipt) return waitCanonical(provider, signed.hash, expected);
  const knownTransaction = await provider.getTransaction(signed.hash);
  if (!knownTransaction) {
    const latestNonce = await provider.getTransactionCount(expected.from, "latest");
    const pendingNonce = await provider.getTransactionCount(expected.from, "pending");
    if (latestNonce !== expected.nonce || pendingNonce !== expected.nonce) {
      fail(`${expected.label}: Nonce ist belegt, aber der Journal-Hash fehlt; sicherer Abbruch.`);
    }
    try {
      const response = await provider.broadcastTransaction(signed.raw);
      if (response.hash.toLowerCase() !== signed.hash.toLowerCase()) {
        fail(`${expected.label}: RPC meldet einen fremden Transaktionshash.`);
      }
    } catch (error) {
      const recovered = await provider.getTransaction(signed.hash);
      const recoveredReceipt = await provider.getTransactionReceipt(signed.hash);
      if (!recovered && !recoveredReceipt) {
        fail(`${expected.label}: Broadcast-Ergebnis unbekannt; mit demselben Journal erneut starten.`);
      }
    }
  } else {
    assertTransactionIdentity(knownTransaction, expected, expected.label);
  }
  return waitCanonical(provider, signed.hash, expected);
}

async function feeUpperBound(oracle, transaction, signedByteLength) {
  const [l1, operator] = await Promise.all([
    oracle.getL1FeeUpperBound(signedByteLength),
    oracle.getOperatorFee(transaction.gasLimit),
  ]);
  return transaction.gasLimit * transaction.maxFeePerGas + (l1 + operator) * 4n;
}

async function main() {
  if (process.argv.length !== 2) fail("Dieser Executor akzeptiert keine Parameter.");
  if (process.env.REIST_CONFIRM_BASE_SEPOLIA_SMOKE !== "EXECUTE_EXACT_TWO_TRANSACTIONS") {
    fail("Ausführung verlangt den interaktiven PowerShell-Wrapper.");
  }
  delete process.env.REIST_CONFIRM_BASE_SEPOLIA_SMOKE;
  const commit = toolingCommit();
  const configuredEnvironmentPath = String(process.env.REIST_SMOKE_ENV_FILE || "").trim();
  delete process.env.REIST_SMOKE_ENV_FILE;
  const environmentPath = configuredEnvironmentPath
    ? resolve(configuredEnvironmentPath)
    : resolve(".env");
  if (configuredEnvironmentPath) {
    const relation = relative(resolve("."), environmentPath);
    if (!isAbsolute(configuredEnvironmentPath) || !relation || (!relation.startsWith("..") && !isAbsolute(relation))) {
      fail("REIST_SMOKE_ENV_FILE muss absolut außerhalb des aktuellen Repositorys liegen.");
    }
  }
  if (!existsSync(environmentPath)) fail("Lokale .env-Konfiguration fehlt.");
  const environmentSource = readFileSync(environmentPath, "utf8");
  for (const name of [
    "BASE_SEPOLIA_RPC_URL",
    "REIST_KEYSTORE_DIRECTORY",
    "TESTNET_DEPLOYER_ADDRESS",
    "FOUNDER_BENEFICIARY",
    "RESEARCH_REWARDS_TREASURY",
    "ECOSYSTEM_TREASURY",
  ]) {
    const entries = environmentSource
      .split(/\r?\n/)
      .filter((line) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line));
    if (entries.length !== 1) {
      fail(`${name} muss in der lokalen .env exakt einmal vorkommen.`);
    }
  }
  const environment = parseEnvironment(environmentSource);
  for (const forbidden of [
    "TESTNET_DEPLOYER_PRIVATE_KEY",
    "RESEARCH_TREASURY_PRIVATE_KEY",
  ]) {
    if (Object.hasOwn(environment, forbidden)) fail("Private Keys dürfen nicht in .env stehen.");
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
  const keystoreDirectory = environmentPathOutsideRepository(
    String(environment.REIST_KEYSTORE_DIRECTORY || "")
  );
  const publicConfig = validatePublicSmokeConfiguration(
    readJson(MANIFEST_PATH, "Deployment-Manifest"),
    readJson(ROLES_PATH, "Rollenregister"),
    readJson(PROJECT_PATH, "Projektstatus")
  );
  for (const [name, expected] of [
    ["TESTNET_DEPLOYER_ADDRESS", publicConfig.deployer],
    ["RESEARCH_REWARDS_TREASURY", publicConfig.research],
    ["ECOSYSTEM_TREASURY", publicConfig.ecosystem],
  ]) {
    if (getAddress(String(environment[name] || "")) !== expected) {
      fail(`Lokale Konfiguration widerspricht ${name}.`);
    }
  }

  let password = "";
  let deployerWallet;
  let researchWallet;
  try {
    password = readPasswordFromStandardInput();
    for (const [id, expected] of [
      ["deployer", publicConfig.deployer],
      ["founder-beneficiary", getAddress(String(environment.FOUNDER_BENEFICIARY || ""))],
      ["research-treasury", publicConfig.research],
      ["ecosystem-treasury", publicConfig.ecosystem],
    ]) {
      const path = join(keystoreDirectory, `${id}.keystore.json`);
      if (!existsSync(path)) fail(`Verschlüsselter Keystore fehlt: ${id}.`);
      let wallet;
      try {
        wallet = await Wallet.fromEncryptedJson(readFileSync(path, "utf8"), password);
      } catch {
        fail(`Keystore konnte nicht entschlüsselt werden: ${id}.`);
      }
      if (getAddress(wallet.address) !== expected) fail(`Keystore-Adresse ist falsch: ${id}.`);
      if (id === "deployer") deployerWallet = wallet;
      if (id === "research-treasury") researchWallet = wallet;
    }
    password = "";

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
      if (tokenCode === "0x" || keccak256(tokenCode) !== readJson(MANIFEST_PATH, "Deployment-Manifest").runtimeCodeHashes.token) {
        fail("REISTToken-Runtime stimmt nicht mit dem verifizierten Deployment überein.");
      }
      for (const address of [publicConfig.deployer, publicConfig.research, publicConfig.ecosystem]) {
        if ((await provider.getCode(address)) !== "0x") fail("Eine feste Treasury-Rolle ist keine EOA.");
      }

      const tokenInterface = new Interface(ERC20_ABI);
      const tokenCalldata = tokenInterface.encodeFunctionData("transfer", [
        publicConfig.ecosystem,
        TOKEN_VALUE,
      ]);
      const token = new Contract(publicConfig.token, ERC20_ABI, provider);
      const [decimals, totalSupply, onchainResearch, onchainEcosystem] = await Promise.all([
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
      const journalPath = join(keystoreDirectory, JOURNAL_FILENAME);
      if (existsSync(OUTPUT_PATH)) {
        fail(
          "Öffentliches Operations-Manifest existiert bereits; sicherer Abbruch ohne Transaktion. " +
          "Bestehenden Abschluss unabhängig on-chain prüfen."
        );
      }
      let journal;
      if (existsSync(journalPath)) {
        journal = readJson(journalPath, "Recovery-Journal");
        validateJournal(journal, tokenCalldata);
        if (journal.toolingCommit !== commit) fail("Recovery-Journal gehört zu einem anderen Tooling-Commit.");
      } else {
        const [deployerLatest, deployerPending, researchLatest, researchPending] = await Promise.all([
          provider.getTransactionCount(publicConfig.deployer, "latest"),
          provider.getTransactionCount(publicConfig.deployer, "pending"),
          provider.getTransactionCount(publicConfig.research, "latest"),
          provider.getTransactionCount(publicConfig.research, "pending"),
        ]);
        if (
          deployerLatest !== DEPLOYER_NONCE || deployerPending !== DEPLOYER_NONCE ||
          researchLatest !== RESEARCH_NONCE || researchPending !== RESEARCH_NONCE
        ) fail("Initiale Nonces sind nicht exakt Deployer=1 und Research=0.");
        const [researchTokens, ecosystemTokens, deployerEth, researchEth] = await Promise.all([
          token.balanceOf(publicConfig.research),
          token.balanceOf(publicConfig.ecosystem),
          provider.getBalance(publicConfig.deployer),
          provider.getBalance(publicConfig.research),
        ]);
        if (researchTokens !== parseUnits("700000", 18) || ecosystemTokens !== parseUnits("200000", 18)) {
          fail("Token-Baseline ist nicht exakt 700000/200000 REIST.");
        }
        if (researchEth !== 0n) fail("Initialer Research-ETH-Bestand ist nicht exakt 0.");
        if (deployerEth < FUNDING_VALUE + FUNDING_FEE_CAP || researchEth + FUNDING_VALUE < TOKEN_FEE_CAP) {
          fail("ETH-Bestände decken Betrag und feste Gebührenobergrenzen nicht.");
        }
        const feeData = await provider.getFeeData();
        if (feeData.maxFeePerGas == null || feeData.maxPriorityFeePerGas == null) {
          fail("RPC liefert keine EIP-1559-Gebühren.");
        }
        const fundingBase = {
          type: 2, chainId: BASE_SEPOLIA_CHAIN_ID, nonce: DEPLOYER_NONCE,
          to: publicConfig.research, value: FUNDING_VALUE, data: "0x",
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        };
        const tokenBase = {
          type: 2, chainId: BASE_SEPOLIA_CHAIN_ID, nonce: RESEARCH_NONCE,
          to: publicConfig.token, value: 0n, data: tokenCalldata,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        };
        await provider.call({
          from: publicConfig.deployer,
          to: publicConfig.research,
          value: FUNDING_VALUE,
          data: "0x",
        });
        const simulated = await provider.call({
          from: publicConfig.research,
          to: publicConfig.token,
          value: 0n,
          data: tokenCalldata,
        });
        if (!tokenInterface.decodeFunctionResult("transfer", simulated)[0]) fail("1-REIST-Simulation schlug fehl.");
        const [fundingGas, tokenGas] = await Promise.all([
          provider.estimateGas({
            from: publicConfig.deployer,
            to: publicConfig.research,
            value: FUNDING_VALUE,
            data: "0x",
          }),
          provider.estimateGas({
            from: publicConfig.research,
            to: publicConfig.token,
            value: 0n,
            data: tokenCalldata,
          }),
        ]);
        const fundingTx = Transaction.from({ ...fundingBase, gasLimit: (fundingGas * 120n + 99n) / 100n });
        const tokenTx = Transaction.from({ ...tokenBase, gasLimit: (tokenGas * 120n + 99n) / 100n });
        const fundingRaw = await deployerWallet.signTransaction(fundingTx);
        const tokenRaw = await researchWallet.signTransaction(tokenTx);
        const oracle = new Contract(GAS_ORACLE, [
          "function getL1FeeUpperBound(uint256) view returns (uint256)",
          "function getOperatorFee(uint256) view returns (uint256)",
        ], provider);
        const [fundingUpper, tokenUpper] = await Promise.all([
          feeUpperBound(oracle, fundingTx, (fundingRaw.length - 2) / 2),
          feeUpperBound(oracle, tokenTx, (tokenRaw.length - 2) / 2),
        ]);
        assertFeeCaps(fundingUpper, tokenUpper);
        journal = createJournal({
          createdAt: new Date().toISOString(), tokenCalldata,
          fundingFields: transactionFields(fundingTx), fundingHash: keccak256(fundingRaw),
          fundingFeeUpperBound: fundingUpper,
          tokenFields: transactionFields(tokenTx), tokenHash: keccak256(tokenRaw),
          tokenFeeUpperBound: tokenUpper,
          baseline: { researchTokenBaseUnits: researchTokens, ecosystemTokenBaseUnits: ecosystemTokens },
        });
        journal.toolingCommit = commit;
        writeJsonAtomically(journalPath, journal);
      }

      validateJournal(journal, tokenCalldata);
      const fundingSigned = await signAndBind(deployerWallet, journal.transactions.funding.fields, journal.transactions.funding.hash, "Funding");
      const tokenSigned = await signAndBind(researchWallet, journal.transactions.token.fields, journal.transactions.token.hash, "Token-Transfer");
      const oracle = new Contract(GAS_ORACLE, [
        "function getL1FeeUpperBound(uint256) view returns (uint256)",
        "function getOperatorFee(uint256) view returns (uint256)",
      ], provider);
      const fundingPlan = Transaction.from(fundingSigned.raw);
      const tokenPlan = Transaction.from(tokenSigned.raw);
      const [currentFundingUpper, currentTokenUpper] = await Promise.all([
        feeUpperBound(oracle, fundingPlan, (fundingSigned.raw.length - 2) / 2),
        feeUpperBound(oracle, tokenPlan, (tokenSigned.raw.length - 2) / 2),
      ]);
      assertFeeCaps(currentFundingUpper, currentTokenUpper);
      const fundingExpected = {
        label: "Funding", hash: fundingSigned.hash, from: publicConfig.deployer,
        to: publicConfig.research, nonce: DEPLOYER_NONCE, value: FUNDING_VALUE, data: "0x",
      };
      const fundingReceipt = await broadcastOrRecover(provider, fundingSigned, fundingExpected);
      fundingSigned.raw = "";
      const fundingBlockBefore = fundingReceipt.blockNumber - 1;
      const [deployerBefore, deployerAfter, researchBefore, researchAfter] = await Promise.all([
        provider.getBalance(publicConfig.deployer, fundingBlockBefore),
        provider.getBalance(publicConfig.deployer, fundingReceipt.blockNumber),
        provider.getBalance(publicConfig.research, fundingBlockBefore),
        provider.getBalance(publicConfig.research, fundingReceipt.blockNumber),
      ]);
      const fundingFee = assertFundingDeltas({ deployerBefore, deployerAfter, researchBefore, researchAfter });

      const refreshedTokenUpper = await feeUpperBound(
        oracle,
        tokenPlan,
        (tokenSigned.raw.length - 2) / 2
      );
      assertFeeCaps(fundingFee, refreshedTokenUpper);
      if (researchAfter < refreshedTokenUpper) {
        fail("Research-Treasury deckt die aktuell konservativ geschätzte Token-Gebühr nicht.");
      }
      const tokenExpected = {
        label: "Token-Transfer", hash: tokenSigned.hash, from: publicConfig.research,
        to: publicConfig.token, nonce: RESEARCH_NONCE, value: 0n, data: tokenCalldata,
      };
      const tokenReceipt = await broadcastOrRecover(provider, tokenSigned, tokenExpected);
      tokenSigned.raw = "";
      const transferEvent = tokenInterface.getEvent("Transfer");
      const transferLogs = tokenReceipt.logs.filter(
        (log) =>
          getAddress(log.address) === publicConfig.token &&
          String(log.topics?.[0] || "").toLowerCase() === transferEvent.topicHash.toLowerCase()
      );
      if (transferLogs.length !== 1) fail("Token-Receipt enthält nicht genau ein Transfer-Event.");
      const parsedTransfer = tokenInterface.parseLog(transferLogs[0]);
      if (
        getAddress(parsedTransfer.args.from) !== publicConfig.research ||
        getAddress(parsedTransfer.args.to) !== publicConfig.ecosystem ||
        BigInt(parsedTransfer.args.value) !== TOKEN_VALUE
      ) fail("Transfer-Event ist nicht der autorisierte 1-REIST-Smoke-Transfer.");
      const tokenBlockBefore = tokenReceipt.blockNumber - 1;
      const [researchEthBefore, researchEthAfter, researchTokenBefore, researchTokenAfter, ecosystemTokenBefore, ecosystemTokenAfter] = await Promise.all([
        provider.getBalance(publicConfig.research, tokenBlockBefore),
        provider.getBalance(publicConfig.research, tokenReceipt.blockNumber),
        token.balanceOf(publicConfig.research, { blockTag: tokenBlockBefore }),
        token.balanceOf(publicConfig.research, { blockTag: tokenReceipt.blockNumber }),
        token.balanceOf(publicConfig.ecosystem, { blockTag: tokenBlockBefore }),
        token.balanceOf(publicConfig.ecosystem, { blockTag: tokenReceipt.blockNumber }),
      ]);
      const tokenFee = assertTokenDeltas({ researchEthBefore, researchEthAfter, researchTokenBefore, researchTokenAfter, ecosystemTokenBefore, ecosystemTokenAfter });
      assertFeeCaps(fundingFee, tokenFee);
      if (fundingFee + tokenFee > TOTAL_FEE_CAP) fail("Tatsächliche Gesamtgebühr überschreitet das feste Limit.");

      mkdirSync(resolve("operations"), { recursive: true });
      const completionBlock = await provider.getBlock(tokenReceipt.blockNumber);
      if (!completionBlock) fail("Abschlussblock ist nicht abrufbar.");
      const manifest = {
        schemaVersion: 1, operationId: OPERATION_ID, status: "completed",
        network: "Base Sepolia", chainId: Number(BASE_SEPOLIA_CHAIN_ID),
        toolingCommit: commit, completedAt: new Date(Number(completionBlock.timestamp) * 1000).toISOString(),
        purpose: "Technical treasury smoke test; not a bounty or contribution.",
        sourceDeployment: { manifest: "deployments/base-sepolia.json", transactionHash: FIXED_SMOKE_ADDRESSES.deploymentTransaction, sourceVerified: true, token: publicConfig.token },
        amounts: { fundingWei: FUNDING_VALUE.toString(), tokenBaseUnits: TOKEN_VALUE.toString() },
        feeCapsWei: { funding: FUNDING_FEE_CAP.toString(), token: TOKEN_FEE_CAP.toString(), total: TOTAL_FEE_CAP.toString() },
        transactions: {
          funding: { hash: fundingSigned.hash, from: publicConfig.deployer, to: publicConfig.research, nonce: DEPLOYER_NONCE, blockNumber: fundingReceipt.blockNumber, blockHash: fundingReceipt.blockHash, feeWei: fundingFee.toString() },
          tokenTransfer: { hash: tokenSigned.hash, from: publicConfig.research, to: publicConfig.token, recipient: publicConfig.ecosystem, nonce: RESEARCH_NONCE, blockNumber: tokenReceipt.blockNumber, blockHash: tokenReceipt.blockHash, feeWei: tokenFee.toString() },
        },
        validation: { confirmationsAfterEach: REQUIRED_CONFIRMATION_BLOCKS, canonicalReceipts: true, exactBalanceDeltas: true, baselineResearchReist: "700000", baselineEcosystemReist: "200000" },
        finalBalances: {
          researchEthWei: researchEthAfter.toString(),
          researchTokenBaseUnits: researchTokenAfter.toString(),
          ecosystemTokenBaseUnits: ecosystemTokenAfter.toString(),
        },
        economicValue: "none-promised-testnet-only",
      };
      if (existsSync(OUTPUT_PATH)) fail("Öffentliches Operations-Manifest existiert bereits; nicht überschrieben.");
      writeJsonAtomically(OUTPUT_PATH, manifest);
      unlinkSync(journalPath);
      console.log("Base-Sepolia-Smoke-Test vollständig und kanonisch validiert.");
      console.log(`Funding: ${fundingSigned.hash}`);
      console.log(`1 REIST: ${tokenSigned.hash}`);
    } finally {
      await provider.destroy();
    }
  } finally {
    password = "";
    deployerWallet = undefined;
    researchWallet = undefined;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
