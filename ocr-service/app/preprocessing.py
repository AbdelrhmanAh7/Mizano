"""Image preprocessing pipeline for OCR extraction."""

from __future__ import annotations

import logging
from io import BytesIO

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def load_image(file_bytes: bytes) -> np.ndarray:
    """Load image from bytes into OpenCV BGR format."""
    img_array = np.frombuffer(file_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        pil_img = Image.open(BytesIO(file_bytes)).convert("RGB")
        img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    return img


def auto_rotate_deskew(img: np.ndarray) -> np.ndarray:
    """Auto-rotate and deskew the image using minAreaRect."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    coords = np.column_stack(np.where(thresh > 0))
    if len(coords) < 50:
        return img

    rect = cv2.minAreaRect(coords)
    angle = rect[-1]

    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    if abs(angle) < 0.5:
        return img
    if abs(angle) > 15:
        return img

    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        img, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    logger.info("Deskewed image by %.2f degrees", angle)
    return rotated


def upscale_if_needed(img: np.ndarray, min_width: int = 2000) -> np.ndarray:
    """Upscale image to at least min_width using INTER_CUBIC."""
    h, w = img.shape[:2]
    if w < min_width:
        scale = min_width / w
        new_w = int(w * scale)
        new_h = int(h * scale)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
        logger.info("Upscaled image from %dx%d to %dx%d", w, h, new_w, new_h)
    return img


def to_grayscale(img: np.ndarray) -> np.ndarray:
    """Convert to grayscale if not already."""
    if len(img.shape) == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img


def adaptive_threshold(gray: np.ndarray) -> np.ndarray:
    """Apply adaptive thresholding for binarization."""
    return cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=21,
        C=10,
    )


def denoise(gray: np.ndarray) -> np.ndarray:
    """Remove noise using fastNlMeansDenoising."""
    return cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)


def sharpen(img: np.ndarray) -> np.ndarray:
    """Apply unsharp mask sharpening."""
    blurred = cv2.GaussianBlur(img, (0, 0), 3)
    sharpened = cv2.addWeighted(img, 1.5, blurred, -0.5, 0)
    return sharpened


def crop_to_content(gray: np.ndarray, border_pct: float = 0.02) -> np.ndarray:
    """Crop to content area by removing excess white borders."""
    thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)[1]

    coords = cv2.findNonZero(thresh)
    if coords is None:
        return gray

    x, y, w, h = cv2.boundingRect(coords)
    img_h, img_w = gray.shape[:2]
    border_x = int(img_w * border_pct)
    border_y = int(img_h * border_pct)

    x1 = max(0, x - border_x)
    y1 = max(0, y - border_y)
    x2 = min(img_w, x + w + border_x)
    y2 = min(img_h, y + h + border_y)

    return gray[y1:y2, x1:x2]


def preprocess_for_paddle(file_bytes: bytes) -> np.ndarray:
    """Full preprocessing pipeline for PaddleOCR (returns BGR image)."""
    img = load_image(file_bytes)
    img = auto_rotate_deskew(img)
    img = upscale_if_needed(img, min_width=2000)
    return img


def preprocess_for_tesseract(file_bytes: bytes) -> np.ndarray:
    """Full preprocessing pipeline for Tesseract (returns grayscale image)."""
    img = load_image(file_bytes)
    img = auto_rotate_deskew(img)
    img = upscale_if_needed(img, min_width=2000)
    gray = to_grayscale(img)
    gray = denoise(gray)
    gray = sharpen(gray)
    gray = adaptive_threshold(gray)
    return gray


def preprocess_full(file_bytes: bytes) -> tuple[np.ndarray, np.ndarray]:
    """Run full pipeline returning (paddle_img_bgr, tesseract_img_gray)."""
    img = load_image(file_bytes)
    img = auto_rotate_deskew(img)
    img = upscale_if_needed(img, min_width=2000)

    paddle_img = img.copy()

    gray = to_grayscale(img)
    gray = denoise(gray)
    gray = sharpen(gray)
    tess_img = adaptive_threshold(gray)

    return paddle_img, tess_img
