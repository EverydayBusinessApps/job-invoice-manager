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

const plain = context.invoicePayable({ total: 80, vatApplied: "N", vat: 18.4, gross: 98.4 });
assert(plain.showsVat === false && plain.payable === 80, JSON.stringify(plain));
const added = context.invoicePayable({ total: 200, vatApplied: "Y", vatRate: 23, vat: 46, gross: 246 });
assert(added.showsVat === true && added.payable === 246 && added.net === 200 && added.vat === 46, JSON.stringify(added));
assert(context.vatRateLabel(23) === "VAT 23%", context.vatRateLabel(23));
assert(context.vatPercentText(0.23) === "23", context.vatPercentText(0.23));
assert(context.vatPercentText("13.5") === "13.5", context.vatPercentText("13.5"));

const vatRows = [
  { id: "A", status: "Invoiced", kind: "due", inYear: true, vatApplied: "Y", vatRate: 99, vat: 46, gross: 246, total: 200, clientName: "Acme, Ltd" },
  { id: "B", status: "Paid", kind: "paid", inYear: true, vatApplied: "Y", vatRate: 23, vat: 23, gross: 123, total: 100 },
  { id: "C", status: "Draft", kind: "draft", inYear: true, vatApplied: "Y", vatRate: 23, vat: 11.5, gross: 61.5, total: 50 },
  { id: "D", status: "Written off", kind: "writtenoff", inYear: true, vatApplied: "Y", vat: 18.4, gross: 98.4, total: 80 },
  { id: "E", status: "Invoiced", kind: "due", inYear: true, vatApplied: "N", vat: 9, gross: 49, total: 40 },
  { id: "F", status: "Invoiced", kind: "due", inYear: false, vatApplied: "Y", vat: 5, gross: 25, total: 20 }
];
assert(context.vatOnInvoiced(vatRows) === 69, "VAT on invoiced " + context.vatOnInvoiced(vatRows));
assert(context.vatOnInvoiced([]) === 0, "an empty list hid the zero");
assert(context.vatOnInvoiced(context.sampleDashboard().invoices) === 46, "sample VAT");
const csv = context.accountantCsvFromRows(vatRows);
assert(csv.indexOf("VAT Amount") !== -1 && csv.indexOf("Gross Total") !== -1, csv.split("\n")[0]);
assert(csv.indexOf('"Acme, Ltd"') !== -1, csv);
assert(csv.indexOf(",99,46,246") !== -1, "stored VAT was recomputed " + csv);
assert(csv.indexOf(",11.5,") !== -1, "the draft row was left out of the CSV");
assert(csv.indexOf(",18.4,") !== -1, "the written-off row was left out of the CSV");

const vatRow = { total: 200, vatApplied: "Y", vatRate: 99, vat: 46, gross: 246 };
const netRow = { total: 40, vatApplied: "N", vat: 9, gross: 49 };
assert(context.invoicePayable(vatRow).payable === 246, "stored gross " + context.invoicePayable(vatRow).payable);
assert(context.invoicePayable(netRow).payable === 40, "stored total due " + context.invoicePayable(netRow).payable);
const waText = context.whatsAppInvoiceText("INV-EB-002", "€246.00", "https://pay.example/inv");
assert(waText.indexOf("Invoice INV-EB-002") === 0, waText);
assert(waText.indexOf("Amount due €246.00") !== -1, waText);
assert(waText.indexOf("https://pay.example/inv") !== -1, waText);
assert(waText.indexOf("PDF downloaded, attach it") !== -1, waText);
assert(waText.indexOf("99") === -1, "the WhatsApp message recomputed VAT");
const waUrl = context.whatsAppLink(waText);
assert(waUrl.indexOf("https://wa.me/?text=") === 0, waUrl);
assert(decodeURIComponent(waUrl.slice("https://wa.me/?text=".length)) === waText, waUrl);
const remind = context.whatsAppInvoiceText("INV-EB-002", "€246.00", "https://example.com/pay/INV-EB-002", "This invoice is overdue.");
assert(remind.indexOf("Invoice INV-EB-002") !== -1 && remind.indexOf("Amount due €246.00") !== -1, remind);
assert(remind.indexOf("https://example.com/pay/INV-EB-002") !== -1, remind);
assert(remind.indexOf("This invoice is overdue.") !== -1, remind);
assert(context.invoiceIsOverdue({ kind: "due", overdue: true, dueDate: "2026-09-15" }, "2026-09-22") === true, "invoiced overdue");
assert(context.invoiceIsOverdue({ kind: "paid", overdue: true, dueDate: "2020-01-01" }, "2026-09-22") === false, "paid was overdue");
assert(context.invoiceIsOverdue({ kind: "draft", overdue: true, dueDate: "2020-01-01" }, "2026-09-22") === false, "draft was overdue");
assert(context.invoiceIsOverdue({ kind: "writtenoff", dueDate: "2020-01-01" }, "2026-09-22") === false, "written off was overdue");
assert(context.invoiceIsOverdue({ status: "Invoiced", dueDate: "2026-10-20" }, "2026-09-22") === false, "future due date was overdue");
const sampleOverdue = context.sampleDashboard().invoices.filter(function (row) {
  return context.invoiceIsOverdue(row, "2026-09-22");
});
assert(sampleOverdue.length === 1 && sampleOverdue[0].id === "INV-EB-002", sampleOverdue.map(function (row) { return row.id; }).join(","));
const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const shareStart = appSource.indexOf("async handInvoiceToWhatsApp()");
const shareBody = appSource.slice(shareStart, shareStart + 2200);
assert(shareBody.indexOf("downloadInvoicePdf") !== -1, "WhatsApp share skipped the PDF download");
assert(shareBody.indexOf("invoicePayable") !== -1, "WhatsApp share skipped the stored amount");
assert(shareBody.indexOf("emailOpen") === -1, "WhatsApp share opened the email sheet");
const remindStart = appSource.indexOf("async remindOnWhatsApp()");
const remindBody = appSource.slice(remindStart, remindStart + 280);
assert(remindBody.indexOf("This invoice is overdue.") !== -1, remindBody);
assert(remindBody.indexOf("emailInvoicePdf") === -1, "Remind sent the email");
const emailRemind = appSource.slice(appSource.indexOf("openEmailReminder()"), appSource.indexOf("async handInvoiceToWhatsApp()"));
assert(emailRemind.indexOf("emailOpen = true") !== -1, "Email reminder left the sheet closed");
assert(emailRemind.indexOf("emailInvoicePdf") === -1, "Email reminder sent the email");
const detailHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert(detailHtml.indexOf('id="share-whatsapp"') !== -1, "the share button is missing");
assert(detailHtml.indexOf("Share on WhatsApp") !== -1, "the share label is missing");

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

