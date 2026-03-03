"""Main LoRA fine-tuning script for Qwen2.5-VL on invoice extraction.

Usage:
    python -m training.train.train_lora
    python -m training.train.train_lora --epochs 3 --dry-run
"""

import argparse
import json
import logging
import sys
from pathlib import Path

import torch
from peft import get_peft_model
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration, TrainingArguments, Trainer

from training.config import (
    BATCH_SIZE,
    BF16,
    CHECKPOINTS_DIR,
    FINAL_ADAPTER_DIR,
    GRADIENT_ACCUMULATION_STEPS,
    GRADIENT_CHECKPOINTING,
    LEARNING_RATE,
    LR_SCHEDULER_TYPE,
    MODEL_NAME,
    NUM_EPOCHS,
    WARMUP_RATIO,
    WEIGHT_DECAY,
)
from training.data.augmentation import augment_image, get_augmentation_pipeline
from training.data.data_collator import Qwen2VLDataCollator
from training.train.callbacks import AdapterCheckpointCallback, FieldAccuracyCallback
from training.train.lora_config import get_lora_config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


class InvoiceDataset(torch.utils.data.Dataset):
    """Dataset that wraps conversation samples for training."""

    def __init__(self, samples: list[dict], augment: bool = False, aug_factor: int = 4):
        self.original_samples = samples
        self.augment = augment
        self.aug_factor = aug_factor if augment else 1

    def __len__(self) -> int:
        return len(self.original_samples) * self.aug_factor

    def __getitem__(self, idx: int) -> dict:
        original_idx = idx % len(self.original_samples)
        sample = self.original_samples[original_idx]

        return {
            "image_path": sample["image_path"],
            "conversations": sample["conversations"],
            "is_augmented": idx >= len(self.original_samples),
        }


def load_dataset_splits() -> tuple[list[dict], list[dict]]:
    """Load pre-prepared train/test splits."""
    dataset_dir = CHECKPOINTS_DIR / "dataset"
    train_path = dataset_dir / "train.json"
    test_path = dataset_dir / "test.json"

    if not train_path.exists() or not test_path.exists():
        print("ERROR: Dataset not prepared. Run: python -m training.data.prepare_dataset", file=sys.stderr)
        sys.exit(1)

    train_samples = json.loads(train_path.read_text(encoding="utf-8"))
    test_samples = json.loads(test_path.read_text(encoding="utf-8"))

    return train_samples, test_samples


def train(
    epochs: int | None = None,
    dry_run: bool = False,
    resume_from: str | None = None,
) -> None:
    """Run LoRA fine-tuning.

    Args:
        epochs: Override number of training epochs.
        dry_run: If True, run 1 epoch with 2 steps only (for testing).
        resume_from: Path to a checkpoint to resume training from.
    """
    num_epochs = epochs or NUM_EPOCHS
    if dry_run:
        num_epochs = 1

    logger.info("Loading dataset splits...")
    train_samples, test_samples = load_dataset_splits()
    logger.info(f"Train: {len(train_samples)} samples, Test: {len(test_samples)} samples")

    # Load base model
    logger.info(f"Loading base model: {MODEL_NAME}")
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        MODEL_NAME,
        device_map="auto",
        torch_dtype=torch.bfloat16 if BF16 else torch.float16,
    )
    processor = AutoProcessor.from_pretrained(MODEL_NAME)

    # Enable gradient checkpointing for memory efficiency
    if GRADIENT_CHECKPOINTING:
        model.gradient_checkpointing_enable()

    # Apply LoRA
    logger.info("Applying LoRA adapters...")
    lora_config = get_lora_config()
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Augmentation pipeline for training
    aug_pipeline = get_augmentation_pipeline()
    aug_fn = (lambda img: augment_image(img, aug_pipeline)) if aug_pipeline else None

    # Create datasets
    train_dataset = InvoiceDataset(train_samples, augment=True)
    eval_dataset = InvoiceDataset(test_samples, augment=False)

    # Data collator
    train_collator = Qwen2VLDataCollator(processor, augmentation_fn=aug_fn)
    eval_collator = Qwen2VLDataCollator(processor, augmentation_fn=None)

    # Training arguments
    output_dir = str(CHECKPOINTS_DIR / "lora-training")
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRADIENT_ACCUMULATION_STEPS,
        learning_rate=LEARNING_RATE,
        lr_scheduler_type=LR_SCHEDULER_TYPE,
        warmup_ratio=WARMUP_RATIO,
        weight_decay=WEIGHT_DECAY,
        bf16=BF16,
        logging_steps=1,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=3,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        remove_unused_columns=False,
        dataloader_pin_memory=False,
        report_to="none",
        max_steps=2 if dry_run else -1,
    )

    # Callbacks
    callbacks = [
        AdapterCheckpointCallback(adapter_dir=FINAL_ADAPTER_DIR),
    ]

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        data_collator=train_collator,
        callbacks=callbacks,
    )

    # Train
    logger.info(f"Starting training: {num_epochs} epochs, batch_size={BATCH_SIZE}, "
                f"grad_accum={GRADIENT_ACCUMULATION_STEPS}, lr={LEARNING_RATE}")

    if resume_from:
        trainer.train(resume_from_checkpoint=resume_from)
    else:
        trainer.train()

    # Save final adapter
    logger.info(f"Saving final adapter to {FINAL_ADAPTER_DIR}")
    FINAL_ADAPTER_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(FINAL_ADAPTER_DIR))
    processor.save_pretrained(str(FINAL_ADAPTER_DIR))

    logger.info("Training complete!")

    # Print final metrics
    metrics = trainer.evaluate()
    logger.info(f"Final eval metrics: {metrics}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune Qwen2.5-VL with LoRA")
    parser.add_argument("--epochs", type=int, default=None, help="Override number of epochs")
    parser.add_argument("--dry-run", action="store_true", help="Run 1 epoch with 2 steps only")
    parser.add_argument("--resume-from", type=str, default=None, help="Checkpoint path to resume from")
    args = parser.parse_args()

    train(epochs=args.epochs, dry_run=args.dry_run, resume_from=args.resume_from)


if __name__ == "__main__":
    main()
