const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TipCalculator, parseBill, formatMoney } = require('../calculator.js');

function withBill(amount) {
  const calculator = new TipCalculator();
  calculator.setBill(amount);
  return calculator;
}

test('$50 defaults to 20%, $10 tip and $60 total; tip-up gives 22% and $61', () => {
  const c = withBill(50);
  assert.deepEqual(c.snapshot(), { billCents: 5000, tipCents: 1000, totalCents: 6000, percent: 20 });
  c.adjust('tip', 1);
  assert.deepEqual(c.snapshot(), { billCents: 5000, tipCents: 1100, totalCents: 6100, percent: 22 });
});

test('fractional money steps to the next whole dollar in each direction', () => {
  for (const [type, direction, expected] of [
    ['tip', -1, 1200], ['tip', 1, 1300],
    ['total', -1, 7400], ['total', 1, 7500],
  ]) {
    const c = withBill(62);
    assert.equal(c.tipCents, 1240);
    c.adjust(type, direction);
    assert.equal(type === 'tip' ? c.tipCents : c.snapshot().totalCents, expected);
    assert.equal(c.billCents, 6200);
  }
});

test('18.75% steps down to 18% and up to 19%', () => {
  for (const direction of [-1, 1]) {
    const c = withBill(80);
    c.setTipCents(1500);
    assert.equal(c.percent, 18.75);
    c.adjust('percent', direction);
    assert.equal(c.percent, direction < 0 ? 18 : 19);
  }
});

test('whole values move by exactly one whole unit', () => {
  for (const [type, direction, key, expected] of [
    ['percent', -1, 'percent', 19], ['percent', 1, 'percent', 21],
    ['tip', -1, 'tipCents', 900], ['tip', 1, 'tipCents', 1100],
    ['total', -1, 'totalCents', 5900], ['total', 1, 'totalCents', 6100],
  ]) {
    const c = withBill(50);
    assert.equal(c.adjust(type, direction)[key], expected);
  }
});

test('$33.33 rounds the tip to $6.67 and total to $40; total cannot fall below bill', () => {
  const c = withBill(33.33);
  assert.equal(c.tipCents, 667);
  assert.equal(c.snapshot().totalCents, 4000);
  c.setTotalCents(3400);
  assert.equal(c.canAdjust('total', -1), false);
  c.adjust('total', -1);
  assert.equal(c.snapshot().totalCents, 3400);
  assert.throws(() => c.setTotalCents(3300));
});

test('bill changes preserve exact percentage, including repeating decimals', () => {
  const c = withBill(62);
  c.setTipCents(1200);
  assert.equal(c.formatPercent(), '19.35');
  const percent = c.percent;
  c.setBill(124);
  assert.equal(c.percent, percent);
  assert.equal(c.tipCents, 2400);
  c.clearBill();
  c.setBill(62);
  assert.equal(c.tipCents, 1200);
});

test('exact percentage stepping avoids binary floating-point errors', () => {
  const c = withBill(0.25);
  c.setTipCents(7); // 7 / 25 * 100 can be 28.000000000000004 in JS.
  assert.equal(c.percent, 28);
  assert.equal(c.nextWholePercent(-1), 27);
  assert.equal(c.nextWholePercent(1), 29);
  c.setPercent(18.75);
  assert.equal(c.formatPercent(), '18.75');
  c.setPercent(0);
  assert.equal(c.formatPercent(), '0');
});

test('empty/zero bills disable arrows; zero tips disable down arrows', () => {
  const c = new TipCalculator();
  for (const type of ['percent', 'tip', 'total']) {
    for (const direction of [-1, 1]) assert.equal(c.canAdjust(type, direction), false);
  }
  c.setBill(0);
  assert.equal(c.canAdjust('percent', 1), false);
  c.setBill(33.33);
  c.setTipCents(0);
  for (const type of ['percent', 'tip', 'total']) assert.equal(c.canAdjust(type, -1), false);
  assert.equal(c.canAdjust('tip', 1), true);
});

test('bill parsing validates all characters and decimal precision', () => {
  for (const [input, cents] of [['50', 5000], ['50.', 5000], ['.5', 50], ['0', 0], [' 33.33 ', 3333], ['0001.05', 105]]) {
    assert.equal(parseBill(input), cents);
  }
  for (const input of ['', '-1', '+1', '50abc', '1.234', '1e3', 'NaN', 'Infinity', '1,000', '$50', '1 2', '.', '90071992547409.92', '9'.repeat(500)]) {
    assert.throws(() => parseBill(input), input);
  }
});

test('unsafe amounts fail without partial model updates', () => {
  const c = withBill(50);
  const before = c.snapshot();
  assert.throws(() => c.setBillCents(Number.MAX_SAFE_INTEGER));
  assert.throws(() => c.setPercent(Number.MAX_VALUE));
  assert.throws(() => c.setTipCents(Number.MAX_SAFE_INTEGER));
  assert.deepEqual(c.snapshot(), before);
  c.setPercent(0);
  c.setBillCents(Number.MAX_SAFE_INTEGER);
  assert.equal(c.canAdjust('total', 1), false);
  assert.equal(c.canAdjust('tip', 1), false);
  assert.equal(formatMoney(Number.MAX_SAFE_INTEGER), '90071992547409.91');
});

test('money rounds half a cent up and never produces negative tips', () => {
  const c = withBill(0.05);
  c.setPercent(10);
  assert.equal(c.tipCents, 1);
  c.setTipCents(0);
  c.adjust('tip', -1);
  assert.equal(c.tipCents, 0);
  assert.throws(() => c.setPercent(-1));
  assert.throws(() => c.setTipCents(-1));
});
