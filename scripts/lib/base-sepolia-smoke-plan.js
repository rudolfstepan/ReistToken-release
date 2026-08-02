import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  Transaction,
  ZeroAddress,
  getAddress,
  keccak256,
  parseEther,
  parseUnits,
} from "ethers";

export const BASE_SEPOLIA_CHAIN_ID = 84532n;
export const OPERATION_ID = "reist-base-sepolia-treasury-smoke-v1";
export const FUNDING_VALUE = parseEther("0.000005");
export const TOKEN_VALUE = parseUnits("1", 18);
export const FUNDING_FEE_CAP = parseEther("0.0000005");
export const TOKEN_FEE_CAP = parseEther("0.000001");
export const TOTAL_FEE_CAP = parseEther("0.0000015");
export const DEPLOYER_NONCE = 1;
export const RESEARCH_NONCE = 0;
export const REQUIRED_CONFIRMATION_BLOCKS = 2;
export const JOURNAL_FILENAME = ".base-sepolia-smoke-transfer.journal.json";
export const PUBLIC_MANIFEST_PATH = "operations/base-sepolia-smoke-transfer.json";

const EXPECTED = Object.freeze({
  deploymentTransaction:
    "0x4d8f54cd5cf2950ab1b2032c8f042ac16b3cc20fb65fca5221c0933df38f021c",
  deployer: "0xCfE0Cbb18351C31E00778fEa42b4b260112Aa48e",
  research: "0x439DdfaBF2B27e1da37904da61970eC48D19AaF8",
  ecosystem: "0xE079E0aaA76A84dBE117E9b0316eB1b416e82DbC",
  token: "0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68",
});

function fail(message) {
  throw new Error(message);
}

function sameHex(actual, expected) {
  return String(actual || "").toLowerCase() === String(expected || "").toLowerCase();
}

export function checkedAddress(value, label) {
  let address;
  try {
    address = getAddress(String(value || ""));
  } catch {
    fail(`${label} ist keine gültige Ethereum-Adresse.`);
  }
  if (address === ZeroAddress) fail(`${label} darf nicht die Nulladresse sein.`);
  return address;
}

export function validatePublicSmokeConfiguration(deployment, roles, project) {
  if (
    deployment?.chainId !== Number(BASE_SEPOLIA_CHAIN_ID) ||
    deployment?.network !== "Base Sepolia" ||
    deployment?.verification?.sourceVerified !== true ||
    deployment?.verification?.externalAudit !== false
  ) {
    fail("Deployment ist nicht der quellcodeverifizierte Base-Sepolia-Pilot.");
  }
  if (
    roles?.chainId !== Number(BASE_SEPOLIA_CHAIN_ID) ||
    roles?.network !== "Base Sepolia" ||
    roles?.status !== "base-sepolia-pilot-deployed-no-economic-value" ||
    project?.status?.testnetDeployment !== true ||
    project?.status?.sourceVerified !== true
  ) {
    fail("Öffentlicher Projektstatus erlaubt keinen Base-Sepolia-Smoke-Test.");
  }

  const result = {
    deployer: checkedAddress(roles.roles?.deployer, "Deployer"),
    research: checkedAddress(
      roles.roles?.researchRewardsTreasury,
      "Research-Treasury"
    ),
    ecosystem: checkedAddress(
      roles.roles?.ecosystemTreasury,
      "Ecosystem-Treasury"
    ),
    token: checkedAddress(deployment.contracts?.token, "REISTToken"),
  };
  for (const key of ["deployer", "research", "ecosystem", "token"]) {
    if (result[key] !== EXPECTED[key]) {
      fail(`${key} weicht von der fest verankerten Pilot-Adresse ab.`);
    }
  }
  if (
    !sameHex(deployment.transactionHash, EXPECTED.deploymentTransaction) ||
    checkedAddress(
      deployment.allocations?.researchRewards?.address,
      "Research-Allokation"
    ) !== result.research ||
    checkedAddress(
      deployment.allocations?.ecosystemTreasury?.address,
      "Ecosystem-Allokation"
    ) !== result.ecosystem ||
    checkedAddress(roles.deployment?.token, "Rollenregister-Token") !== result.token ||
    !sameHex(roles.deployment?.transactionHash, EXPECTED.deploymentTransaction) ||
    deployment.token?.decimals !== 18 ||
    deployment.token?.totalSupply !== "1000000" ||
    deployment.allocations?.researchRewards?.amount !== "700000" ||
    deployment.allocations?.ecosystemTreasury?.amount !== "200000"
  ) {
    fail("Deployment- und Rollenmanifest widersprechen dem festen Smoke-Plan.");
  }
  return result;
}

function requiredDecimal(value, label) {
  if (!/^(0|[1-9]\d*)$/.test(String(value ?? ""))) {
    fail(`${label} ist keine kanonische Ganzzahl.`);
  }
  return BigInt(value);
}

