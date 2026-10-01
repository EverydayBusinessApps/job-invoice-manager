# job-invoice-manager

# EverydayWork

A high-performance, mobile-first service delivery ledger and automated billing solution engineered for autonomous B2B and B2C professionals operating on hourly, daily, or flat-rate parameters.

This project delivers a completely decoupled **PWA-ready frontend framework** that transforms any standard Google Sheet into a secure, serverless database API gateway—**requiring zero continuous hosting costs or third-party database subscriptions.**

---

## 🔒 License & Intellectual Property Notice
**Copyright © 2026 EverydayBusinessApps. All Rights Reserved.**

This software, including all backend routing logic (`Code.gs`) and frontend interface mechanics (`index.html`), is **proprietary and confidential**. 

* **Permitted Use:** The source code in this repository is made visible exclusively for architectural evaluation, educational review, and portfolio verification.
* **Prohibited Use:** Unauthorized duplication, alteration, sub-licensing, distribution, extraction, or commercial execution of this codebase—via any medium—is strictly prohibited without the express written authorization of the copyright holder.

---

## 🚀 Architectural Blueprint
* **Frontend Viewport:** Single-page responsive web app utilizing **Tailwind CSS** for native component formatting and **Alpine.js** for reactive data mutations and view state controls.
* **Backend API Gateway:** High-performance REST web handler engineered with **Google Apps Script (V8 Engine)** utilizing text serialization to completely bypass cross-origin (CORS) preflight (`OPTIONS`) limitations.
* **Data Layer Core:** A Google Sheets relational storage engine partitioned across transactional configurations, operational transaction ledgers, and document indexes.

## ✨ Core Functional Assets
* 🕒 **Unified Activity Log:** Instantly capture accounts, billable volumes, unit rate matrices, temporal constraints, and narrative milestone scopes from any smartphone browser interface.
* 📄 **Invoice on the dashboard:** Statuses move in one order: Draft, Invoiced, Paid, Written off. A draft becomes Invoiced when you mark it, or when you save or download the PDF. Emailing leaves the draft until you mark it invoiced. An invoiced invoice can be marked Paid or Written off. Undo on a paid or written-off invoice puts it back to Invoiced. Home has Log a job, which opens the Log tab, then Invoices to send, Invoices to collect, and Finished invoices. An empty group shows one line, “Nothing waiting here.” Invoices to send can be marked invoiced, or opened to email, save, or download the PDF. Invoices to collect can be marked paid or written off. Finished invoices can be undone back to collect. Mark invoiced, Mark paid, Write off, and Undo return to Home with a short confirmation.
* 📦 **Zero-Overhead Distribution Architecture:** Designed for a "Bring Your Own Database (BYOD)" distribution model. The entire architecture is bound to the document context, making it trivial to monetize as a zero-maintenance digital asset wrapper.
* 📊 **Period totals:** On the Summary tab: week, month, quarter, and financial year totals for hours worked, work value, average rate, and top client. The week is Monday to Sunday. The financial year ends on the day in Settings. The browser keeps the last read of the workbook and reuses it for lists, invoice lines, and draft totals. Opening the app refreshes that copy once. **Refresh** in the header reads the sheet again after a direct edit. Saving a shift, compiling, changing a status, or saving a client sends the updated copy back in the same request.
* 💶 **Summary:** The Summary tab shows the week, month, quarter, and financial year hours and work value, then estimates income tax, USC, and Class S PRSI for a single sole trader on the current financial year’s recorded work. Allowable expenses are typed there and are not stored. The short line on the page says the figure is an indication and is not a substitute for accountancy. See more opens the 2026 rates. Settings is the cog beside Refresh.
* ⚙️ **Settings:** The Settings tab shows the logo currently on the invoice and edits your business defaults. Each name is the setting and the box is the value: default rate, financial year end, currency, business name, address, email, website, phone, bank account name, and IBAN. A PNG or JPEG logo replaces the logo already on the invoice, in the same place. Break lengths stay off the Settings page.
* 👤 **Clients:** Add or edit a client on the Clients tab. The fields are Name, Address 1, Address 2, Address 3, Address 4, Rate, Contact person, email address, phone number, and Payment Terms. Later details, including shift windows, stay as they are. A saved rate applies to draft invoices and new shifts. Invoices that have left Draft keep the rate stored on their time rows. Renaming a client updates the name on their time rows.
* 🖨️ **Invoice PDF:** Opening an invoice writes that invoice id into `INV-Template` cell B1 (the same dropdown as the sheet). The PDF is the print of `INV-Template` from row 2 through row 36, columns A–G, with the sheet grid left off, so the logo, colours, and bank block are the sheet's. Row 1, the dropdown, stays on the sheet and out of the file. `INV-Template` itself keeps the grid hidden. Save it to the Drive folder named `Invoices`, download it, or email it. The send page shows the letter, asks for the address, and can add a Cc. The letter is addressed to the contact person on the client. The address is the email on that client. From is the business name in Settings, and the subject is that name followed by the invoice number. Refresh, reloading the page, and saving read the client list from the spreadsheet again. Email is sent through Gmail from the account that runs EverydayWork, and that account also receives a copy. Saving or downloading the PDF marks a draft invoice as Invoiced. Email stays on the send page until you choose Mark invoiced.

