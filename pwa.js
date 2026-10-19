const installButton = document.querySelector("#install-app");
const installRow = document.querySelector("#install-row");
const installDialog = document.querySelector("#install-dialog");
const offlineStatus = document.querySelector("#offline-status");
const standalone = window.matchMedia("(display-mode: standalone)");
let pendingInstall = null;

installDialog?.addEventListener("close", () => {
  if (installButton && !installRow.hidden) installButton.focus();
});

function updateInstallVisibility() {
  if (installRow) installRow.hidden = standalone.matches || navigator.standalone === true;
}
updateInstallVisibility();
standalone.addEventListener("change", updateInstallVisibility);

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  pendingInstall = event;
});

window.addEventListener("appinstalled", () => {
  pendingInstall = null;
  if (installRow) installRow.hidden = true;
  if (installDialog?.open) installDialog.close();
});

function showInstallInstructions() {
  if (!installDialog) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(navigator.userAgent);
  document.querySelector("#install-instructions").textContent = ios
    ? "On iPhone or iPad, open this page in Safari. Tap Share (the square with an upward arrow), then Add to Home Screen, and tap Add. You may need to scroll through the Share menu to find it."
    : android
      ? "Open your browser’s menu (⋮), choose Install app or Add to Home screen, then follow the prompts. If neither appears, try opening this page in Chrome."
      : "Open your browser’s menu and look for Install Simple Tip Calculator or Install app. On a Mac, Safari also offers File → Add to Dock. If installation isn’t available, you can bookmark this page instead.";
  if (!installDialog.open) installDialog.showModal();
}

installButton?.addEventListener("click", async () => {
  if (!pendingInstall) {
    showInstallInstructions();
    return;
  }
  // The browser permits each saved install event to be prompted only once.
  const prompt = pendingInstall;
  pendingInstall = null;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch {
    showInstallInstructions();
  } finally {
    installButton.disabled = false;
    if (!installDialog.open && !installRow.hidden) installButton.focus();
  }
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      if (offlineStatus) offlineStatus.textContent = "Ready for offline use on this device. You can calculate tips without an internet connection.";
    } catch {
      if (offlineStatus) offlineStatus.textContent = "Offline setup couldn’t finish. Connect to the internet and refresh to try again.";
    }
  });
} else if (offlineStatus) {
  offlineStatus.textContent = "Offline access isn’t supported in this browser. You can still save a bookmark and use the calculator online.";
}
