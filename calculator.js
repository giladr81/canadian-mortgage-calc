const PAYMENT_FREQUENCIES = {
  AccW: {
    code: "AccW",
    label: "Accelerated Weekly",
    shortLabel: "Accelerated weekly",
    perYear: 52,
    accelerated: true,
    monthlyDivisor: 4,
  },
  W: {
    code: "W",
    label: "Weekly",
    shortLabel: "Weekly",
    perYear: 52,
    accelerated: false,
  },
  AccBiW: {
    code: "AccBiW",
    label: "Accelerated Bi-weekly",
    shortLabel: "Accelerated bi-weekly",
    perYear: 26,
    accelerated: true,
    monthlyDivisor: 2,
  },
  BiW: {
    code: "BiW",
    label: "Bi-Weekly (every 2 weeks)",
    shortLabel: "Bi-weekly",
    perYear: 26,
    accelerated: false,
  },
  SemiM: {
    code: "SemiM",
    label: "Semi-monthly (24x per year)",
    shortLabel: "Semi-monthly",
    perYear: 24,
    accelerated: false,
  },
  M: {
    code: "M",
    label: "Monthly (12x per year)",
    shortLabel: "Monthly",
    perYear: 12,
    accelerated: false,
  },
};

const PREPAYMENT_FREQUENCIES = {
  "1": {
    code: "1",
    label: "One time",
  },
  Y: {
    code: "Y",
    label: "Each year",
  },
  SameAsRegPay: {
    code: "SameAsRegPay",
    label: "Same as regular payment",
  },
};

const DEFAULT_INPUTS = {
  mortgageAmount: "100000",
  interestRate: "5.00",
  amortizationYears: "25",
  amortizationMonths: "0",
  paymentFrequency: "M",
  termYears: "5",
  prepaymentAmount: "0",
  prepaymentFrequency: "1",
  startWithPayment: "1",
};

