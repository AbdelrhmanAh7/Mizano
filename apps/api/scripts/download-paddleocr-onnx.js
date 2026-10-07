#!/usr/bin/env node
/**
 * Download PaddleOCR ONNX models for Mizano document extraction.
 *
 * Downloads pre-converted ONNX models from HuggingFace repos:
 *  - deepghs/paddleocr — Arabic rec (v3), English rec (v4), detection (v3)
 *  - monkt/paddleocr-onnx — alternative detection model
 *
 * Usage:
 *   node apps/api/scripts/download-paddleocr-onnx.js
 *
 * Models are saved to: apps/api/src/modules/ai/models/
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'src', 'modules', 'ai', 'models');

// Verified HuggingFace URLs (tested March 2026)
const MODELS = {
  // Detection model — language-agnostic text region detector (~2.4MB)
  'det.onnx': [
    'https://huggingface.co/deepghs/paddleocr/resolve/main/det/en_PP-OCRv3_det/model.onnx',
    'https://huggingface.co/monkt/paddleocr-onnx/resolve/main/detection/v3/det.onnx',
  ],
  // Arabic recognition model (~9MB)
  'rec_ar.onnx': [
    'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/arabic_PP-OCRv3_rec/model.onnx',
  ],
  // English recognition model (~7.7MB)
  'rec_en.onnx': [
    'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/en_PP-OCRv4_rec/model.onnx',
  ],
};

const DICTS = {
  // Arabic character dictionary (from deepghs repo)
  'arabic_dict.txt': [
    'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/arabic_PP-OCRv3_rec/dict.txt',
    'https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/arabic/dict.txt',
    'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/dict/arabic_dict.txt',
  ],
  // English character dictionary
  'en_dict.txt': [
    'https://huggingface.co/deepghs/paddleocr/resolve/main/rec/en_PP-OCRv4_rec/dict.txt',
    'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/dict/en_dict.txt',
  ],
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mizano-ERP/1.0' } }, (res) => {
      // Handle HuggingFace redirects (LFS)
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        const redir = res.headers.location;
        if (redir) return download(redir, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { fs.unlinkSync(dest); reject(err); });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function downloadWithFallback(name, urls) {
  const dest = path.join(MODELS_DIR, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
    const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
    console.log(`  [OK] ${name} already exists (${sizeMB}MB)`);
    return true;
  }

  const urlList = Array.isArray(urls) ? urls : [urls];
  for (const url of urlList) {
    try {
      const hostname = new URL(url).hostname;
      console.log(`  [..] Downloading ${name} from ${hostname}...`);
      await download(url, dest);
      const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
      console.log(`  [OK] ${name} (${sizeMB}MB)`);
      return true;
    } catch (err) {
      console.log(`  [!!] Failed from this source: ${err.message}`);
      // Clean up partial download
      if (fs.existsSync(dest)) try { fs.unlinkSync(dest); } catch {}
    }
  }
  console.log(`  [FAIL] Could not download ${name} from any source`);
  return false;
}

async function main() {
  console.log('=== PaddleOCR ONNX Model Downloader for Mizano ===\n');
  console.log(`Target: ${MODELS_DIR}\n`);

  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  let allSuccess = true;

  console.log('--- ONNX Models ---');
  for (const [name, urls] of Object.entries(MODELS)) {
    const ok = await downloadWithFallback(name, urls);
    if (!ok) allSuccess = false;
  }

  console.log('\n--- Dictionary Files ---');
  for (const [name, urls] of Object.entries(DICTS)) {
    const ok = await downloadWithFallback(name, urls);
    if (!ok) allSuccess = false;
  }

  console.log('\n' + '='.repeat(50));
  if (allSuccess) {
    console.log('All models downloaded successfully!');
    console.log('PaddleOCR is ready for Arabic + English document extraction.');
  } else {
    console.log('Some downloads failed. Check the errors above.');
    console.log('The system will fall back to Tesseract.js for missing models.');
  }
}

main().catch(console.error);
