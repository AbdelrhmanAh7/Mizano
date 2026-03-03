"""PaddleOCR engine wrapper."""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from app.models.schemas import OcrTextBlock

logger = logging.getLogger(__name__)

_paddle_instance: Optional[object] = None


def _get_paddle():
    """Lazy-init PaddleOCR singleton."""
    global _paddle_instance
    if _paddle_instance is None:
        from paddleocr import PaddleOCR

        _paddle_instance = PaddleOCR(
            use_angle_cls=True,
            lang="en",
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            rec_algorithm="SVTR_LCNet",
            show_log=False,
            use_gpu=False,
        )
        logger.info("PaddleOCR engine initialized")
    return _paddle_instance


def extract(img: np.ndarray) -> list[OcrTextBlock]:
    """Run PaddleOCR on a BGR image, return text blocks with bounding boxes."""
    try:
        ocr = _get_paddle()
        results = ocr.ocr(img, cls=True)

        blocks: list[OcrTextBlock] = []
        if not results or not results[0]:
            return blocks

        for line in results[0]:
            bbox = line[0]  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
            text = line[1][0]
            confidence = float(line[1][1])

            if not text.strip():
                continue

            blocks.append(
                OcrTextBlock(
                    text=text.strip(),
                    bbox=bbox,
                    confidence=confidence,
                )
            )

        logger.info("PaddleOCR extracted %d text blocks", len(blocks))
        return blocks

    except Exception:
        logger.exception("PaddleOCR extraction failed")
        return []


def is_available() -> bool:
    """Check if PaddleOCR is importable."""
    try:
        import paddleocr  # noqa: F401

        return True
    except ImportError:
        return False
