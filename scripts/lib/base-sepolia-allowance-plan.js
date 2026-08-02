import { Transaction, parseEther, parseUnits } from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  FIXED_SMOKE_ADDRESSES,
  canonicalTransactionFields,
  validatePublicSmokeConfiguration,
} from "./base-sepolia-smoke-plan.js";

export const ALLOWANCE_OPERATION_ID =
  "reist-base-sepolia-allowance-roundtrip-v1";
export const PREPARED_PLAN_PATH =
  "plans/base-sepolia-allowance-smoke.json";
export const ALLOWANCE_JOURNAL_FILENAME =
  ".base-sepolia-allowance-roundtrip.journal.json";
export const ALLOWANCE_EVIDENCE_PATH =
  "operations/base-sepolia-allowance-roundtrip.json";
export const ALLOWANCE_VALUE = parseUnits("1", 18);
export const SET_ALLOWANCE_NONCE = 1;
export const CLEAR_ALLOWANCE_NONCE = 2;
export const SET_ALLOWANCE_GAS_LIMIT = 70_000n;
export const CLEAR_ALLOWANCE_GAS_LIMIT = 60_000n;
export const SET_ALLOWANCE_FEE_CAP = parseEther("0.000001");
export const CLEAR_ALLOWANCE_FEE_CAP = parseEther("0.000001");
export const ALLOWANCE_TOTAL_FEE_CAP = parseEther("0.000002");
export const REQUIRED_ALLOWANCE_CONFIRMATION_BLOCKS = 2;
export const BASELINE_RESEARCH_TOKENS = parseUnits("699999", 18);
export const BASELINE_ECOSYSTEM_TOKENS = parseUnits("200001", 18);
export const SET_ALLOWANCE_CALLDATA =
  "0x095ea7b3000000000000000000000000e079e0aaa76a84dbe117e9b0316eb1b416e82dbc0000000000000000000000000000000000000000000000000de0b6b3a7640000";
export const CLEAR_ALLOWANCE_CALLDATA =
  "0x095ea7b3000000000000000000000000e079e0aaa76a84dbe117e9b0316eb1b416e82dbc0000000000000000000000000000000000000000000000000000000000000000";

const PREPARED_AT = "2026-08-02";
const PRIOR_OPERATION_ID = "reist-base-sepolia-treasury-smoke-v1";
const PRIOR_OPERATION_PATH = "operations/base-sepolia-smoke-transfer.json";
const PRIOR_TOKEN_HASH =
  "0x308a8c07593179744c6a72b9d1992274282300064e9e31bf36cbbd18f2bdcde8";

function fail(message) {
  throw new Error(message);
}

function sameHex(actual, expected) {
  return String(actual || "").toLowerCase() === String(expected || "").toLowerCase();
}

function requiredDecimal(value, label) {
  if (!/^(0|[1-9]\d*)$/.test(String(value ?? ""))) {
    fail(`${label} ist keine kanonische Ganzzahl.`);
  }
  return BigInt(value);
}

