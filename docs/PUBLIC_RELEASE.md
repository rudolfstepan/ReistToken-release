# Öffentliches Release-Repository

Das kanonische öffentliche Quellcode-Repository für freigegebene REIST-Token-
Stände ist
[`rudolfstepan/ReistToken-release`](https://github.com/rudolfstepan/ReistToken-release).
Das private Entwicklungs-Repository und seine Historie werden nicht
veröffentlicht.

## Veröffentlichungsmodell

Das öffentliche Repository beginnt einmalig mit einem historienfreien,
geprüften Root-Snapshot. Ab diesem Commit wird seine öffentliche Historie nur
noch fortgeschrieben; veröffentlichte Commits und Tags werden weder ersetzt noch
umgeschrieben. So bleibt die private Entwicklungshistorie verborgen, während
die öffentliche Provenienz dauerhaft nachvollziehbar bleibt.

Der Root-Snapshot enthält alle Quellen, Tests, Build- und
Verifikationsskripte, Abhängigkeits-Lockfiles, Projektdaten, Lizenzen und
öffentlichen Dokumente, die für einen reproduzierbaren Build benötigt werden.
Jeder spätere öffentliche Stand entsteht als nachvollziehbarer Commit auf
dieser Historie.

Nicht veröffentlicht werden insbesondere:

- `.env` und andere lokale Konfigurationsdateien,
- private Schlüssel, Seed-Phrasen oder API-Schlüssel,
- Wallet- oder Signer-Dateien,
- produktive, server- oder betreiberspezifische Konfigurationen,
- nicht freigegebene Paper-Entwürfe,
- lokale Build-Artefakte, Logs und Abhängigkeiten.

## Deployment-Bindung

Ein Deployment wird ausschließlich aus einem frischen Clone des öffentlichen
Release-Repositorys ausgeführt. Das Deployment-Skript verlangt einen sauberen
Arbeitsbaum und prüft anonym, dass der exakte `HEAD`-Commit in einem öffentlichen
Branch oder Tag vorhanden ist. Repository-URL, Commit, Build-ID und
Standard-JSON-Hash werden anschließend im Deployment-Manifest festgehalten.

Vor einem Deployment erhält dieser exakte Commit einen signierten oder
annotierten, unveränderlichen Release-Tag. Dadurch bleibt er auch dann anonym
auffindbar, wenn der öffentliche Hauptbranch später um Manifest und Statusdaten
fortgeschrieben wird.

Ein veröffentlichter Quellcode-Stand ist noch kein Deployment. Maßgeblich sind
zusätzlich das Netzwerk, die Vertragsadressen, die Deployment-Transaktion und
der Verifikationsstatus im Manifest.

## Sicherheitsmeldungen

Sensible Schwachstellen gehören nicht in öffentliche Issues. Dafür ist im
öffentlichen Repository die private GitHub-Sicherheitsmeldung vorgesehen:

[`Private vulnerability report erstellen`](https://github.com/rudolfstepan/ReistToken-release/security/advisories/new)
