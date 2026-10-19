// Share only this fixed public URL. Never include calculator state.
const calculatorShare = {
  title: "Simple Tip Calculator",
  url: "https://simpletipcalculator.com/"
};
const shareButton = document.querySelector("#share-calculator");
const shareFallback = document.querySelector("#share-fallback");
const copyLinkButton = document.querySelector("#copy-link");
const shareStatus = document.querySelector("#share-status");
const manualCopy = document.querySelector("#manual-copy");
const shareUrl = document.querySelector("#share-url");

function offerCopyLink() {
  shareFallback.hidden = false;
  shareButton.setAttribute("aria-expanded", "true");
  copyLinkButton.focus();
}

shareButton.addEventListener("click", async () => {
  shareStatus.textContent = "";
  manualCopy.hidden = true;
  shareFallback.hidden = true;
  shareButton.setAttribute("aria-expanded", "false");

  if (typeof navigator.share !== "function") {
    offerCopyLink();
    return;
  }

  shareButton.disabled = true;
  try {
    await navigator.share(calculatorShare);
  } catch (error) {
    // Closing the device's sharing panel is a normal, silent cancellation.
    if (error?.name !== "AbortError") offerCopyLink();
  } finally {
    shareButton.disabled = false;
    if (shareFallback.hidden) shareButton.focus();
  }
});

copyLinkButton.addEventListener("click", async () => {
  shareStatus.textContent = "";
  manualCopy.hidden = true;
  copyLinkButton.disabled = true;
  try {
    if (typeof navigator.clipboard?.writeText !== "function") {
      throw new Error("Clipboard unavailable");
    }
    await navigator.clipboard.writeText(calculatorShare.url);
    shareStatus.textContent = "Link copied!";
  } catch {
    shareStatus.textContent = "Copying isn’t available. Please copy the link below.";
    manualCopy.hidden = false;
    shareUrl.focus();
    shareUrl.select();
  } finally {
    copyLinkButton.disabled = false;
    if (manualCopy.hidden) copyLinkButton.focus();
  }
});
