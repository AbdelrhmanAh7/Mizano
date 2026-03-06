/**
 * Validates next.config.js constraints.
 *
 * Key insight: Next.js has a BUILT-IN default list of optimizePackageImports
 * (in next/dist/server/config.js) that ALWAYS includes packages like recharts,
 * @mui/*, lodash-es, etc. This list is merged with the user config and CANNOT
 * be overridden. When these packages are used inside dynamic() + ssr:false
 * components, webpack factory errors occur:
 *   "Cannot read properties of undefined (reading 'call')"
 *
 * Solution: Components importing from packages in Next.js's built-in
 * optimizePackageImports list must NOT be loaded via dynamic() + ssr:false.
 * Use static imports instead.
 */

describe('next.config.js', () => {
  let packages: string[];

  beforeAll(() => {
    const fs = require('fs');
    const path = require('path');
    const configContent = fs.readFileSync(path.join(__dirname, 'next.config.js'), 'utf-8');

    const match = configContent.match(/optimizePackageImports:\s*\[([\s\S]*?)\]/);
    packages = match
      ? match[1]
          .split(',')
          .map((s: string) => s.trim().replace(/['"]/g, ''))
          .filter(Boolean)
      : [];
  });

  it('should only contain safe packages (not ones used exclusively in dynamic ssr:false chunks)', () => {
    // These are safe because they're used everywhere → land in commons chunk
    expect(packages).toContain('lucide-react');
    expect(packages).toContain('date-fns');
  });

  it('should not add recharts (Next.js built-in list already includes it; charts use static imports)', () => {
    // recharts is in Next.js built-in optimizePackageImports.
    // Adding it here would be redundant and could cause confusion.
    // Dashboard charts must use STATIC imports (not dynamic ssr:false) because
    // of this built-in optimization.
    expect(packages).not.toContain('recharts');
  });
});

describe('dashboard-client.tsx', () => {
  it('must NOT use dynamic() + ssr:false for recharts chart components', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, 'components/dashboard/dashboard-client.tsx'),
      'utf-8',
    );

    // Ensure no dynamic() imports for chart components
    expect(content).not.toMatch(/dynamic\s*\(\s*\(\)\s*=>\s*import.*chart/i);
    expect(content).not.toMatch(/dynamic\s*\(\s*\(\)\s*=>\s*import.*pie/i);

    // Ensure static imports are used instead
    expect(content).toMatch(/import\s*\{.*CashFlowChart.*\}\s*from/);
    expect(content).toMatch(/import\s*\{.*RevenueChart.*\}\s*from/);
    expect(content).toMatch(/import\s*\{.*ARAPChart.*\}\s*from/);
    expect(content).toMatch(/import\s*\{.*ExpensesPie.*\}\s*from/);
    expect(content).toMatch(/import\s*\{.*ProfitMarginChart.*\}\s*from/);
    expect(content).toMatch(/import\s*\{.*BankBalanceChart.*\}\s*from/);
    expect(content).toMatch(/import\s*\{.*InventoryValueChart.*\}\s*from/);
  });
});
