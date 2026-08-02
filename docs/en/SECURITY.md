# Security Policy

[Deutsche Fassung](../../SECURITY.md)

## Supported Status

The first technical pilot is deployed on Base Sepolia; the source code of the
token and vesting contracts is verified in the explorer. There is no official
mainnet deployment and no external audit.

## Reporting a Security Issue

Sensitive vulnerabilities must not be described in public issues. They can be
submitted confidentially through the release repository's private GitHub
security reporting channel:

[`Submit a private vulnerability report`](https://github.com/rudolfstepan/ReistToken-release/security/advisories/new)

Non-sensitive defects, documentation discrepancies, and test improvements can
be reported as normal issues.

## Response Principles

- Acknowledge receipt and preserve reproducible details.
- Assess the impact on the contract, deployment scripts, and documentation
  separately.
- Do not publish on mainnet while High or Critical findings remain unresolved.
- Publish the correction, tests, and technical description together.
- Because the token is immutable, the deployed testnet contract cannot be
  patched. A relevant defect would require a public warning, a new contract,
  and a documented migration decision. Mainnet would still require a separate
  review and approval.

## No Bug-Bounty Promise

There is currently no financial bug-bounty program. Any possible recognition
in testnet REIST will be awarded only under rules published in advance and has
no assured economic value.
