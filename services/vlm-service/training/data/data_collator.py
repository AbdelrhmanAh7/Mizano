"""Custom data collator for Qwen2.5-VL multimodal training.

Loads images at batch time, applies the Qwen2.5-VL processor (chat template +
vision processing), and returns padded tensors.
"""

import json
import logging
from pathlib import Path

from PIL import Image, ImageOps

from training.config import MAX_IMAGE_RESOLUTION

logger = logging.getLogger(__name__)


class Qwen2VLDataCollator:
    """Collator that processes conversation samples into model-ready tensors.

    Each sample in the batch is a dict with:
        - image_path: str — path to the source image
        - conversations: list of {role, content} messages
    """

    def __init__(self, processor, augmentation_fn=None):
        self.processor = processor
        self.augmentation_fn = augmentation_fn

    def _load_image(self, image_path: str) -> Image.Image:
        """Load and preprocess an image from disk."""
        path = Path(image_path)
        suffix = path.suffix.lower()

        if suffix == ".heic":
            try:
                import pillow_heif
                pillow_heif.register_heif_opener()
            except ImportError:
                raise RuntimeError("pillow-heif required for HEIC files")
            img = Image.open(path)
        elif suffix == ".pdf":
            from pdf2image import convert_from_path
            pages = convert_from_path(str(path), first_page=1, last_page=1, dpi=200)
            if not pages:
                raise ValueError(f"Empty PDF: {path}")
            img = pages[0]
        else:
            img = Image.open(path)

        img = ImageOps.exif_transpose(img)

        # Resize
        w, h = img.size
        longest = max(w, h)
        if longest > MAX_IMAGE_RESOLUTION:
            scale = MAX_IMAGE_RESOLUTION / longest
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        if img.mode != "RGB":
            img = img.convert("RGB")

        # Optional augmentation
        if self.augmentation_fn is not None:
            img = self.augmentation_fn(img)

        return img

    def __call__(self, batch: list[dict]) -> dict:
        """Collate a batch of samples into model inputs + labels."""
        import torch
        from qwen_vl_utils import process_vision_info

        all_texts = []
        all_images = []

        for sample in batch:
            image_path = sample["image_path"]
            conversations = sample["conversations"]

            # Load the image
            img = self._load_image(image_path)

            # Build messages for the processor
            # User message with image reference
            user_msg = conversations[0]
            assistant_msg = conversations[1]

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": img},
                        {"type": "text", "text": user_msg["content"][-1]["text"]},
                    ],
                },
                {
                    "role": "assistant",
                    "content": [
                        {"type": "text", "text": assistant_msg["content"][0]["text"]},
                    ],
                },
            ]

            # Apply chat template (full conversation including assistant response)
            text = self.processor.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
            all_texts.append(text)

            # Process vision info
            image_inputs, _ = process_vision_info(messages)
            if image_inputs:
                all_images.extend(image_inputs)

        # Tokenize
        inputs = self.processor(
            text=all_texts,
            images=all_images if all_images else None,
            padding=True,
            return_tensors="pt",
        )

        # Create labels — mask everything except the assistant response
        labels = inputs["input_ids"].clone()

        for i, sample in enumerate(batch):
            assistant_text = sample["conversations"][1]["content"][0]["text"]

            # Build just the user part to find where assistant starts
            user_only_messages = [
                {
                    "role": "user",
                    "content": sample["conversations"][0]["content"],
                },
            ]
            user_text = self.processor.apply_chat_template(
                user_only_messages,
                tokenize=False,
                add_generation_prompt=True,
            )
            user_tokens = self.processor.tokenizer(
                user_text, return_tensors="pt", add_special_tokens=False
            )
            user_len = user_tokens["input_ids"].shape[1]

            # Mask user tokens (set to -100 so they don't contribute to loss)
            labels[i, :user_len] = -100

        inputs["labels"] = labels
        return inputs