function asCurrencyText(value) {
  const rounded = roundMoney(value);
  const parts = rounded.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${parts.join(".")}`;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampMinimum(value, min) {
  return Number.isFinite(value) ? Math.max(value, min) : value;
}

function parseNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value !== "string") {
    return NaN;
  }

  const cleaned = value.replace(/,/g, "").trim();

  if (!cleaned) {
    return NaN;
  }

  return Number(cleaned);
}

function parseInteger(value) {
  const parsed = parseNumber(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function getPeriodicRate(annualRatePercent, paymentsPerYear) {
  const annualRate = annualRatePercent / 100;
  return Math.pow(1 + annualRate / 2, 2 / paymentsPerYear) - 1;
}

function getAmortizingPayment(principal, periodicRate, totalPeriods) {
  if (totalPeriods <= 0) {
    return 0;
  }

  if (Math.abs(periodicRate) < 1e-10) {
    return principal / totalPeriods;
  }

  return (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -totalPeriods));
}

function getRegularPayment(inputs) {
  const monthlyRate = getPeriodicRate(inputs.interestRate, 12);
  const monthlyPayment = getAmortizingPayment(
    inputs.mortgageAmount,
    monthlyRate,
    inputs.totalAmortizationMonths
  );
  const frequency = PAYMENT_FREQUENCIES[inputs.paymentFrequency];

  if (frequency.accelerated) {
    return monthlyPayment / frequency.monthlyDivisor;
  }

  const periodicRate = getPeriodicRate(inputs.interestRate, frequency.perYear);
  const periods = (inputs.totalAmortizationMonths * frequency.perYear) / 12;
  return getAmortizingPayment(inputs.mortgageAmount, periodicRate, periods);
}

function getScheduledPrepayment(inputs, paymentNumber, paymentsPerYear) {
  const amount = inputs.prepaymentAmount;

  if (amount <= 0 || paymentNumber < inputs.startWithPayment) {
    return 0;
  }

  if (inputs.prepaymentFrequency === "1") {
    return paymentNumber === inputs.startWithPayment ? amount : 0;
  }

  if (inputs.prepaymentFrequency === "Y") {
    return (paymentNumber - inputs.startWithPayment) % paymentsPerYear === 0 ? amount : 0;
  }

  return amount;
}

function getRoundedDurationMonths(paymentCount, paymentsPerYear) {
  if (paymentCount <= 0) {
    return 0;
  }

  return Math.max(1, Math.round((paymentCount * 12) / paymentsPerYear));
}

function splitDuration(totalMonths) {
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
  };
}

function summarizeRows(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.totalPaid += row.totalPayment;
      summary.regularPaid += row.regularPaymentPortion;
      summary.prepayments += row.prepaymentPortion;
      summary.principal += row.principalPayment;
      summary.interest += row.interestPayment;
      return summary;
    },
    {
      totalPaid: 0,
      regularPaid: 0,
      prepayments: 0,
      principal: 0,
      interest: 0,
    }
  );
}

function aggregateYearlySchedule(rows, paymentsPerYear) {
  const yearly = [];

  for (let index = 0; index < rows.length; index += paymentsPerYear) {
    const chunk = rows.slice(index, index + paymentsPerYear);
    const totals = summarizeRows(chunk);
    yearly.push({
      yearNumber: yearly.length + 1,
      startPayment: chunk[0].paymentNumber,
      endPayment: chunk[chunk.length - 1].paymentNumber,
      openingBalance: chunk[0].startingBalance,
      regularPaid: totals.regularPaid,
      prepayments: totals.prepayments,
      principal: totals.principal,
      interest: totals.interest,
      totalPaid: totals.totalPaid,
      closingBalance: chunk[chunk.length - 1].endingBalance,
    });
  }

  return yearly;
}

function buildSchedule(inputs) {
  const frequency = PAYMENT_FREQUENCIES[inputs.paymentFrequency];
  const regularPayment = getRegularPayment(inputs);
  const periodicRate = getPeriodicRate(inputs.interestRate, frequency.perYear);
  const rows = [];
  let balance = inputs.mortgageAmount;
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  let cumulativePaid = 0;
  let paymentNumber = 0;

  while (balance > 1e-8 && paymentNumber < 5000) {
    paymentNumber += 1;
    const startingBalance = balance;
    const scheduledPrepayment = getScheduledPrepayment(
      inputs,
      paymentNumber,
      frequency.perYear
    );
    const interestPayment = startingBalance * periodicRate;
    const plannedPayment = regularPayment + scheduledPrepayment;
    const totalPayment = Math.min(plannedPayment, startingBalance + interestPayment);
    const principalPayment = totalPayment - interestPayment;
    const prepaymentPortion =
      totalPayment > regularPayment
        ? Math.min(scheduledPrepayment, totalPayment - regularPayment)
        : 0;
    const regularPaymentPortion = totalPayment - prepaymentPortion;
    balance = Math.max(0, startingBalance - principalPayment);
    cumulativeInterest += interestPayment;
    cumulativePrincipal += principalPayment;
    cumulativePaid += totalPayment;

    rows.push({
      paymentNumber,
      yearNumber: Math.floor((paymentNumber - 1) / frequency.perYear) + 1,
      startingBalance,
      regularPaymentPortion,
      prepaymentPortion,
      totalPayment,
      principalPayment,
      interestPayment,
      endingBalance: balance,
      cumulativeInterest,
      cumulativePrincipal,
      cumulativePaid,
    });
  }

  return {
    inputs,
    frequency,
    periodicRate,
    regularPayment,
    rows,
    yearlyRows: aggregateYearlySchedule(rows, frequency.perYear),
    roundedPayoffMonths: getRoundedDurationMonths(rows.length, frequency.perYear),
  };
}

function describeCount(rows, schedule, inputs) {
  if (!rows.length) {
    return "0";
  }

  const scheduleFinished = rows[rows.length - 1].endingBalance <= 1e-8;

  if (!scheduleFinished) {
    return String(rows.length);
  }

  const typicalPayment =
    inputs.prepaymentFrequency === "SameAsRegPay"
      ? schedule.regularPayment + inputs.prepaymentAmount
      : schedule.regularPayment;
  const finalPayment = rows[rows.length - 1].totalPayment;

  if (rows.length > 1 && finalPayment < typicalPayment - 0.005) {
    return `${rows.length - 1} + 1 final payment of ${asCurrencyText(finalPayment)}`;
  }

  return String(rows.length);
}

function buildNotes(actualSchedule, sameFrequencyBaseline, monthlyBaseline) {
  const inputs = actualSchedule.inputs;
  const actualTotals = summarizeRows(actualSchedule.rows);
  const sameFrequencyTotals = summarizeRows(sameFrequencyBaseline.rows);
  const monthlyTotals = summarizeRows(monthlyBaseline.rows);
  const notes = [];

  if (inputs.prepaymentAmount > 0) {
    const sooner = Math.max(
      0,
      sameFrequencyBaseline.roundedPayoffMonths - actualSchedule.roundedPayoffMonths
    );
    const interestSaved = Math.max(0, sameFrequencyTotals.interest - actualTotals.interest);

    if (interestSaved > 0) {
      notes.push({
        tone: "accent",
        text: `Compared with the same payment frequency and no prepayments, this plan saves about ${asCurrencyText(
          interestSaved
        )} in interest${sooner > 0 ? ` and pays the mortgage off about ${sooner} months sooner` : ""}.`,
      });
    }
  }

  if (inputs.paymentFrequency !== "M") {
    const nonMonthlySaved = Math.max(0, monthlyTotals.interest - sameFrequencyTotals.interest);
    if (nonMonthlySaved > 0) {
      notes.push({
        tone: "muted",
        text: `Choosing ${PAYMENT_FREQUENCIES[inputs.paymentFrequency].shortLabel.toLowerCase()} instead of monthly saves about ${asCurrencyText(
          nonMonthlySaved
        )} in interest before any prepayment savings are added.`,
      });
    }
  }

  if (actualSchedule.rows.length < inputs.termYears * actualSchedule.frequency.perYear) {
    notes.push({
      tone: "accent",
      text: "This mortgage would be fully paid off before the selected term ends.",
    });
  }

  return notes;
}

function buildNarrative(actualSchedule) {
  const inputs = actualSchedule.inputs;
  const totals = summarizeRows(actualSchedule.rows);
  const termPaymentLimit = inputs.termYears * actualSchedule.frequency.perYear;
  const termRows = actualSchedule.rows.slice(0, Math.min(termPaymentLimit, actualSchedule.rows.length));
  const termTotals = summarizeRows(termRows);
  const termBalance = termRows.length ? termRows[termRows.length - 1].endingBalance : inputs.mortgageAmount;
  const payoff = splitDuration(actualSchedule.roundedPayoffMonths);
  const paymentFrequencyLabel = actualSchedule.frequency.shortLabel.toLowerCase();
  const regularPayment = roundMoney(actualSchedule.regularPayment);
  const typicalPayment =
    inputs.prepaymentFrequency === "SameAsRegPay"
      ? regularPayment + roundMoney(inputs.prepaymentAmount)
      : regularPayment;

  const timingParts = [];
  if (payoff.years > 0) {
    timingParts.push(`${payoff.years} year${payoff.years === 1 ? "" : "s"}`);
  }
  if (payoff.months > 0) {
    timingParts.push(`${payoff.months} month${payoff.months === 1 ? "" : "s"}`);
  }

  const timingText = timingParts.length ? timingParts.join(", ") : "less than 1 month";
  const paymentText =
    inputs.prepaymentAmount > 0 && inputs.prepaymentFrequency === "SameAsRegPay"
      ? `Most payments are ${asCurrencyText(typicalPayment)} total (${asCurrencyText(
          regularPayment
        )} regular + ${asCurrencyText(inputs.prepaymentAmount)} prepayment).`
      : `The regular payment is ${asCurrencyText(regularPayment)} per ${paymentFrequencyLabel} period.`;

  return {
    overview: `At this pace, the mortgage is paid off in about ${timingText}. ${paymentText}`,
    amortization: `Across the full payoff period, you pay about ${asCurrencyText(
      totals.principal
    )} in principal and ${asCurrencyText(totals.interest)} in interest.`,
    term: `Over the ${inputs.termYears}-year term, you pay about ${asCurrencyText(
      termTotals.interest
    )} in interest and finish with a remaining balance of ${asCurrencyText(termBalance)}.`,
  };
}

function buildSummaryRows(actualSchedule, sameFrequencyBaseline, monthlyBaseline) {
  const inputs = actualSchedule.inputs;
  const getTermRows = (schedule) => {
    const termPaymentLimit = inputs.termYears * schedule.frequency.perYear;
    return schedule.rows.slice(0, Math.min(termPaymentLimit, schedule.rows.length));
  };
  const termRows = getTermRows(actualSchedule);
  const termTotals = summarizeRows(termRows);
  const amortizationTotals = summarizeRows(actualSchedule.rows);
  const termBalance = termRows.length ? termRows[termRows.length - 1].endingBalance : inputs.mortgageAmount;
  const sameFrequencyTermTotals = summarizeRows(getTermRows(sameFrequencyBaseline));
  const monthlyTermTotals = summarizeRows(getTermRows(monthlyBaseline));
  const rows = [
    {
      label: "Number of payments",
      term: describeCount(termRows, actualSchedule, inputs),
      amortization: describeCount(actualSchedule.rows, actualSchedule, inputs),
    },
    {
      label: "Mortgage payment",
      term: roundMoney(actualSchedule.regularPayment),
      amortization: roundMoney(actualSchedule.regularPayment),
      format: "currency",
    },
    {
      label: "Prepayment",
      term: roundMoney(inputs.prepaymentAmount),
      amortization: roundMoney(inputs.prepaymentAmount),
      format: "currency",
    },
    {
      label: "Principal paid",
      term: roundMoney(termTotals.principal),
      amortization: roundMoney(amortizationTotals.principal),
      format: "currency",
    },
    {
      label: "Interest paid",
      term: roundMoney(termTotals.interest),
      amortization: roundMoney(amortizationTotals.interest),
      format: "currency",
    },
    {
      label: "Total cost",
      term: roundMoney(termTotals.totalPaid),
      amortization: roundMoney(amortizationTotals.totalPaid),
      format: "currency",
    },
  ];

  if (inputs.prepaymentAmount > 0) {
    rows.push({
      label: "Interest savings with prepayment",
      term: roundMoney(Math.max(0, sameFrequencyTermTotals.interest - termTotals.interest)),
      amortization: roundMoney(
        Math.max(0, summarizeRows(sameFrequencyBaseline.rows).interest - amortizationTotals.interest)
      ),
      format: "currency",
    });
  }

  if (inputs.paymentFrequency !== "M") {
    rows.push({
      label: "Interest savings with non-monthly plan",
      term: roundMoney(Math.max(0, monthlyTermTotals.interest - sameFrequencyTermTotals.interest)),
      amortization: roundMoney(
        Math.max(0, summarizeRows(monthlyBaseline.rows).interest - summarizeRows(sameFrequencyBaseline.rows).interest)
      ),
      format: "currency",
    });
  }

  if (inputs.prepaymentAmount > 0 || inputs.paymentFrequency !== "M") {
    rows.push({
      label: "Total savings in interest",
      term: roundMoney(Math.max(0, monthlyTermTotals.interest - termTotals.interest)),
      amortization: roundMoney(
        Math.max(0, summarizeRows(monthlyBaseline.rows).interest - amortizationTotals.interest)
      ),
      format: "currency",
    });
  }

  rows.push({
    label: "Balance at term end",
    term: roundMoney(termBalance),
    amortization: 0,
    format: "currency",
  });

  return rows;
}

function normalizeInputs(rawInputs) {
  const normalized = {
    mortgageAmount: parseNumber(rawInputs.mortgageAmount),
    interestRate: parseNumber(rawInputs.interestRate),
    amortizationYears: parseInteger(rawInputs.amortizationYears),
    amortizationMonths: parseInteger(rawInputs.amortizationMonths),
    paymentFrequency: rawInputs.paymentFrequency,
    termYears: parseInteger(rawInputs.termYears),
    prepaymentAmount: parseNumber(rawInputs.prepaymentAmount),
    prepaymentFrequency: rawInputs.prepaymentFrequency,
    startWithPayment: parseInteger(rawInputs.startWithPayment),
  };
  const errors = [];

  if (!Number.isFinite(normalized.mortgageAmount) || normalized.mortgageAmount <= 0) {
    errors.push("Mortgage amount must be greater than 0.");
  }

  if (!Number.isFinite(normalized.interestRate) || normalized.interestRate <= 0) {
    errors.push("Interest rate must be greater than 0.");
  }

  if (!Number.isFinite(normalized.amortizationYears) || normalized.amortizationYears < 0) {
    errors.push("Amortization years must be 0 or more.");
  }

  if (
    !Number.isFinite(normalized.amortizationMonths) ||
    normalized.amortizationMonths < 0 ||
    normalized.amortizationMonths > 11
  ) {
    errors.push("Amortization months must be between 0 and 11.");
  }

  normalized.totalAmortizationMonths =
    normalized.amortizationYears * 12 + normalized.amortizationMonths;

  if (!Number.isFinite(normalized.totalAmortizationMonths) || normalized.totalAmortizationMonths <= 0) {
    errors.push("Amortization period must be at least 1 month.");
  }

  if (normalized.totalAmortizationMonths > 360) {
    errors.push("Amortization period cannot exceed 30 years.");
  }

  if (!PAYMENT_FREQUENCIES[normalized.paymentFrequency]) {
    errors.push("Select a valid payment frequency.");
  }

  if (!Number.isFinite(normalized.termYears) || normalized.termYears < 1 || normalized.termYears > 10) {
    errors.push("Term must be between 1 and 10 years.");
  }

  if (!Number.isFinite(normalized.prepaymentAmount) || normalized.prepaymentAmount < 0) {
    errors.push("Prepayment amount must be 0 or more.");
  }

  if (!PREPAYMENT_FREQUENCIES[normalized.prepaymentFrequency]) {
    errors.push("Select a valid prepayment frequency.");
  }

  if (!Number.isFinite(normalized.startWithPayment) || normalized.startWithPayment < 1) {
    errors.push("Start with payment must be 1 or greater.");
  }

  normalized.mortgageAmount = clampMinimum(normalized.mortgageAmount, 0);
  normalized.interestRate = clampMinimum(normalized.interestRate, 0);
  normalized.prepaymentAmount = clampMinimum(normalized.prepaymentAmount, 0);

  return {
    valid: errors.length === 0,
    errors,
    inputs: normalized,
  };
}

function calculateScenario(rawInputs) {
  const normalized = normalizeInputs(rawInputs);

  if (!normalized.valid) {
    return {
      valid: false,
      errors: normalized.errors,
      inputs: normalized.inputs,
    };
  }

  const inputs = normalized.inputs;
  const actualSchedule = buildSchedule(inputs);
  const sameFrequencyBaseline = buildSchedule({
    ...inputs,
    prepaymentAmount: 0,
    prepaymentFrequency: "1",
    startWithPayment: 1,
  });
  const monthlyBaseline = buildSchedule({
    ...inputs,
    paymentFrequency: "M",
    prepaymentAmount: 0,
    prepaymentFrequency: "1",
    startWithPayment: 1,
  });
  const actualTotals = summarizeRows(actualSchedule.rows);
  const termPaymentLimit = inputs.termYears * actualSchedule.frequency.perYear;
  const termRows = actualSchedule.rows.slice(0, Math.min(termPaymentLimit, actualSchedule.rows.length));
  const termTotals = summarizeRows(termRows);
  const termBalance = termRows.length ? termRows[termRows.length - 1].endingBalance : inputs.mortgageAmount;
  const payoffDuration = splitDuration(actualSchedule.roundedPayoffMonths);
  const typicalPayment =
    inputs.prepaymentFrequency === "SameAsRegPay"
      ? actualSchedule.regularPayment + inputs.prepaymentAmount
      : actualSchedule.regularPayment;
  const totalInterestSavings = Math.max(
    0,
    summarizeRows(monthlyBaseline.rows).interest - actualTotals.interest
  );

  return {
    valid: true,
    inputs,
    schedule: actualSchedule,
    summaryRows: buildSummaryRows(actualSchedule, sameFrequencyBaseline, monthlyBaseline),
    narrative: buildNarrative(actualSchedule),
    notes: buildNotes(actualSchedule, sameFrequencyBaseline, monthlyBaseline),
    metrics: {
      regularPayment: roundMoney(actualSchedule.regularPayment),
      typicalPayment: roundMoney(typicalPayment),
      termInterest: roundMoney(termTotals.interest),
      termBalance: roundMoney(termBalance),
      totalInterest: roundMoney(actualTotals.interest),
      totalCost: roundMoney(actualTotals.totalPaid),
      totalInterestSavings: roundMoney(totalInterestSavings),
      payoffMonths: actualSchedule.roundedPayoffMonths,
      payoffDuration,
      paymentCount: actualSchedule.rows.length,
      configuredPrepayment: roundMoney(inputs.prepaymentAmount),
    },
  };
}

globalThis.MortgageCalculator = {
  PAYMENT_FREQUENCIES,
  PREPAYMENT_FREQUENCIES,
  DEFAULT_INPUTS,
  normalizeInputs,
  calculateScenario,
};
