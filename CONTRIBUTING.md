# Contributing to REIST Research Token

Contributions are welcome when they improve the verifiability, security, or
reproducibility of the REIST research-token pilot. The mathematical framework
and the optional token remain separate projects.

## Before opening a pull request

- Open or reference an issue that defines the problem and acceptance criteria.
- Keep contract changes small and add tests for every changed invariant.
- Run `npm ci` and `npm run preflight` from a clean checkout.
- Document assumptions, negative results, and known limitations.
- Never commit private keys, seed phrases, `.env`, API keys, wallet files, or
  personal data.

Benchmark and research contributions must identify hardware, operating system,
compiler version, exact flags, raw measurements, baseline, and negative
control. A summarized speedup value alone is not reproducible evidence.

## Security issues

Do not open a public issue for a suspected vulnerability. Use the
[private vulnerability reporting form](https://github.com/rudolfstepan/ReistToken-release/security/advisories/new)
described in [SECURITY.md](SECURITY.md).

## Rewards and licensing

A contribution is not automatically entitled to a token reward. Only a bounty
that was publicly marked active before work began can define a possible
testnet-REIST recognition, and testnet REIST has no assured economic value.

Unless explicitly agreed otherwise before submission, contributions to the
repository are provided under its MIT license. Rights in the REIST trademark
and in the separately licensed scientific paper are not transferred.
