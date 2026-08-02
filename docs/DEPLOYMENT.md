# Deployment auf Base Sepolia

## Grundsatz

Der Workflow ist derzeit technisch auf Base Sepolia mit Chain-ID `84532`
beschränkt. Es gibt keine Mainnet-Konfiguration und keinen Mainnet-Befehl.

## 1. Rollen vorbereiten

Benötigt werden drei Empfängeradressen:

- `FOUNDER_BENEFICIARY`
- `RESEARCH_REWARDS_TREASURY`
- `ECOSYSTEM_TREASURY`

Alle drei Empfänger und die separate Deployment-Wallet müssen paarweise
verschieden sein. Das Skript und der Vertrag prüfen dies vor beziehungsweise
bei der Erstellung; die Deployment-Wallet erhält dadurch weder eine direkte
Zuteilung noch Founder-Rechte.

Für einen realistischen Piloten sollten die beiden Treasuries separate
Base-Sepolia-Safes sein. Vor Mainnet sollten sie durch voneinander unabhängige
Signer kontrolliert werden. Eine Person mit mehreren Wallets ist nicht
dezentral.

## 2. Wegwerf-Testnet-Wallet

Eine separate Wallet ohne Mainnet-Guthaben verwenden. Kostenloses
Base-Sepolia-ETH gibt es über die in der
[Base-Dokumentation gelisteten Faucets](https://docs.base.org/base-chain/network-information/network-faucets).

Der private Schlüssel wird ausschließlich lokal in `.env` verwendet. Niemals
den Schlüssel einer Wallet einsetzen, die reale Vermögenswerte hält.

## 3. Konfiguration

```powershell
Copy-Item .env.example .env
```

`.env` lokal ausfüllen. `REIST_PAPER_DOI` muss vor Veröffentlichung auf die
tatsächlich zitierte, überprüfte Paper-Version zeigen.

## 4. Reproduzierbarer Preflight

```powershell
npm ci
npm run preflight
```

Der Preflight bereinigt Build-Artefakte, kompiliert, testet, validiert
Projektdaten und prüft sämtliche npm-Abhängigkeiten.

Das Deployment wird aus einem frischen Clone des kanonischen öffentlichen
Release-Repositorys
[`rudolfstepan/ReistToken-release`](https://github.com/rudolfstepan/ReistToken-release)
ausgeführt. Die private Entwicklungshistorie ist nicht Teil des Releases; das
Veröffentlichungsmodell steht in [PUBLIC_RELEASE.md](PUBLIC_RELEASE.md).

Vor dem Deployment muss der vollständige Release-Stand committed, mit einem
annotierten unveränderlichen Release-Tag versehen und zusammen mit diesem Tag
zum `origin`-Remote gepusht sein. Das Skript
normalisiert den Remote auf eine HTTPS-Repository-URL, ruft sie ohne
gespeicherte Zugangsdaten ab und verlangt dort den exakten HEAD-Commit. Bei
uncommitted Änderungen, privatem oder nicht erreichbarem Remote sowie fehlendem
Commit bricht es vor jeder On-chain-Transaktion ab. Commit, öffentliche
Repository-URL, Build-ID und Standard-JSON-Hash werden in das Manifest
geschrieben.

## 5. Deployment

```powershell
npm run deploy:testnet
```

Das Skript:

- verweigert andere Netzwerke und Chain-IDs,
- validiert alle Adressen und ihre Verschiedenheit,
- prüft Test-ETH,
- deployed den Token und dessen Vesting-Vertrag,
- prüft Gesamtmenge, Zuteilungen, Beneficiary und Deployer-Bestand,
- erzeugt `deployments/base-sepolia.json`,
- erzeugt das gebundene `deployments/base-sepolia-standard-input.json`,
- aktualisiert den maschinenlesbaren Testnet-Status in `data/project.json`.

Ein bestehendes Manifest wird nicht still überschrieben. Für einen bewussten
neuen Pilotvertrag muss `ALLOW_MANIFEST_OVERWRITE=YES` gesetzt und der Grund
öffentlich dokumentiert werden.

Nach dem Deployment die Statuszeilen in `README.md` und
`docs/TRANSPARENCY.md` auf die tatsächlichen Adressen und Transaktionen
umstellen. `npm run check` verweigert einen Website-Build mit
widersprüchlichen Statusdaten.

## 6. Quellcode verifizieren

```powershell
npm run verify:testnet
```

Das Skript lädt `.env`, prüft zuerst Chain, Deployment-Receipt, beide
Runtime-Codehashes, Zuteilungen und Vesting gegen RPC und Manifest. Danach
übermittelt es das beim Deployment gehashte Solidity-Standard-JSON sowie die
ABI-kodierten Konstruktorargumente direkt an die offizielle Etherscan-V2-API.
Es liest den dort tatsächlich veröffentlichten Quellcode zurück und setzt
`sourceVerified` nur dann auf `true`, wenn Token und Vesting deployment-identisch
sind. Dafür ist `ETHERSCAN_API_KEY` erforderlich; der Schlüssel wird weder
protokolliert noch in das Manifest geschrieben.

Anschließend beide Adressen zusätzlich im Explorer öffnen und Compiler-Version,
Optimierung, Konstruktorargumente und Bytecode manuell kontrollieren. Eine
Explorer-Verifikation ersetzt kein Sicherheitsaudit.

## 7. Smoke Test

- kleine Standardübertragung aus einer Treasury,
- Approve und Zurücksetzen der Allowance,
- Vesting `releasable(token)` vor dem Cliff = 0,
- Bounty-Testtransfer mit öffentlicher Test-ID,
- Transaktion im Beitragsregister verlinken,
- Website neu bauen und angezeigte Adressen gegen Explorer prüfen.

## Mainnet-Gate

Ein Mainnet-Deployment verlangt die vollständige
[Release-Checkliste](RELEASE_CHECKLIST.md), neue hardwaregestützte
Deployment-Prozesse und eine explizite Codeänderung. Es ist kein bloßer
Netzwerk-Schalter.
