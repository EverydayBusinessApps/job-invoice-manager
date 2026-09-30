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
* 📄 **Invoice on the dashboard:** Statuses move in one order: Draft, Invoiced, Paid, Written off. A draft becomes Invoiced when you mark it, or when you save, download, or email the PDF. An invoiced invoice can be marked Paid or Written off. Undo on a paid or written-off invoice puts it back to Invoiced. Home has Log a job, which opens the Log tab, then Invoices to send, Invoices to collect, and Finished invoices. Those three open the same lists as before.
* 📦 **Zero-Overhead Distribution Architecture:** Designed for a "Bring Your Own Database (BYOD)" distribution model. The entire architecture is bound to the document context, making it trivial to monetize as a zero-maintenance digital asset wrapper.
* 📊 **Period totals:** On the Tax tab: week, month, quarter, and financial year totals for hours worked, work value, average rate, and top client. The week is Monday to Sunday. The financial year ends on the day in Config, cell B3. The browser keeps the last read of the workbook and reuses it for lists, invoice lines, and draft totals. Opening the app refreshes that copy once. **Refresh** in the header reads the sheet again after a direct edit. Saving a shift, compiling, changing a status, or saving a client sends the updated copy back in the same request.
* 💶 **Tax:** The Tax tab shows the week, month, quarter, and financial year hours and work value, then estimates income tax, USC, and Class S PRSI for a single sole trader on the current financial year’s recorded work. Allowable expenses are typed there and are not stored. The short line on the page says the figure is an indication and is not a substitute for accountancy. See more opens the 2026 rates. Settings is the cog beside Refresh.
* ⚙️ **Settings:** The Settings tab shows the logo currently on the invoice and edits the Config sheet. Column A is the setting and column B is the value: default rate, financial year end, currency, business name, address, email, website, phone, bank account name, and IBAN. A PNG or JPEG logo replaces the logo already on INV-Template, in the same place. Business name stays in Config cell B5. Break lengths stay on the Config sheet.
* 👤 **Clients:** Add or edit a client on the Clients tab. The columns written are Name, Address 1, Address 2, Address 3, Address 4, Rate, Contact person, email address, phone number, and Payment Terms. Later columns on ClientRecords, including shift windows, stay as they are. A saved rate applies to draft invoices and new shifts. Invoices that have left Draft keep the rate stored on their time rows. Renaming a client updates the name on their time rows.
* 🖨️ **Invoice PDF:** Opening an invoice writes that invoice id into `INV-Template` cell B1 (the same dropdown as the sheet). The PDF is the print of `INV-Template` from row 2 through row 36, columns A–G, with the sheet grid left off, so the logo, colours, and bank block are the sheet's. Row 1, the dropdown, stays on the sheet and out of the file. `INV-Template` itself keeps the grid hidden. Save it to the Drive folder named `Invoices`, download it, or email it. The email message is editable and starts as a short letter addressed to the contact person on ClientRecords (column G). The address is the email on that client record. From is the business name in Config cell B5, and the subject is that name followed by the invoice number. Refresh, reloading the page, and saving read ClientRecords from the spreadsheet again. Email is sent through Gmail from the account that runs EverydayWork, and that account also receives a copy. Saving, downloading, or emailing the PDF marks a draft invoice as Invoiced.

After updating `Code.gs`, paste it into the Apps Script project bound to the EverydayWork spreadsheet (`1YN1xWdA7OScbXZj72yB5EyjrYA2zsJqwTTJ7-VdTxhM`). In the script editor, select `authorizeEverydayWork`, click Run, and choose Allow. Then open Deploy, Manage deployments, edit the web app, set Version to New version, and Deploy. The app calls `https://script.google.com/macros/s/AKfycbzVJ3wV-heWwuT0xD5uKQum8xMp9NJ165pTWESf170vNvsgpI6ApGIX2BjoyuW5Z3tS/exec`. Opening that address should show `"invoicePdf":"inv-template-plain"`. A different deployment address has to be pasted into `app.js` as well. Save to Drive needs Drive, and email needs Gmail. Line totals on the template cover rows 20–31.

## 📊 Database Schema Requirement
To interface with the API layout, the underlying data core must be structured across exactly three sheets matching this structural matrix:
* **`ClientRecords`**: `Name`, `Address 1`, `Address 2`, `Address 3`, `Address 4`, `Rate`, `Contact person`, `email address`, `phone number`, `Payment Terms`
* **`Time&Attendance`**: `EntryID`, `InvoiceNumber1`, `InvoiceNumber2`, `ClientID`, `Date`, `Job Details`, `Start`, `Lunch`, `Finish`, `Hours`, `Rate`, `Billable Charge`, `Updated On`
* **`InvoiceList`**: `InvoiceID`, `Client`, `Job Details`, `Service Period`, `Hours Worked`, `Rate`, `Total Due`, `Invoice Date`, `Invoice Status`

---
Developed by **EverydayBusinessApps** • Premium Digital Infrastructure for Autonomous Professionals.
