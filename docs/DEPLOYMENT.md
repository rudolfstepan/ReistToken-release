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

Für einen rein technischen, offen zentral kontrollierten Testnet-Piloten kann
der lokale Bootstrap vier voneinander unabhängige EOA-Keypairs erzeugen:

```powershell
npm run setup:testnet-wallets
```

Das sichtbare Passwortfenster liest ein mindestens 16 Zeichen langes Passwort
verdeckt ein. Das Skript überschreibt niemals vorhandene `.env`- oder
Keystore-Dateien. Es legt vier verschlüsselte JSON-Keystores außerhalb des
Repositorys unter `%LOCALAPPDATA%\REIST\base-sepolia-wallets` und die lokale
`.env` an. Das externe Verzeichnis kann weder von Git noch von Hardhats
Quellensuche erfasst werden; beide Pfade werden unter Windows auf das aktuelle
Benutzerkonto beschränkt. `.env` enthält nur die öffentliche Deployer-Adresse
und den externen Keystore-Pfad, keinen privaten Wallet-Schlüssel. Das ist
getrennte Schlüsselverwahrung, aber keine Dezentralisierung oder
Multisig-Governance.

Vor Faucet oder Deployment müssen Keystore-Verzeichnis und Passwort getrennt
gesichert werden. Ohne Passwort lassen sich die Keystores nicht
wiederherstellen. Alle vier Wiederherstellungen müssen vor der Finanzierung
zuerst lokal und anschließend direkt aus einer getrennten Sicherung geprüft
werden:

```powershell
npm run check:testnet-acl
npm run check:testnet-recovery
npm run check:testnet-recovery -- -WalletDirectory "E:\REIST-Backup\base-sepolia-wallets"
```

Der letzte Pfad ist ein Beispiel und muss auf eine tatsächlich getrennte Kopie
des Keystore-Verzeichnisses zeigen. Der ACL-Check ist idempotent; falls die
Rechte nach einem abgebrochenen Setup repariert werden müssen, kann lokal
`powershell.exe -File scripts/check-testnet-acl.ps1 -Repair` ausgeführt werden.

Alle vier Keystores teilen im zentral kontrollierten Testpiloten ein Passwort
und einen lokalen Verwahrungsort. Das ist ein gemeinsamer Verlust- und
Kompromittierungspunkt und für Mainnet ausdrücklich ungeeignet.

## 2. Wegwerf-Testnet-Wallet

Eine separate Wallet ohne Mainnet-Guthaben verwenden. Kostenloses
Base-Sepolia-ETH gibt es über die in der
[Base-Dokumentation gelisteten Faucets](https://docs.base.org/base-chain/network-information/network-faucets).

Der private Schlüssel bleibt verschlüsselt im lokalen Keystore und wird erst
für einen ausdrücklich bestätigten Deployment-Prozess kurzzeitig im Speicher
entschlüsselt. Niemals eine Wallet einsetzen, die reale Vermögenswerte hält.

## 3. Konfiguration

Nach dem automatischen Setup:

```powershell
npm run check:testnet-wallets
```

Alternativ `.env.example` manuell nach `.env` kopieren und ausfüllen; `npm run
check:testnet-config` prüft dann die öffentlichen Angaben ohne lokale
Bootstrap-Keystores vorauszusetzen. `REIST_PAPER_DOI` muss auf die tatsächlich
zitierte, überprüfte Paper-Version zeigen. Nach Finanzierung der
Deployment-Wallet prüft `npm run check:testnet:rpc` per direkter JSON-RPC-Antwort
mit Timeout Chain-ID, aktuellen Block und öffentlichen Test-ETH-Bestand, ohne
eine Transaktion zu senden.

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

- verlangt im sichtbaren Fenster die exakte Freigabe `DEPLOY BASE SEPOLIA`,
- entschlüsselt den Deployer-Key nur für den kurzlebigen Hardhat-Prozess,
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
