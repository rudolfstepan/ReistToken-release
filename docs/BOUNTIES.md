# Forschungs- und Implementierungsprämien

## Zweck

Der Testnet-Pilot soll einen realen, prüfbaren Ablauf erproben:

```text
öffentliches Bounty
-> vorab definierte Annahmekriterien
-> reproduzierbares Artefakt
-> dokumentierte Prüfung
-> Treasury-Entscheid
-> Testnet-REIST-Transfer
-> öffentlicher Transaktions- und Evidenznachweis
```

Testnet-REIST besitzt keinen zugesicherten wirtschaftlichen Wert. Es wird nicht
für Werbung, Empfehlungen, Trading, Reichweite oder bloße Tokenhaltung
vergeben.

## Mindestangaben eines aktiven Bountys

- eindeutige ID und öffentliches Issue,
- fachlicher Umfang und Nicht-Umfang,
- vor Arbeitsbeginn festgelegte Prämie,
- messbare Annahmekriterien,
- benötigte Lizenz und Offenlegungspflichten,
- Reviewer und Interessenkonflikte,
- Frist oder ausdrückliche Angabe „offen“,
- Netzwerk und Treasury-Adresse,
- Verfahren bei mehreren Einreichungen.

Das maschinenlesbare Register steht in
[`data/bounties.json`](../data/bounties.json). Ein Eintrag wird erst durch ein
verlinktes öffentliches Issue, einen benannten Reviewer und eine dokumentierte
Reservierungsentscheidung aktiv. Aktive Forschungsbountys sind an die
veröffentlichte Research-Treasury gebunden.

Eine Aktivierung vor dem Token-Deployment öffnet nur die Einreichungsphase. Ein
Testnet-REIST-Transfer ist erst nach Deployment, dokumentierter Annahme und
öffentlicher Treasury-Transaktion möglich.

## Prüfung einer Einreichung

Eine reproduzierbare Einreichung enthält mindestens:

- Quellcode-Commit oder unveränderlichen Artefakt-Hash,
- Lizenz,
- Hardware, Betriebssystem, Compiler und exakte Flags,
- Rohdaten und Skript zur Auswertung,
- Baseline und Kontrollmessungen,
- bekannte Grenzen und negative Ergebnisse,
- Erklärung von Interessenkonflikten.

Performance-Prämien werden nicht allein anhand einer zusammengefassten
Speedup-Zahl vergeben.

## Geeignete Pilotbereiche

- unabhängige Reproduktion auf einer bisher nicht dokumentierten CPU,
- Rust- oder RISC-V-Referenzimplementierung mit Eigenschaftstests,
- LLVM-/GCC-Mustererkennung,
- FPGA-Skalierung auf 16/64 Bit,
- zentrierte Add/Sub-Schichten einer NTT,
- RNS-/CRT-Studie,
- formale Driftanalyse.

## Beitragsregister

Akzeptierte Beiträge werden in [`data/contributions.json`](../data/contributions.json)
eingetragen. Ein Eintrag ist vollständig, wenn er Bounty, Evidenz, Reviewer,
Entscheidung, Empfänger, Menge, Netzwerk und Transaktionshash nennt. Das leere
Register ist Absicht: Es werden keine Beiträge oder Community-Aktivitäten
erfunden.
