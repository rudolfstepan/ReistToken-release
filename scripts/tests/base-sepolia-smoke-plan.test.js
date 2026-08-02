import assert from "node:assert/strict";
import test from "node:test";
import { Interface, Transaction, Wallet, parseEther, parseUnits } from "ethers";
import {
  BASE_SEPOLIA_CHAIN_ID,
  FIXED_SMOKE_ADDRESSES,
  FUNDING_FEE_CAP,
  FUNDING_VALUE,
  TOKEN_FEE_CAP,
  TOKEN_VALUE,
  assertFeeCaps,
  assertFundingDeltas,
  assertTokenDeltas,
  canonicalTransactionFields,
  createJournal,
  signAndBind,
  validateJournal,
} from "../lib/base-sepolia-smoke-plan.js";

const tokenCalldata = new Interface([
  "function transfer(address,uint256) returns (bool)",
]).encodeFunctionData("transfer", [FIXED_SMOKE_ADDRESSES.ecosystem, TOKEN_VALUE]);

const fundingFields = {
  chainId: BASE_SEPOLIA_CHAIN_ID.toString(),
  nonce: "1",
  to: FIXED_SMOKE_ADDRESSES.research,
  valueWei: FUNDING_VALUE.toString(),
  data: "0x",
  gasLimit: "25200",
  maxFeePerGas: "1000000",
  maxPriorityFeePerGas: "100000",
};
const tokenFields = {
  chainId: BASE_SEPOLIA_CHAIN_ID.toString(),
  nonce: "0",
  to: FIXED_SMOKE_ADDRESSES.token,
  valueWei: "0",
  data: tokenCalldata,
  gasLimit: "70000",
  maxFeePerGas: "1000000",
  maxPriorityFeePerGas: "100000",
};

function fixture() {
  return createJournal({
    createdAt: "2026-08-02T17:00:00.000Z",
    tokenCalldata,
    fundingFields,
    fundingHash: `0x${"11".repeat(32)}`,
    fundingFeeUpperBound: FUNDING_FEE_CAP,
    tokenFields,
    tokenHash: `0x${"22".repeat(32)}`,
    tokenFeeUpperBound: TOKEN_FEE_CAP,
    baseline: {
      researchTokenBaseUnits: parseUnits("700000", 18),
      ecosystemTokenBaseUnits: parseUnits("200000", 18),
    },
  });
}

test("journal binds exact chain, nonces, addresses, amounts and baseline", () => {
  const journal = fixture();
  assert.doesNotThrow(() => validateJournal(journal, tokenCalldata));
  for (const mutate of [
    (copy) => { copy.chainId = 1; },
    (copy) => { copy.transactions.funding.fields.nonce = "2"; },
    (copy) => { copy.transactions.funding.fields.valueWei = "5000000000001"; },
    (copy) => { copy.transactions.token.fields.data = "0x"; },
    (copy) => {
      copy.transactions.funding.fields.maxFeePerGas = FUNDING_FEE_CAP.toString();
      copy.transactions.funding.feeUpperBoundWei = "1";
    },
    (copy) => { copy.transactions.funding.fields.gasLimit = "30001"; },
    (copy) => { copy.baseline.researchTokenBaseUnits = parseUnits("699999", 18).toString(); },
  ]) {
    const copy = structuredClone(journal);
    mutate(copy);
    assert.throws(() => validateJournal(copy, tokenCalldata));
  }
});

test("fee caps and exact historical balance deltas fail closed", () => {
  assert.doesNotThrow(() => assertFeeCaps(FUNDING_FEE_CAP, TOKEN_FEE_CAP));
  assert.throws(() => assertFeeCaps(FUNDING_FEE_CAP + 1n, TOKEN_FEE_CAP));
  assert.equal(
    assertFundingDeltas({
      deployerBefore: FUNDING_VALUE + 100n,
      deployerAfter: 0n,
      researchBefore: 0n,
      researchAfter: FUNDING_VALUE,
    }),
    100n
  );
  assert.throws(() =>
    assertFundingDeltas({
      deployerBefore: FUNDING_VALUE + 100n,
      deployerAfter: 0n,
      researchBefore: 0n,
      researchAfter: FUNDING_VALUE + 1n,
    })
  );
  assert.equal(
    assertTokenDeltas({
      researchEthBefore: parseEther("0.000005"),
      researchEthAfter: parseEther("0.0000049"),
      researchTokenBefore: parseUnits("700000", 18),
      researchTokenAfter: parseUnits("699999", 18),
      ecosystemTokenBefore: parseUnits("200000", 18),
      ecosystemTokenAfter: parseUnits("200001", 18),
    }),
    parseEther("0.0000001")
  );
});

test("resume accepts only a deterministic re-signature with the journal hash", async () => {
  const wallet = new Wallet(`0x${"01".repeat(32)}`);
  const transaction = canonicalTransactionFields(fundingFields, "Funding");
  const raw = await wallet.signTransaction(transaction);
  const hash = Transaction.from(raw).hash;
  const signed = await signAndBind(wallet, fundingFields, hash, "Funding");
  assert.equal(Transaction.from(signed.raw).hash, hash);
  await assert.rejects(
    signAndBind(wallet, { ...fundingFields, gasLimit: "25201" }, hash, "Funding"),
    /nicht denselben Journal-Hash/
  );
});
