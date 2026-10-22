describe('API require.cache isolation @issue-391 @issue-257 @issue-142', () => {
  it('API app module does not load tesseract.js or pdf-parse into require.cache', () => {
    jest.isolateModules(() => {
      require('../../../app.module');
      const tesseractKeys = Object.keys(require.cache).filter((k) => k.includes('tesseract.js'));
      const pdfParseKeys = Object.keys(require.cache).filter((k) => k.includes('pdf-parse'));
      expect(tesseractKeys).toHaveLength(0);
      expect(pdfParseKeys).toHaveLength(0);
    });
  });
});
