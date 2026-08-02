# Security Policy

[Deutsche Fassung](../../SECURITY.md)

## Supported Status

The code is at a stage before the first testnet release. There is currently no
official mainnet deployment and no external audit.

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
- Because the token is immutable, a deployed contract cannot be patched. If a
  defect were found before a mainnet deployment, a new contract and a publicly
  documented migration decision would be required.

## No Bug-Bounty Promise

There is currently no financial bug-bounty program. Any possible recognition
in testnet REIST will be awarded only under rules published in advance and has
no assured economic value.
