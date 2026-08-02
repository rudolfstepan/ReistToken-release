# Wissenschaftliche Grundlage und zulässige Aussagen

## Trennung von Framework und Token

REIST Division (Remainder-Extended Inversion and Subtraction Technique) ist
eine implementierungsorientierte Formulierung zentrierter Restarithmetik. Der
REIST Research Token ist eine davon getrennte ERC-20-Schicht zur transparenten
Anerkennung überprüfter Beiträge.

Das Framework benötigt keinen Token. Tokenbesitz:

- beweist keine mathematische Aussage,
- validiert keinen Benchmark,
- beschleunigt keinen ERC-20 und keine Blockchain,
- verleiht kein Eigentum am Paper oder am Framework,
- ersetzt kein wissenschaftliches Review.

## Mathematischer Kern

Für ganze Zahlen `T` und `B > 0` wählt REIST `q` und `r` so, dass

```text
T = qB + r,     -B/2 <= r < B/2.
```

Der Rest ist damit ein betragskleiner, vorzeichenbehafteter Vertreter. Beispiel:

```text
klassisch: 17 = 1 * 10 + 7
REIST:     17 = 2 * 10 - 3
```

Zentrierte Restklassen sind mathematisch bekannt. Der beanspruchte Beitrag ist
nicht ein neuer Ring, sondern ihre implementierungsorientierte Verwendung als
persistenter Zustand: Bei zentrierten Summanden genügt pro Aktualisierung
höchstens eine Korrektur um `+B` oder `-B`. Diese Korrektur lässt sich ohne
datenabhängige Verzweigung und SIMD-fähig formulieren.

## Dokumentierte Ergebnisse

Die folgenden Werte stammen aus dem deutschsprachigen Manuskript. Sie sind
keine allgemeine Leistungszusage und gelten ausschließlich für die dort
dokumentierten Systeme, Compiler, Flags, Workloads und Baselines.

| Messung | Berichtetes Ergebnis | Kontext |
|---|---:|---|
| Modularer Additionszähler | 2,1–4,4x | Apple M2 Pro, O3 bis NEON |
| Modularer Additionszähler | 7,9–8,9x | Intel Core i9-14900K, O3 |
| Polynomielle modulare Addition | 4,3–4,5x | Apple M2 Pro, O3/NEON |
| Polynomielle modulare Addition | 12,4–12,8x; bis 17,0x | Intel Core i9-14900K, O3/AVX2 |
| Rückgekoppelter FPGA-Akkumulator | 1 Takt pro Schritt | Gowin GW2A-18, konkrete Konfiguration |
| Isolierte 32-Bit-REIST-Korrektureinheit | 161,8 MHz, 101 Logikzellen | Gowin GW2A-18, konkrete Synthese |
| Vergleichendes Divisions-IP | 4 Takte in der Kette, 8,1 MHz, 1.276 Logikzellen | vermessene 32-Bit-IP-Konfiguration |

## Ebenso wichtige Negativergebnisse

- Ohne persistenten modularen Zustand besteht kein struktureller Vorteil.
- Reine Restberechnung ist im skalaren O3-Vergleich ungefähr gleich schnell
  (ARM etwa 1,02x, x86 etwa 0,96x); der dokumentierte x86-SIMD-Vergleich liegt
  mit etwa 0,85x unter der klassischen Variante.
- ARX-Code wie ChaCha20 erhält durch REIST keinen Ansatzpunkt.
- Die getesteten Hash-Mixing-Varianten wurden unter O3/SIMD um etwa 15–25 %
  langsamer; unter O0 war der Nachteil deutlich größer.
- Für multiplikationslastige Reduktion bleiben Montgomery und Barrett relevant.
- Ohne O3/SIMD kann eine branchless Form langsamer sein.
- Die Arbeit beansprucht keine Constant-Time- oder Seitenkanalsicherheit.

## Reproduzierbarkeit

- Benchmark-Repository:
  [rudolfstepan/reist-crypto-bench](https://github.com/rudolfstepan/reist-crypto-bench)
- Kanonische Paper-Version des Token-Piloten:
  [DOI 10.5281/zenodo.21206471](https://doi.org/10.5281/zenodo.21206471),
  veröffentlicht am 5. Juli 2026 unter CC BY 4.0
- Frühere öffentliche Version 2.0:
  [DOI 10.5281/zenodo.17897540](https://doi.org/10.5281/zenodo.17897540)
- Projektkontext:
  [intracom.at/papers/reist-division.html](https://intracom.at/papers/reist-division.html)
- Live-Demo:
  [intracom.at/demo/reist/](https://intracom.at/demo/reist/)

Die kanonische deutschsprachige PDF besitzt den SHA-256-Hash
`369B9FB75C1B6D4C2CBBA91FF63DB4420900AB30B6EEC137BFD72290AE7D45C4`.
Für Token-Manifest, Website und Deployment wird ausschließlich DOI
`10.5281/zenodo.21206471` verwendet. DOI `10.5281/zenodo.17897540` bleibt als
frühere Version 2.0 historisch referenziert. Zenodo beschreibt den kanonischen
Datensatz als neue Version dieses Vorgängers; beide Kennungen bezeichnen nicht
dieselbe Version.

## Zulässige Kurzbeschreibung

> REIST ist eine implementierungsorientierte Formulierung zentrierter
> Restarithmetik für additionsdominierte modulare Rechenkerne. Der optionale
> REIST Research Token erprobt transparente Prämien für reproduzierbare
> Open-Source-Beiträge; er ist nicht Teil des Rechenverfahrens.
