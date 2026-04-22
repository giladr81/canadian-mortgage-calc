const mortgageCalculatorApi = globalThis.MortgageCalculator;

if (!mortgageCalculatorApi) {
  throw new Error("Mortgage calculator engine failed to load.");
}

const {
  DEFAULT_INPUTS: defaultInputs,
  PAYMENT_FREQUENCIES: paymentFrequencies,
  PREPAYMENT_FREQUENCIES: prepaymentFrequencies,
  calculateScenario: runScenarioCalculation,
} = mortgageCalculatorApi;

const currencyFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-CA");

const scenarioGrid = document.querySelector("#scenario-grid");
const scenarioTemplate = document.querySelector("#scenario-template");
const comparisonTableWrap = document.querySelector("#comparison-table-wrap");
const addScenarioButton = document.querySelector("#add-scenario-button");
const exportButton = document.querySelector("#export-button");
const scenarioCountText = document.querySelector("#scenario-count-text");
const workspaceStatus = document.querySelector("#workspace-status");

const MAX_SCENARIOS = 5;
const AMORTIZATION_YEARS = Array.from({ length: 31 }, (_, index) => String(index));
const AMORTIZATION_MONTHS = Array.from({ length: 12 }, (_, index) => String(index));
const TERM_YEARS = Array.from({ length: 10 }, (_, index) => String(index + 1));

const state = {
  scenarios: [],
};

function generateScenarioId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `scenario-${globalThis.crypto.randomUUID()}`;
  }

  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createScenarioName(index) {
  return `Scenario ${String.fromCharCode(65 + index)}`;
}

function createScenario(sourceScenario) {
  const nextInputs = sourceScenario ? { ...sourceScenario.inputs } : { ...defaultInputs };

  return {
    id: generateScenarioId(),
    name: createScenarioName(state.scenarios.length),
    inputs: nextInputs,
    activeTab: "overview",
    calculation: runScenarioCalculation(nextInputs),
  };
}

function clearWorkspaceStatus() {
  if (!workspaceStatus) {
    return;
  }

  workspaceStatus.hidden = true;
  workspaceStatus.textContent = "";
}

function setWorkspaceStatus(message) {
  if (!workspaceStatus) {
    return;
  }

  workspaceStatus.hidden = false;
  workspaceStatus.textContent = message;
}

function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatPlainNumber(value) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatCellValue(value, format) {
  if (format === "currency" && typeof value === "number") {
    return formatCurrency(value);
  }

  if (typeof value === "number") {
    return formatPlainNumber(value);
  }

  return value;
}

function getScenario(id) {
  return state.scenarios.find((scenario) => scenario.id === id);
}

function fillSelect(select, values, labelBuilder, currentValue) {
  select.innerHTML = values
    .map((value) => {
      const selected = value === String(currentValue) ? ' selected="selected"' : "";
      return `<option value="${value}"${selected}>${labelBuilder(value)}</option>`;
    })
    .join("");
}

