# REIST Research Token (REIST)

The REIST Research Token is the documented ERC-20 test token for the REIST
Division research project on Base Sepolia. Its official contract address is
[`0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`](https://sepolia.basescan.org/token/0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68).
Only the network and address together uniquely identify this test token.

## Specification

| Feature | Value |
|---|---|
| Name | REIST Research Token |
| Symbol | REIST |
| Standard | ERC-20 |
| Pilot network | Base Sepolia, chain ID 84532; deployed and source verified |
| Decimal places | 18 |
| Total supply | 1,000,000 REIST |
| Subsequent minting | technically unavailable |
| Upgrade/proxy | not present |
| Transfer tax | not present |
| Blacklist/pause/rebase | not present |

Names and symbols are not unique on blockchains. Only the combination of the
network and the published contract address identifies the token.

| Contract | Official Base Sepolia address |
|---|---|
| Token page | [`0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`](https://sepolia.basescan.org/token/0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68) |
| Token source | [`0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`](https://sepolia.basescan.org/address/0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68#code) |
| Founder vesting | [`0x0A062Ff80791a96bda452A72094c98E87e3E67e6`](https://sepolia.basescan.org/address/0x0A062Ff80791a96bda452A72094c98E87e3E67e6#code) |

## Genesis Allocation

The allocation is created in the constructor. The address that directly
performs the deployment may not assume any of the three recipient roles and
receives zero tokens.

| Pool | Share | Amount | Purpose |
|---|---:|---:|---|
| Research Rewards | 70% | 700,000 | verified reproductions, implementations, and research contributions |
| Ecosystem Treasury | 20% | 200,000 | documented project operations, infrastructure, and integrations |
| Founder Vesting | 10% | 100,000 | time-bound allocation to the founder/author |

The deployment reserved `0%` for a public sale and `0%` for DEX liquidity.
There is no private presale round and no price commitment. This is documented
project policy, not a transfer restriction of the standard ERC-20: treasuries
and subsequent holders can technically transfer and could thereby also enable
secondary markets.

## Founder Vesting

- Start: timestamp of the token deployment
- Cliff: 365 days
- Total duration: 1,095 days
- Schedule: linear from the start, with withdrawals locked before the cliff
- At the cliff: one third is vested
- End: fully vested after three years

The contract is based on OpenZeppelin's `VestingWalletCliff`. Its beneficiary
role is transferable. This does not accelerate the schedule, but it permits
the transfer of economic rights to amounts that have not yet been withdrawn.
Renouncing the beneficiary role (`renounceOwnership`) is disabled in the REIST
vesting contract so that tokens still subject to vesting cannot accidentally
become permanently inaccessible.

A [read-only Base Sepolia record](../../operations/base-sepolia-vesting-readonly.json)
binds the observed state to finalized block `44966505`. At that block, the full
`100,000 REIST` remained in the vesting contract and its owner matched the
published founder beneficiary. Before the cliff, `released`, `releasable`, and
`vested` were all `0`; no later incoming or outgoing REIST transfers had
occurred after the initial allocation. The exact dates are 2 August 2026 for
the start, 2 August 2027 for the cliff, and 1 August 2029 for the end. The end
date results from the exact duration of `3 × 365` days. This observation was
not a transaction or disbursement and is neither an audit nor a guarantee of
future state.

## Treasury Control

The token contract enforces the initial recipients and amounts, not the later
use of treasury balances. The two testnet treasuries are separate wallets that
are currently controlled centrally; they are not independently staffed Safe
multisigs. The following are planned for substantive disbursements and are
mandatory before any mainnet deployment:

- two separate Safe multisigs,
- a published signer count and threshold,
- every disbursement documented with a bounty/decision ID and evidence,
- a public contribution register with transaction links,
- periodic reconciliation of expected and actual wallet balances.

As long as one person controls all Safe keys, this must be openly described as
centralized control. A multisig label alone does not constitute
decentralization.

## No Economic Promise

A fixed supply creates neither demand nor value. Tokens may remain worthless
and completely illiquid. There is no dividend, profit participation,
redemption, minimum price, interest, staking yield, or commitment to a future
exchange listing.
