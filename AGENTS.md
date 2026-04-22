# AGENTS.md

## Project overview

This project is a static browser app for comparing Canadian mortgage scenarios side by side.

Core files:
- `calculator.js`: amortization engine and summary math
- `app.js`: DOM rendering, scenario state, scenario actions, CSV export
- `index.html`: page shell and scenario template
- `styles.css`: layout and responsive behavior

## Current product decisions

- New scenarios inherit inputs from the most recent scenario.
- CSV export is side-by-side comparison data only.
- The app does not export yearly or payment schedules to CSV.
- Layout is biased toward stable 1-3 column scenario grids on common desktop widths.

## FCAC compatibility notes

The app is intended to track FCAC-style behavior, but there is a known unresolved difference in some full-amortization non-monthly cases.

### Verified monthly baseline behavior

Do not break these:
- `25-year monthly` mortgages should remain exactly `300` payments
- `20-year monthly` mortgages should remain exactly `240` payments

These are currently satisfied by the existing engine.

### Known mismatch case

Reference case:
- mortgage amount: `$100,000`
- interest rate: `5.00%`
- amortization: `20 years`
- payment frequency: `Accelerated Bi-weekly`
- term: `3 years`
- prepayment: `$0`

Current local results:
- payment: `$328.56`
- term payments: `78`
- term interest: `$13,999.78`
- term total cost: `$25,627.88`
- term-end balance: `$88,371.90`
- amortization payments: `455 + 1 final payment of $9.88`
- amortization interest: `$49,505.83`
- amortization total cost: `$149,505.83`

Observed FCAC results:
- payment: `$328.56`
- term payments: `78`
- term interest: `$13,999.78`
- term total cost: `$25,627.88`
- term-end balance: `$88,371.90`
- amortization payments: `455 + 1 final payment of $10.49`
- amortization interest: `$49,506.43`
- amortization total cost: `$149,506.43`

Interpretation:
- payment-frequency selection logic looks correct
- schedule-level rounding still differs slightly from FCAC
- differences are small but real and propagate into savings rows

## What was tested already

The following approaches were investigated and were not accepted as-is:
- rounding recurring payments to cents before generating the schedule
- rounding interest every period
- rounding principal every period
- rounding balance every period
- combinations of the above

Why these were rejected:
- some combinations get the accelerated bi-weekly case closer
- but they break exact monthly amortization cases by introducing an extra final payment

In particular, forcing cent-rounded recurring payments caused a `25-year monthly` case to become `301` payments instead of `300`. That change was reverted.

## Guidance for future changes

If you touch `calculator.js`:
- verify monthly baseline cases first
- verify at least one accelerated bi-weekly FCAC comparison case
- do not assume a cents-only fix is safe
- treat payment count and final payment as separate checks

Recommended regression cases:
1. `$100,000`, `5%`, `25 years`, `Monthly`, `5-year term`, no prepayment
Expected:
- payment count `300`
- payoff timeline `25y 0m`
- `Number of payments` summary row should be `300`

2. `$100,000`, `5%`, `20 years`, `Accelerated Bi-weekly`, `3-year term`, no prepayment
Expected local target today:
- payment `$328.56`
- term payments `78`
- term interest `$13,999.78`
- term balance `$88,371.90`

Expected FCAC target:
- amortization final payment `$10.49`
- amortization interest `$49,506.43`

## UI notes

If you touch `styles.css`:
- preserve non-stretched invalid scenario cards
- preserve clean wrapping of card headers and action buttons
- avoid restoring 4-column desktop layouts unless card minimum widths are revisited carefully

If you touch `app.js`:
- preserve inherited values on `Add scenario`
- preserve side-by-side CSV export
- do not reintroduce top-level global name collisions with `calculator.js`

## Documentation intent

Keep this file factual. It is for future maintainers and coding agents, not end users.

If FCAC parity work continues, update this file with:
- the exact reference inputs used
- local result
- FCAC result
- conclusion about which hypotheses were eliminated