function createScenarioElement(scenario, options = {}) {
  const fragment = scenarioTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".scenario-card");
  card.dataset.scenarioId = scenario.id;
  if (options.isNew) {
    card.classList.add("scenario-card--new");
  }

  const nameInput = card.querySelector('[data-field="name"]');
  nameInput.value = scenario.name;

  card.querySelector(".scenario-card__subtitle").textContent =
    "FCAC-style mortgage inputs, summaries, and schedules for quick side-by-side comparison.";

  const mortgageAmountInput = card.querySelector('[data-field="mortgageAmount"]');
  const interestRateInput = card.querySelector('[data-field="interestRate"]');
  const amortizationYearsSelect = card.querySelector('[data-field="amortizationYears"]');
  const amortizationMonthsSelect = card.querySelector('[data-field="amortizationMonths"]');
  const paymentFrequencySelect = card.querySelector('[data-field="paymentFrequency"]');
  const termYearsSelect = card.querySelector('[data-field="termYears"]');
  const prepaymentAmountInput = card.querySelector('[data-field="prepaymentAmount"]');
  const prepaymentFrequencySelect = card.querySelector('[data-field="prepaymentFrequency"]');
  const startWithPaymentInput = card.querySelector('[data-field="startWithPayment"]');

  mortgageAmountInput.value = scenario.inputs.mortgageAmount;
  interestRateInput.value = scenario.inputs.interestRate;
  prepaymentAmountInput.value = scenario.inputs.prepaymentAmount;
  startWithPaymentInput.value = scenario.inputs.startWithPayment;

  fillSelect(
    amortizationYearsSelect,
    AMORTIZATION_YEARS,
    (value) => `${value} ${value === "1" ? "year" : "years"}`,
    scenario.inputs.amortizationYears
  );
  fillSelect(
    amortizationMonthsSelect,
    AMORTIZATION_MONTHS,
    (value) => `${value} ${value === "1" ? "month" : "months"}`,
    scenario.inputs.amortizationMonths
  );

  paymentFrequencySelect.innerHTML = Object.values(paymentFrequencies)
    .map((frequency) => {
      const selected = frequency.code === scenario.inputs.paymentFrequency ? ' selected="selected"' : "";
      return `<option value="${frequency.code}"${selected}>${frequency.label}</option>`;
    })
    .join("");

  fillSelect(
    termYearsSelect,
    TERM_YEARS,
    (value) => `${value} ${value === "1" ? "year" : "years"}`,
    scenario.inputs.termYears
  );

  prepaymentFrequencySelect.innerHTML = Object.values(prepaymentFrequencies)
    .map((frequency) => {
      const selected = frequency.code === scenario.inputs.prepaymentFrequency ? ' selected="selected"' : "";
      return `<option value="${frequency.code}"${selected}>${frequency.label}</option>`;
    })
    .join("");

  renderScenarioResults(card, scenario);
  return card;
}

