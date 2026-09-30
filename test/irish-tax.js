/**
 * Irish sole-trader indication for 2026.
 * Run: node test/irish-tax.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

const context = {
  window: {},
  document: { addEventListener: function () {} }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), context);

const tax = context.estimateSoleTraderTax;
const sixty = tax(60000);
assert(sixty.incomeTax === 11200, "income tax " + sixty.incomeTax);
assert(sixty.usc === 1332.82, "usc " + sixty.usc);
assert(sixty.prsi === 2520, "prsi " + sixty.prsi);
assert(sixty.total === 15052.82, "total " + sixty.total);

const small = tax(10000);
assert(small.incomeTax === 0 && small.usc === 0 && small.prsi === 650 && small.total === 650, JSON.stringify(small));

const atUscLine = tax(13000);
assert(atUscLine.usc === 0 && atUscLine.prsi === 650, JSON.stringify(atUscLine));

const justOver = tax(13000.01);
assert(justOver.usc > 0, "usc should start above 13000");

const hundred = tax(100000);
assert(hundred.incomeTax === 27200, "100k tax " + hundred.incomeTax);
assert(hundred.usc === 4030.62, "100k usc " + hundred.usc);
assert(hundred.prsi === 4200, "100k prsi " + hundred.prsi);

const above = tax(150000);
assert(above.usc === 9530.62, "surcharge usc " + above.usc);
assert(above.incomeTax === 47200, "150k tax " + above.incomeTax);
assert(above.prsi === 6300, "150k prsi " + above.prsi);

assert(tax(0).total === 0, "no profit");
assert(tax(-500).total === 0, "a loss was taxed");
assert(context.expenseAmount("1,500.50") === 1500.5, "expenses");
assert(context.expenseAmount("") === 0, "blank expenses");
assert(context.expenseAmount("abc") === null, "bad expenses");

console.log("Irish sole trader indication passed.");