export function canonicalTransactionFields(fields, label) {
  const transaction = Transaction.from({
    type: 2,
    chainId: requiredDecimal(fields?.chainId, `${label} chainId`),
    nonce: Number(requiredDecimal(fields?.nonce, `${label} nonce`)),
    to: checkedAddress(fields?.to, `${label} Empfänger`),
    value: requiredDecimal(fields?.valueWei, `${label} Wert`),
    data: String(fields?.data || ""),
    gasLimit: requiredDecimal(fields?.gasLimit, `${label} gasLimit`),
    maxFeePerGas: requiredDecimal(
      fields?.maxFeePerGas,
      `${label} maxFeePerGas`
    ),
    maxPriorityFeePerGas: requiredDecimal(
      fields?.maxPriorityFeePerGas,
      `${label} maxPriorityFeePerGas`
    ),
  });
  if (!/^0x(?:[0-9a-f]{2})*$/i.test(transaction.data)) {
    fail(`${label} calldata ist ungültig.`);
  }
  return transaction;
}

export function assertFeeCaps(fundingUpperBound, tokenUpperBound) {
  const funding = BigInt(fundingUpperBound);
  const token = BigInt(tokenUpperBound);
  if (funding < 0n || funding > FUNDING_FEE_CAP) {
    fail("Funding überschreitet die feste Gebührenobergrenze.");
  }
  if (token < 0n || token > TOKEN_FEE_CAP) {
    fail("Token-Transfer überschreitet die feste Gebührenobergrenze.");
  }
  if (funding + token > TOTAL_FEE_CAP) {
    fail("Gesamtgebühr überschreitet die feste Gebührenobergrenze.");
  }
}

export function createJournal({
  createdAt,
  tokenCalldata,
  fundingFields,
  fundingHash,
  fundingFeeUpperBound,
  tokenFields,
  tokenHash,
  tokenFeeUpperBound,
  baseline,
}) {
  assertFeeCaps(fundingFeeUpperBound, tokenFeeUpperBound);
  const journal = {
    schemaVersion: 1,
    operationId: OPERATION_ID,
    createdAt,
    network: "Base Sepolia",
    chainId: Number(BASE_SEPOLIA_CHAIN_ID),
    deploymentTransaction: EXPECTED.deploymentTransaction,
    addresses: {
      deployer: EXPECTED.deployer,
      researchTreasury: EXPECTED.research,
      ecosystemTreasury: EXPECTED.ecosystem,
      token: EXPECTED.token,
    },
    amounts: {
      fundingWei: FUNDING_VALUE.toString(),
      tokenBaseUnits: TOKEN_VALUE.toString(),
    },
    baseline: {
      researchTokenBaseUnits: String(baseline.researchTokenBaseUnits),
      ecosystemTokenBaseUnits: String(baseline.ecosystemTokenBaseUnits),
    },
    transactions: {
      funding: {
        fields: fundingFields,
        hash: fundingHash,
        feeUpperBoundWei: String(fundingFeeUpperBound),
      },
      token: {
        fields: tokenFields,
        hash: tokenHash,
        feeUpperBoundWei: String(tokenFeeUpperBound),
      },
    },
    tokenCalldata,
    notice:
      "Technical treasury smoke test on Base Sepolia; not a bounty, contribution, sale, or mainnet operation.",
  };
  validateJournal(journal, tokenCalldata);
  return journal;
}

