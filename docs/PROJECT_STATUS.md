# Aktueller Projektstand

Stand: 2. August 2026.

## Veröffentlicht und bestätigt

- kanonisches Paper: DOI `10.5281/zenodo.21206471`,
- öffentlicher Token-Quellcode:
  [`rudolfstepan/ReistToken-release`](https://github.com/rudolfstepan/ReistToken-release),
- Base-Sepolia-Token:
  `0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`,
- Founder-Vesting:
  `0x0A062Ff80791a96bda452A72094c98E87e3E67e6`,
- verifizierter Quellcode beider Verträge,
- fixer Bestand von `1.000.000 REIST`, keine Mint-, Pause-, Tax-, Blacklist-,
  Owner- oder Upgradefunktion,
- bestätigter Treasury-Funktionstest mit `0,000005` Test-ETH und anschließend
  `1 REIST`; Nachweis unter
  [`operations/base-sepolia-smoke-transfer.json`](../operations/base-sepolia-smoke-transfer.json),
- öffentlich einsehbare REIST-FPGA-Quellen am geprüften Commit
  `42c11dc941c23ff4b3f84fd606791d285b4311e9`,
- deutsche und englische statische Website mit automatischer Sprachwahl.

## Allowance-Test: vorbereitet, nicht ausgeführt

Der nächste technische Test ist unter
[`plans/base-sepolia-allowance-smoke.json`](../plans/base-sepolia-allowance-smoke.json)
exakt gebunden:

1. Research Treasury setzt für die Ecosystem Treasury eine Allowance von
   exakt `1 Testnet-REIST` mit Nonce `1`.
2. Research Treasury widerruft sie unmittelbar mit Nonce `2` auf `0`.

Es werden keine Token übertragen. Der vorbereitete Plan enthält null
Signaturen, null Broadcasts, keine Transaktionshashes und keine Receipts.

Der ausschließlich lesende On-chain-Precheck war am 2. August 2026 in Block
`44964850` erfolgreich:

- Research-Bestand: `699.999 REIST`,
- Ecosystem-Bestand: `200.001 REIST`,
- Allowance: `0`,
- Research-Nonce: `1`,
- Research-Test-ETH: `0,000004787156183642`,
- konservative Pre-Broadcast-Freigabegrenze: `0,000002 Test-ETH`,
- gebundene Gaslimits: `70.000 / 60.000`.

Der Precheck öffnete keinen Keystore, erzeugte keine Signatur und sendete
keine Transaktion. Die lokale Prüfung umfasst 15 Contract-Tests sowie 13
Tests für Deployment-Recovery und gebundene Operationspläne.

## Noch offen

- Allowance-Roundtrip nach einer neuen, ausdrücklichen Freigabe ausführen und
  den kanonischen Operationsnachweis veröffentlichen,
- Vesting-Read-only-Nachweis in den vollständigen Testnet-Bericht aufnehmen,
- erstes echtes öffentliches Pilot-Bounty aktivieren und unabhängig
  abschließen,
- Benchmark-Dokumentation und FPGA-CI/Lizenzumfang bereinigen,
- externe Contract-Prüfung, unabhängige Signer, Multisigs und Incident-Plan,
- rechtliche und steuerliche Prüfung vor jeder Mainnet-, Verkaufs- oder
  Liquiditätsentscheidung.

Mainnet bleibt gesperrt. Testnet-REIST besitzt keinen zugesicherten
wirtschaftlichen Wert.
