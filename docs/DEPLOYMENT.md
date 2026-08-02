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
npm run backup:testnet-wallets -- -DestinationDirectory "E:\REIST-Backup\base-sepolia-wallets"
npm run check:testnet-recovery -- -WalletDirectory "E:\REIST-Backup\base-sepolia-wallets"
```

Der Pfad ist ein Beispiel und muss auf ein anderes Laufwerk zeigen. Das
Backup-Skript überschreibt keine vorhandene Sicherung, kopiert ausschließlich
die sechs erwarteten Dateien (vier verschlüsselte Keystores sowie
`addresses.json` und `RECOVERY.txt`), vergleicht SHA-256-Hashes und
beschränkt den Zugriff auf das aktuelle Windows-Benutzerkonto. Die anschließende
Recovery-Prüfung kontrolliert zusätzlich die Zugriffsrechte der Sicherung. Eine
Kopie auf einem zweiten internen Datenträger ist nur eine Zwischenstufe; für die
dauerhafte Verwahrung ist zusätzlich ein getrennt gelagertes Offline-Medium
erforderlich. Der ACL-Check ist idempotent; falls die Rechte nach einem
abgebrochenen Setup repariert werden müssen, kann lokal `powershell.exe -File
scripts/check-testnet-acl.ps1 -Repair` ausgeführt werden.

Eine Sicherung benötigt NTFS oder ein anderes Dateisystem mit kompatiblen
Windows-ACLs; FAT und exFAT genügen diesem Ablauf nicht. Die Laufwerksprüfung
belegt nur verschiedene Laufwerksbuchstaben, nicht automatisch verschiedene
physische Datenträger. Das Zielmedium deshalb unabhängig kontrollieren. Nach
einem Verlust des ursprünglichen Windows-Profils muss ein Administrator den
Besitz der Backup-Dateien übernehmen und die ACL auf das neue Benutzerkonto
setzen. Die Recovery-Prüfung mit `-WalletDirectory` benötigt weder das
ursprüngliche Keystore-Verzeichnis noch dessen `.env`; sie vergleicht die
Sicherung mit dem öffentlichen Rollenregister in `data/testnet-roles.json`.

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

Für die spätere Explorer-Verifikation einen Etherscan-V2-API-Schlüssel im
offiziellen Dashboard erzeugen, ausschließlich in die Zwischenablage kopieren
und lokal speichern:

```powershell
npm run configure:etherscan-key
```

Der Helfer zeigt den Schlüssel nicht an, lehnt getrackte oder nicht ignorierte
`.env`-Dateien ab, übernimmt nur die freigegebenen Testnet-Variablen, erhält die
exklusiven Windows-Zugriffsrechte und ersetzt anschließend den
Zwischenablageinhalt. API-Schlüssel gehören ebenso wenig in Git, Issues oder
Chats wie Wallet-Schlüssel.

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

Unmittelbar vor einer Freigabe die Gesamtkosten erneut rein lesend schätzen:

```powershell
npm run estimate:testnet-deployment
```

Der Check konstruiert die unsignierte Deployment-Transaktion aus dem geprüften
Build, fragt Base Sepolia nach Ausführungsgas sowie die offizielle
`GasPriceOracle`-Predeploy-Adresse nach L1-Daten- und Operatorgebühr und rechnet
eine konservative aktuelle Kostenschätzung mit 20 Prozent Gaspuffer. Die
Oracle-Methode bildet dabei eine sehr hohe, aber keine absolute statistische
Abdeckung ab. Der Check liest keinen Keystore, lädt keinen privaten Schlüssel
und sendet keine Transaktion. Gebühren sind
zeitabhängig; deshalb ist nur eine unmittelbar vor dem Deployment erzeugte
Schätzung entscheidend. Der Deployment-Wrapper wiederholt genau diesen Check
automatisch, bevor er die ausdrückliche Freigabe abfragt.

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

Die lokalen Manifest- und Statusdateien werden nach dem bestätigten Receipt
jeweils atomar ersetzt. Meldet das Skript ein erfolgreiches oder noch unklares
On-chain-Ergebnis mit fehlgeschlagener lokaler Finalisierung oder Validierung,
darf der Deployment-Befehl nicht erneut ausgeführt werden: zuerst
Transaktionshash und Vertragsadressen aus der Ausgabe sichern, den Receipt per
Explorer oder RPC prüfen und danach den lokalen Status reparieren.

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

### Gebundener Treasury-Transfer

Für den ersten technischen Treasury-Schritt existiert ein absichtlich nicht
allgemeines Ausführungswerkzeug:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/execute-base-sepolia-smoke.ps1
```

Der Ablauf ist dauerhaft an Base Sepolia, den verifizierten Pilotvertrag und
genau zwei Transaktionen gebunden: `0,000005` Test-ETH vom Deployer an die
Research Treasury und anschließend `1 REIST` von der Research Treasury an die
Ecosystem Treasury. Andere Netzwerke, Adressen, Beträge oder Nonces werden
abgelehnt. Das Werkzeug verlangt einen sauberen veröffentlichten Git-Stand,
prüft L2-, L1- und Operatorgebühren gegen feste Grenzen und validiert beide
Receipts, Blockkanonizität, Balanceänderungen und das Transfer-Event.

Wird aus einem separaten öffentlichen Release-Clone gearbeitet, kann die
lokale, nicht veröffentlichte Konfiguration mit `-EnvironmentFile` angegeben
werden. Das Keystore-Passwort wird einmal als `SecureString` gelesen und nur
über die Standardeingabe an Node übergeben. Vor jedem Broadcast wird ein
geheimnisfreies Recovery-Journal im geschützten Keystore-Verzeichnis atomar
geschrieben; signierte Rohtransaktionen werden niemals gespeichert. Ein
unklares RPC-Ergebnis wird ausschließlich über denselben gebundenen Hash
wiederaufgenommen und darf nicht durch einen neuen Transfer ersetzt werden.

Der Treasury-Transfer ist kein Bounty, keine Contribution und noch nicht der
vollständige Smoke-Test dieser Checkliste. Nach erfolgreicher Ausführung wird
ein öffentliches, maschinenlesbares Operations-Manifest erzeugt.

## Mainnet-Gate

Ein Mainnet-Deployment verlangt die vollständige
[Release-Checkliste](RELEASE_CHECKLIST.md), neue hardwaregestützte
Deployment-Prozesse und eine explizite Codeänderung. Es ist kein bloßer
Netzwerk-Schalter.
