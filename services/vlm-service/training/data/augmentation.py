"""Image augmentation to expand the small training set (~33 → ~130+ samples).

Applies geometric and photometric transforms to create diverse variants
while preserving invoice readability.

Usage:
    Used internally by prepare_dataset.py and train_lora.py
"""

import random

import numpy as np
from PIL import Image

try:
    import albumentations as A
except ImportError:
    A = None  # type: ignore[assignment]


def get_augmentation_pipeline() -> "A.Compose | None":
    """Create an albumentations augmentation pipeline for invoice images."""
    if A is None:
        return None

    return A.Compose([
        # Geometric transforms (mild — don't distort text too much)
        A.Rotate(limit=5, border_mode=0, fill=(255, 255, 255), p=0.5),
        A.Perspective(scale=(0.02, 0.05), fill=(255, 255, 255), p=0.3),

        # Photometric transforms
        A.OneOf([
            A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=1.0),
            A.ColorJitter(brightness=0.1, contrast=0.1, saturation=0.1, hue=0.02, p=1.0),
        ], p=0.6),

        # Blur and noise (simulating scan/photo quality)
        A.OneOf([
            A.GaussianBlur(blur_limit=(3, 5), p=1.0),
            A.MotionBlur(blur_limit=3, p=1.0),
        ], p=0.3),

        # JPEG compression artifacts
        A.ImageCompression(quality_range=(60, 90), p=0.4),

        # Noise
        A.GaussNoise(std_range=(0.02, 0.1), p=0.3),
    ])


def augment_image(image: Image.Image, pipeline: "A.Compose | None" = None) -> Image.Image:
    """Apply augmentation to a single PIL Image.

    Args:
        image: Input PIL Image in RGB mode.
        pipeline: Optional pre-built augmentation pipeline. If None, creates one.

    Returns:
        Augmented PIL Image.
    """
    if pipeline is None:
        pipeline = get_augmentation_pipeline()

    if pipeline is None:
        # albumentations not available — return original
        return image

    img_array = np.array(image)
    augmented = pipeline(image=img_array)
    return Image.fromarray(augmented["image"])


def generate_augmented_variants(
    image: Image.Image,
    num_variants: int = 3,
    seed: int | None = None,
) -> list[Image.Image]:
    """Generate multiple augmented variants of a single image.

    Args:
        image: Original PIL Image.
        num_variants: Number of augmented copies to produce.
        seed: Random seed for reproducibility.

    Returns:
        List of augmented PIL Images (does NOT include the original).
    """
    pipeline = get_augmentation_pipeline()
    if pipeline is None:
        return []

    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)

    variants = []
    for _ in range(num_variants):
        variants.append(augment_image(image, pipeline))

    return variants
