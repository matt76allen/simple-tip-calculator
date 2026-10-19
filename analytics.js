(() => {
  // Track only the public website, never local development or Vercel previews.
  const publicHosts = ["simpletipcalculator.com", "www.simpletipcalculator.com"];
  if (location.protocol !== "https:" || !publicHosts.includes(location.hostname)) return;

  const measurementId = "G-0HBEB4V626";
  const pages = {
    "/": ["/", "Simple Tip Calculator"],
    "/index.html": ["/", "Simple Tip Calculator"],
    "/privacy.html": ["/privacy.html", "Privacy Policy | Simple Tip Calculator"],
    "/terms.html": ["/terms.html", "Terms of Use | Simple Tip Calculator"]
  };
  const [path, title] = pages[location.pathname] || pages["/"];
  let referrer = "";
  try {
    // Only the referring origin is needed, not its query string or fragments.
    if (document.referrer) referrer = `${new URL(document.referrer).origin}/`;
  } catch { /* An invalid referrer is simply omitted. */ }

  let configured = false;
  let tag = null;

  function loadAnalytics() {
    if (document.readyState !== "complete" || navigator.onLine === false || tag) return;

    if (!configured) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      const page = {
        page_title: title,
        page_location: `https://simpletipcalculator.com${path}`,
        page_referrer: referrer
      };
      // Use fixed page metadata; never read bill inputs, calculated results,
      // URL parameters, or fragments into Analytics events.
      window.gtag("set", page);
      window.gtag("config", measurementId, {
        ...page,
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
      window.gtag("event", "page_view", page);
      configured = true;
    }

    tag = document.createElement("script");
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    tag.addEventListener("error", () => {
      // Analytics failure must never affect the calculator. Retry on a later
      // online event without queuing duplicate page views or offline actions.
      tag.remove();
      tag = null;
    });
    document.head.append(tag);
  }

  window.addEventListener("online", loadAnalytics);
  // A slow or blocked Google request must not delay the page's load event or
  // the independent offline-cache setup that starts at that event.
  if (document.readyState === "complete") loadAnalytics();
  else window.addEventListener("load", loadAnalytics, { once: true });
})();
