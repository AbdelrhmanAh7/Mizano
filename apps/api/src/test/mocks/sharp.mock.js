// Mock for sharp — native image processing library unavailable in test env
const chainable = () => {
  const obj = {
    grayscale: () => obj,
    normalize: () => obj,
    sharpen: () => obj,
    rotate: () => obj,
    resize: () => obj,
    threshold: () => obj,
    jpeg: () => obj,
    png: () => obj,
    toBuffer: () => Promise.resolve(Buffer.from('')),
    metadata: () => Promise.resolve({ width: 800, height: 600, format: 'jpeg' }),
  };
  return obj;
};

const sharp = jest.fn(() => chainable());
sharp.default = sharp;
module.exports = sharp;
module.exports.default = sharp;
