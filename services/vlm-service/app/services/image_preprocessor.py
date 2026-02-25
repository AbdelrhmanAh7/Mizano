import io
import logging

from PIL import Image, ImageOps

from app.config import get_settings

logger = logging.getLogger(__name__)

SUPPORTED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/webp",
    "application/pdf",
}


class ImagePreprocessor:
    """Converts uploaded file bytes into a PIL Image ready for VLM inference.

    Handles JPEG, PNG, TIFF, WebP, and PDF (first page only).
    Applies EXIF auto-orientation, resizes to the configured max resolution,
    and ensures the output is RGB.
    """

    def preprocess(self, file_bytes: bytes, content_type: str) -> Image.Image:
        """Preprocess raw file bytes into a PIL Image.

        Args:
            file_bytes: Raw bytes of the uploaded file.
            content_type: MIME type string (e.g. "image/jpeg", "application/pdf").

        Returns:
            A PIL Image in RGB mode, resized to fit MAX_IMAGE_RESOLUTION.

        Raises:
            ValueError: If the content type is unsupported or the file cannot be decoded.
        """
        content_type = content_type.lower().strip()

        if content_type not in SUPPORTED_CONTENT_TYPES:
            raise ValueError(
                f"Unsupported file type: '{content_type}'. "
                f"Supported types: {', '.join(sorted(SUPPORTED_CONTENT_TYPES))}"
            )

        try:
            if content_type == "application/pdf":
                image = self._pdf_to_image(file_bytes)
            else:
                image = Image.open(io.BytesIO(file_bytes))
        except Exception as exc:
            raise ValueError(f"Failed to decode image file: {exc}") from exc

        # Auto-orient using EXIF data (handles photos taken in landscape/portrait)
        image = ImageOps.exif_transpose(image)

        # Resize if the longest side exceeds the configured maximum
        image = self._resize_if_needed(image)

        # Ensure RGB — VLM expects 3-channel input
        if image.mode != "RGB":
            image = image.convert("RGB")

        return image

    def _pdf_to_image(self, pdf_bytes: bytes) -> Image.Image:
        """Convert the first page of a PDF to a PIL Image."""
        try:
            from pdf2image import convert_from_bytes
        except ImportError as exc:
            raise ValueError(
                "pdf2image is required for PDF support. "
                "Install poppler-utils (system) and pdf2image (pip)."
            ) from exc

        pages = convert_from_bytes(pdf_bytes, first_page=1, last_page=1, dpi=200)
        if not pages:
            raise ValueError("PDF appears to be empty — no pages could be rendered.")
        logger.debug("PDF converted to image successfully (first page, 200 DPI)")
        return pages[0]

    def _resize_if_needed(self, image: Image.Image) -> Image.Image:
        """Resize image so the longest side does not exceed MAX_IMAGE_RESOLUTION."""
        settings = get_settings()
        max_res = settings.MAX_IMAGE_RESOLUTION
        width, height = image.size

        longest_side = max(width, height)
        if longest_side <= max_res:
            return image

        scale = max_res / longest_side
        new_width = int(width * scale)
        new_height = int(height * scale)
        logger.debug(
            "Resizing image from %dx%d to %dx%d (max_resolution=%d)",
            width,
            height,
            new_width,
            new_height,
            max_res,
        )
        return image.resize((new_width, new_height), Image.LANCZOS)
