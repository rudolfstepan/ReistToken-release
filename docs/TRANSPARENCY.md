# Transparenzstatus

Stand: 2. August 2026.

## Was tatsächlich existiert

- lokaler `REISTToken`-Entwurf mit fixer Menge und fest codierter Genesis-Verteilung,
- automatisch erzeugter `REISTFounderVesting`,
- lokale Hardhat-Tests,
- abgesichertes Base-Sepolia-Deployment-Skript,
- historienfreies öffentliches Release-Repository mit reproduzierbarem Quellstand,
- privater GitHub-Kanal für sensible Sicherheitsmeldungen,
- maschinenlesbare Bounty-, Beitrags- und Projektdaten,
- trackerfreie statische Projektseite.

## Was noch nicht existiert

- kein Testnet- oder Mainnet-Vertrag,
- keine offizielle Vertragsadresse,
- kein Verkauf und keine Liquidität,
- kein aktives Bounty und keine ausgezahlte Prämie,
- kein externes Smart-Contract-Audit,
- keine DAO oder dezentrale Kontrolle,
- noch keine rechtliche Freigabe für ein öffentliches Angebot.

## Deployment-Manifest

Nach einem Base-Sepolia-Deployment erzeugt das Skript
`deployments/base-sepolia.json` mit:

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

Das zugehörige Standard-JSON wird separat neben dem Manifest gespeichert. Der
Verifier prüft RPC-Chain, Deployment-Receipt, beide Runtime-Codehashes,
Zuteilungen, Vesting und den tatsächlich von Etherscan abrufbaren Quellcode,
bevor er `sourceVerified` setzt. Ein Manifest und eine Explorer-Verifikation
sind trotzdem kein Audit.

## Custody-Realität

Treasury-Safes können Bestände übertragen. On-chain sichtbare Zuteilungen
garantieren nicht, dass spätere Ausgaben fachlich sinnvoll sind. Das öffentliche
Register und voneinander unabhängige Signer sind deshalb Teil des Systems, auch
wenn sie nicht im Tokenvertrag erzwungen werden.
