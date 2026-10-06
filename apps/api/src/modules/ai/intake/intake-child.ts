import { ConfigService } from '@nestjs/config';
import type { DocumentIntakeResult } from '../services/document-intake.service';
import { extractCpuDocument } from './cpu-extraction';
import { IntakeStorage, LocalFsIntakeStorage } from './intake-storage';

export interface IntakeChildInput {
  storageKey: string;
  sha256: string;
  mimeType: string;
  organizationId: string;
  directory: string;
}

/**
 * The child gets only a storage descriptor. It must still refuse a key outside the job's own
 * organization folder, including `org/../other-org/...` which passes a plain prefix check.
 */
export function assertOwnStorageKey(input: IntakeChildInput): void {
  const segments = input.storageKey.split('/');
  const ownFolder = input.organizationId !== '' && segments[0] === input.organizationId;
  const clean = segments.every((s) => s !== '' && s !== '.' && s !== '..' && !s.includes('\\'));
  if (!ownFolder || !clean || segments.length < 2) throw new Error('Invalid scope');
}

export async function runIntakeChild(
  input: IntakeChildInput,
  storage: IntakeStorage = new LocalFsIntakeStorage(new ConfigService()),
): Promise<DocumentIntakeResult> {
  assertOwnStorageKey(input);
  const buffer = await storage.get(input.storageKey, input.sha256);
  return extractCpuDocument(buffer, input.mimeType, input.directory);
}

// One document per process. No Nest application, database, network client or LLM is loaded.
// Only the spawned entry point listens: importing this module (tests) registers nothing.
if (require.main === module) {
  process.once('message', (input: IntakeChildInput) => {
    runIntakeChild(input)
      .then(
        (result) => process.send?.({ result }),
        () => process.send?.({ failed: true }),
      )
      .catch(() => process.exit(1));
  });
}
