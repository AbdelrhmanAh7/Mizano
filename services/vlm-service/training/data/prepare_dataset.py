"""Convert annotations → Qwen2.5-VL conversation format for training.

Each sample becomes a conversation:
  - user: [image] + INVOICE_EXTRACTION_PROMPT
  - assistant: ground truth JSON

Usage:
    python -m training.data.prepare_dataset
"""

import json
import sys
from pathlib import Path

from sklearn.model_selection import train_test_split

from training.config import (
    ANNOTATIONS_JSON,
    CHECKPOINTS_DIR,
    MAX_IMAGE_RESOLUTION,
    RANDOM_SEED,
    TEST_DATA_DIR,
    TRAIN_SPLIT_RATIO,
)

# Inline the prompt to avoid importing from the app package (which has heavy deps)
_PROMPT_PATH = Path(__file__).resolve().parent.parent.parent / "app" / "prompts" / "invoice_extraction.py"


def _load_prompt() -> str:
    """Load the invoice extraction prompt from the app module."""
    content = _PROMPT_PATH.read_text(encoding="utf-8")
    # Extract the string value from the Python file
    import ast
    tree = ast.parse(content)
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "INVOICE_EXTRACTION_PROMPT":
                    return ast.literal_eval(node.value)
    raise ValueError("Could not find INVOICE_EXTRACTION_PROMPT in prompt file")


def _resolve_image_path(file_name: str) -> Path | None:
    """Find the image file in test-data/, handling HEIC files."""
    path = TEST_DATA_DIR / file_name
    if path.exists():
        return path
    return None


def _load_and_preprocess_image_to_base64(image_path: Path) -> str | None:
    """Load image and return base64 string, handling HEIC/PDF conversion."""
    try:
        import base64
        import io

        from PIL import Image, ImageOps

        suffix = image_path.suffix.lower()

        if suffix == ".heic":
            try:
                import pillow_heif
                pillow_heif.register_heif_opener()
            except ImportError:
                print(f"  WARN: pillow-heif not installed, skipping {image_path.name}")
                return None
            img = Image.open(image_path)
        elif suffix == ".pdf":
            try:
                from pdf2image import convert_from_path
                pages = convert_from_path(str(image_path), first_page=1, last_page=1, dpi=200)
                if not pages:
                    return None
                img = pages[0]
            except ImportError:
                print(f"  WARN: pdf2image not installed, skipping {image_path.name}")
                return None
        else:
            img = Image.open(image_path)

        # Apply EXIF orientation
        img = ImageOps.exif_transpose(img)

        # Resize if needed
        w, h = img.size
        longest = max(w, h)
        if longest > MAX_IMAGE_RESOLUTION:
            scale = MAX_IMAGE_RESOLUTION / longest
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        # Ensure RGB
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Encode to base64
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=95)
        return base64.b64encode(buf.getvalue()).decode("ascii")

    except Exception as e:
        print(f"  ERROR processing {image_path.name}: {e}")
        return None


def _build_ground_truth_json(gt: dict) -> str:
    """Build the expected JSON output from ground truth annotations."""
    # Build the response dict matching the VLM output schema
    output = {
        "vendor_name": gt.get("vendor_name"),
        "vendor_tax_id": gt.get("vendor_tax_id"),
        "customer_name": gt.get("customer_name"),
        "invoice_number": gt.get("invoice_number"),
        "invoice_date": gt.get("invoice_date"),
        "due_date": gt.get("due_date"),
        "currency": gt.get("currency"),
        "subtotal": gt.get("subtotal"),
        "tax_amount": gt.get("tax_amount"),
        "total_amount": gt.get("total_amount"),
        "payment_terms": gt.get("payment_terms"),
        "items": [
            {
                "description": item.get("description", ""),
                "quantity": item.get("quantity", 1.0),
                "unit_price": item.get("unit_price", 0.0),
                "total": item.get("total", 0.0),
                "tax_rate": item.get("tax_rate"),
            }
            for item in gt.get("items", [])
        ],
        "notes": gt.get("notes"),
        "accounting_entry": gt.get("accounting_entry"),
        "confidence": gt.get("confidence"),
    }
    return json.dumps(output, ensure_ascii=False, indent=2)


def prepare_dataset() -> tuple[list[dict], list[dict]]:
    """Build train/test conversation datasets.

    Returns:
        (train_samples, test_samples) where each sample is a dict with:
        - file: filename
        - image_path: absolute path to image
        - image_base64: base64-encoded preprocessed image
        - conversations: list of {role, content} dicts
    """
    if not ANNOTATIONS_JSON.exists():
        print(f"ERROR: {ANNOTATIONS_JSON} not found.", file=sys.stderr)
        print("Run: python -m training.annotate.bootstrap_annotations", file=sys.stderr)
        sys.exit(1)

    data = json.loads(ANNOTATIONS_JSON.read_text(encoding="utf-8"))
    prompt = _load_prompt()
    samples: list[dict] = []

    for entry in data["entries"]:
        if entry.get("needs_manual_review"):
            continue

        file_name = entry["file"]
        image_path = _resolve_image_path(file_name)
        if image_path is None:
            print(f"  SKIP: {file_name} — file not found in test-data/")
            continue

        image_b64 = _load_and_preprocess_image_to_base64(image_path)
        if image_b64 is None:
            continue

        gt_json = _build_ground_truth_json(entry["ground_truth"])

        # Build Qwen2.5-VL conversation format
        conversations = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": f"data:image/jpeg;base64,{image_b64}"},
                    {"type": "text", "text": prompt},
                ],
            },
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": gt_json},
                ],
            },
        ]

        samples.append({
            "file": file_name,
            "image_path": str(image_path),
            "conversations": conversations,
        })

    print(f"Prepared {len(samples)} valid samples")

    if len(samples) < 2:
        print("ERROR: Need at least 2 samples for train/test split", file=sys.stderr)
        sys.exit(1)

    # Split into train/test
    train_samples, test_samples = train_test_split(
        samples,
        train_size=TRAIN_SPLIT_RATIO,
        random_state=RANDOM_SEED,
        shuffle=True,
    )

    print(f"  Train: {len(train_samples)} samples")
    print(f"  Test:  {len(test_samples)} samples")

    return train_samples, test_samples


def main() -> None:
    train_samples, test_samples = prepare_dataset()

    output_dir = CHECKPOINTS_DIR / "dataset"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Save without the base64 images to keep file sizes manageable
    # The actual training script will load images on-the-fly
    def _strip_base64(samples: list[dict]) -> list[dict]:
        stripped = []
        for s in samples:
            conv = []
            for msg in s["conversations"]:
                new_content = []
                for part in msg["content"]:
                    if part.get("type") == "image":
                        new_content.append({"type": "image", "image": s["image_path"]})
                    else:
                        new_content.append(part)
                conv.append({"role": msg["role"], "content": new_content})
            stripped.append({
                "file": s["file"],
                "image_path": s["image_path"],
                "conversations": conv,
            })
        return stripped

    train_path = output_dir / "train.json"
    test_path = output_dir / "test.json"

    train_path.write_text(
        json.dumps(_strip_base64(train_samples), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    test_path.write_text(
        json.dumps(_strip_base64(test_samples), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"\nSaved to:")
    print(f"  {train_path}")
    print(f"  {test_path}")


if __name__ == "__main__":
    main()
