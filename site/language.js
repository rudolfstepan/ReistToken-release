{
const languageRoot = document.documentElement;
const currentLanguage = languageRoot.lang.toLowerCase().startsWith("en")
  ? "en"
  : "de";
const supportedLanguages = new Set(["de", "en"]);
const storageKey = "reist-language";
const search = new URLSearchParams(window.location.search);
const requestedLanguage = supportedLanguages.has(search.get("lang"))
  ? search.get("lang")
  : null;

function storedLanguage() {
  try {
    const value = window.localStorage.getItem(storageKey);
    return supportedLanguages.has(value) ? value : null;
  } catch {
    return null;
  }
}

function browserLanguage() {
  const preferences = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const preference of preferences) {
    const language = String(preference || "").toLowerCase().split("-", 1)[0];
    if (supportedLanguages.has(language)) return language;
  }
  return "en";
}

function rememberLanguage(language) {
  try {
    window.localStorage.setItem(storageKey, language);
  } catch {
    // Die Sprachwahl funktioniert weiterhin über die URL.
  }
}

if (requestedLanguage) rememberLanguage(requestedLanguage);

const automaticLanguage = languageRoot.dataset.autoLanguage === "true";
const preferredLanguage =
  requestedLanguage || storedLanguage() || browserLanguage();

if (
  preferredLanguage !== currentLanguage &&
  (requestedLanguage || automaticLanguage)
) {
  const target = new URL(
    languageRoot.dataset.alternateLanguageUrl,
    window.location.href
  );
  search.delete("lang");
  target.search = search.toString();
  target.hash = window.location.hash;
  window.location.replace(target);
} else if (requestedLanguage) {
  search.delete("lang");
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = search.toString();
  try {
    window.history.replaceState(null, "", cleanUrl);
  } catch {
    // Kein Problem auf Hosts ohne History-Unterstützung.
  }
}
}
