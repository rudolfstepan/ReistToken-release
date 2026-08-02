# Deployment-Manifeste

In diesem Verzeichnis liegen ausschließlich tatsächlich erzeugte,
maschinenlesbare Deployment-Artefakte.

`base-sepolia.json` dokumentiert das am 2. August 2026 ausgeführte
Base-Sepolia-Deployment. Das Manifest enthält Vertragsadressen,
Deployment-Transaktion, Block, Runtime-Codehashes, Zuteilungen,
Vesting-Zeitplan, Quellstand und Verifikationsstatus. Das zugehörige
`base-sepolia-standard-input.json` enthält den reproduzierbaren Solidity-Build,
der zur Explorer-Verifikation verwendet wurde. Es werden keine Beispieladressen
als echte Verträge ausgegeben.

Der Quellcode von Token und Vesting ist verifiziert; ein externes
Smart-Contract-Audit wurde nicht durchgeführt.

Ein Mainnet-Manifest darf erst nach den dokumentierten Release-Gates entstehen.
