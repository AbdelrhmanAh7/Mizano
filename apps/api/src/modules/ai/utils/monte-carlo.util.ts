/**
 * Monte Carlo Simulation Utilities for Cash Flow Prediction
 * Implements probabilistic simulation for cash flow forecasting
 */

export interface CashFlowEvent {
  id: string;
  date: Date;
  amount: number;
  type: 'inflow' | 'outflow';
  source: 'ar' | 'ap' | 'payroll' | 'recurring' | 'other';
  variability: 'fixed' | 'timing' | 'amount';
  predictedDate?: Date; // For AR items with payment prediction
  confidence?: number; // 0-1, higher = more likely on predicted date
  entityId?: string;
  entityName?: string;
}

export interface MonteCarloParams {
  currentCash: number;
  events: CashFlowEvent[];
  horizonDays: number;
  runs: number;
}

export interface DailyBalance {
  date: Date;
  openingBalance: number;
  inflows: number;
  outflows: number;
  closingBalance: number;
  inflowDetails: { source: string; amount: number }[];
  outflowDetails: { source: string; amount: number }[];
}

export interface MonteCarloResult {
  dailyBalances: DailyBalance[][];
  percentiles: {
    p10: number[];
    p50: number[];
    p90: number[];
  };
  minBalance: number;
  minBalanceDate: Date | null;
  daysUntilNegative: number | null;
}

/**
 * Randomize AR collection date based on payment prediction confidence
 * Distribution:
 * - 70%: On predicted date
 * - 20%: Delayed 1-14 days
 * - 10%: Delayed 15-30 days
 */
function randomizeARDate(predictedDate: Date, confidence: number = 0.7): Date {
  const random = Math.random();
  const result = new Date(predictedDate);

  // Higher confidence = more likely to be on time
  const onTimeThreshold = 0.5 + confidence * 0.3; // 50-80% on time based on confidence
  const shortDelayThreshold = onTimeThreshold + 0.25; // Next 25% short delay

  if (random < onTimeThreshold) {
    // On time
    return result;
  } else if (random < shortDelayThreshold) {
    // Short delay: 1-14 days
    const delayDays = Math.floor(Math.random() * 14) + 1;
    result.setDate(result.getDate() + delayDays);
  } else {
    // Long delay: 15-30 days
    const delayDays = Math.floor(Math.random() * 16) + 15;
    result.setDate(result.getDate() + delayDays);
  }

  return result;
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Calculate percentile from sorted array
 */
function getPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Run Monte Carlo simulation for cash flow prediction
 *
 * @param params Simulation parameters
 * @returns Simulation results with percentiles
 */
export function runCashFlowMonteCarlo(params: MonteCarloParams): MonteCarloResult {
  const { currentCash, events, horizonDays, runs } = params;
  const dailyBalancesAllRuns: DailyBalance[][] = [];
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  for (let run = 0; run < runs; run++) {
    const runBalances: DailyBalance[] = [];
    let balance = currentCash;

    // Clone and randomize events for this run
    const runEvents = events.map((e) => {
      const eventCopy = { ...e, date: new Date(e.date) };

      // Randomize AR timing
      if (
        eventCopy.type === 'inflow' &&
        eventCopy.source === 'ar' &&
        eventCopy.predictedDate
      ) {
        eventCopy.date = randomizeARDate(
          eventCopy.predictedDate,
          eventCopy.confidence || 0.7,
        );
      }

      return eventCopy;
    });

    // Simulate each day
    for (let day = 0; day <= horizonDays; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);

      const openingBalance = balance;
      let dayInflows = 0;
      let dayOutflows = 0;
      const inflowDetails: { source: string; amount: number }[] = [];
      const outflowDetails: { source: string; amount: number }[] = [];

      // Process events for this day
      for (const event of runEvents) {
        if (isSameDay(event.date, currentDate)) {
          if (event.type === 'inflow') {
            dayInflows += event.amount;
            inflowDetails.push({ source: event.source, amount: event.amount });
          } else {
            dayOutflows += event.amount;
            outflowDetails.push({ source: event.source, amount: event.amount });
          }
        }
      }

      balance = balance + dayInflows - dayOutflows;

      runBalances.push({
        date: new Date(currentDate),
        openingBalance,
        inflows: dayInflows,
        outflows: dayOutflows,
        closingBalance: balance,
        inflowDetails,
        outflowDetails,
      });
    }

    dailyBalancesAllRuns.push(runBalances);
  }

  // Calculate percentiles for each day
  const percentiles = {
    p10: [] as number[],
    p50: [] as number[],
    p90: [] as number[],
  };

  let minBalance = currentCash;
  let minBalanceDate: Date | null = null;
  let daysUntilNegative: number | null = null;

  for (let day = 0; day <= horizonDays; day++) {
    const dayValues = dailyBalancesAllRuns
      .map((run) => run[day].closingBalance)
      .sort((a, b) => a - b);

    const p10 = getPercentile(dayValues, 10);
    const p50 = getPercentile(dayValues, 50);
    const p90 = getPercentile(dayValues, 90);

    percentiles.p10.push(p10);
    percentiles.p50.push(p50);
    percentiles.p90.push(p90);

    // Track minimum balance (using p10 - pessimistic)
    if (p10 < minBalance) {
      minBalance = p10;
      minBalanceDate = dailyBalancesAllRuns[0][day].date;
    }

    // Track first day when balance goes negative (using p10)
    if (p10 < 0 && daysUntilNegative === null) {
      daysUntilNegative = day;
    }
  }

  return {
    dailyBalances: dailyBalancesAllRuns,
    percentiles,
    minBalance,
    minBalanceDate,
    daysUntilNegative,
  };
}

