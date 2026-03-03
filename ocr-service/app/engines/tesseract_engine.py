"""Tesseract OCR engine wrapper."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pytesseract

from app.models.schemas import OcrTextBlock

logger = logging.getLogger(__name__)


def extract(img_gray: np.ndarray, lang: str = "eng") -> list[OcrTextBlock]:
    """Run Tesseract on a grayscale image, return text blocks with bounding boxes."""
    try:
        # Use LSTM engine (--oem 1) with assume uniform block (--psm 6)
        custom_config = r"--oem 1 --psm 6"
        data = pytesseract.image_to_data(
            img_gray,
            lang=lang,
            config=custom_config,
            output_type=pytesseract.Output.DICT,
        )

        blocks: list[OcrTextBlock] = []
        n = len(data["text"])

        for i in range(n):
            text = str(data["text"][i]).strip()
            conf = float(data["conf"][i])

            if not text or conf < 0:
                continue

            x = int(data["left"][i])
            y = int(data["top"][i])
            w = int(data["width"][i])
            h = int(data["height"][i])

            bbox = [
                [float(x), float(y)],
                [float(x + w), float(y)],
                [float(x + w), float(y + h)],
                [float(x), float(y + h)],
            ]

            blocks.append(
                OcrTextBlock(
                    text=text,
                    bbox=bbox,
                    confidence=conf / 100.0,
                )
            )

        logger.info("Tesseract extracted %d text blocks", len(blocks))
        return blocks

    except Exception:
        logger.exception("Tesseract extraction failed")
        return []


def extract_fulltext(img_gray: np.ndarray, lang: str = "eng") -> tuple[str, float]:
    """Run Tesseract and return (full_text, avg_confidence)."""
    try:
        custom_config = r"--oem 1 --psm 6"
        text = pytesseract.image_to_string(img_gray, lang=lang, config=custom_config)
        data = pytesseract.image_to_data(
            img_gray,
            lang=lang,
            config=custom_config,
            output_type=pytesseract.Output.DICT,
        )
        confs = [float(c) for c in data["conf"] if float(c) > 0]
        avg_conf = sum(confs) / len(confs) if confs else 0.0
        return text.strip(), avg_conf / 100.0
    except Exception:
        logger.exception("Tesseract full-text extraction failed")
        return "", 0.0


def get_confidence(img_gray: np.ndarray) -> float:
    """Get average Tesseract confidence for image."""
    _, conf = extract_fulltext(img_gray)
    return conf


def is_available() -> bool:
    """Check if Tesseract is installed and accessible."""
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def detect_orientation(img_gray: np.ndarray) -> Optional[int]:
    """Detect text orientation using Tesseract OSD."""
    try:
        osd = pytesseract.image_to_osd(img_gray)
        for line in osd.split("\n"):
            if "Rotate:" in line:
                return int(line.split(":")[-1].strip())
    except Exception:
        pass
    return None
