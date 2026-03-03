// Mock for tesseract.js — heavy OCR library, not needed for unit tests
const recognize = jest.fn().mockResolvedValue({
  data: { text: '', confidence: 0 },
});
const createWorker = jest.fn().mockResolvedValue({
  recognize,
  terminate: jest.fn().mockResolvedValue(undefined),
  loadLanguage: jest.fn().mockResolvedValue(undefined),
  initialize: jest.fn().mockResolvedValue(undefined),
  setParameters: jest.fn().mockResolvedValue(undefined),
});

module.exports = { createWorker, recognize };
module.exports.default = module.exports;
