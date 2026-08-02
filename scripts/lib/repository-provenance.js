import { isIP } from "node:net";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fail(message) {
  throw new Error(message);
}

function isPublicIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function publicHostname(rawHostname) {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname.endsWith(".")) {
    fail("Git-Remote muss auf einen öffentlichen Host ohne abschließenden Punkt zeigen.");
  }
  const ipVersion = isIP(hostname);
  if (ipVersion === 4 && !isPublicIpv4(hostname)) {
    fail("Git-Remote muss auf einen öffentlichen Host zeigen.");
  }
  if (
    ipVersion === 6 &&
    (!/^[23]/.test(hostname) || /^2001:db8(?::|$)/.test(hostname))
  ) {
    fail("Git-Remote muss auf einen öffentlichen Host zeigen.");
  }
  if (
    ipVersion === 0 &&
    (
      !hostname.includes(".") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".test") ||
      hostname.endsWith(".example") ||
      hostname.endsWith(".invalid") ||
      hostname === "home.arpa" ||
      hostname.endsWith(".home.arpa") ||
      hostname.endsWith(".onion")
    )
  ) {
    fail("Git-Remote muss auf einen öffentlichen Host zeigen.");
  }
  return ipVersion === 6 ? `[${hostname}]` : hostname;
}

function normalizedPath(pathname) {
  const path = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  const segments = path.split("/");
  if (
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    fail("Git-Remote muss auf einen konkreten Repository-Pfad zeigen.");
  }
  if (/[\\\s\u0000-\u001f]/u.test(path)) {
    fail("Git-Remote enthält unzulässige Zeichen.");
  }
  return path;
}

export function normalizePublicRepositoryUrl(remote) {
  let value = String(remote || "").trim();
  if (!value) fail("Ein veröffentlichbarer Git-Remote `origin` ist erforderlich.");

  const scpStyle = value.match(/^git@([a-z0-9.-]+):(.+)$/i);
  if (scpStyle) {
    value = `ssh://git@${scpStyle[1]}/${scpStyle[2]}`;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    fail("Git-Remote `origin` ist keine gültige öffentliche Repository-URL.");
  }

  if (!new Set(["https:", "ssh:"]).has(url.protocol)) {
    fail("Git-Remote `origin` muss HTTPS oder SSH verwenden.");
  }
  if (url.password || url.search || url.hash || url.port) {
    fail("Git-Remote darf keine Zugangsdaten, Parameter, Fragmente oder Ports enthalten.");
  }
  if (url.protocol === "https:" && url.username) {
    fail("HTTPS-Git-Remote darf keine eingebetteten Zugangsdaten enthalten.");
  }
  if (url.protocol === "ssh:" && url.username !== "git") {
    fail("SSH-Git-Remote muss den üblichen Benutzer `git` verwenden.");
  }
  if (!url.hostname) fail("Git-Remote muss auf einen öffentlichen Host zeigen.");
  const hostname = publicHostname(url.hostname);

  return `https://${hostname}/${normalizedPath(url.pathname)}`;
}

export function remoteReferencesContainCommit(references, commit) {
  const expected = String(commit || "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) return false;
  return String(references || "")
    .split(/\r?\n/)
    .some((line) => line.trim().split(/\s+/, 1)[0]?.toLowerCase() === expected);
}

export function createIsolatedGitEnvironment(
  globalConfigPath,
  workingDirectory,
  sourceEnvironment = process.env
) {
  const environment = {};
  const blockedSshVariables = new Set([
    "SSH_AGENT_PID",
    "SSH_ASKPASS",
    "SSH_ASKPASS_REQUIRE",
    "SSH_AUTH_SOCK",
  ]);
  const blockedHomeVariables = new Set([
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "NETRC",
    "USERPROFILE",
    "XDG_CONFIG_HOME",
  ]);

  for (const [key, value] of Object.entries(sourceEnvironment)) {
    const normalizedKey = key.toUpperCase();
    if (
      normalizedKey.startsWith("GIT_") ||
      normalizedKey.startsWith("GCM_") ||
      blockedSshVariables.has(normalizedKey) ||
      blockedHomeVariables.has(normalizedKey)
    ) {
      continue;
    }
    if (value !== undefined) environment[key] = value;
  }

  return {
    ...environment,
    GCM_INTERACTIVE: "Never",
    GIT_CEILING_DIRECTORIES: workingDirectory,
    GIT_CONFIG_GLOBAL: globalConfigPath,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_SSL_NO_VERIFY: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
}

export function assertPublicCommitPublished(repositoryUrl, commit) {
  const publicUrl = normalizePublicRepositoryUrl(repositoryUrl);
  const workingDirectory = mkdtempSync(join(tmpdir(), "reist-git-"));
  const globalConfigPath = join(workingDirectory, "empty-global.gitconfig");
  let result;
  try {
    writeFileSync(globalConfigPath, "# Intentionally empty.\n", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    result = spawnSync(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "credential.interactive=never",
        "-c",
        "core.askPass=",
        "-c",
        "http.extraHeader=",
        "-c",
        "http.sslVerify=true",
        "ls-remote",
        "--heads",
        "--tags",
        publicUrl,
      ],
      {
        cwd: workingDirectory,
        encoding: "utf8",
        env: createIsolatedGitEnvironment(
          globalConfigPath,
          workingDirectory
        ),
        shell: false,
        timeout: 30_000,
        windowsHide: true,
      }
    );
  } finally {
    rmSync(workingDirectory, {
      force: true,
      maxRetries: 2,
      recursive: true,
      retryDelay: 50,
    });
  }
  if (result.status !== 0) {
    const reason = result.error?.message || result.stderr || result.stdout;
    fail(`Öffentliche Git-Remote-Prüfung fehlgeschlagen: ${String(reason).trim()}`);
  }
  if (!remoteReferencesContainCommit(result.stdout, commit)) {
    fail("Deployment-Commit ist in keinem öffentlichen Branch oder Tag des Remotes enthalten.");
  }
  return publicUrl;
}
