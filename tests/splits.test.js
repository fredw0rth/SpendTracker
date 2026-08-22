const { test } = require("node:test");
const assert = require("node:assert");
const R = require("../reconcile.js");

const sums = (r, total) => assert.equal(Math.round((r.your + r.their) * 100), Math.round(total * 100),
  `halves must sum back to ${total}, got ${r.your} + ${r.their}`);

test("an even split scales evenly", () => {
  const r = R.resplit(25, 25, 60);
  assert.deepEqual(r, { your: 30, their: 30 });
  sums(r, 60);
});

test("an uneven split keeps its proportions", () => {
  const r = R.resplit(40, 10, 100);   // 80/20
  assert.deepEqual(r, { your: 80, their: 20 });
  sums(r, 100);
});

test("a correction downwards works the same way", () => {
  const r = R.resplit(30, 30, 50);
  assert.deepEqual(r, { your: 25, their: 25 });
  sums(r, 50);
});

test("rounding never loses or invents a penny", () => {
  // 1/3 of 10.00 does not divide cleanly; the remainder goes to the personal half.
  const r = R.resplit(6.67, 3.33, 10.01);
  sums(r, 10.01);
  const s = R.resplit(1, 2, 9.99);
  sums(s, 9.99);
  for (let t = 1; t <= 200; t++) {
    const x = R.resplit(7, 3, t / 7);
    sums(x, Math.round((t / 7) * 100) / 100);
  }
});

test("a zero half stays zero", () => {
  const r = R.resplit(50, 0, 80);
  assert.deepEqual(r, { your: 80, their: 0 });
});

test("a zero personal half stays zero", () => {
  const r = R.resplit(0, 50, 80);
  assert.deepEqual(r, { your: 0, their: 80 });
});

test("a degenerate pair puts everything on the personal half", () => {
  assert.deepEqual(R.resplit(0, 0, 40), { your: 40, their: 0 });
});

test("a zero or negative total collapses to nothing rather than going negative", () => {
  assert.deepEqual(R.resplit(25, 25, 0), { your: 0, their: 0 });
  assert.deepEqual(R.resplit(25, 25, -5), { your: 0, their: 0 });
});

test("neither half ever goes negative", () => {
  for (const [y, t, total] of [[25, 25, 0.01], [99, 1, 0.02], [1, 99, 0.01]]) {
    const r = R.resplit(y, t, total);
    assert.ok(r.your >= 0 && r.their >= 0, `${r.your}/${r.their}`);
    sums(r, total);
  }
});
