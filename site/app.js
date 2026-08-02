document.documentElement.classList.add("js");

const pageLanguage = document.documentElement.lang.toLowerCase().startsWith("en")
  ? "en"
  : "de";
const applicationScriptUrl = document.currentScript?.src || window.location.href;
const siteBaseUrl = new URL(".", applicationScriptUrl);
const navToggle = document.querySelector(".nav-toggle");
const navigation = document.querySelector(".site-nav");
const languageSwitch = document.querySelector("[data-language-switch]");

navToggle?.addEventListener("click", () => {
  const open = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!open));
  navigation?.classList.toggle("open", !open);
});

navigation?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    navigation.classList.remove("open");
    navToggle?.setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigation?.classList.contains("open")) {
    navigation.classList.remove("open");
    navToggle?.setAttribute("aria-expanded", "false");
    navToggle?.focus();
  }
});

languageSwitch?.addEventListener("click", (event) => {
  const language = languageSwitch.getAttribute("data-language");
  try {
    window.localStorage.setItem("reist-language", language);
  } catch {
    // Die URL bleibt als sprachspezifischer Fallback erhalten.
  }
  if (languageSwitch instanceof HTMLAnchorElement) {
    event.preventDefault();
    const target = new URL(languageSwitch.href);
    target.hash = window.location.hash;
    window.location.assign(target);
  }
});

async function loadJson(path) {
  const response = await fetch(new URL(path, siteBaseUrl), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function updateProjectStatus() {
  let project = null;
  try {
    project = await loadJson("data/project.json");
    document.querySelectorAll("[data-test-count]").forEach((element) => {
      element.textContent = String(project.status.contractTestsPassing);
    });
  } catch (error) {
    console.warn("Projektstatus konnte nicht geladen werden", error);
  }

  try {
    const bountyData = await loadJson("data/bounties.json");
    const activeBounties = bountyData.bounties.filter(
      (bounty) => bounty.status === "active"
    ).length;
    document.querySelectorAll("[data-active-bounties]").forEach((element) => {
      element.textContent = String(activeBounties);
    });

    const statusLabels = pageLanguage === "en"
      ? {
          active: "Active",
          cancelled: "Cancelled",
          closed: "Closed",
          draft: "Draft",
        }
      : {
          active: "Aktiv",
          cancelled: "Abgebrochen",
          closed: "Abgeschlossen",
          draft: "Entwurf",
        };
    document.querySelectorAll("[data-bounty-id]").forEach((element) => {
      const bounty = bountyData.bounties.find(
        (entry) => entry.id === element.getAttribute("data-bounty-id")
      );
      const status = element.querySelector("[data-bounty-status]");
      if (bounty && status) {
        status.textContent = statusLabels[bounty.status] || bounty.status;
      }
    });
  } catch (error) {
    console.warn("Bounty-Status konnte nicht geladen werden", error);
  }

  try {
    const contributions = await loadJson("data/contributions.json");
    document.querySelectorAll("[data-contribution-count]").forEach((element) => {
      element.textContent = String(contributions.contributions.length);
    });
  } catch (error) {
    console.warn("Beitragsregister konnte nicht geladen werden", error);
  }
  return project;
}

async function updateDeploymentStatus() {
  try {
    const deployment = await loadJson("deployments/base-sepolia.json");
    if (deployment.chainId !== 84532 || !deployment.contracts?.token) return;

    const address = deployment.contracts.token;
    const explorerUrl = `https://sepolia.basescan.org/address/${address}`;
    const status = document.querySelector("[data-testnet-status]");
    const panel = document.querySelector("[data-address-panel]");
    const addressElement = document.querySelector("[data-token-address]");
    const explorerLink = document.querySelector("[data-explorer-link]");
    const vestingExplorerLink = document.querySelector(
      "[data-vesting-explorer-link]"
    );
    const transactionExplorerLink = document.querySelector(
      "[data-transaction-explorer-link]"
    );
    const copyButton = document.querySelector("[data-copy-address]");

    if (status) {
      status.textContent = deployment.verification?.sourceVerified
        ? pageLanguage === "en"
          ? "deployed · source verified"
          : "deployed · Quellcode verifiziert"
        : pageLanguage === "en"
          ? "deployed · verification pending"
          : "deployed · Verifikation offen";
    }
    if (addressElement) addressElement.textContent = address;
    if (explorerLink instanceof HTMLAnchorElement) explorerLink.href = explorerUrl;
    if (
      vestingExplorerLink instanceof HTMLAnchorElement &&
      /^0x[a-fA-F0-9]{40}$/.test(deployment.contracts?.founderVesting || "")
    ) {
      vestingExplorerLink.href =
        `https://sepolia.basescan.org/address/${deployment.contracts.founderVesting}#code`;
    }
    if (
      transactionExplorerLink instanceof HTMLAnchorElement &&
      /^0x[a-fA-F0-9]{64}$/.test(deployment.transactionHash || "")
    ) {
      transactionExplorerLink.href =
        `https://sepolia.basescan.org/tx/${deployment.transactionHash}`;
    }
    if (panel instanceof HTMLElement) panel.hidden = false;

    copyButton?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(address);
        copyButton.textContent = pageLanguage === "en" ? "Copied" : "Kopiert";
      } catch {
        copyButton.textContent = pageLanguage === "en"
          ? "Copy failed"
          : "Kopieren fehlgeschlagen";
      }
    });
  } catch {
    // Kein Manifest bedeutet ehrlich: noch nicht deployed.
  }
}

async function initialize() {
  const project = await updateProjectStatus();
  if (project?.status?.testnetDeployment) {
    await updateDeploymentStatus();
  }
}

initialize();
