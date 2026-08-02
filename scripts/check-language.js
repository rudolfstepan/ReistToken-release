import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";

const source = readFileSync(resolve("site", "language.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function simulate({
  language,
  alternate,
  automatic,
  browserLanguages,
  stored,
  url,
}) {
  let replacement = null;
  let cleanedUrl = null;
  const storage = new Map();
  if (stored) storage.set("reist-language", stored);
  const parsed = new URL(url);
  const location = {
    href: parsed.href,
    hash: parsed.hash,
    search: parsed.search,
    replace(target) {
      replacement = String(target);
    },
  };
  const window = {
    history: {
      replaceState(_state, _title, target) {
        cleanedUrl = String(target);
      },
    },
    localStorage: {
      getItem(key) {
        return storage.get(key) || null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    location,
  };

  runInNewContext(source, {
    URL,
    URLSearchParams,
    console,
    document: {
      documentElement: {
        dataset: {
          alternateLanguageUrl: alternate,
          autoLanguage: String(automatic),
        },
        lang: language,
      },
    },
    navigator: {
      language: browserLanguages[0],
      languages: browserLanguages,
    },
    window,
  });

  return { cleanedUrl, replacement, stored: storage.get("reist-language") };
}

let result = simulate({
  language: "de",
  alternate: "en/",
  automatic: true,
  browserLanguages: ["en-GB", "de-AT"],
  url: "https://example.test/reist/#token",
});
assert(
  result.replacement === "https://example.test/reist/en/#token",
  "Englischer Browser wird nicht auf die englische Fassung geleitet."
);

result = simulate({
  language: "de",
  alternate: "en/",
  automatic: true,
  browserLanguages: ["de-AT"],
  url: "https://example.test/reist/",
});
assert(result.replacement === null, "Deutscher Browser darf nicht umgeleitet werden.");

result = simulate({
  language: "de",
  alternate: "en/",
  automatic: true,
  browserLanguages: ["de-AT"],
  stored: "en",
  url: "https://example.test/reist/",
});
assert(
  result.replacement === "https://example.test/reist/en/",
  "Gespeicherte englische Sprachwahl wird nicht angewandt."
);

result = simulate({
  language: "en",
  alternate: "../",
  automatic: false,
  browserLanguages: ["de-AT"],
  url: "https://example.test/reist/en/",
});
assert(
  result.replacement === null,
  "Eine direkt aufgerufene englische URL darf nicht automatisch verlassen werden."
);

result = simulate({
  language: "en",
  alternate: "../",
  automatic: false,
  browserLanguages: ["de-AT"],
  url: "https://example.test/reist/en/?lang=en#evidence",
});
assert(result.stored === "en", "Explizite Sprachwahl wird nicht gespeichert.");
assert(
  result.cleanedUrl === "https://example.test/reist/en/#evidence",
  "Sprachparameter wird nach der Auswahl nicht aus der URL entfernt."
);

console.log("Sprachrouting erfolgreich geprüft: Browserwahl, Persistenz und Direktlinks.");
