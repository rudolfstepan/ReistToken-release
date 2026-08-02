# Release-Gates

## Base-Sepolia-Deployment

- [x] Alle früheren Platzhalter-Artefakte im Projekt ersetzt
- [x] fixer Bestand und Genesis-Verteilung im Vertrag
- [x] Founder-Vesting im Vertrag erzeugt
- [x] lokale Vertrags- und Vesting-Tests
- [x] keine Mint-, Tax-, Pause-, Blacklist- oder Upgradefunktion
- [x] Deployment-Invarianten und Manifest
- [x] zwei separate Testnet-Treasury-Wallets eingerichtet
- [x] privater Security-Meldekanal im öffentlichen Release-Repository eingerichtet
- [x] DOI `10.5281/zenodo.21206471` für den Pilot eindeutig festgelegt
- [x] öffentliche Repository-URL festgelegt und Release-Commit gepusht
- [x] Deployment-Transaktion und Manifest veröffentlicht
- [x] Quellcode von Token und Vesting im Explorer verifiziert
- [x] gebundener technischer Treasury-Transfer mit öffentlichem Operationsnachweis
- [x] fail-closed Allowance-/Widerrufsplan mit Read-only-Precheck vorbereitet
- [x] Allowance `1 REIST` on-chain gesetzt, unmittelbar auf `0` widerrufen und
  mit öffentlichem Operationsnachweis dokumentiert
- [ ] erstes Pilot-Bounty als öffentliches Issue aktiviert

## Wissenschaftliche Konsistenz

- [x] Beziehung zwischen DOI `10.5281/zenodo.17897540` und
  `10.5281/zenodo.21206471` veröffentlicht
- [ ] öffentliches Benchmark-README präzisiert: Das Framework bleibt kein
  Token; der Research Token ist ein getrenntes Projekt
- [ ] fehlerhaften BibTeX-/DOI-Verweis im öffentlichen Benchmark-README korrigiert
- [ ] widersprüchliche README-Aussage zur reinen Restberechnung bereinigt
- [ ] Leistungsangaben mit Rohdaten, Hardware und Compilerfassung verknüpft
- [x] REIST-FPGA-RTL, Testbenches und Tang-Primer-20K-Buildquellen öffentlich verlinkt
- [ ] FPGA-Lizenzierung, CI-Gate und unabhängige Hardware-Reproduktion abgeschlossen
- [x] Paper-Lizenz CC BY 4.0 und Token-Code-Lizenz MIT eindeutig ausgewiesen

## Vor Mainnet

- [ ] mindestens ein real abgeschlossenes, reproduzierbares Pilot-Bounty
- [ ] unabhängige Testnet-Nutzer und Treasury-Signer
- [ ] vollständiger Testnet-Smoke-Test und veröffentlichter Bericht
- [x] Quellcode beider Verträge im Explorer verifiziert
- [ ] externe Smart-Contract-Prüfung ohne offene High/Critical-Befunde
- [ ] rechtliche und steuerliche Prüfung für Österreich/EU
- [ ] MiCAR-Einordnung und gegebenenfalls konformes Whitepaper/Notifikation
- [ ] Marken- und Tickerprüfung für die tatsächliche Token-Nutzung
- [ ] hardwaregestützter Mainnet-Deployment-Signer
- [ ] getrennte Safe-Multisigs mit veröffentlichter Schwelle
- [ ] Incident-, Schlüsselverlust- und Migrationsplan
- [ ] keinerlei ungeklärte Preis-, Rendite- oder Listing-Kommunikation

Mainnet ist eine Entscheidung nach nachgewiesenem Nutzen, kein automatisch
folgender Meilenstein. Werden die Gates nicht erfüllt, bleibt REIST ein
Testnet-Forschungspilot.
