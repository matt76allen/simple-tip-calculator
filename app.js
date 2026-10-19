const calculator = new TipCalculator();
const billInput = document.querySelector("#bill");
const errorOutput = document.querySelector("#bill-error");
const percentOutput = document.querySelector("#percent");
const tipOutput = document.querySelector("#tip");
const totalOutput = document.querySelector("#total");
const buttons = [...document.querySelectorAll(".step-button")];
let hasValidBill = false;

function render() {
  percentOutput.textContent = `${calculator.formatPercent()}%`;
  tipOutput.textContent = hasValidBill ? `$${formatMoney(calculator.tipCents)}` : "—";
  totalOutput.textContent = hasValidBill ? `$${formatMoney(calculator.billCents + calculator.tipCents)}` : "—";
  for (const button of buttons) {
    button.disabled = !hasValidBill || !calculator.canAdjust(button.dataset.type, Number(button.dataset.direction));
  }
}

function readBill() {
  hasValidBill = false;
  errorOutput.textContent = "";
  billInput.removeAttribute("aria-invalid");
  if (billInput.value.trim() === "") {
    calculator.clearBill();
  } else {
    try {
      calculator.setBillCents(parseBill(billInput.value));
      hasValidBill = true;
    } catch (error) {
      calculator.clearBill();
      errorOutput.textContent = error.message;
      billInput.setAttribute("aria-invalid", "true");
    }
  }
  render();
}

billInput.addEventListener("input", readBill);
billInput.addEventListener("blur", () => {
  if (hasValidBill) billInput.value = formatMoney(calculator.billCents);
});
billInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    billInput.blur();
  }
});
for (const button of buttons) {
  button.addEventListener("click", () => {
    if (!hasValidBill) return;
    calculator.adjust(button.dataset.type, Number(button.dataset.direction));
    render();
  });
}
render();
