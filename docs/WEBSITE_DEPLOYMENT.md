# Deployment der Projektwebsite

Die öffentliche Website wird ausschließlich aus `dist/` veröffentlicht. Der
kanonische Ursprung ist `https://reist-token.intracom.at`.

## 1. Build und lokale Prüfung

```powershell
npm ci
npm run check
npm run smoke:site
```

`npm run smoke:site` erzeugt `dist/` neu. Der Build enthält die statischen
DE/EN-Seiten, zehn gerenderte HTML-Dokumente, `404.html`, `robots.txt`,
`sitemap.xml`, öffentliche JSON-Daten, Vertragsquellen und `LICENSE.txt`.
Markdown-Quellen, Node-Abhängigkeiten, Tests, Schlüssel und die nginx-Datei
gehören nicht in den Webroot.

## 2. Webroot synchronisieren

Ziel auf dem aktuellen Server ist `/home/www/reist-token`. Den **Inhalt** von
`dist/` dorthin synchronisieren, nicht den Ordner `dist` selbst. Da frühere
Builds Markdown-Dateien enthielten, müssen nicht mehr vorhandene Zieldateien
beim zweiten Deployment entfernt werden. Vor einer Synchronisierung mit
Löschoption zuerst deren Dry-Run und das exakte Ziel kontrollieren.

Beispiel mit bewusstem Platzhalter für den SSH-Host:

```bash
rsync --archive --verbose --delete --dry-run dist/ USER@SERVER:/home/www/reist-token/
rsync --archive --verbose --delete           dist/ USER@SERVER:/home/www/reist-token/
```

Niemals den Projektordner, `.env`, `.git/`, `node_modules/`, `artifacts/` oder
`cache/` in den Webroot kopieren.

## 3. nginx-Konfiguration

Die produktive VHost-Datei enthält server- und betreiberspezifische Pfade und
bleibt deshalb im privaten Betriebs-Repository. Sie ist kein Bestandteil des
öffentlichen Quellcode-Releases oder des Webroots. Vor dem Ersetzen der aktiven
Konfiguration eine Sicherung erstellen und den privaten freigegebenen Stand
gegen die aktive Konfiguration vergleichen. nginx verwendet keine
`.htaccess`-Dateien.

Nach dem Einspielen:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Nur bei erfolgreichem `nginx -t` neu laden. Die Konfiguration sorgt unter
anderem für echte 404-Antworten, die kanonische Domain, HTTPS, CSP, HSTS und den
MIME-Typ `application/xml` für die Sitemap sowie `text/plain` für Solidity.

## 4. Live-Prüfung

```powershell
npm run check:live
```

Dieser Test liest ausschließlich öffentliche URLs. Er prüft zwölf indexierbare
Seiten, Canonicals, Sprachalternativen, Redirects, die eigene 404-Seite,
`robots.txt`, Sitemap, MIME-Typen und Sicherheitsheader. Er führt kein
Blockchain-Deployment und keine Serveränderung durch.
