import {
  runCashFlowMonteCarlo,
  generateDailyForecasts,
  calculatePeriodTotals,
  applyWhatIfScenario,
  identifyCriticalDates,
  CashFlowEvent,
  MonteCarloParams,
} from './monte-carlo.util';

describe('monte-carlo.util', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function futureDate(daysFromNow: number): Date {
    const d = new Date(today);
    d.setDate(d.getDate() + daysFromNow);
    return d;
  }

  const sampleEvents: CashFlowEvent[] = [
    {
      id: '1',
      date: futureDate(5),
      amount: 5000,
      type: 'inflow',
      source: 'ar',
      variability: 'timing',
      predictedDate: futureDate(5),
      confidence: 0.8,
      entityName: 'Customer A',
    },
    {
      id: '2',
      date: futureDate(10),
      amount: 2000,
      type: 'outflow',
      source: 'ap',
      variability: 'fixed',
      entityId: 'bill-001',
      entityName: 'Vendor B',
    },
    {
      id: '3',
      date: futureDate(15),
      amount: 3000,
      type: 'outflow',
      source: 'payroll',
      variability: 'fixed',
    },
    {
      id: '4',
      date: futureDate(20),
      amount: 8000,
      type: 'inflow',
      source: 'ar',
      variability: 'timing',
      predictedDate: futureDate(20),
      confidence: 0.6,
      entityName: 'Customer C',
    },
  ];

  describe('runCashFlowMonteCarlo', () => {
    const params: MonteCarloParams = {
      currentCash: 10000,
      events: sampleEvents,
      horizonDays: 30,
      runs: 50, // Reduced for test speed
    };

    it('should return correct result structure', () => {
      const result = runCashFlowMonteCarlo(params);

      expect(result).toHaveProperty('dailyBalances');
      expect(result).toHaveProperty('percentiles');
      expect(result).toHaveProperty('minBalance');
      expect(result).toHaveProperty('minBalanceDate');
      expect(result).toHaveProperty('daysUntilNegative');
    });

    it('should run correct number of simulations', () => {
      const result = runCashFlowMonteCarlo(params);
      expect(result.dailyBalances).toHaveLength(50);
    });

    it('should produce daily balances for each day in horizon', () => {
      const result = runCashFlowMonteCarlo(params);
      expect(result.dailyBalances[0]).toHaveLength(31); // 0 to 30 inclusive
    });

    it('should have P10 <= P50 <= P90', () => {
      const result = runCashFlowMonteCarlo(params);
      for (let day = 0; day < result.percentiles.p50.length; day++) {
        expect(result.percentiles.p10[day]).toBeLessThanOrEqual(result.percentiles.p50[day]);
        expect(result.percentiles.p50[day]).toBeLessThanOrEqual(result.percentiles.p90[day]);
      }
    });

    it('should start with current cash balance', () => {
      const result = runCashFlowMonteCarlo(params);
      // Day 0 should start at currentCash (no events on day 0 typically)
      expect(result.percentiles.p50[0]).toBe(10000);
    });

    it('should detect when balance might go negative', () => {
      const badParams: MonteCarloParams = {
        currentCash: 100, // Very low starting cash
        events: [
          {
            id: '1',
            date: futureDate(1),
            amount: 5000,
            type: 'outflow',
            source: 'ap',
            variability: 'fixed',
          },
        ],
        horizonDays: 5,
        runs: 20,
      };
      const result = runCashFlowMonteCarlo(badParams);
      expect(result.daysUntilNegative).not.toBeNull();
      expect(result.minBalance).toBeLessThan(0);
    });

    it('should handle empty events', () => {
      const emptyParams: MonteCarloParams = {
        currentCash: 10000,
        events: [],
        horizonDays: 10,
        runs: 10,
      };
      const result = runCashFlowMonteCarlo(emptyParams);
      // Balance should remain constant
      result.percentiles.p50.forEach((balance) => {
        expect(balance).toBe(10000);
      });
    });

    it('should track daily balance structure correctly', () => {
      const result = runCashFlowMonteCarlo(params);
      const dayBalance = result.dailyBalances[0][0];

      expect(dayBalance).toHaveProperty('date');
      expect(dayBalance).toHaveProperty('openingBalance');
      expect(dayBalance).toHaveProperty('inflows');
      expect(dayBalance).toHaveProperty('outflows');
      expect(dayBalance).toHaveProperty('closingBalance');
      expect(dayBalance).toHaveProperty('inflowDetails');
      expect(dayBalance).toHaveProperty('outflowDetails');
    });
  });

  describe('generateDailyForecasts', () => {
    it('should generate forecast array with risk flags', () => {
      const mcResult = runCashFlowMonteCarlo({
        currentCash: 10000,
        events: sampleEvents,
        horizonDays: 30,
        runs: 20,
      });

      const forecasts = generateDailyForecasts(mcResult, today);
      expect(forecasts.length).toBeGreaterThan(0);

      forecasts.forEach((f) => {
        expect(f).toHaveProperty('date');
        expect(f).toHaveProperty('p10');
        expect(f).toHaveProperty('p50');
        expect(f).toHaveProperty('p90');
        expect(f).toHaveProperty('isNegativeRisk');
        expect(f).toHaveProperty('isLowCashRisk');
        expect(typeof f.isNegativeRisk).toBe('boolean');
      });
    });
  });

  describe('calculatePeriodTotals', () => {
    it('should sum inflows and outflows by source', () => {
      const start = futureDate(0);
      const end = futureDate(30);
      const result = calculatePeriodTotals(sampleEvents, start, end);

      expect(result.expectedInflows).toBeGreaterThan(0);
      expect(result.expectedOutflows).toBeGreaterThan(0);
      expect(result.inflowsBySource).toHaveProperty('ar');
      expect(result.outflowsBySource).toHaveProperty('ap');
    });

    it('should only include events within the date range', () => {
      const start = futureDate(0);
      const end = futureDate(7); // Only captures first event
      const result = calculatePeriodTotals(sampleEvents, start, end);
      expect(result.expectedInflows).toBe(5000);
    });
  });

  describe('applyWhatIfScenario', () => {
    it('should delay specific customer payments', () => {
      const events: CashFlowEvent[] = [
        {
          id: '1',
          date: futureDate(5),
          amount: 1000,
          type: 'inflow',
          source: 'ar',
          variability: 'timing',
          entityId: 'cust-001',
        },
      ];

      const modified = applyWhatIfScenario(events, {
        type: 'delay_customer',
        customerId: 'cust-001',
        delayDays: 10,
      });

      expect(modified[0].date.getTime()).toBeGreaterThan(events[0].date.getTime());
    });

    it('should add new expense', () => {
      const modified = applyWhatIfScenario([], {
        type: 'new_expense',
        expenseAmount: 5000,
        expenseDate: futureDate(3),
      });

      expect(modified).toHaveLength(1);
      expect(modified[0].type).toBe('outflow');
      expect(modified[0].amount).toBe(5000);
    });

    it('should change revenue by percentage', () => {
      const events: CashFlowEvent[] = [
        {
          id: '1',
          date: futureDate(5),
          amount: 1000,
          type: 'inflow',
          source: 'ar',
          variability: 'timing',
        },
      ];

      const modified = applyWhatIfScenario(events, {
        type: 'revenue_change',
        revenueChangePercent: 20,
      });

      expect(modified[0].amount).toBe(1200);
    });

    it('should move bill payment to earlier date', () => {
      const events: CashFlowEvent[] = [
        {
          id: '1',
          date: futureDate(30),
          amount: 2000,
          type: 'outflow',
          source: 'ap',
          variability: 'fixed',
          entityId: 'bill-001',
        },
      ];

      const newDate = futureDate(5);
      const modified = applyWhatIfScenario(events, {
        type: 'early_payment',
        billId: 'bill-001',
        newPaymentDate: newDate,
      });

      expect(modified[0].date.getDate()).toBe(newDate.getDate());
    });

    it('should not mutate original events', () => {
      const events: CashFlowEvent[] = [
        {
          id: '1',
          date: futureDate(5),
          amount: 1000,
          type: 'inflow',
          source: 'ar',
          variability: 'timing',
        },
      ];
      const originalDate = events[0].date.getTime();

      applyWhatIfScenario(events, {
        type: 'revenue_change',
        revenueChangePercent: 50,
      });

      expect(events[0].amount).toBe(1000);
      expect(events[0].date.getTime()).toBe(originalDate);
    });
  });

  describe('identifyCriticalDates', () => {
    it('should identify dates when balance goes negative', () => {
      const forecasts = [
        { date: futureDate(0), p10: 1000, p50: 5000 },
        { date: futureDate(1), p10: -500, p50: 2000 },
      ];

      const critical = identifyCriticalDates(forecasts, sampleEvents, 1000);
      const negativeAlerts = critical.filter((c) => c.type === 'critical');
      expect(negativeAlerts.length).toBeGreaterThan(0);
    });

    it('should identify low cash warnings', () => {
      const forecasts = [
        { date: futureDate(0), p10: 5000, p50: 5000 },
        { date: futureDate(1), p10: 400, p50: 800 },
      ];

      const critical = identifyCriticalDates(forecasts, [], 1000);
      const warnings = critical.filter((c) => c.type === 'warning');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should limit results to 10', () => {
      const forecasts = Array.from({ length: 50 }, (_, i) => ({
        date: futureDate(i),
        p10: 1000 - i * 100,
        p50: 2000 - i * 100,
      }));

      const critical = identifyCriticalDates(forecasts, [], 2000);
      expect(critical.length).toBeLessThanOrEqual(10);
    });
  });
});