After updating `Code.gs`, paste it into the Apps Script project bound to the EverydayWork spreadsheet (`1YN1xWdA7OScbXZj72yB5EyjrYA2zsJqwTTJ7-VdTxhM`). In the script editor, select `authorizeEverydayWork`, click Run, and choose Allow. Set Script Property `CLIENT_TOKEN` (see Closed beta below), then open Deploy, Manage deployments, edit the web app, set Version to New version, and Deploy. The public demo calls the URL in `config.js`. Opening that address with no token is rejected. Opening it with `?clientToken=` set to the same `CLIENT_TOKEN` should show `"invoicePdf":"inv-template-plain"`. A different deployment address goes in `config.js`, with that client's own token. Save to Drive needs Drive, and email needs Gmail. Line totals on the template cover rows 20–31.

## Closed beta: client token

Everyday Business owns the Google Sheet and the Apps Script project. The client is not the Apps Script owner. The web app runs as Everyday Business (Deploy → Execute as: Me, Who has access: Anyone). Anyone can reach the URL; the token is what closes the beta. Share the sheet with the client as **Viewer** when they use the web app only. Share it as **Editor** only when they should change cells themselves.

The public GitHub Pages site keeps `config.js`, which points at the demo sheet and the public demo token. A real client gets a private copy of the static files with their own `apiUrl` and `clientToken` (`config.example.js` is the shape). That private token is not committed, and that copy does not use the demo sheet. One codebase; hosting is not split per client branch.

Apps Script cannot read a custom header such as `X-Client-Token`, and the browser would send a preflight that Apps Script does not answer. The page sends `clientToken` in the POST body and on the web app URL. The URL copy is what lets the browser read the reply after Apps Script redirects. A health check uses the `clientToken` query parameter. The JSON body carries `status` 401 when the token is missing and 403 when it is wrong or the Script Property is unset. Apps Script still returns HTTP 200; callers use the JSON `status`. A rejected request does not open the sheet.

Checklist:

1. In the Apps Script project, open Project Settings → Script properties. Add `CLIENT_TOKEN`. For the public demo, use the `clientToken` value in `config.js`. For a real client, generate a different value.
2. Put that same value in the client config (`config.js` for the demo, a private `config.js` for a real client) next to that client's web app `apiUrl`.
3. Deploy → Manage deployments → edit this web app → Version = New version → Deploy. Do this after Code.gs changes and after the Script Property is set.
4. Open the web app URL with no token. The JSON says the client token is missing (`status` 401). A wrong token is not accepted (`status` 403).
5. With the matching token, log a job, list invoices, mark invoiced, mark paid, and email the PDF.

## Pay link (Stripe test mode)

EverydayWork keeps the jobs and the Paid status. Opening an unpaid invoice prepares a Stripe test-mode pay link for the total (EUR) when Script property `STRIPE_SECRET_KEY` is set (`sk_test_…`). Copy pay link and Email invoice use that stored link. A new link is created only when the total changes. The same link is in the email and, once it is on the page, in the PDF footer. Bank transfer details stay on the PDF. When Stripe reports the payment, that invoice is marked Paid in the Sheet. The page checks for that payment for about two minutes, and again when you come back to the tab. Refresh still checks straight away. If that invoice is open when the payment lands, EverydayWork returns to Home. The note clears after a few seconds, or when you dismiss it.

Paste it in Apps Script: Project Settings → Script properties. Never in the frontend, GitHub, or chat.

* `STRIPE_SECRET_KEY` — test mode secret only (`sk_test_…`).
* `STRIPE_WEBHOOK_TOKEN` — a long random string you choose.

Webhook URL: the web app exec URL plus `?stripeWebhook=TOKEN` (the same token). Event: `checkout.session.completed` (and `checkout.session.async_payment_succeeded` if you want bank debits later).

After pasting `Code.gs`, open Deploy → Manage deployments → edit this web app → Version = New version → Deploy. Keep the same URL.

The pay link is ready before the email is sent, so the page can show it while the email goes out. The green note only says who the invoice was emailed to. When `STRIPE_SECRET_KEY` is empty, Email invoice still sends and the letter has no pay link.

## 📊 Database Schema Requirement
To interface with the API layout, the underlying data core must be structured across exactly three sheets matching this structural matrix:
* **`ClientRecords`**: `Name`, `Address 1`, `Address 2`, `Address 3`, `Address 4`, `Rate`, `Contact person`, `email address`, `phone number`, `Payment Terms`
* **`Time&Attendance`**: `EntryID`, `InvoiceNumber1`, `InvoiceNumber2`, `ClientID`, `Date`, `Job Details`, `Start`, `Lunch`, `Finish`, `Hours`, `Rate`, `Billable Charge`, `Updated On`
* **`InvoiceList`**: `InvoiceID`, `Client`, `Job Details`, `Service Period`, `Hours Worked`, `Rate`, `Total Due`, `Invoice Date`, `Invoice Status`

---
Developed by **EverydayBusinessApps** • Premium Digital Infrastructure for Autonomous Professionals.
