/* Money stays in integer cents. A fraction preserves the exact percentage
   when a dollar adjustment produces a repeating decimal (like 12 / 62). */
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

function parseBill(text) {
  const value = text.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) {
    throw new Error("Enter an amount like 50 or 50.25.");
  }
  const [dollars, decimals = ""] = value.split(".");
  const whole = (dollars || "0").replace(/^0+(?=\d)/, "");
  if (whole.length > 14) throw new Error("That amount is too large.");
  const cents = BigInt(whole) * 100n + BigInt(decimals.padEnd(2, "0"));
  if (cents > MAX_CENTS) throw new Error("That amount is too large.");
  return Number(cents);
}

function formatMoney(cents) {
  const value = BigInt(cents);
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function roundFraction(numerator, denominator) {
  return (2n * numerator + denominator) / (2n * denominator);
}

function numberFraction(value) {
  const [coefficient, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, decimal = ""] = coefficient.split(".");
  const scale = decimal.length - Number(exponent);
  const numerator = BigInt(whole + decimal);
  return scale >= 0
    ? [numerator, 10n ** BigInt(scale)]
    : [numerator * 10n ** BigInt(-scale), 1n];
}

class TipCalculator {
  constructor() {
    this.billCents = 0;
    this.tipCents = 0;
    this.percentNumerator = 20n;
    this.percentDenominator = 1n;
  }

  get percent() {
    return Number(this.percentNumerator) / Number(this.percentDenominator);
  }

  formatPercent() {
    const hundredths = roundFraction(this.percentNumerator * 100n, this.percentDenominator);
    return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}`.replace(/\.?0+$/, "");
  }

  validateMoney(bill, tip) {
    if (!Number.isSafeInteger(bill) || !Number.isSafeInteger(tip) ||
        !Number.isSafeInteger(bill + tip) || bill < 0 || tip < 0) {
      throw new Error("That amount is too large.");
    }
  }

  tipFor(bill, numerator = this.percentNumerator, denominator = this.percentDenominator) {
    const tip = roundFraction(BigInt(bill) * numerator, denominator * 100n);
    if (tip > MAX_CENTS || BigInt(bill) + tip > MAX_CENTS) {
      throw new Error("That amount is too large for the current tip.");
    }
    return Number(tip);
  }

  setBill(dollars) {
    if (!Number.isFinite(dollars) || dollars < 0) throw new Error("Enter a valid amount of zero or more.");
    return this.setBillCents(parseBill(String(dollars)));
  }

  setBillCents(bill) {
    this.validateMoney(bill, 0);
    const tip = this.tipFor(bill);
    this.billCents = bill;
    this.tipCents = tip;
    return this.snapshot();
  }

  clearBill() {
    this.billCents = 0;
    this.tipCents = 0;
  }

  requireBill() {
    if (this.billCents <= 0) throw new Error("Enter a bill greater than zero first.");
  }

  setPercent(percent) {
    if (!Number.isFinite(percent) || percent < 0) throw new Error("Enter a valid percentage.");
    const [numerator, denominator] = numberFraction(percent);
    const tip = this.tipFor(this.billCents, numerator, denominator);
    this.percentNumerator = numerator;
    this.percentDenominator = denominator;
    this.tipCents = tip;
    return this.snapshot();
  }

  setTipCents(tip) {
    this.requireBill();
    this.validateMoney(this.billCents, tip);
    this.tipCents = tip;
    this.percentNumerator = BigInt(tip) * 100n;
    this.percentDenominator = BigInt(this.billCents);
    return this.snapshot();
  }

  setTotalCents(total) {
    this.requireBill();
    if (!Number.isSafeInteger(total) || total < this.billCents) {
      throw new Error("Total cannot be less than the bill.");
    }
    return this.setTipCents(total - this.billCents);
  }

  nextWholePercent(direction) {
    // Exact division avoids floating-point values just above/below an integer.
    const n = this.percentNumerator;
    const d = this.percentDenominator;
    return Number(direction > 0 ? n / d + 1n : (n + d - 1n) / d - 1n);
  }

  nextWholeDollarCents(cents, direction) {
    const value = BigInt(cents);
    return Number((direction > 0 ? value / 100n + 1n : (value + 99n) / 100n - 1n) * 100n);
  }

  canAdjust(type, direction) {
    if (this.billCents <= 0 || ![1, -1].includes(direction)) return false;
    if (type === "percent") {
      const next = this.nextWholePercent(direction);
      if (!Number.isSafeInteger(next) || next < 0) return false;
      try { this.tipFor(this.billCents, BigInt(next), 1n); return true; }
      catch { return false; }
    }
    if (type === "tip") {
      const next = this.nextWholeDollarCents(this.tipCents, direction);
      return next >= 0 && Number.isSafeInteger(next) && Number.isSafeInteger(this.billCents + next);
    }
    if (type === "total") {
      const next = this.nextWholeDollarCents(this.billCents + this.tipCents, direction);
      return Number.isSafeInteger(next) && next >= this.billCents;
    }
    return false;
  }

  adjust(type, direction) {
    if (!this.canAdjust(type, direction)) return this.snapshot();
    if (type === "percent") return this.setPercent(this.nextWholePercent(direction));
    if (type === "tip") return this.setTipCents(this.nextWholeDollarCents(this.tipCents, direction));
    return this.setTotalCents(this.nextWholeDollarCents(this.billCents + this.tipCents, direction));
  }

  snapshot() {
    return { billCents: this.billCents, tipCents: this.tipCents,
      totalCents: this.billCents + this.tipCents, percent: this.percent };
  }
}

if (typeof module !== "undefined") module.exports = { TipCalculator, parseBill, formatMoney };
