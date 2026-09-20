# job-invoice-manager

# Everyday Job & Invoice Manager (FlexiTrack Pro)

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
* 📄 **Dynamic Billing Portal:** Live data synchronization loops sweep ledger rows to instantly aggregate unbilled tracking balances by account profile automatically.
* 🔒 **Atomic Invoice Locking:** One-tap compilation groups open service lines, generates a unique document tracking reference ID, locks historical ledger rows, and appends a consolidated financial record directly into the invoicing pipeline.
* 📦 **Zero-Overhead Distribution Architecture:** Designed for a "Bring Your Own Database (BYOD)" distribution model. The entire architecture is bound to the document context, making it trivial to monetize as a zero-maintenance digital asset wrapper.

## 📊 Database Schema Requirement
To interface with the API layout, the underlying data core must be structured across exactly three sheets matching this structural matrix:
* **`ClientRecords`**: `Name`, `Address 1`, `Rate`, `Contact Person`, `Email Address`, `Phone Number`
* **`Time&Attendance`**: `EntryID`, `InvoiceNumber1`, `InvoiceNumber2`, `ClientID`, `Date`, `Job Details`, `Start`, `Lunch`, `Finish`, `Hours`, `Rate`, `Billable Charge`, `Updated On`
* **`InvoiceList`**: `InvoiceID`, `Client`, `Job Details`, `Service Period`, `Hours Worked`, `Rate`, `Total Due`, `Invoice Date`, `Invoice Status`

---
Developed by **EverydayBusinessApps** • Premium Digital Infrastructure for Autonomous Professionals.
