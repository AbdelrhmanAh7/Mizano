/** Match the CPU intake API's byte limit before allocating a preview or uploading. */
export const INTAKE_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function isOversizedIntakeUpload(sizeBytes: number): boolean {
  return sizeBytes > INTAKE_MAX_UPLOAD_BYTES;
}

/** Client hint; the API independently sniffs the buffered OLE signature. */
export function isLegacyWordUpload(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type === 'application/msword' || /\.doc$/i.test(file.name);
}
