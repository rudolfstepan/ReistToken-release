# REIST Research Token (REIST)

Der REIST Research Token ist der dokumentierte ERC-20-Testtoken des
REIST-Division-Forschungsprojekts auf Base Sepolia. Seine offizielle
Vertragsadresse lautet
[`0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`](https://sepolia.basescan.org/token/0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68).
Nur Netzwerk und Adresse zusammen identifizieren diesen Testtoken eindeutig.

## Spezifikation

| Merkmal | Wert |
|---|---|
| Name | REIST Research Token |
| Symbol | REIST |
| Standard | ERC-20 |
| Pilotnetz | Base Sepolia, Chain-ID 84532; deployed und quellcodeverifiziert |
| Dezimalstellen | 18 |
| Gesamtmenge | 1.000.000 REIST |
| Späteres Minting | technisch nicht vorhanden |
| Upgrade/Proxy | nicht vorhanden |
| Transfersteuer | nicht vorhanden |
| Blacklist/Pause/Rebase | nicht vorhanden |

Name und Symbol sind auf Blockchains nicht eindeutig. Nur die Kombination aus
Netzwerk und veröffentlichter Vertragsadresse identifiziert den Token.

| Vertrag | Offizielle Base-Sepolia-Adresse |
|---|---|
| Token-Seite | [`0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`](https://sepolia.basescan.org/token/0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68) |
| Token-Quellcode | [`0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68`](https://sepolia.basescan.org/address/0xF2960B84525dF8Da9C038EA85AE5e3B4D0C26A68#code) |
| Founder-Vesting | [`0x0A062Ff80791a96bda452A72094c98E87e3E67e6`](https://sepolia.basescan.org/address/0x0A062Ff80791a96bda452A72094c98E87e3E67e6#code) |

## Genesis-Verteilung

Die Verteilung wird im Konstruktor erzeugt. Die direkte Deployment-Adresse darf
keine der drei Empfängerrollen übernehmen und erhält null Token.

| Pool | Anteil | Menge | Zweck |
|---|---:|---:|---|
| Research Rewards | 70 % | 700.000 | überprüfte Reproduktionen, Implementierungen und Forschungsbeiträge |
| Ecosystem Treasury | 20 % | 200.000 | dokumentierter Projektbetrieb, Infrastruktur und Integrationen |
| Founder Vesting | 10 % | 100.000 | Gründer-/Autorenzuteilung mit Zeitbindung |

Beim Deployment wurden `0 %` für öffentlichen Verkauf und `0 %` für
DEX-Liquidität reserviert. Es gibt keine private Vorverkaufsrunde und keine
Preiszusage. Dies ist dokumentierte Projektpolitik, keine Transferbeschränkung
des Standard-ERC-20: Treasuries und spätere Besitzer können technisch
übertragen und könnten dadurch auch Sekundärmärkte ermöglichen.

## Founder Vesting

- Start: Timestamp des Token-Deployments
- Cliff: 365 Tage
- Gesamtdauer: 1.095 Tage
- Verlauf: linear ab Start, Auszahlung vor dem Cliff gesperrt
- Am Cliff: ein Drittel ist freigeschaltet
- Ende: vollständige Freischaltung nach drei Jahren

Der Vertrag basiert auf OpenZeppelins `VestingWalletCliff`. Dessen
Begünstigtenrolle ist übertragbar. Das beschleunigt den Zeitplan nicht, erlaubt
aber die Übertragung der noch nicht ausgezahlten wirtschaftlichen Rechte.
Ein Verzicht auf die Begünstigtenrolle (`renounceOwnership`) ist im
REIST-Vesting-Vertrag deaktiviert, damit noch gesperrte Token nicht
versehentlich dauerhaft unzugänglich werden.

Ein [rein lesender Base-Sepolia-Nachweis](../operations/base-sepolia-vesting-readonly.json)
hat den Zustand am finalisierten Block `44966505` gebunden. Dort lagen die
vollständigen `100.000 REIST` weiterhin im Vesting-Vertrag; der Owner entsprach
dem Founder-Beneficiary. Vor dem Cliff waren `released`, `releasable` und
`vested` jeweils `0`, und nach der initialen Zuteilung wurden keine weiteren
eingehenden oder ausgehenden REIST-Transfers festgestellt. Die exakten
Zeitpunkte sind Start 2. August 2026, Cliff 2. August 2027 und Ende
1. August 2029. Das Enddatum folgt aus exakt `3 × 365` Tagen. Der Nachweis war
keine Transaktion oder Auszahlung und ist weder Audit noch Zukunftsgarantie.

## Treasury-Kontrolle

Der Tokenvertrag erzwingt die anfänglichen Empfänger und Mengen, nicht die
spätere Verwendung der Treasury-Bestände. Die beiden Testnet-Treasuries sind
getrennte, derzeit zentral verwaltete Wallets; sie sind keine unabhängig
besetzten Safe-Multisigs. Für fachliche Auszahlungen und zwingend vor einem
Mainnet sind vorgesehen:

- zwei voneinander getrennte Safe-Multisigs,
- veröffentlichte Signeranzahl und Schwelle,
- jede Ausgabe mit Bounty-/Beschluss-ID und Beleg,
- öffentliches Beitragsregister mit Transaktionslink,
- periodischer Soll-Ist-Abgleich der Wallet-Bestände.

Solange eine einzelne Person alle Safe-Schlüssel kontrolliert, ist das offen
als zentrale Kontrolle zu bezeichnen. Ein Multisig-Label allein ist keine
Dezentralisierung.

## Kein ökonomisches Versprechen

Die feste Menge erzeugt weder Nachfrage noch Wert. Token können wertlos bleiben
und vollständig illiquide sein. Es gibt keine Dividende, Gewinnbeteiligung,
Rücknahme, Mindestpreis, Verzinsung, Staking-Rendite oder Zusage einer späteren
Börsennotierung.
