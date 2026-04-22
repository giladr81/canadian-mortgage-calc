# Canadian Mortgage Calculator

This project is a browser-based mortgage comparison tool that models multiple Canadian mortgage scenarios side by side.

It is designed to:
- compare up to five scenarios at once
- vary rate, amortization, payment frequency, term, and prepayments
- export comparison-oriented CSV output
- present term and full-payoff summaries without requiring a server

## Files

- `index.html` contains the page structure and scenario template
- `styles.css` contains layout and visual styling
- `calculator.js` contains the mortgage math engine
- `app.js` contains UI state, rendering, scenario actions, and CSV export

## Current behavior

The calculator currently:
- uses semi-annual nominal compounding converted to the selected payment frequency
- supports monthly, semi-monthly, bi-weekly, accelerated bi-weekly, weekly, and accelerated weekly payments
- supports one-time, yearly, and same-as-regular-payment prepayments
- computes term summaries and full amortization summaries from a generated payment schedule

## FCAC parity status

This calculator was built to mirror the FCAC mortgage calculator closely, but it is not yet FCAC-identical in every case.

### Cases that currently match well

For standard monthly schedules, the current engine matches the expected payment-count behavior:
- a `25-year` monthly mortgage produces exactly `300` payments
- a `20-year` monthly mortgage produces exactly `240` payments

For the following FCAC reference case:
- mortgage amount: `$100,000`
- interest rate: `5.00%`
- amortization: `20 years`
- payment frequency: `Accelerated Bi-weekly`
- term: `3 years`
- prepayment: `$0`

the local calculator matches FCAC on these values:
- mortgage payment: `$328.56`
- term number of payments: `78`
- term interest: `$13,999.78`
- term total cost: `$25,627.88`
- balance at end of term: `$88,371.90`

### Known differences versus FCAC

The same accelerated bi-weekly reference case still differs from FCAC on full-amortization totals by a small amount.

Observed local result:
- amortization number of payments: `455 + 1 final payment of $9.88`
- total interest: `$49,505.83`
- total cost: `$149,505.83`

Observed FCAC result:
- amortization number of payments: `455 + 1 final payment of $10.49`
- total interest: `$49,506.43`
- total cost: `$149,506.43`

Net difference:
- approximately `$0.60` on total interest
- approximately `$0.60` on total cost
- final payment differs by `$0.61`

These differences also flow through to “interest savings” rows because those rows are derived from the full-amortization totals.

## Important conclusion

The mismatch does not currently appear to be caused by the accelerated bi-weekly payment formula itself.

Why:
- the scheduled payment amount matches FCAC
- the term results match FCAC
- the divergence appears in the cumulative amortization schedule only

The most likely remaining cause is a schedule-rounding convention mismatch with FCAC’s implementation.

## Rounding investigation summary

Several rounding variants were tested during investigation:
- rounding the recurring payment to cents before schedule generation
- rounding interest each period
- rounding principal and/or balance each period
- rounding monthly payment before deriving accelerated payments

None of the straightforward rounding combinations reproduced both of these constraints at the same time:
1. `25-year monthly` must remain exactly `300` payments
2. `20-year accelerated bi-weekly` must match FCAC’s final payment and total interest exactly

One tempting change was to round the recurring payment before schedule generation. That improves some accelerated schedules, but it breaks monthly amortization by producing an extra final payment in cases that should end exactly on schedule.

Because of that, the current code intentionally preserves the exact-payment monthly behavior instead of forcing a partial fix for accelerated frequencies.

## CSV export behavior

CSV export is comparison-oriented rather than schedule-oriented.

The exported CSV currently includes:
- `Inputs`
- `Summary: Term`
- `Summary: Full Payoff`

Each scenario is exported as a separate column. Payment-by-payment and yearly schedules are intentionally omitted.

## UI behavior notes

The UI has been adjusted to avoid a few layout failures that were discovered during testing:
- adding a scenario now inherits inputs from the last scenario instead of resetting to defaults
- scenario cards no longer stretch awkwardly when an invalid scenario has less content than adjacent valid scenarios
- the scenario grid avoids squeezing four cards into a width that causes header overlap

## Limitations

- FCAC parity is close, but not exact for some non-monthly amortization totals
- payoff timeline is derived from payment count and payment frequency, then converted into months/years
- weekly and bi-weekly timelines are still displayed as rounded months, not exact calendar durations

## Next work if strict FCAC parity is required

To reach stricter parity, future work should:
- gather more FCAC reference cases across all payment frequencies
- compare both term and full-amortization outputs
- identify FCAC’s schedule-level rounding rules empirically
- update `calculator.js` only after verifying that monthly exact-payment cases still hold
