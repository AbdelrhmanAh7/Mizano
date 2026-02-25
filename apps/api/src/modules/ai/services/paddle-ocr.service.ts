import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as ort from 'onnxruntime-node';
import * as sharp from 'sharp';
import { join } from 'path';
import { existsSync } from 'fs';

export interface PaddleOcrResult {
  text: string;
  confidence: number;
  boxes: Array<{
    text: string;
    confidence: number;
    bbox: number[][];
  }>;
}

interface DetectionBox {
  bbox: number[][];
  score: number;
}

@Injectable()
export class PaddleOcrService implements OnModuleInit {
  private readonly logger = new Logger(PaddleOcrService.name);
  private detectionSession: ort.InferenceSession | null = null;
  private recognitionSession: ort.InferenceSession | null = null;
  private isAvailable = false;

  private readonly modelPaths = {
    detection: join(process.cwd(), 'ml-models', 'paddle-ocr', 'en_det_infer.onnx'),
    recognition: join(process.cwd(), 'ml-models', 'paddle-ocr', 'en_rec_infer.onnx'),
  };

  async onModuleInit() {
    try {
      await this.loadModels();
    } catch (error) {
      this.logger.warn(
        `PaddleOCR models not available: ${error.message}. OCR will fall back to Tesseract.js only.`,
      );
      this.isAvailable = false;
    }
  }

  /**
   * Load ONNX models at startup (models are loaded once and kept in memory).
   */
  private async loadModels(): Promise<void> {
    // Check if model files exist
    if (!existsSync(this.modelPaths.detection) || !existsSync(this.modelPaths.recognition)) {
      throw new Error(`PaddleOCR ONNX models not found. Please run: pnpm download-ocr-models`);
    }

    this.logger.log('Loading PaddleOCR ONNX models...');

    // Load detection model (DBNet)
    this.detectionSession = await ort.InferenceSession.create(this.modelPaths.detection, {
      executionProviders: ['cpu'], // CPU-only for cost efficiency
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
    });

    // Load recognition model (CRNN)
    this.recognitionSession = await ort.InferenceSession.create(this.modelPaths.recognition, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
      enableMemPattern: true,
    });

