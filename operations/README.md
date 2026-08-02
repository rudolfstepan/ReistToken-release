# Base-Sepolia-Operationsnachweise

Dieses Verzeichnis enthält ausschließlich öffentliche, maschinenlesbare
Nachweise bestätigter technischer Testnet-Operationen. Private Schlüssel,
Keystores, Passwörter, signierte Rohtransaktionen und RPC-Zugangsdaten gehören
nicht in dieses Verzeichnis oder in das Repository.

Ein Operationsnachweis ist weder ein Bounty- noch ein Beitragsregistereintrag
und macht aus dem Base-Sepolia-Piloten kein wirtschaftlich nutzbares Token.
Unvollständige oder nicht kanonisch bestätigte Vorgänge werden hier nicht als
abgeschlossen veröffentlicht.

Vor der Ausführung gebundene Pläne stehen getrennt unter
[`plans/`](../plans/). Ein Plan allein ist kein Operationsnachweis; der
Abschluss wird jeweils durch eine Datei in diesem Verzeichnis dokumentiert.

## Abgeschlossene Nachweise

- [Gebundener Base-Sepolia-Treasury-Funktionstest vom 2. August 2026](base-sepolia-smoke-transfer.json):
  `0,000005` Test-ETH an die Research Treasury und anschließend `1 REIST` an
  die Ecosystem Treasury. Der vollständige Testnet-Smoke-Test, ein Bounty und
  ein externes Audit bleiben davon unberührt.
- [Gebundener Base-Sepolia-Allowance-Roundtrip vom 2. August 2026](base-sepolia-allowance-roundtrip.json):
  temporäre Allowance von `1 REIST` mit
  [`0x5b355cd4…b53180`](https://sepolia.basescan.org/tx/0x5b355cd4e660fa3659eb33100e1bcc361ac92917a86f958dbdbe136e96b53180),
  unmittelbarer Widerruf auf `0` mit
  [`0xdfc94680…747e07`](https://sepolia.basescan.org/tx/0xdfc94680a2aff29cb7ea6a86a4a098ec95176e621d8b402bd6df210b8e747e07),
  unveränderte Tokenbestände und keine REIST-`Transfer`-Events im gebundenen
  Blockbereich. Der vollständige Testnet-Smoke-Test bleibt offen.