export function createPreparedAllowancePlan() {
  return {
    schemaVersion: 1,
    planId: ALLOWANCE_OPERATION_ID,
    status: "prepared-not-executed",
    preparedAt: PREPARED_AT,
    network: "Base Sepolia",
    chainId: Number(BASE_SEPOLIA_CHAIN_ID),
    sourceDeployment: {
      manifest: "deployments/base-sepolia.json",
      token: FIXED_SMOKE_ADDRESSES.token,
      sourceVerified: true,
    },
    priorOperation: {
      manifest: PRIOR_OPERATION_PATH,
      operationId: PRIOR_OPERATION_ID,
    },
    roles: {
      owner: FIXED_SMOKE_ADDRESSES.research,
      spender: FIXED_SMOKE_ADDRESSES.ecosystem,
    },
    baseline: {
      ownerTokenBaseUnits: BASELINE_RESEARCH_TOKENS.toString(),
      spenderTokenBaseUnits: BASELINE_ECOSYSTEM_TOKENS.toString(),
      allowanceBaseUnits: "0",
      nextConfirmedNonce: SET_ALLOWANCE_NONCE,
      nextPendingNonce: SET_ALLOWANCE_NONCE,
    },
    transactions: [
      {
        sequence: 1,
        action: "approve-exactly-one-testnet-reist",
        type: 2,
        chainId: Number(BASE_SEPOLIA_CHAIN_ID),
        from: FIXED_SMOKE_ADDRESSES.research,
        to: FIXED_SMOKE_ADDRESSES.token,
        nonce: SET_ALLOWANCE_NONCE,
        valueWei: "0",
        spender: FIXED_SMOKE_ADDRESSES.ecosystem,
        allowanceBaseUnits: ALLOWANCE_VALUE.toString(),
        calldata: SET_ALLOWANCE_CALLDATA,
        gasLimit: SET_ALLOWANCE_GAS_LIMIT.toString(),
        accessList: [],
      },
      {
        sequence: 2,
        action: "revoke-allowance-to-zero",
        type: 2,
        chainId: Number(BASE_SEPOLIA_CHAIN_ID),
        from: FIXED_SMOKE_ADDRESSES.research,
        to: FIXED_SMOKE_ADDRESSES.token,
        nonce: CLEAR_ALLOWANCE_NONCE,
        valueWei: "0",
        spender: FIXED_SMOKE_ADDRESSES.ecosystem,
        allowanceBaseUnits: "0",
        calldata: CLEAR_ALLOWANCE_CALLDATA,
        gasLimit: CLEAR_ALLOWANCE_GAS_LIMIT.toString(),
        accessList: [],
      },
    ],
    preBroadcastFeeThresholdsWei: {
      setAllowance: SET_ALLOWANCE_FEE_CAP.toString(),
      clearAllowance: CLEAR_ALLOWANCE_FEE_CAP.toString(),
      total: ALLOWANCE_TOTAL_FEE_CAP.toString(),
    },
    requiredOutcome: {
      finalAllowanceBaseUnits: "0",
      tokenTransfers: 0,
      ownerTokenBalanceChange: "0",
      spenderTokenBalanceChange: "0",
      evidencePath: ALLOWANCE_EVIDENCE_PATH,
    },
    executionState: {
      signaturesCreated: 0,
      broadcastsSent: 0,
      transactionHashes: [],
      receipts: [],
    },
    notice:
      "Prepared Base Sepolia allowance/revocation test only. No transaction has been signed or broadcast; testnet REIST has no promised economic value.",
  };
}

export function validatePreparedAllowancePlan(plan) {
  const expected = createPreparedAllowancePlan();
  if (JSON.stringify(plan) !== JSON.stringify(expected)) {
    fail("Vorbereiteter Allowance-Plan weicht vom exakt autorisierten Entwurf ab.");
  }
  for (const transaction of plan.transactions) {
    for (const forbidden of ["hash", "raw", "receipt", "signedTransaction"] ) {
      if (Object.hasOwn(transaction, forbidden)) {
        fail(`Vorbereiteter Plan darf kein Feld ${forbidden} enthalten.`);
      }
    }
  }
  return expected;
}

export function validateAllowancePublicConfiguration(
  deployment,
  roles,
  project,
  priorOperation
) {
  const config = validatePublicSmokeConfiguration(deployment, roles, project);
  if (
    project?.status?.technicalTreasurySmoke !== true ||
    project?.status?.allowanceTestPrepared !== true ||
    project?.status?.allowanceTestCompleted !== false ||
    project?.status?.fullTestnetSmoke !== false
  ) {
    fail("Projektstatus erlaubt nur den vorbereiteten, noch offenen Allowance-Test.");
  }
  if (
    priorOperation?.schemaVersion !== 1 ||
    priorOperation?.operationId !== PRIOR_OPERATION_ID ||
    priorOperation?.status !== "completed" ||
    priorOperation?.chainId !== Number(BASE_SEPOLIA_CHAIN_ID) ||
    !sameHex(priorOperation?.sourceDeployment?.token, config.token) ||
    !sameHex(priorOperation?.transactions?.tokenTransfer?.hash, PRIOR_TOKEN_HASH) ||
    priorOperation?.transactions?.tokenTransfer?.nonce !== 0 ||
    priorOperation?.finalBalances?.researchTokenBaseUnits !==
      BASELINE_RESEARCH_TOKENS.toString() ||
    priorOperation?.finalBalances?.ecosystemTokenBaseUnits !==
      BASELINE_ECOSYSTEM_TOKENS.toString()
  ) {
    fail("Vorheriger Treasury-Smoke belegt die Allowance-Baseline nicht.");
  }
  return config;
}