export function validateJournal(journal, expectedTokenCalldata) {
  if (
    journal?.schemaVersion !== 1 ||
    journal?.operationId !== OPERATION_ID ||
    journal?.network !== "Base Sepolia" ||
    journal?.chainId !== Number(BASE_SEPOLIA_CHAIN_ID) ||
    !sameHex(journal?.deploymentTransaction, EXPECTED.deploymentTransaction)
  ) {
    fail("Recovery-Journal gehört nicht zum festen Base-Sepolia-Smoke-Plan.");
  }
  const addresses = journal.addresses || {};
  for (const [key, expected] of [
    ["deployer", EXPECTED.deployer],
    ["researchTreasury", EXPECTED.research],
    ["ecosystemTreasury", EXPECTED.ecosystem],
    ["token", EXPECTED.token],
  ]) {
    if (checkedAddress(addresses[key], `Journal ${key}`) !== expected) {
      fail(`Recovery-Journal enthält eine falsche Adresse: ${key}.`);
    }
  }
  if (
    journal.amounts?.fundingWei !== FUNDING_VALUE.toString() ||
    journal.amounts?.tokenBaseUnits !== TOKEN_VALUE.toString() ||
    journal.baseline?.researchTokenBaseUnits !== parseUnits("700000", 18).toString() ||
    journal.baseline?.ecosystemTokenBaseUnits !== parseUnits("200000", 18).toString() ||
    !sameHex(journal.tokenCalldata, expectedTokenCalldata)
  ) {
    fail("Recovery-Journal enthält nicht die autorisierten Beträge/Baselines.");
  }

  const funding = canonicalTransactionFields(
    journal.transactions?.funding?.fields,
    "Funding"
  );
  const token = canonicalTransactionFields(
    journal.transactions?.token?.fields,
    "Token-Transfer"
  );
  if (
    funding.chainId !== BASE_SEPOLIA_CHAIN_ID ||
    funding.nonce !== DEPLOYER_NONCE ||
    funding.to !== EXPECTED.research ||
    funding.value !== FUNDING_VALUE ||
    funding.data !== "0x" ||
    token.chainId !== BASE_SEPOLIA_CHAIN_ID ||
    token.nonce !== RESEARCH_NONCE ||
    token.to !== EXPECTED.token ||
    token.value !== 0n ||
    !sameHex(token.data, expectedTokenCalldata)
  ) {
    fail("Recovery-Journal enthält abweichende Transaktionsfelder.");
  }
  if (
    funding.gasLimit < 21_000n ||
    funding.gasLimit > 30_000n ||
    token.gasLimit < 21_000n ||
    token.gasLimit > 100_000n ||
    funding.maxPriorityFeePerGas > funding.maxFeePerGas ||
    token.maxPriorityFeePerGas > token.maxFeePerGas
  ) {
    fail("Recovery-Journal enthält unzulässige Gasparameter.");
  }
  if (
    !/^0x[0-9a-f]{64}$/i.test(journal.transactions.funding.hash || "") ||
    !/^0x[0-9a-f]{64}$/i.test(journal.transactions.token.hash || "")
  ) {
    fail("Recovery-Journal enthält keinen gültigen Transaktionshash.");
  }
  const fundingUpperBound = requiredDecimal(
    journal.transactions.funding.feeUpperBoundWei,
    "Funding feeUpperBoundWei"
  );
  const tokenUpperBound = requiredDecimal(
    journal.transactions.token.feeUpperBoundWei,
    "Token feeUpperBoundWei"
  );
  if (
    fundingUpperBound < funding.gasLimit * funding.maxFeePerGas ||
    tokenUpperBound < token.gasLimit * token.maxFeePerGas
  ) {
    fail("Recovery-Journal unterschätzt die gebundene L2-Maximalgebühr.");
  }
  assertFeeCaps(fundingUpperBound, tokenUpperBound);
  return { funding, token };
}

export async function signAndBind(wallet, fields, expectedHash, label) {
  const raw = await wallet.signTransaction(canonicalTransactionFields(fields, label));
  const hash = keccak256(raw);
  if (!sameHex(hash, expectedHash)) {
    fail(`${label} ergibt bei erneuter Signatur nicht denselben Journal-Hash.`);
  }
  return { raw, hash };
}

export function assertFundingDeltas(values) {
  const fee = BigInt(values.deployerBefore) - BigInt(values.deployerAfter) - FUNDING_VALUE;
  if (BigInt(values.researchAfter) - BigInt(values.researchBefore) !== FUNDING_VALUE) {
    fail("Research-Treasury erhielt nicht exakt 0,000005 ETH.");
  }
  if (fee < 0n || fee > FUNDING_FEE_CAP) {
    fail("Tatsächliche Funding-Gebühr liegt außerhalb der Obergrenze.");
  }
  return fee;
}

export function assertTokenDeltas(values) {
  const fee = BigInt(values.researchEthBefore) - BigInt(values.researchEthAfter);
  if (
    BigInt(values.researchTokenBefore) - BigInt(values.researchTokenAfter) !== TOKEN_VALUE ||
    BigInt(values.ecosystemTokenAfter) - BigInt(values.ecosystemTokenBefore) !== TOKEN_VALUE
  ) {
    fail("Token-Bilanzen änderten sich nicht um exakt 1 REIST.");
  }
  if (fee < 0n || fee > TOKEN_FEE_CAP) {
    fail("Tatsächliche Token-Transfer-Gebühr liegt außerhalb der Obergrenze.");
  }
  return fee;
}

export function assertTransactionIdentity(transaction, expected, label) {
  if (!transaction) fail(`${label} ist nicht abrufbar.`);
  if (
    !sameHex(transaction.hash, expected.hash) ||
    BigInt(transaction.chainId) !== BASE_SEPOLIA_CHAIN_ID ||
    checkedAddress(transaction.from, `${label} Absender`) !== expected.from ||
    checkedAddress(transaction.to, `${label} Empfänger`) !== expected.to ||
    Number(transaction.nonce) !== expected.nonce ||
    BigInt(transaction.value) !== expected.value ||
    !sameHex(transaction.data, expected.data)
  ) {
    fail(`${label} widerspricht dem atomaren Recovery-Journal.`);
  }
}

export function writeJsonAtomically(path, value) {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${label} ist nicht als gültiges JSON lesbar.`);
  }
}

export const FIXED_SMOKE_ADDRESSES = EXPECTED;
