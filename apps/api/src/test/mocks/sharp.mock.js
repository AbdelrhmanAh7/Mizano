// Mock for sharp — native image processing library unavailable in test env
const chainable = () => {
  const obj = {
    grayscale: () => obj,
    normalize: () => obj,
    sharpen: () => obj,
    rotate: () => obj,
    resize: () => obj,
    threshold: () => obj,
    median: () => obj,
    blur: () => obj,
    flatten: () => obj,
    gamma: () => obj,
    linear: () => obj,
    negate: () => obj,
    modulate: () => obj,
    trim: () => obj,
    extend: () => obj,
    extract: () => obj,
    flip: () => obj,
    flop: () => obj,
    jpeg: () => obj,
    png: () => obj,
    webp: () => obj,
    tiff: () => obj,
    raw: () => obj,
    toBuffer: () => Promise.resolve(Buffer.from('')),
    toFile: () => Promise.resolve({ width: 800, height: 600 }),
    metadata: () => Promise.resolve({ width: 800, height: 600, format: 'jpeg' }),
  };
  return obj;
};

const sharp = jest.fn(() => chainable());
sharp.default = sharp;
module.exports = sharp;
module.exports.default = sharp;