    this.isAvailable = true;
    this.logger.log('PaddleOCR models loaded successfully');
  }

  /**
   * Check if PaddleOCR is available.
   */
  available(): boolean {
    return this.isAvailable;
  }

  /**
   * Extract text from image using PaddleOCR ONNX models.
   */
  async extractText(imageBuffer: Buffer, language: string = 'en'): Promise<PaddleOcrResult> {
    if (!this.isAvailable) {
      throw new Error('PaddleOCR models not loaded');
    }

    try {
      // 1. Preprocess image for detection
      const { imageData, width, height } = await this.preprocessForDetection(imageBuffer);

      // 2. Run text detection to find bounding boxes
      const boxes = await this.detectText(imageData, width, height);

      if (boxes.length === 0) {
        return {
          text: '',
          confidence: 0,
          boxes: [],
        };
      }

      // 3. Extract and recognize text from each box
      const recognizedBoxes = await this.recognizeTextBoxes(imageBuffer, boxes, language);

      // 4. Combine results
      const text = recognizedBoxes.map((box) => box.text).join('\n');
      const avgConfidence =
        recognizedBoxes.reduce((sum, box) => sum + box.confidence, 0) / recognizedBoxes.length;

      return {
        text,
        confidence: avgConfidence,
        boxes: recognizedBoxes,
      };
    } catch (error) {
      this.logger.error(`PaddleOCR extraction failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Preprocess image for text detection model.
   * Detection model expects: [1, 3, H, W] with pixel values normalized to [0, 1].
   */
  private async preprocessForDetection(
    imageBuffer: Buffer,
  ): Promise<{ imageData: Float32Array; width: number; height: number }> {
    // Resize to max dimension 960 (balance between accuracy and speed)
    const maxDim = 960;
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    let width = metadata.width || 0;
    let height = metadata.height || 0;

    // Maintain aspect ratio
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    // PaddleOCR detection model (DBNet) requires dimensions divisible by 32
    width = Math.ceil(width / 32) * 32;
    height = Math.ceil(height / 32) * 32;

    // Convert to RGB, resize, normalize
    const { data, info } = await image
      .resize(width, height, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    width = info.width;
    height = info.height;

    // Convert to CHW format (channels first) and normalize to [0, 1]
    const channels = 3;
    const imageData = new Float32Array(channels * width * height);

    for (let c = 0; c < channels; c++) {
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          const pixelIndex = (h * width + w) * channels + c;
          const tensorIndex = c * (width * height) + h * width + w;
          // Normalize to [0, 1] and apply mean/std (standard ImageNet normalization)
          const mean = [0.485, 0.456, 0.406][c];
          const std = [0.229, 0.224, 0.225][c];
          imageData[tensorIndex] = (data[pixelIndex] / 255.0 - mean) / std;
        }
      }
    }

    return { imageData, width, height };
  }

  /**
   * Run text detection model to find bounding boxes.
   */
  private async detectText(
    imageData: Float32Array,
    width: number,
    height: number,
  ): Promise<DetectionBox[]> {
    if (!this.detectionSession) {
      throw new Error('Detection model not loaded');
    }

    // Create input tensor [1, 3, H, W]
    const inputTensor = new ort.Tensor('float32', imageData, [1, 3, height, width]);

    // Run inference
    const feeds = { x: inputTensor };
    const results = await this.detectionSession.run(feeds);

    // Extract output (detection map)
    const outputTensor = results[Object.keys(results)[0]];
    const outputData = outputTensor.data as Float32Array;

    // Post-process detection map to extract bounding boxes
    const boxes = this.postProcessDetection(
      outputData,
      outputTensor.dims as number[],
      width,
      height,
    );

    return boxes;
  }

  /**
   * Post-process detection output to extract bounding boxes.
   * This is a simplified version - production would use DBNet post-processing.
   */
  private postProcessDetection(
    detectionMap: Float32Array,
    dims: number[],
    originalWidth: number,
    originalHeight: number,
  ): DetectionBox[] {
    // dims: [1, 1, H, W] - binary segmentation map
    const mapHeight = dims[2];
    const mapWidth = dims[3];
    const threshold = 0.3; // Detection confidence threshold

    const boxes: DetectionBox[] = [];

    // Simple bounding box extraction (for production, use contour detection)
    // This is a placeholder - you'd implement proper DBNet post-processing here
    const scaleX = originalWidth / mapWidth;
    const scaleY = originalHeight / mapHeight;

    // Find regions with high confidence
    const visited = new Set<number>();
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const idx = y * mapWidth + x;
        if (detectionMap[idx] > threshold && !visited.has(idx)) {
          // Found a text region - extract bounding box
          const box = this.expandRegion(
            detectionMap,
            mapWidth,
            mapHeight,
            x,
            y,
            threshold,
            visited,
          );

          if (box.width > 5 && box.height > 5) {
            // Minimum size filter
            boxes.push({
              bbox: [
                [box.x * scaleX, box.y * scaleY],
                [(box.x + box.width) * scaleX, box.y * scaleY],
                [(box.x + box.width) * scaleX, (box.y + box.height) * scaleY],
                [box.x * scaleX, (box.y + box.height) * scaleY],
              ],
              score: box.score,
            });
          }
        }
      }
    }

    // Sort boxes by position (top to bottom, left to right)
    boxes.sort((a, b) => {
      const aY = a.bbox[0][1];
      const bY = b.bbox[0][1];
      if (Math.abs(aY - bY) < 10) {
        return a.bbox[0][0] - b.bbox[0][0]; // Same row, sort by X
      }
      return aY - bY; // Sort by Y
    });

    return boxes;
  }

  /**
   * Expand region using flood-fill to find bounding box.
   */
  private expandRegion(
    map: Float32Array,
    width: number,
    height: number,
    startX: number,
    startY: number,
    threshold: number,
    visited: Set<number>,
  ): { x: number; y: number; width: number; height: number; score: number } {
    const queue: Array<[number, number]> = [[startX, startY]];
    let minX = startX,
      maxX = startX,
      minY = startY,
      maxY = startY;
    let scoreSum = 0,
      count = 0;

    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      const idx = y * width + x;

      if (visited.has(idx)) continue;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (map[idx] <= threshold) continue;

      visited.add(idx);
      scoreSum += map[idx];
      count++;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      // Expand to neighbors
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      score: count > 0 ? scoreSum / count : 0,
    };
  }

  /**
   * Recognize text from detected bounding boxes.
   */
  private async recognizeTextBoxes(
    originalImage: Buffer,
    boxes: DetectionBox[],
    language: string,
  ): Promise<Array<{ text: string; confidence: number; bbox: number[][] }>> {
    if (!this.recognitionSession) {
      throw new Error('Recognition model not loaded');
    }

    const results: Array<{
      text: string;
      confidence: number;
      bbox: number[][];
    }> = [];

    // Process each box
    for (const box of boxes) {
      try {
        // Extract and preprocess region
        const regionBuffer = await this.extractRegion(originalImage, box.bbox);
        const { imageData, width } = await this.preprocessForRecognition(regionBuffer);

        // Run recognition
        const inputTensor = new ort.Tensor('float32', imageData, [1, 3, 48, width]);
        const feeds = { x: inputTensor };
        const recResults = await this.recognitionSession.run(feeds);

        // Decode output
        const outputTensor = recResults[Object.keys(recResults)[0]];
        const { text, confidence } = this.decodeRecognitionOutput(
          outputTensor.data as Float32Array,
          outputTensor.dims as number[],
        );

        if (text.trim().length > 0) {
          results.push({
            text,
            confidence,
            bbox: box.bbox,
          });
        }
      } catch (error) {
        this.logger.warn(`Failed to recognize text box: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Extract image region defined by bounding box.
   */
  private async extractRegion(imageBuffer: Buffer, bbox: number[][]): Promise<Buffer> {
    // Find bounding rectangle
    const minX = Math.min(...bbox.map((p) => p[0]));
    const minY = Math.min(...bbox.map((p) => p[1]));
    const maxX = Math.max(...bbox.map((p) => p[0]));
    const maxY = Math.max(...bbox.map((p) => p[1]));

    const width = Math.round(maxX - minX);
    const height = Math.round(maxY - minY);

    return sharp(imageBuffer)
      .extract({
        left: Math.round(minX),
        top: Math.round(minY),
        width: Math.max(1, width),
        height: Math.max(1, height),
      })
      .toBuffer();
  }

  /**
   * Preprocess image for recognition model.
   * Recognition expects: [1, 3, 48, W] with variable width.
   */
  private async preprocessForRecognition(
    imageBuffer: Buffer,
  ): Promise<{ imageData: Float32Array; width: number }> {
    const targetHeight = 48;

    // Resize maintaining aspect ratio
    const metadata = await sharp(imageBuffer).metadata();
    const origWidth = metadata.width || 0;
    const origHeight = metadata.height || 0;

    const width = Math.round((origWidth * targetHeight) / origHeight);

    const { data } = await sharp(imageBuffer)
      .resize(width, targetHeight, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Convert to CHW and normalize
    const channels = 3;
    const imageData = new Float32Array(channels * targetHeight * width);

    for (let c = 0; c < channels; c++) {
      for (let h = 0; h < targetHeight; h++) {
        for (let w = 0; w < width; w++) {
          const pixelIndex = (h * width + w) * channels + c;
          const tensorIndex = c * (targetHeight * width) + h * width + w;
          const mean = [0.5, 0.5, 0.5][c];
          const std = [0.5, 0.5, 0.5][c];
          imageData[tensorIndex] = (data[pixelIndex] / 255.0 - mean) / std;
        }
      }
    }

    return { imageData, width };
  }

  /**
   * Decode recognition output to text.
   */
  private decodeRecognitionOutput(
    output: Float32Array,
    dims: number[],
  ): { text: string; confidence: number } {
    // dims: [1, T, C] where T = time steps, C = character classes
    const timeSteps = dims[1];
    const numClasses = dims[2];

    // Simple CTC decoding (greedy)
    const chars: string[] = [];
    const confidences: number[] = [];
    let prevChar = -1;

    for (let t = 0; t < timeSteps; t++) {
      let maxIdx = 0;
      let maxProb = output[t * numClasses];

      for (let c = 1; c < numClasses; c++) {
        const prob = output[t * numClasses + c];
        if (prob > maxProb) {
          maxProb = prob;
          maxIdx = c;
        }
      }

      // CTC: skip blank (0) and consecutive duplicates
      if (maxIdx !== 0 && maxIdx !== prevChar) {
        chars.push(this.indexToChar(maxIdx));
        confidences.push(maxProb);
      }
      prevChar = maxIdx;
    }

    const text = chars.join('');
    const avgConfidence =
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    return { text, confidence: avgConfidence };
  }

  /**
   * Map character index to actual character.
   * This is a simplified version - production would load from character dict file.
   */
  private indexToChar(index: number): string {
    // PaddleOCR English character set (simplified)
    const charset =
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~ ';

    return index > 0 && index <= charset.length ? charset[index - 1] : '';
  }
}