export function assertFreshAllowanceBaseline(values) {
  if (
    Number(values.latestNonce) !== SET_ALLOWANCE_NONCE ||
    Number(values.pendingNonce) !== SET_ALLOWANCE_NONCE
  ) {
    fail("Research-Treasury besitzt nicht exakt den freien Start-Nonce 1.");
  }
  if (
    BigInt(values.researchTokens) !== BASELINE_RESEARCH_TOKENS ||
    BigInt(values.ecosystemTokens) !== BASELINE_ECOSYSTEM_TOKENS ||
    BigInt(values.allowance) !== 0n
  ) {
    fail("On-chain-Bilanzen oder Allowance widersprechen der festen Baseline.");
  }
  if (BigInt(values.researchEth) < ALLOWANCE_TOTAL_FEE_CAP) {
    fail("Research-Treasury deckt die konservative Pre-Broadcast-Freigabegrenze nicht.");
  }
}

export function assertAllowanceFeeCaps(setUpperBound, clearUpperBound) {
  const set = BigInt(setUpperBound);
  const clear = BigInt(clearUpperBound);
  if (set < 0n || set > SET_ALLOWANCE_FEE_CAP) {
    fail("Allowance-Setzen überschreitet die konservative Pre-Broadcast-Freigabegrenze.");
  }
  if (clear < 0n || clear > CLEAR_ALLOWANCE_FEE_CAP) {
    fail("Allowance-Widerruf überschreitet die konservative Pre-Broadcast-Freigabegrenze.");
  }
  if (set + clear > ALLOWANCE_TOTAL_FEE_CAP) {
    fail("Allowance-Gesamtschätzung überschreitet die konservative Pre-Broadcast-Freigabegrenze.");
  }
}

export function createAllowanceJournal({
  createdAt,
  toolingCommit,
  baselineBlock,
  setFields,
  setHash,
  setFeeUpperBound,
  clearFields,
  clearHash,
  clearFeeUpperBound,
}) {
  const journal = {
    schemaVersion: 1,
    operationId: ALLOWANCE_OPERATION_ID,
    createdAt,
    toolingCommit,
    network: "Base Sepolia",
    chainId: Number(BASE_SEPOLIA_CHAIN_ID),
    planPath: PREPARED_PLAN_PATH,
    addresses: {
      owner: FIXED_SMOKE_ADDRESSES.research,
      spender: FIXED_SMOKE_ADDRESSES.ecosystem,
      token: FIXED_SMOKE_ADDRESSES.token,
    },
    baseline: {
      blockNumber: Number(baselineBlock.number),
      blockHash: baselineBlock.hash,
      researchTokenBaseUnits: BASELINE_RESEARCH_TOKENS.toString(),
      ecosystemTokenBaseUnits: BASELINE_ECOSYSTEM_TOKENS.toString(),
      allowanceBaseUnits: "0",
    },
    transactions: {
      setAllowance: {
        fields: setFields,
        hash: setHash,
        feeUpperBoundWei: String(setFeeUpperBound),
      },
      clearAllowance: {
        fields: clearFields,
        hash: clearHash,
        feeUpperBoundWei: String(clearFeeUpperBound),
      },
    },
    notice:
      "Secret-free recovery journal for exactly two Base Sepolia approval transactions; no raw signed transaction is stored.",
  };
  validateAllowanceJournal(journal);
  return journal;
}

function validateJournalTransaction(
  entry,
  label,
  expectedNonce,
  expectedCalldata,
  feeCap,
  expectedGasLimit
) {
  if (!entry || Object.hasOwn(entry, "raw") || Object.hasOwn(entry, "receipt")) {
    fail(`${label}-Journal enthält unzulässige Ausführungsdaten.`);
  }
  const fields = entry.fields;
  if (
    fields?.type !== 2 ||
    !Array.isArray(fields?.accessList) ||
    fields.accessList.length !== 0
  ) {
    fail(`${label}-Journal muss eine leere Access-List binden.`);
  }
  const transaction = canonicalTransactionFields(fields, label);
  if (
    transaction.type !== 2 ||
    transaction.chainId !== BASE_SEPOLIA_CHAIN_ID ||
    transaction.nonce !== expectedNonce ||
    transaction.to !== FIXED_SMOKE_ADDRESSES.token ||
    transaction.value !== 0n ||
    !sameHex(transaction.data, expectedCalldata) ||
    transaction.gasLimit !== expectedGasLimit ||
    transaction.maxFeePerGas == null ||
    transaction.maxPriorityFeePerGas == null ||
    transaction.maxPriorityFeePerGas > transaction.maxFeePerGas
  ) {
    fail(`${label}-Journal enthält abweichende Transaktionsfelder.`);
  }
  if (!/^0x[0-9a-f]{64}$/i.test(entry.hash || "")) {
    fail(`${label}-Journal enthält keinen gültigen gebundenen Hash.`);
  }
  const upperBound = requiredDecimal(entry.feeUpperBoundWei, `${label} feeUpperBoundWei`);
  if (
    upperBound < transaction.gasLimit * transaction.maxFeePerGas ||
    upperBound > feeCap
  ) {
    fail(`${label}-Journal enthält eine unzulässige Pre-Broadcast-Freigabegrenze.`);
  }
  return { transaction, upperBound };
}

