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
- bestätigter Allowance-Roundtrip mit temporär `1 REIST`, unmittelbarem
  Widerruf auf `0` und
  [maschinenlesbarem Operationsnachweis](../operations/base-sepolia-allowance-roundtrip.json),
- öffentlich einsehbare REIST-FPGA-Quellen am geprüften Commit
  `42c11dc941c23ff4b3f84fd606791d285b4311e9`,
- deutsche und englische statische Website mit automatischer Sprachwahl.

## Allowance-Test: abgeschlossen

Der unter
[`plans/base-sepolia-allowance-smoke.json`](../plans/base-sepolia-allowance-smoke.json)
exakt gebundene Test wurde am 2. August 2026 abgeschlossen:

1. Research Treasury setzt für die Ecosystem Treasury eine Allowance von
   exakt `1 Testnet-REIST` mit Nonce `1`:
   [`0x5b355cd4…b53180`](https://sepolia.basescan.org/tx/0x5b355cd4e660fa3659eb33100e1bcc361ac92917a86f958dbdbe136e96b53180).
2. Research Treasury widerruft sie unmittelbar mit Nonce `2` auf `0`:
   [`0xdfc94680…747e07`](https://sepolia.basescan.org/tx/0xdfc94680a2aff29cb7ea6a86a4a098ec95176e621d8b402bd6df210b8e747e07).

Beide Transaktionen wurden in Block `44965712` aufgenommen. Der
[Operationsnachweis](../operations/base-sepolia-allowance-roundtrip.json)
dokumentiert kanonische Receipts mit jeweils zwei nachgelagerten
Bestätigungen, die erwarteten `Approval`-Events für `1 REIST` und `0` sowie
folgende Endprüfungen:

- finale Allowance: `0`,
- Research-Bestand unverändert: `699.999 REIST`,
- Ecosystem-Bestand unverändert: `200.001 REIST`,
- Gesamtmenge unverändert,
- keine REIST-`Transfer`-Events im gebundenen Blockbereich
  `44965711` bis `44965712`.

Der Vorgang war ein technischer ERC-20-Test. Er war weder Token-Transfer noch
Bounty, Beitrag, Verkauf oder Mainnet-Operation. Die lokale Prüfung umfasst
15 Contract-Tests sowie 14 Tests für Deployment-Recovery und gebundene
Operationspläne.

## Noch offen

- Vesting-Read-only-Nachweis in den vollständigen Testnet-Bericht aufnehmen,
- erstes echtes öffentliches Pilot-Bounty aktivieren und unabhängig
  abschließen,
- Benchmark-Dokumentation und FPGA-CI/Lizenzumfang bereinigen,
- externe Contract-Prüfung, unabhängige Signer, Multisigs und Incident-Plan,
- rechtliche und steuerliche Prüfung vor jeder Mainnet-, Verkaufs- oder
  Liquiditätsentscheidung.

Mainnet bleibt gesperrt. Testnet-REIST besitzt keinen zugesicherten
wirtschaftlichen Wert.