const sampleQuote = context.sampleDashboard().invoices.filter(function (row) { return row.id === "INV-EB-006"; })[0];
assert(sampleQuote && sampleQuote.status === "Quote" && sampleQuote.kind === "quote", JSON.stringify(sampleQuote && sampleQuote.status));
assert(!sampleQuote.payUrl, "the sample quote included a pay link");
assert(context.invoicePayable(sampleQuote).payable === 150, context.invoicePayable(sampleQuote).payable);
assert(context.invoiceIsOverdue(sampleQuote, "2026-09-22") === false, "a quote was overdue");
const quoteText = context.quoteShareText("INV-EB-006", "€150.00");
assert(quoteText.indexOf("Invoice INV-EB-006") === 0, quoteText);
assert(quoteText.indexOf("Amount due €150.00") !== -1, quoteText);
assert(quoteText.indexOf("PDF downloaded, attach it") !== -1, quoteText);
assert(quoteText.indexOf("http") === -1, quoteText);
const firstConvert = context.convertQuoteRows(context.sampleDashboard().invoices, "INV-EB-006");
assert(firstConvert.created === true && firstConvert.invoiceId === "INV-EB-007", JSON.stringify(firstConvert));
assert(firstConvert.rows.filter(function (row) { return row.status === "Quote" || row.kind === "quote"; }).length === 0, "the quote stayed on the live list");
assert(firstConvert.rows.filter(function (row) { return row.id === "INV-EB-007"; }).length === 1, "convert minted more than one invoice");
assert(!firstConvert.rows.filter(function (row) { return row.id === "INV-EB-007"; })[0].payUrl, "preview convert added a pay link");
const secondConvert = context.convertQuoteRows(firstConvert.stored, "INV-EB-006");
assert(secondConvert.created === false && secondConvert.invoiceId === "INV-EB-007", secondConvert.invoiceId + " " + secondConvert.created);
assert(secondConvert.rows.filter(function (row) { return row.id === "INV-EB-007"; }).length === 1, "a second convert changed the live list");
assert(detailHtml.indexOf("Log a quote") !== -1, "the quote path is missing");
assert(detailHtml.indexOf('id="turn-into-invoice"') !== -1, "Turn into invoice is missing");
assert(detailHtml.indexOf("Turn into invoice") !== -1, "the convert label is missing");
assert(detailHtml.indexOf('x-show="detailIsQuote"') !== -1, "quote actions are always visible");
assert(detailHtml.indexOf('x-show="detailShowShare"') !== -1, "quote WhatsApp is hidden");
assert(detailHtml.indexOf('x-show="detailShowPay"') !== -1, "pay link visibility changed");
const chrome = appSource.slice(appSource.indexOf("syncDetailChrome(status)"), appSource.indexOf("syncDetailChrome(status)") + 800);
assert(chrome.indexOf('this.detailShowPay = kind === "draft" || kind === "due"') !== -1, chrome);
assert(chrome.indexOf('kind === "quote"') !== -1, chrome);
const issue = appSource.slice(appSource.indexOf("previewIssue()"), appSource.indexOf("previewIssue()") + 360);
assert(issue.indexOf("detailIsQuote") !== -1, "quote PDF preview marks the quote invoiced");

console.log("Irish sole trader indication passed.");
