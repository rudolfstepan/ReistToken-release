# Sicherheitsrichtlinie

[English version](docs/en/SECURITY.md)

## Unterstützter Stand

Der Code befindet sich vor dem ersten Testnet-Release. Es existiert derzeit
kein offizielles Mainnet-Deployment und kein externes Audit.

## Sicherheitsproblem melden

Sensible Schwachstellen dürfen nicht in öffentlichen Issues beschrieben
werden. Sie können vertraulich über die privaten GitHub-Sicherheitsmeldungen
des Release-Repositorys eingereicht werden:

[`Private Sicherheitsmeldung erstellen`](https://github.com/rudolfstepan/ReistToken-release/security/advisories/new)

Nicht sensible Fehler, Dokumentationsabweichungen und Testverbesserungen können
als normales Issue gemeldet werden.

## Reaktionsprinzipien

- Eingang bestätigen und reproduzierbare Details sichern.
- Auswirkung auf Vertrag, Deployment-Skripte und Dokumentation getrennt prüfen.
- Keine Mainnet-Veröffentlichung bei ungeklärten High- oder Critical-Befunden.
- Korrektur, Tests und technische Beschreibung gemeinsam veröffentlichen.
- Da der Token unveränderlich ist, kann ein deployed Vertrag nicht gepatcht
  werden. Vor einem Mainnet-Deployment wäre bei einem Fehler ein neuer Vertrag
  und ein öffentlich dokumentierter Migrationsentscheid erforderlich.

## Kein Bug-Bounty-Versprechen

Zum aktuellen Zeitpunkt besteht kein finanzielles Bug-Bounty-Programm. Eine
mögliche Testnet-REIST-Anerkennung wird nur nach vorher veröffentlichten Regeln
vergeben und besitzt keinen zugesicherten wirtschaftlichen Wert.