function renderScenarioResults(card, scenario) {
  const results = card.querySelector(".scenario-card__results");
  const { calculation } = scenario;

  if (!calculation.valid) {
    results.innerHTML = `
      <section class="result-panel error-box" aria-live="polite">
        <strong>This scenario needs a few fixes before it can be calculated.</strong>
        <ul>${calculation.errors.map((error) => `<li>${error}</li>`).join("")}</ul>
      </section>
    `;
    return;
  }

  const { summaryRows, narrative, notes, metrics, schedule } = calculation;
  const paymentLabel =
    scenario.inputs.prepaymentAmount !== "0" && scenario.inputs.prepaymentFrequency === "SameAsRegPay"
      ? "Typical payment with prepayment"
      : "Regular payment";

  results.innerHTML = `
    <section class="result-panel">
      <dl class="metric-list">
        <div class="metric">
          <dt>${paymentLabel}</dt>
          <dd>${formatCurrency(metrics.typicalPayment)}</dd>
        </div>
        <div class="metric">
          <dt>Balance at term end</dt>
          <dd>${formatCurrency(metrics.termBalance)}</dd>
        </div>
        <div class="metric">
          <dt>Total interest</dt>
          <dd>${formatCurrency(metrics.totalInterest)}</dd>
        </div>
        <div class="metric">
          <dt>Payoff timeline</dt>
          <dd>${metrics.payoffDuration.years ? `${metrics.payoffDuration.years}y ` : ""}${metrics.payoffDuration.months}m</dd>
        </div>
      </dl>
    </section>

    <section class="result-panel">
      <div class="section-heading">
        <p class="section-heading__kicker">Calculation summary</p>
        <h3>Term and full-payoff totals</h3>
      </div>
      <div class="table-wrap">
        <table class="summary-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Term</th>
              <th scope="col">Amortization period</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRows
              .map(
                (row) => `
                  <tr>
                    <td>${row.label}</td>
                    <td>${formatCellValue(row.term, row.format)}</td>
                    <td>${formatCellValue(row.amortization, row.format)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="result-panel">
      <div class="result-tabs" role="tablist" aria-label="Scenario detail tabs">
        <button class="tab-button ${scenario.activeTab === "overview" ? "is-active" : ""}" data-action="tab" data-tab="overview" type="button">Overview</button>
        <button class="tab-button ${scenario.activeTab === "yearly" ? "is-active" : ""}" data-action="tab" data-tab="yearly" type="button">By year</button>
        <button class="tab-button ${scenario.activeTab === "payments" ? "is-active" : ""}" data-action="tab" data-tab="payments" type="button">Every payment</button>
      </div>
      ${renderDetailTab(scenario)}
    </section>
  `;
}

function renderDetailTab(scenario) {
  const { calculation } = scenario;
  const { schedule, narrative, notes } = calculation;

  if (scenario.activeTab === "yearly") {
    return `
      <div class="table-wrap">
        <table class="schedule-table">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Payment range</th>
              <th scope="col">Opening balance</th>
              <th scope="col">Regular payments</th>
              <th scope="col">Prepayments</th>
              <th scope="col">Principal</th>
              <th scope="col">Interest</th>
              <th scope="col">Total paid</th>
              <th scope="col">Closing balance</th>
            </tr>
          </thead>
          <tbody>
            ${schedule.yearlyRows
              .map(
                (row) => `
                  <tr>
                    <td>${row.yearNumber}</td>
                    <td>${row.startPayment} to ${row.endPayment}</td>
                    <td>${formatCurrency(row.openingBalance)}</td>
                    <td>${formatCurrency(row.regularPaid)}</td>
                    <td>${formatCurrency(row.prepayments)}</td>
                    <td>${formatCurrency(row.principal)}</td>
                    <td>${formatCurrency(row.interest)}</td>
                    <td>${formatCurrency(row.totalPaid)}</td>
                    <td>${formatCurrency(row.closingBalance)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  if (scenario.activeTab === "payments") {
    return `
      <div class="table-wrap">
        <table class="schedule-table">
          <thead>
            <tr>
              <th scope="col">Payment</th>
              <th scope="col">Year</th>
              <th scope="col">Starting balance</th>
              <th scope="col">Regular payment</th>
              <th scope="col">Prepayment</th>
              <th scope="col">Total payment</th>
              <th scope="col">Principal</th>
              <th scope="col">Interest</th>
              <th scope="col">Ending balance</th>
            </tr>
          </thead>
          <tbody>
            ${schedule.rows
              .map(
                (row) => `
                  <tr>
                    <td>${row.paymentNumber}</td>
                    <td>${row.yearNumber}</td>
                    <td>${formatCurrency(row.startingBalance)}</td>
                    <td>${formatCurrency(row.regularPaymentPortion)}</td>
                    <td>${formatCurrency(row.prepaymentPortion)}</td>
                    <td>${formatCurrency(row.totalPayment)}</td>
                    <td>${formatCurrency(row.principalPayment)}</td>
                    <td>${formatCurrency(row.interestPayment)}</td>
                    <td>${formatCurrency(row.endingBalance)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="summary-copy">
      <p>${narrative.overview}</p>
      <p>${narrative.amortization}</p>
      <p>${narrative.term}</p>
      ${notes
        .map(
          (note) => `
            <div class="callout ${note.tone === "muted" ? "callout--muted" : ""}">
              ${note.text}
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAllScenarios() {
  scenarioGrid.innerHTML = "";
  state.scenarios.forEach((scenario) => {
    scenario.calculation = runScenarioCalculation(scenario.inputs);
    scenarioGrid.appendChild(createScenarioElement(scenario));
  });
  renderComparisonBoard();
  updateToolbarState();
}

function focusScenarioCard(scenarioId) {
  const newCard = scenarioGrid.querySelector(`[data-scenario-id="${scenarioId}"]`);
  const nameInput = newCard?.querySelector(".scenario-card__name-input");

  if (!newCard) {
    return;
  }

  const focusWork = () => {
    newCard.scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
    if (nameInput) {
      nameInput.focus();
      nameInput.select();
    }
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(focusWork);
    return;
  }

  setTimeout(focusWork, 0);
}

function addScenario() {
  if (state.scenarios.length >= MAX_SCENARIOS) {
    return;
  }

  clearWorkspaceStatus();
  const previousScenario = state.scenarios[state.scenarios.length - 1];
  const scenario = createScenario(previousScenario);
  state.scenarios.push(scenario);
  renderAllScenarios();
  focusScenarioCard(scenario.id);
}

function updateToolbarState() {
  const count = state.scenarios.length;
  scenarioCountText.textContent = `${count} of ${MAX_SCENARIOS} scenario slots in use.`;
  addScenarioButton.disabled = count >= MAX_SCENARIOS;
  exportButton.disabled = !state.scenarios.some((scenario) => scenario.calculation.valid);
}

function renderComparisonBoard() {
  const validScenarios = state.scenarios.filter((scenario) => scenario.calculation.valid);

  if (!validScenarios.length) {
    comparisonTableWrap.innerHTML = `
      <div class="empty-state">
        Enter valid numbers in at least one scenario to see the comparison board.
      </div>
    `;
    return;
  }

  const rows = [
    {
      label: "Regular payment",
      render: (scenario) => formatCurrency(scenario.calculation.metrics.regularPayment),
    },
    {
      label: "Typical payment",
      render: (scenario) => {
        const typical = scenario.calculation.metrics.typicalPayment;
        const regular = scenario.calculation.metrics.regularPayment;

        if (Math.abs(typical - regular) < 0.005) {
          return `<strong>${formatCurrency(typical)}</strong>`;
        }

        return `<strong>${formatCurrency(typical)}</strong><span>${formatCurrency(
          regular
        )} regular + prepayment</span>`;
      },
    },
    {
      label: "Interest over term",
      render: (scenario) => formatCurrency(scenario.calculation.metrics.termInterest),
    },
    {
      label: "Balance at term end",
      render: (scenario) => formatCurrency(scenario.calculation.metrics.termBalance),
    },
    {
      label: "Total interest",
      render: (scenario) => formatCurrency(scenario.calculation.metrics.totalInterest),
    },
    {
      label: "Total savings in interest",
      render: (scenario) => formatCurrency(scenario.calculation.metrics.totalInterestSavings),
    },
    {
      label: "Payoff timeline",
      render: (scenario) => {
        const payoff = scenario.calculation.metrics.payoffDuration;
        const years = payoff.years ? `${payoff.years}y ` : "";
        return `${years}${payoff.months}m`;
      },
    },
  ];

  comparisonTableWrap.innerHTML = `
    <table class="comparison-table">
      <thead>
        <tr>
          <th scope="col">Metric</th>
          ${validScenarios
            .map((scenario) => `<th scope="col">${scenario.name || "Untitled scenario"}</th>`)
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${row.label}</td>
                ${validScenarios.map((scenario) => `<td>${row.render(scenario)}</td>`).join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function updateScenarioFromField(scenario, field, value) {
  if (field === "name") {
    scenario.name = value;
    return;
  }

  scenario.inputs[field] = value;
}

function handleFieldChange(event) {
  const target = event.target;
  const field = target.dataset.field;

  if (!field) {
    return;
  }

  const card = target.closest(".scenario-card");
  const scenario = getScenario(card.dataset.scenarioId);

  if (!scenario) {
    return;
  }

  updateScenarioFromField(scenario, field, target.value);
  scenario.calculation = runScenarioCalculation(scenario.inputs);
  renderScenarioResults(card, scenario);
  renderComparisonBoard();
  updateToolbarState();
}

function handleScenarioAction(event) {
  const actionButton = event.target.closest("[data-action]");

  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action;
  const card = actionButton.closest(".scenario-card");
  const scenario = card ? getScenario(card.dataset.scenarioId) : null;

  if (action === "tab" && scenario) {
    scenario.activeTab = actionButton.dataset.tab;
    renderScenarioResults(card, scenario);
    return;
  }

  if (action === "duplicate" && scenario) {
    if (state.scenarios.length >= MAX_SCENARIOS) {
      return;
    }

    clearWorkspaceStatus();
    const duplicate = {
      id: generateScenarioId(),
      name: `${scenario.name} copy`,
      inputs: { ...scenario.inputs },
      activeTab: scenario.activeTab,
      calculation: runScenarioCalculation(scenario.inputs),
    };
    state.scenarios.push(duplicate);
    renderAllScenarios();
    focusScenarioCard(duplicate.id);
    return;
  }

  if (action === "remove" && scenario) {
    if (state.scenarios.length === 1) {
      return;
    }

    state.scenarios = state.scenarios.filter((item) => item.id !== scenario.id);
    renderAllScenarios();
  }
}

function escapeCsvCell(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildCsv() {
  const rows = [];
  const validScenarios = state.scenarios.filter((scenario) => scenario.calculation.valid);
  const scenarioNames = validScenarios.map((scenario) => scenario.name || "Untitled scenario");

  const appendSection = (title, metrics) => {
    rows.push([title, ...scenarioNames]);
    metrics.forEach(([label, getValue]) => {
      rows.push([label, ...validScenarios.map((scenario) => getValue(scenario))]);
    });
    rows.push([]);
  };

  appendSection("Inputs", [
    ["Mortgage amount", (scenario) => formatCurrency(scenario.calculation.inputs.mortgageAmount)],
    ["Interest rate", (scenario) => `${scenario.calculation.inputs.interestRate.toFixed(2)}%`],
    [
      "Amortization period",
      (scenario) =>
        `${scenario.calculation.inputs.amortizationYears} years ${scenario.calculation.inputs.amortizationMonths} months`,
    ],
    [
      "Payment frequency",
      (scenario) => paymentFrequencies[scenario.calculation.inputs.paymentFrequency].label,
    ],
    ["Term", (scenario) => `${scenario.calculation.inputs.termYears} years`],
    ["Prepayment amount", (scenario) => formatCurrency(scenario.calculation.inputs.prepaymentAmount)],
    [
      "Prepayment frequency",
      (scenario) => prepaymentFrequencies[scenario.calculation.inputs.prepaymentFrequency].label,
    ],
    ["Start with payment", (scenario) => scenario.calculation.inputs.startWithPayment],
  ]);

  appendSection("Summary: Term", [
    [
      "Regular payment",
      (scenario) => formatCurrency(scenario.calculation.metrics.regularPayment),
    ],
    [
      "Typical payment",
      (scenario) => formatCurrency(scenario.calculation.metrics.typicalPayment),
    ],
    [
      "Interest over term",
      (scenario) => formatCurrency(scenario.calculation.metrics.termInterest),
    ],
    [
      "Principal paid over term",
      (scenario) => {
        const principalRow = scenario.calculation.summaryRows.find(
          (row) => row.label === "Principal paid"
        );
        return principalRow ? formatCellValue(principalRow.term, principalRow.format) : "";
      },
    ],
    [
      "Total cost over term",
      (scenario) => {
        const totalCostRow = scenario.calculation.summaryRows.find(
          (row) => row.label === "Total cost"
        );
        return totalCostRow ? formatCellValue(totalCostRow.term, totalCostRow.format) : "";
      },
    ],
    [
      "Balance at term end",
      (scenario) => formatCurrency(scenario.calculation.metrics.termBalance),
    ],
  ]);

  appendSection("Summary: Full Payoff", [
    [
      "Total interest",
      (scenario) => formatCurrency(scenario.calculation.metrics.totalInterest),
    ],
    [
      "Principal paid over full payoff",
      (scenario) => {
        const principalRow = scenario.calculation.summaryRows.find(
          (row) => row.label === "Principal paid"
        );
        return principalRow ? formatCellValue(principalRow.amortization, principalRow.format) : "";
      },
    ],
    [
      "Total cost over full payoff",
      (scenario) => {
        const totalCostRow = scenario.calculation.summaryRows.find(
          (row) => row.label === "Total cost"
        );
        return totalCostRow ? formatCellValue(totalCostRow.amortization, totalCostRow.format) : "";
      },
    ],
    [
      "Total savings in interest",
      (scenario) => formatCurrency(scenario.calculation.metrics.totalInterestSavings),
    ],
    [
      "Payoff timeline",
      (scenario) => {
        const payoff = scenario.calculation.metrics.payoffDuration;
        return `${payoff.years ? `${payoff.years}y ` : ""}${payoff.months}m`;
      },
    ],
  ]);

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function exportCsv() {
  const csv = buildCsv();
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  anchor.href = url;
  anchor.download = `mortgage-scenarios-${stamp}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

addScenarioButton.addEventListener("click", () => {
  try {
    addScenario();
  } catch (error) {
    console.error(error);
    setWorkspaceStatus(`Add scenario failed: ${error.message}`);
  }
});

exportButton.addEventListener("click", exportCsv);
scenarioGrid.addEventListener("input", (event) => {
  try {
    clearWorkspaceStatus();
    handleFieldChange(event);
  } catch (error) {
    console.error(error);
    setWorkspaceStatus(`Update failed: ${error.message}`);
  }
});
scenarioGrid.addEventListener("change", (event) => {
  try {
    clearWorkspaceStatus();
    handleFieldChange(event);
  } catch (error) {
    console.error(error);
    setWorkspaceStatus(`Update failed: ${error.message}`);
  }
});
scenarioGrid.addEventListener("click", (event) => {
  try {
    clearWorkspaceStatus();
    handleScenarioAction(event);
  } catch (error) {
    console.error(error);
    setWorkspaceStatus(`Scenario action failed: ${error.message}`);
  }
});

state.scenarios.push(createScenario());
renderAllScenarios();
