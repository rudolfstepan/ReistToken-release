import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Transaction, Wallet, parseEther, parseUnits } from "ethers";
import {
  ALLOWANCE_TOTAL_FEE_CAP,
  ALLOWANCE_VALUE,
  BASELINE_ECOSYSTEM_TOKENS,
  BASELINE_RESEARCH_TOKENS,
  CLEAR_ALLOWANCE_CALLDATA,
  CLEAR_ALLOWANCE_FEE_CAP,
  CLEAR_ALLOWANCE_GAS_LIMIT,
  SET_ALLOWANCE_CALLDATA,
  SET_ALLOWANCE_FEE_CAP,
  SET_ALLOWANCE_GAS_LIMIT,
  assertAllowanceFeeCaps,
  assertFinalAllowanceRoundtrip,
  assertFreshAllowanceBaseline,
  createAllowanceJournal,
  createPreparedAllowancePlan,
  validateAllowanceJournal,
  validateAllowancePublicConfiguration,
  validatePreparedAllowancePlan,
} from "../lib/base-sepolia-allowance-plan.js";
import { ensureExactPairBroadcast } from "../execute-base-sepolia-allowance-smoke.js";
import {
  BASE_SEPOLIA_CHAIN_ID,
  FIXED_SMOKE_ADDRESSES,
  signAndBind,
} from "../lib/base-sepolia-smoke-plan.js";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const setFields = {
  type: 2,
  chainId: BASE_SEPOLIA_CHAIN_ID.toString(),
  nonce: "1",
  to: FIXED_SMOKE_ADDRESSES.token,
  valueWei: "0",
  data: SET_ALLOWANCE_CALLDATA,
  gasLimit: SET_ALLOWANCE_GAS_LIMIT.toString(),
  maxFeePerGas: "1000000",
  maxPriorityFeePerGas: "100000",
  accessList: [],
};
const clearFields = {
  ...setFields,
  nonce: "2",
  data: CLEAR_ALLOWANCE_CALLDATA,
  gasLimit: CLEAR_ALLOWANCE_GAS_LIMIT.toString(),
};

function journalFixture() {
  return createAllowanceJournal({
    createdAt: "2026-08-02T19:00:00.000Z",
    toolingCommit: "ab".repeat(20),
    baselineBlock: {
      number: 44963305,
      hash: `0x${"33".repeat(32)}`,
    },
    setFields,
    setHash: `0x${"11".repeat(32)}`,
    setFeeUpperBound: SET_ALLOWANCE_FEE_CAP,
    clearFields,
    clearHash: `0x${"22".repeat(32)}`,
    clearFeeUpperBound: CLEAR_ALLOWANCE_FEE_CAP,
  });
}

test("public prepared plan is exact and explicitly contains no execution", () => {
  const stored = readJson("plans/base-sepolia-allowance-smoke.json");
  assert.deepEqual(stored, createPreparedAllowancePlan());
  assert.doesNotThrow(() => validatePreparedAllowancePlan(stored));
  for (const mutate of [
    (copy) => { copy.status = "completed"; },
    (copy) => { copy.roles.spender = FIXED_SMOKE_ADDRESSES.research; },
    (copy) => { copy.transactions[0].nonce = 2; },
    (copy) => { copy.transactions[0].calldata = CLEAR_ALLOWANCE_CALLDATA; },
    (copy) => { copy.executionState.signaturesCreated = 1; },
    (copy) => { copy.executionState.transactionHashes.push(`0x${"44".repeat(32)}`); },
  ]) {
    const copy = structuredClone(stored);
    mutate(copy);
    assert.throws(() => validatePreparedAllowancePlan(copy));
  }
});

test("allowance preparation is bound to the completed prior smoke", () => {
  const deployment = readJson("deployments/base-sepolia.json");
  const roles = readJson("data/testnet-roles.json");
  const project = readJson("data/project.json");
  const operation = readJson("operations/base-sepolia-smoke-transfer.json");
  assert.doesNotThrow(() =>
    validateAllowancePublicConfiguration(deployment, roles, project, operation)
  );
  for (const mutate of [
    (copy) => { copy.project.status.allowanceTestPrepared = false; },
    (copy) => { copy.project.status.allowanceTestCompleted = true; },
    (copy) => { copy.operation.transactions.tokenTransfer.nonce = 1; },
    (copy) => {
      copy.operation.finalBalances.researchTokenBaseUnits =
        parseUnits("700000", 18).toString();
    },
  ]) {
    const copy = {
      deployment: structuredClone(deployment),
      roles: structuredClone(roles),
      project: structuredClone(project),
      operation: structuredClone(operation),
    };
    mutate(copy);
    assert.throws(() =>
      validateAllowancePublicConfiguration(
        copy.deployment,
        copy.roles,
        copy.project,
        copy.operation
      )
    );
  }
});

test("fresh on-chain baseline requires nonce 1, zero allowance and fee reserve", () => {
  const baseline = {
    latestNonce: 1,
    pendingNonce: 1,
    researchTokens: BASELINE_RESEARCH_TOKENS,
    ecosystemTokens: BASELINE_ECOSYSTEM_TOKENS,
    allowance: 0n,
    researchEth: ALLOWANCE_TOTAL_FEE_CAP,
  };
  assert.doesNotThrow(() => assertFreshAllowanceBaseline(baseline));
  for (const changes of [
    { pendingNonce: 2 },
    { allowance: 1n },
    { researchTokens: BASELINE_RESEARCH_TOKENS + 1n },
    { ecosystemTokens: BASELINE_ECOSYSTEM_TOKENS - 1n },
    { researchEth: ALLOWANCE_TOTAL_FEE_CAP - 1n },
  ]) {
    assert.throws(() => assertFreshAllowanceBaseline({ ...baseline, ...changes }));
  }
});

