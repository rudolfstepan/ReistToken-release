# Transparenzstatus

Stand: 2. August 2026.

## Was tatsächlich existiert

- auf Base Sepolia bereitgestellter `REISTToken` mit fixer Menge und fest
  codierter Genesis-Verteilung,
- beim Deployment erzeugter `REISTFounderVesting`,
- über Etherscan V2 verifizierter Quellcode beider Verträge,
- 14 lokale Hardhat-Tests und dokumentierte Deployment-Invarianten,
- öffentliches Release-Repository, dessen erster Commit als historienfreier
  Snapshot den reproduzierbaren Deployment-Quellstand festhält,
- privater GitHub-Kanal für sensible Sicherheitsmeldungen,
- maschinenlesbare Bounty-, Beitrags- und Projektdaten,
- trackerfreie statische Projektseite.

## Was noch nicht existiert

- kein Mainnet-Vertrag,
- kein Verkauf und keine Liquidität,
- kein aktives Bounty und keine ausgezahlte Prämie,
- kein externes Smart-Contract-Audit,
- keine DAO, keine unabhängigen Treasury-Signer und keine dezentrale Kontrolle,
- noch keine rechtliche Freigabe für ein öffentliches Angebot.

Der Base-Sepolia-Pilot besitzt keinen zugesicherten wirtschaftlichen Wert. Er
ist weder ein Verkaufsangebot noch eine Zusage für ein späteres
Mainnet-Deployment.

## Deployment-Manifest

Das Deployment erfolgte am 2. August 2026 um 15:41:30 UTC in Block
[`44958501`](https://sepolia.basescan.org/block/44958501). Die offizielle
Deployment-Transaktion lautet
[`0x4d8f54cd5cf2950ab1b2032c8f042ac16b3cc20fb65fca5221c0933df38f021c`](https://sepolia.basescan.org/tx/0x4d8f54cd5cf2950ab1b2032c8f042ac16b3cc20fb65fca5221c0933df38f021c).

| Vertrag | Base-Sepolia-Adresse |
|---|---|
| REIST Research Token | [`0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`](https://sepolia.basescan.org/address/0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68#code) |
| Founder-Vesting | [`0x0A062Ff80791a96bda452A72094c98E87e3E67e6`](https://sepolia.basescan.org/address/0x0A062Ff80791a96bda452A72094c98E87e3E67e6#code) |

Das maschinenlesbare Manifest `deployments/base-sepolia.json` dokumentiert:

- Netzwerk und Chain-ID,
- Token- und Vesting-Adresse,
- Deployment-Transaktion und Block,
- tatsächlichen Treasury-Adressen,
- Vesting-Start, Cliff und Ende,
- Git-Commit und Repository-Remote,
- exakter Hardhat-Build und Solidity-Standard-JSON-Hash,
- Compiler-, OpenZeppelin-, ethers- und Hardhat-Version,
- Runtime-Codehash von Token und Vesting,
- zitierter Paper-DOI,
- Verifikations- und Auditstatus.

Das zugehörige Standard-JSON ist neben dem Manifest gespeichert. Der
veröffentlichte Quellstand ist Tag `v0.1.0-predeployment.2`, Commit
`e3a732afcc0a6ced913621edcef49f81046979bf`. Der Verifier hat RPC-Chain,
Deployment-Receipt, beide Runtime-Codehashes, Zuteilungen, Vesting und den über
Etherscan abrufbaren Quellcode geprüft. Der Status `sourceVerified` steht
deshalb auf `true`. Diese technische Verifikation ersetzt kein unabhängiges
Sicherheitsaudit.

## Custody-Realität

Die beiden Testnet-Treasuries werden derzeit zentral verwaltet und sind keine
unabhängig besetzten Safe-Multisigs. Sie können ihre Bestände übertragen;
on-chain sichtbare Zuteilungen garantieren nicht, dass spätere Ausgaben fachlich
sinnvoll sind. Öffentliche Belege und voneinander unabhängige Signer bleiben
daher Voraussetzungen für einen belastbaren Vergabeprozess, werden aber vom
Tokenvertrag nicht erzwungen.
