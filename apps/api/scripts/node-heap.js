/**
 * Parse and validate MIZANO_NODE_HEAP_MB from the environment.
 * Must be an integer between 128 and 4096. Unset returns undefined.
 */
function parseHeapMb(env = process.env) {
  const raw = env ? env.MIZANO_NODE_HEAP_MB : undefined;
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const str = String(raw).trim();
  if (str === '' || !/^(?:0x[0-9a-fA-F]+|\d+)$/.test(str)) {
    throw new Error('MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096');
  }

  const val = Number(str);
  if (!Number.isInteger(val) || val < 128 || val > 4096) {
    throw new Error('MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096');
  }

  return val;
}

/**
 * Build arguments array to pass to node, prepending --max-old-space-size if configured.
 */
function buildNodeArgs(env = process.env, args = []) {
  const heapMb = parseHeapMb(env);
  if (heapMb !== undefined) {
    return [`--max-old-space-size=${heapMb}`, ...args];
  }
  return [...args];
}

module.exports = {
  parseHeapMb,
  buildNodeArgs,
};
