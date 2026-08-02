# REIST Research Token

`REIST` ist ein experimenteller ERC-20 für transparent dokumentierte
Forschungs- und Implementierungsbeiträge zum offenen REIST-Division-Ökosystem.
Der Token ist **nicht** das mathematische Verfahren, kein Nachweis
wissenschaftlicher Richtigkeit und kein Renditeversprechen.

## Aktueller Status

| Bereich | Status |
|---|---|
| Smart Contracts | auf Base Sepolia deployed; Quellcode verifiziert |
| Projektwebsite | veröffentlicht unter `reist-token.intracom.at` |
| Öffentlicher Quellcode | [`ReistToken-release`](https://github.com/rudolfstepan/ReistToken-release) |
| REIST-FPGA-Implementierung | [VHDL, Testbenches und Gowin-Buildquellen öffentlich einsehbar](https://github.com/rudolfstepan/6502-sbc-fpga); unabhängige Hardware-Reproduktion offen |
| Base Sepolia | Testnet-Pilot aktiv, Chain-ID `84532` |
| Technischer Treasury-Test | erfolgreich; [öffentlicher Operationsnachweis](operations/base-sepolia-smoke-transfer.json) |
| Allowance-Roundtrip | erfolgreich; [öffentlicher Operationsnachweis](operations/base-sepolia-allowance-roundtrip.json), finale Allowance `0`, keine REIST-`Transfer`-Events im gebundenen Blockbereich |
| Base Mainnet | gesperrt / nicht konfiguriert |
| Verkauf oder Liquidität | nicht vorhanden |
| Externes Audit | nicht durchgeführt |
| Wirtschaftlicher Wert | keiner zugesichert |

Framework, Paper und Benchmark-Suite bleiben ohne Token zugänglich. Das
kanonische Paper ist unter DOI `10.5281/zenodo.21206471` veröffentlicht und
steht unter CC BY 4.0. Das öffentliche Benchmark-Repository beschreibt REIST
historisch ausdrücklich als Nicht-Kryptowährung. Dieses Projekt ergänzt davon
getrennt einen Research-Reward-Piloten; es ändert nicht die Einordnung des
Frameworks.

## Base-Sepolia-Deployment

Der Testnet-Pilot wurde am 2. August 2026 in Block `44958501` bereitgestellt.
Token- und Vesting-Quellcode sind über Etherscan V2 verifiziert und auf
BaseScan einsehbar:

| Nachweis | Wert |
|---|---|
| Token | [`0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`](https://sepolia.basescan.org/address/0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68#code) |
| Founder-Vesting | [`0x0A062Ff80791a96bda452A72094c98E87e3E67e6`](https://sepolia.basescan.org/address/0x0A062Ff80791a96bda452A72094c98E87e3E67e6#code) |
| Deployment-Transaktion | [`0x4d8f54cd…f38f021c`](https://sepolia.basescan.org/tx/0x4d8f54cd5cf2950ab1b2032c8f042ac16b3cc20fb65fca5221c0933df38f021c) |
| Treasury-Funding | [`0xe3f9e726…9a2864af`](https://sepolia.basescan.org/tx/0xe3f9e7265530e1cc3b8e636d98c038d416360aecd02a36b5e0549bcc9a2864af) |
| Treasury-Transfer | [`0x308a8c07…f2bdcde8`](https://sepolia.basescan.org/tx/0x308a8c07593179744c6a72b9d1992274282300064e9e31bf36cbbd18f2bdcde8) |
| Allowance setzen | [`0x5b355cd4…b53180`](https://sepolia.basescan.org/tx/0x5b355cd4e660fa3659eb33100e1bcc361ac92917a86f958dbdbe136e96b53180) |
| Allowance widerrufen | [`0xdfc94680…747e07`](https://sepolia.basescan.org/tx/0xdfc94680a2aff29cb7ea6a86a4a098ec95176e621d8b402bd6df210b8e747e07) |
| Quellstand | Tag `v0.1.0-predeployment.2`, Commit `e3a732afcc0a6ced913621edcef49f81046979bf` |

Das vollständige, maschinenlesbare Manifest steht unter
[`deployments/base-sepolia.json`](deployments/base-sepolia.json). Dieses
Deployment ist ausschließlich ein technischer Testnet-Pilot. Es ist kein
Mainnet-Asset, kein Verkaufsangebot und kein Nachweis eines externen Audits.
Der gebundene Treasury-Funktionstest ist getrennt unter
[`operations/base-sepolia-smoke-transfer.json`](operations/base-sepolia-smoke-transfer.json)
dokumentiert; er ist weder ein Bounty noch ein akzeptierter Beitrag.
Der getrennt geplante Allowance-Roundtrip wurde ebenfalls abgeschlossen. Der
[`Operationsnachweis`](operations/base-sepolia-allowance-roundtrip.json) bindet
`approve(1 REIST)` und den unmittelbaren Widerruf mit `approve(0)` an die
kanonischen Receipts. Die finale Allowance ist `0`; im gebundenen Blockbereich
wurde kein REIST-`Transfer`-Event erzeugt. Die Plan-JSON bleibt als historische
Momentaufnahme des Zustands vor Signatur und Broadcast unverändert; sie ist
nicht der aktuelle Ausführungsstatus.

## Vertrag

`REISTToken` verwendet OpenZeppelins Standard-ERC-20 und erzeugt einmalig
`1.000.000 REIST`:

| Zuteilung | Menge | Technische Durchsetzung |
|---|---:|---|
| Forschungs- und Reproduktionsprämien | 700.000 REIST | direkt an separate Treasury |
| Ökosystem und Projektbetrieb | 200.000 REIST | direkt an separate Treasury |
| Gründer/Autor | 100.000 REIST | Vesting-Vertrag, 1 Jahr Cliff, 3 Jahre linear |

Es gibt keine nachträgliche Ausgabe, Administration, Upgrade-Proxy,
Transaktionssteuer, Blacklist, Pause, Rebase- oder Staking-Funktion. Die
direkte Deployment-Adresse darf keine Empfängerrolle übernehmen und erhält
keine Token oder Founder-Rechte.

Der Vesting-Zeitplan beginnt beim Deployment. Am einjährigen Cliff ist deshalb
ein Drittel der Gründerzuteilung freigeschaltet; nach drei Jahren ist sie
vollständig freigeschaltet. Die wirtschaftlichen Rechte des OpenZeppelin-
Vesting-Wallets sind durch Übertragung der Begünstigtenrolle übertragbar.

## Lokale Verifikation

Voraussetzung: Node.js 22.13 oder neuer.

```powershell
npm ci
npm run preflight
```

Einzelne Befehle:

```powershell
npm run compile
npm test
npm run coverage
npm run check
```

## Projektseite

Öffentliche Fassung:
[`Deutsch`](https://reist-token.intracom.at/) ·
[`English`](https://reist-token.intracom.at/en/)

```powershell
npm run site
```

Danach ist die trackerfreie statische Seite unter
`http://127.0.0.1:4173` erreichbar. `npm run build:site` erzeugt ein
veröffentlichbares `dist/`-Verzeichnis. Die öffentlichen Projekt- und
Rechtstexte bleiben als Markdown wartbar und werden dabei in eigenständige
deutsche und englische HTML-Seiten umgewandelt. Die Website verlinkt nur diese
HTML-Ausgaben; im Browser ist dafür kein Markdown-Interpreter erforderlich.
Die technische Anleitung für Build, Webroot-Synchronisierung, nginx und den
Live-Test steht in [docs/WEBSITE_DEPLOYMENT.md](docs/WEBSITE_DEPLOYMENT.md).

## Base-Sepolia-Pilot prüfen

Das Repository unterstützt ausschließlich Base Sepolia (Chain-ID `84532`);
eine Mainnet-Konfiguration ist nicht enthalten. Ein frischer öffentlicher
Checkout kann Quellstand, Build, Verträge, Tests und Manifest ohne Walletdaten
reproduzieren:

```powershell
npm ci
npm run preflight
```

Die On-chain-Nachweise sind über die obigen BaseScan-Links öffentlich
einsehbar. Die zusätzlichen Befehle `npm run check:testnet:rpc` und
`npm run verify:testnet` gehören zum Maintainer-Workflow: Sie benötigen die in
`.env.example` dokumentierte lokale RPC- beziehungsweise Etherscan-
Konfiguration. Der Verifier sendet keine Blockchain-Transaktion, fragt aber den
Explorer ab und aktualisiert bei Erfolg die lokalen Statusdateien.

Der Allowance-Ablauf besitzt einen getrennten, ausschließlich lesenden
Precheck:

```powershell
npm run check:base-sepolia-allowance
```

Dieser Befehl entschlüsselt keinen Keystore, signiert nichts und sendet keine
Transaktion. Seit dem Abschluss verweigert er absichtlich jede erneute
Vorbereitung. Auch der einmalige Ausführungsbefehl darf nicht erneut gestartet
werden.

Private Schlüssel gehören niemals in Git, Tickets, Webseiten oder Chats. Für
die erzeugten Keystores müssen Passwort und Verzeichnis getrennt gesichert
werden; das Passwort wird nicht gespeichert oder wiederhergestellt. Der
private Deployer-Key wird nicht in `.env` gespeichert und nur für den
freigegebenen Deployment-Prozess kurzzeitig aus dem Keystore entschlüsselt. Für
ein späteres Mainnet wäre ein hardwaregestützter Signer und eine erneute
Deployment-Konfiguration erforderlich; dieses Repository stellt derzeit keinen
Mainnet-Befehl bereit.

Die vollständige Anleitung steht in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Wissenschaftliche Referenz

- Kanonische Paper-Version des Token-Piloten: DOI
  [`10.5281/zenodo.21206471`](https://doi.org/10.5281/zenodo.21206471),
  veröffentlicht am 5. Juli 2026 unter CC BY 4.0
- Frühere öffentliche Version 2.0:
  [`10.5281/zenodo.17897540`](https://doi.org/10.5281/zenodo.17897540)
- Benchmark-Suite:
  [`rudolfstepan/reist-crypto-bench`](https://github.com/rudolfstepan/reist-crypto-bench)
- FPGA-Implementierung und GHDL-Testbenches:
  [`rudolfstepan/6502-sbc-fpga`](https://github.com/rudolfstepan/6502-sbc-fpga)
- Projektseite:
  [`intracom.at/papers/reist-division.html`](https://intracom.at/papers/reist-division.html)
- Live-Demo:
  [`intracom.at/demo/reist/`](https://intracom.at/demo/reist/)

Für Token-Manifest, Website und Deployment gilt ausschließlich der kanonische
DOI `10.5281/zenodo.21206471`. DOI `10.5281/zenodo.17897540` bleibt als frühere
Version 2.0 historisch referenziert; Zenodo führt den kanonischen Datensatz als
neue Version dieses Vorgängers. Beide Kennungen werden nicht als identische
Version ausgegeben.

## Dokumentation

- [Aktueller Projektstand](docs/PROJECT_STATUS.md)
- [Wissenschaftliche Grundlage](docs/SCIENTIFIC_BASIS.md)
- [Token und Verteilung](docs/TOKENOMICS.md)
- [Beitrags- und Bounty-Prozess](docs/BOUNTIES.md)
- [Transparenz und Status](docs/TRANSPARENCY.md)
- [Risiken](docs/RISKS.md)
- [Rechtlicher Hinweis](docs/LEGAL_NOTICE.md)
- [Release-Gates](docs/RELEASE_CHECKLIST.md)
- [Öffentliches Release-Modell](docs/PUBLIC_RELEASE.md)
- [Beiträge](CONTRIBUTING.md)
- [Sicherheitsmeldungen](SECURITY.md)

## Lizenz und Marke

Der Smart-Contract- und Website-Code steht unter der MIT-Lizenz. Das
kanonische wissenschaftliche Paper steht getrennt davon unter CC BY 4.0. Keine
dieser Lizenzen überträgt Markenrechte. Laut EUIPO-Eintragungsurkunde vom
20. März 2026 ist `REIST` als Unionswortmarke Nr. `019285788` eingetragen;
Nachweis und Einschränkungen stehen in [TRADEMARKS.md](TRADEMARKS.md).
