# REIST Research Token

`REIST` ist ein experimenteller ERC-20 für transparent dokumentierte
Forschungs- und Implementierungsbeiträge zum offenen REIST-Division-Ökosystem.
Der Token ist **nicht** das mathematische Verfahren, kein Nachweis
wissenschaftlicher Richtigkeit und kein Renditeversprechen.

## Aktueller Status

| Bereich | Status |
|---|---|
| Smart Contracts | lokal implementiert und getestet |
| Projektwebsite | veröffentlicht unter `reist-token.intracom.at` |
| Öffentlicher Quellcode | [`ReistToken-release`](https://github.com/rudolfstepan/ReistToken-release) |
| Base Sepolia | Deployment-Wallet finanziert; noch nicht deployed |
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

## Base-Sepolia-Pilot

Das Deployment ist absichtlich ausschließlich für Base Sepolia (Chain-ID
84532) freigeschaltet. Es verlangt drei öffentliche Empfängeradressen, die auch
von der Deployment-Wallet verschieden sind, und erzeugt anschließend ein
maschinenlesbares Manifest.

1. Zwei separate Testnet-Treasuries erstellen, vorzugsweise Safes. Für einen
   zentral kontrollierten technischen Piloten kann `npm run
   setup:testnet-wallets` vier unabhängige, verschlüsselt gesicherte
   Testnet-Keypairs und die lokale `.env` erzeugen.
2. `npm run check:testnet-wallets` ausführen und die vier öffentlichen Adressen
   unabhängig kontrollieren.
3. Mit `npm run check:testnet-acl` den lokalen Zugriffsschutz prüfen. Eine neue
   verschlüsselte Kopie auf einem anderen Laufwerk mit `npm run
   backup:testnet-wallets -- -DestinationDirectory <BACKUP-PFAD>` anlegen und
   anschließend mit `npm run check:testnet-recovery -- -WalletDirectory
   <BACKUP-PFAD>` die tatsächliche Sicherung aller vier Wallets prüfen. Das
   Passwort getrennt aufbewahren.
4. Erst danach die Deployment-Wallet mit Faucet-ETH versorgen und `npm run
   check:testnet:rpc` ausführen.
5. `npm run preflight` ausführen und danach mit `npm run
   estimate:testnet-deployment` Gas, L1-Datengebühr und verfügbare Reserve
   nochmals rein lesend prüfen.
6. Erst nach expliziter Freigabe `npm run deploy:testnet` ausführen.
7. `npm run verify:testnet` ausführen und Explorer-Ergebnis kontrollieren.

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
