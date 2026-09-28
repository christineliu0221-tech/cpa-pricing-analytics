# CPA Pricing Analytics

An explainable, browser-based pricing analytics prototype designed around the real workflow of a Taiwan CPA firm.

**[Open the live demo](https://christineliu0221-tech.github.io/cpa-pricing-analytics/)**

> **Privacy notice:** Every company name and financial figure in this public repository is synthetic. No client data, engagement records, or confidential firm information is included.

## Why I built it

Professional-service pricing often depends on fragmented historical records and experience-based judgment. This project explores a more consistent workflow: structure past engagements, model the factors that drive effort, and turn the result into an explainable pricing reference.

The project combines my accounting-domain experience with hands-on product design, data modeling, and frontend engineering.

## What it does

- Manages historical bookkeeping and annual tax-attestation engagements.
- Imports and exports CSV data and supports published Google Sheets CSV links.
- Fits an Ordinary Least Squares multiple linear regression model in the browser.
- Reports R², adjusted R², RMSE, coefficients, and per-factor contribution.
- Produces an indicative fee and a range based on `prediction ± 1.5 × RMSE`.
- Stores user-entered data locally in the browser; the demo has no application backend.

## Product workflow

```mermaid
flowchart LR
    A[Historical engagement data] --> B[Feature encoding]
    B --> C[OLS regression]
    C --> D[Model diagnostics]
    D --> E[Explainable fee reference]
```

## Technical highlights

- **Frontend:** semantic HTML, responsive CSS, vanilla JavaScript
- **Data handling:** Papa Parse for CSV workflows
- **Visualization:** Chart.js
- **Modeling:** OLS solved with Gaussian elimination, implemented in JavaScript
- **Persistence:** browser `localStorage`
- **Architecture:** static, dependency-light, and deployable on GitHub Pages

The model uses domain-informed feature encoding for engagement complexity, including service volume, revenue band, staffing, industry, add-on services, accounting readiness, audit scope, and risk.

## Run locally

No build step is required. Clone the repository and open `index.html` in a modern browser.

```bash
git clone https://github.com/christineliu0221-tech/cpa-pricing-analytics.git
cd cpa-pricing-analytics
```

Then open `index.html`, or serve the directory with any static web server.

## Using the demo

1. Select **載入範例數據** to load the synthetic dataset.
2. Open **回歸分析** to inspect model diagnostics and coefficients.
3. Open **報價計算機** to enter a hypothetical engagement and view the estimate.

The product interface is intentionally in Traditional Chinese because it was designed for Taiwan CPA workflows. The repository documentation is in English for an international portfolio audience.

## Responsible-use notes

This is a portfolio prototype, not production pricing, accounting, tax, or audit advice. OLS estimates can be unstable with small or highly correlated datasets. A production system should add stronger validation, access controls, encrypted storage, model monitoring, and professional review.

## Author

Built by [Christine Liu](https://github.com/christineliu0221-tech), combining CPA-domain knowledge with data and software product development.
