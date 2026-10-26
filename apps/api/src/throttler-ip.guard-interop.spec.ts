import { join } from 'path';
import {
  createProgram,
  flattenDiagnosticMessageText,
  getPreEmitDiagnostics,
  parseJsonConfigFileContent,
  readConfigFile,
  sys,
} from 'typescript';

it('AC1: compiles the throttler HTTP tests with esModuleInterop enabled', () => {
  const configPath = join(__dirname, '../test/tsconfig.throttler-interop.json');
  const config = readConfigFile(configPath, sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = parseJsonConfigFileContent(config.config, sys, join(__dirname, '../test'));
  expect(parsed.errors).toEqual([]);
  expect(parsed.fileNames).toContain(join(__dirname, 'throttler-ip.guard.spec.ts'));
  const program = createProgram(parsed.fileNames, parsed.options);
  const diagnostics = getPreEmitDiagnostics(program).map(
    (diagnostic) =>
      `TS${diagnostic.code}: ${flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
  );
  expect(diagnostics).toEqual([]);
}, 15_000);
