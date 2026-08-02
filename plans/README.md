# Vorbereitete Base-Sepolia-Pläne

Dieses Verzeichnis enthält ausschließlich öffentlich prüfbare, noch nicht
ausgeführte Testnet-Pläne. Ein Plan ist keine Transaktion und kein
Operationsnachweis. Er enthält weder private Schlüssel noch Passwörter,
signierte Rohtransaktionen oder RPC-Zugangsdaten.

## Vorbereitet, nicht ausgeführt

- [`base-sepolia-allowance-smoke.json`](base-sepolia-allowance-smoke.json):
  exakt `1 REIST` Allowance von der Research Treasury an die Ecosystem
  Treasury setzen und unmittelbar wieder auf `0` widerrufen. Es werden keine
  Token übertragen. Der spätere Abschluss gilt erst nach zwei kanonisch
  bestätigten Receipts, den passenden `Approval`-Events, unveränderten
  Tokenbeständen und finaler Allowance `0`.
