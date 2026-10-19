// The copyright year follows the visitor's current calendar year.
document.querySelectorAll("[data-copyright-year]").forEach(element => {
  element.textContent = new Date().getFullYear();
});
