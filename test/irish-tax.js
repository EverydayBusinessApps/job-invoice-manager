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

const sample = context.sampleDashboard();
const draft = sample.invoices.filter((row) => row.id === "INV-EB-003")[0];
const draftFacts = context.invoiceCardFacts(draft);
assert(draftFacts.period === "12/09/2026", "draft period " + draftFacts.period);
assert(draftFacts.when === "10/09/2026", "draft date " + draftFacts.when);
assert(draftFacts.hours === "1 h", "draft hours " + draftFacts.hours);
assert(draftFacts.work === "Survey", "draft work " + draftFacts.work);

const collapsed = context.collapseInvoiceRows([
  { id: "17", code: "INV-EB-017", status: "Draft", kind: "draft", total: 150 },
  { id: "INV-JR26-017", code: "INV-JR26-017", status: "Draft", kind: "draft", total: 150 },
  { id: "INV-EB-017", code: "INV-EB-017", status: "Invoiced", kind: "due", total: 150 }
]);
assert(collapsed.length === 1, "collapsed " + collapsed.length);
assert(collapsed[0].id === "INV-EB-017" && collapsed[0].code === "INV-EB-017", JSON.stringify(collapsed[0]));
assert(collapsed[0].status === "Invoiced" && collapsed[0].kind === "due", collapsed[0].status + " " + collapsed[0].kind);

const span = context.invoiceCardFacts({
  date: "2026-09-30",
  hours: 3.5,
  jobDetails: "Site pack",
  lines: [
    { date: "2026-09-30", details: "Fit the lock", hours: 1 },
    { date: "2026-09-28", details: "Survey the quay", hours: 1.5 },
    { date: "2026-09-29", details: "Survey the quay", hours: 1 }
  ]
});
assert(span.period === "28/09/2026 – 30/09/2026", "span " + span.period);
assert(span.when === "30/09/2026", "span date " + span.when);
assert(span.hours === "3.5 h", "span hours " + span.hours);
assert(span.work === "Fit the lock, Survey the quay", "span work " + span.work);

const oneDay = context.invoiceCardFacts({
  date: "2026-09-30",
  hours: 3,
  jobDetails: "Site visit",
  servicePeriod: "2026-09-30",
  lines: [{ date: "2026-09-30", details: "Site visit", hours: 3 }]
});
assert(oneDay.period === "30/09/2026", "one day " + oneDay.period);
assert(oneDay.hours === "3 h", "whole hours " + oneDay.hours);
assert(oneDay.work === "Site visit", "job details " + oneDay.work);

const fromService = context.invoiceCardFacts({
  date: "2026-09-30",
  servicePeriod: "2026-09-28 - 2026-09-30",
  jobDetails: "Callout",
  lines: []
});
assert(fromService.period === "28/09/2026 – 30/09/2026", "service period " + fromService.period);
assert(fromService.hours === "0 h", "missing hours " + fromService.hours);
assert(fromService.work === "Callout", "service work " + fromService.work);

const summed = context.invoiceCardFacts({
  lines: [
    { date: "2026-09-01", details: "Install", hours: 2 },
    { date: "2026-09-01", details: "Install", hours: 1.25 }
  ]
});
assert(summed.period === "01/09/2026", "same day " + summed.period);
assert(summed.hours === "3.3 h", "summed hours " + summed.hours);
assert(summed.work === "Install", "repeated work " + summed.work);
assert(summed.when === "—", "blank invoice date");

const longWork = context.invoiceCardFacts({
  jobDetails: "Checked the north quay gate, replaced the hinge pins, and wrote the survey notes for the harbour office before the tide turned",
  lines: []
});
assert(longWork.work.length <= 90, "work stays short " + longWork.work);
assert(/…$/.test(longWork.work), "long work is cut " + longWork.work);

console.log("Irish sole trader indication passed.");