/**
 * Generate daily forecast summary from Monte Carlo results
 */
export function generateDailyForecasts(
  result: MonteCarloResult,
  startDate: Date,
): Array<{
  date: Date;
  p10: number;
  p50: number;
  p90: number;
  isNegativeRisk: boolean;
  isLowCashRisk: boolean;
}> {
  const forecasts = [];
  const lowCashThreshold = result.percentiles.p50[0] * 0.1; // 10% of starting balance

  for (let i = 0; i < result.percentiles.p50.length; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    forecasts.push({
      date,
      p10: result.percentiles.p10[i],
      p50: result.percentiles.p50[i],
      p90: result.percentiles.p90[i],
      isNegativeRisk: result.percentiles.p10[i] < 0,
      isLowCashRisk: result.percentiles.p50[i] < lowCashThreshold,
    });
  }

  return forecasts;
}

/**
 * Calculate expected inflows and outflows for a period
 */
export function calculatePeriodTotals(
  events: CashFlowEvent[],
  startDate: Date,
  endDate: Date,
): {
  expectedInflows: number;
  expectedOutflows: number;
  inflowsBySource: Record<string, number>;
  outflowsBySource: Record<string, number>;
} {
  const inflowsBySource: Record<string, number> = {};
  const outflowsBySource: Record<string, number> = {};

  for (const event of events) {
    if (event.date >= startDate && event.date <= endDate) {
      if (event.type === 'inflow') {
        inflowsBySource[event.source] =
          (inflowsBySource[event.source] || 0) + event.amount;
      } else {
        outflowsBySource[event.source] =
          (outflowsBySource[event.source] || 0) + event.amount;
      }
    }
  }

  const expectedInflows = Object.values(inflowsBySource).reduce(
    (sum, v) => sum + v,
    0,
  );
  const expectedOutflows = Object.values(outflowsBySource).reduce(
    (sum, v) => sum + v,
    0,
  );

  return {
    expectedInflows,
    expectedOutflows,
    inflowsBySource,
    outflowsBySource,
  };
}

/**
 * Apply a what-if scenario to events
 */
