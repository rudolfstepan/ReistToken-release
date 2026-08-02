# Gebundene Base-Sepolia-Pläne

Dieses Verzeichnis enthält öffentlich prüfbare, vor einer Testnet-Ausführung
gebundene Pläne. Ein Plan ist für sich keine Transaktion und kein
Operationsnachweis. Private Schlüssel, Passwörter, signierte
Rohtransaktionen und RPC-Zugangsdaten werden nicht veröffentlicht.

Die Plan-JSON-Datei bleibt absichtlich als unveränderte historische
Pre-Execution-Momentaufnahme erhalten. Ihre Felder `status`, `executionState`
und `notice` beschreiben den Zustand zum Zeitpunkt `preparedAt`, nicht den
heutigen Projektstatus. Der spätere kanonische Abschluss wird ausschließlich
im verlinkten Operationsnachweis dokumentiert. Dadurch bleibt nachvollziehbar,
welches Eingabedokument vor Signatur und Broadcast öffentlich gebunden war.

## Ausgeführt und nachgewiesen

- [`base-sepolia-allowance-smoke.json`](base-sepolia-allowance-smoke.json):
  vorab gebundener Ablauf, um exakt `1 REIST` Allowance von der Research
  Treasury an die Ecosystem Treasury zu setzen und unmittelbar wieder auf `0`
  zu widerrufen. Der Abschluss ist im
  [`Operationsnachweis`](../operations/base-sepolia-allowance-roundtrip.json)
  dokumentiert: zwei kanonische Receipts, passende `Approval`-Events,
  unveränderte Tokenbestände, keine REIST-`Transfer`-Events im gebundenen
  Blockbereich und finale Allowance `0`.