export function validateAllowanceJournal(journal) {
  if (
    journal?.schemaVersion !== 1 ||
    journal?.operationId !== ALLOWANCE_OPERATION_ID ||
    journal?.network !== "Base Sepolia" ||
    journal?.chainId !== Number(BASE_SEPOLIA_CHAIN_ID) ||
    journal?.planPath !== PREPARED_PLAN_PATH ||
    !/^[0-9a-f]{40}$/.test(journal?.toolingCommit || "")
  ) {
    fail("Recovery-Journal gehört nicht zum festen Allowance-Plan.");
  }
  if (
    !sameHex(journal?.addresses?.owner, FIXED_SMOKE_ADDRESSES.research) ||
    !sameHex(journal?.addresses?.spender, FIXED_SMOKE_ADDRESSES.ecosystem) ||
    !sameHex(journal?.addresses?.token, FIXED_SMOKE_ADDRESSES.token) ||
    !Number.isSafeInteger(journal?.baseline?.blockNumber) ||
    journal.baseline.blockNumber <= 0 ||
    !/^0x[0-9a-f]{64}$/i.test(journal?.baseline?.blockHash || "") ||
    journal?.baseline?.researchTokenBaseUnits !== BASELINE_RESEARCH_TOKENS.toString() ||
    journal?.baseline?.ecosystemTokenBaseUnits !== BASELINE_ECOSYSTEM_TOKENS.toString() ||
    journal?.baseline?.allowanceBaseUnits !== "0"
  ) {
    fail("Recovery-Journal enthält keine gültige gebundene Baseline.");
  }
  const set = validateJournalTransaction(
    journal.transactions?.setAllowance,
    "Allowance-Setzen",
    SET_ALLOWANCE_NONCE,
    SET_ALLOWANCE_CALLDATA,
    SET_ALLOWANCE_FEE_CAP,
    SET_ALLOWANCE_GAS_LIMIT
  );
  const clear = validateJournalTransaction(
    journal.transactions?.clearAllowance,
    "Allowance-Widerruf",
    CLEAR_ALLOWANCE_NONCE,
    CLEAR_ALLOWANCE_CALLDATA,
    CLEAR_ALLOWANCE_FEE_CAP,
    CLEAR_ALLOWANCE_GAS_LIMIT
  );
  assertAllowanceFeeCaps(set.upperBound, clear.upperBound);
  return { set: set.transaction, clear: clear.transaction };
}

export function assertFinalAllowanceRoundtrip(values) {
  if (
    BigInt(values.baselineAllowance) !== 0n ||
    BigInt(values.finalAllowance) !== 0n ||
    BigInt(values.latestAllowance) !== 0n ||
    BigInt(values.researchTokensBefore) !== BASELINE_RESEARCH_TOKENS ||
    BigInt(values.researchTokensAfter) !== BASELINE_RESEARCH_TOKENS ||
    BigInt(values.ecosystemTokensBefore) !== BASELINE_ECOSYSTEM_TOKENS ||
    BigInt(values.ecosystemTokensAfter) !== BASELINE_ECOSYSTEM_TOKENS ||
    BigInt(values.totalSupplyBefore) !== parseUnits("1000000", 18) ||
    BigInt(values.totalSupplyAfter) !== parseUnits("1000000", 18)
  ) {
    fail("Allowance-Roundtrip veränderte Allowance-, Token- oder Supply-Endstände.");
  }
  return true;
}

export function allowanceTransactionFromFields(fields, label) {
  return Transaction.from(canonicalTransactionFields(fields, label));
}