export function applyWhatIfScenario(
  events: CashFlowEvent[],
  scenario: {
    type: 'delay_customer' | 'early_payment' | 'new_expense' | 'revenue_change';
    customerId?: string;
    delayDays?: number;
    billId?: string;
    newPaymentDate?: Date;
    expenseAmount?: number;
    expenseDate?: Date;
    revenueChangePercent?: number;
  },
): CashFlowEvent[] {
  const modifiedEvents = events.map((e) => ({ ...e, date: new Date(e.date) }));

  switch (scenario.type) {
    case 'delay_customer':
      // Delay all AR from specific customer
      if (scenario.customerId && scenario.delayDays) {
        for (const event of modifiedEvents) {
          if (
            event.type === 'inflow' &&
            event.source === 'ar' &&
            event.entityId === scenario.customerId
          ) {
            event.date.setDate(event.date.getDate() + scenario.delayDays);
          }
        }
      }
      break;

    case 'early_payment':
      // Pay a bill earlier
      if (scenario.billId && scenario.newPaymentDate) {
        for (const event of modifiedEvents) {
          if (
            event.type === 'outflow' &&
            event.source === 'ap' &&
            event.entityId === scenario.billId
          ) {
            event.date = new Date(scenario.newPaymentDate);
          }
        }
      }
      break;

    case 'new_expense':
      // Add a new expense
      if (scenario.expenseAmount && scenario.expenseDate) {
        modifiedEvents.push({
          id: `what-if-expense-${Date.now()}`,
          date: new Date(scenario.expenseDate),
          amount: scenario.expenseAmount,
          type: 'outflow',
          source: 'other',
          variability: 'fixed',
        });
      }
      break;

    case 'revenue_change':
      // Adjust all AR by percentage
      if (scenario.revenueChangePercent !== undefined) {
        const multiplier = 1 + scenario.revenueChangePercent / 100;
        for (const event of modifiedEvents) {
          if (event.type === 'inflow' && event.source === 'ar') {
            event.amount *= multiplier;
          }
        }
      }
      break;
  }

  return modifiedEvents;
}

/**
 * Generate critical dates with explanations
 */
export function identifyCriticalDates(
  forecasts: Array<{ date: Date; p10: number; p50: number }>,
  events: CashFlowEvent[],
  threshold: number,
): Array<{
  date: Date;
  reason: string;
  impact: number;
  type: 'warning' | 'critical';
}> {
  const criticalDates: Array<{
    date: Date;
    reason: string;
    impact: number;
    type: 'warning' | 'critical';
  }> = [];

  for (let i = 1; i < forecasts.length; i++) {
    const prev = forecasts[i - 1];
    const curr = forecasts[i];

    // Check for significant drops
    const drop = prev.p50 - curr.p50;
    if (drop > threshold * 0.2) {
      // 20% of threshold
      // Find what caused the drop
      const dayEvents = events.filter(
        (e) =>
          e.type === 'outflow' &&
          e.date.toDateString() === curr.date.toDateString(),
      );

      const largestEvent = dayEvents.sort((a, b) => b.amount - a.amount)[0];
      const reason = largestEvent
        ? `Large ${largestEvent.source} payment: ${largestEvent.entityName || 'Unknown'}`
        : 'Multiple outflows';

      criticalDates.push({
        date: curr.date,
        reason,
        impact: -drop,
        type: curr.p10 < 0 ? 'critical' : 'warning',
      });
    }

    // Check for negative balance risk
    if (curr.p10 < 0 && prev.p10 >= 0) {
      criticalDates.push({
        date: curr.date,
        reason: 'Cash balance may go negative',
        impact: curr.p10,
        type: 'critical',
      });
    }

    // Check for low balance warning
    if (curr.p50 < threshold && prev.p50 >= threshold) {
      criticalDates.push({
        date: curr.date,
        reason: 'Cash balance falls below safety threshold',
        impact: curr.p50 - threshold,
        type: 'warning',
      });
    }
  }

  // Sort by date and limit
  return criticalDates.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 10);
}