test("journal binds both exact transactions, fees, access lists and baseline", () => {
  const journal = journalFixture();
  assert.doesNotThrow(() => validateAllowanceJournal(journal));
  for (const mutate of [
    (copy) => { copy.toolingCommit = "00"; },
    (copy) => { copy.baseline.allowanceBaseUnits = "1"; },
    (copy) => { copy.transactions.setAllowance.fields.nonce = "2"; },
    (copy) => { copy.transactions.setAllowance.fields.type = 1; },
    (copy) => { copy.transactions.clearAllowance.fields.nonce = "3"; },
    (copy) => { copy.transactions.setAllowance.fields.data = CLEAR_ALLOWANCE_CALLDATA; },
    (copy) => { copy.transactions.clearAllowance.fields.accessList = [{ address: FIXED_SMOKE_ADDRESSES.token, storageKeys: [] }]; },
    (copy) => { copy.transactions.setAllowance.fields.gasLimit = "70001"; },
    (copy) => { copy.transactions.setAllowance.feeUpperBoundWei = "1"; },
    (copy) => { copy.transactions.clearAllowance.raw = "0x01"; },
  ]) {
    const copy = structuredClone(journal);
    mutate(copy);
    assert.throws(() => validateAllowanceJournal(copy));
  }
});

test("fee thresholds and final roundtrip state fail closed", () => {
  assert.doesNotThrow(() =>
    assertAllowanceFeeCaps(SET_ALLOWANCE_FEE_CAP, CLEAR_ALLOWANCE_FEE_CAP)
  );
  assert.throws(() =>
    assertAllowanceFeeCaps(SET_ALLOWANCE_FEE_CAP + 1n, CLEAR_ALLOWANCE_FEE_CAP)
  );
  const values = {
    baselineAllowance: 0n,
    finalAllowance: 0n,
    latestAllowance: 0n,
    researchTokensBefore: BASELINE_RESEARCH_TOKENS,
    researchTokensAfter: BASELINE_RESEARCH_TOKENS,
    ecosystemTokensBefore: BASELINE_ECOSYSTEM_TOKENS,
    ecosystemTokensAfter: BASELINE_ECOSYSTEM_TOKENS,
    totalSupplyBefore: parseUnits("1000000", 18),
    totalSupplyAfter: parseUnits("1000000", 18),
  };
  assert.equal(assertFinalAllowanceRoundtrip(values), true);
  assert.throws(() =>
    assertFinalAllowanceRoundtrip({ ...values, finalAllowance: ALLOWANCE_VALUE })
  );
  assert.throws(() =>
    assertFinalAllowanceRoundtrip({
      ...values,
      researchTokensAfter: BASELINE_RESEARCH_TOKENS - 1n,
    })
  );
});

test("both journal transactions re-sign only to their bound hashes", async () => {
  const wallet = new Wallet(`0x${"01".repeat(32)}`);
  for (const [label, fields] of [
    ["Allowance-Setzen", setFields],
    ["Allowance-Widerruf", clearFields],
  ]) {
    const raw = await wallet.signTransaction(Transaction.from({
      type: 2,
      chainId: BigInt(fields.chainId),
      nonce: Number(fields.nonce),
      to: fields.to,
      value: BigInt(fields.valueWei),
      data: fields.data,
      gasLimit: BigInt(fields.gasLimit),
      maxFeePerGas: BigInt(fields.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(fields.maxPriorityFeePerGas),
      accessList: [],
    }));
    const hash = Transaction.from(raw).hash;
    const signed = await signAndBind(wallet, fields, hash, label);
    assert.equal(Transaction.from(signed.raw).hash, hash);
    await assert.rejects(
      signAndBind(wallet, { ...fields, gasLimit: String(BigInt(fields.gasLimit) + 1n) }, hash, label),
      /nicht denselben Journal-Hash/
    );
  }
});

test("clear broadcast starts before an ambiguous set response resolves", async () => {
  const journal = journalFixture();
  const setSigned = {
    raw: "set-raw",
    hash: journal.transactions.setAllowance.hash,
  };
  const clearSigned = {
    raw: "clear-raw",
    hash: journal.transactions.clearAllowance.hash,
  };
  const calls = [];
  const knownReceipts = new Set();
  let resolveSet;
  const provider = {
    async getTransaction() {
      return null;
    },
    async getTransactionReceipt(hash) {
      return knownReceipts.has(hash) ? { hash } : null;
    },
    broadcastTransaction(raw) {
      if (raw === setSigned.raw) {
        calls.push("set-started");
        knownReceipts.add(setSigned.hash);
        return new Promise((resolve) => {
          resolveSet = () => resolve({ hash: setSigned.hash });
        });
      }
      if (raw === clearSigned.raw) {
        calls.push("clear-started");
        knownReceipts.add(clearSigned.hash);
        return Promise.resolve({ hash: clearSigned.hash });
      }
      throw new Error("unexpected raw transaction");
    },
  };

  const operation = ensureExactPairBroadcast(
    provider,
    setSigned,
    clearSigned,
    journal,
    FIXED_SMOKE_ADDRESSES.research
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["set-started", "clear-started"]);
  resolveSet();
  await operation;
});
