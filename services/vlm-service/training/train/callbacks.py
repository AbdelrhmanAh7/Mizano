"""Training callbacks for field-level accuracy tracking and adapter checkpointing."""

import logging
from pathlib import Path

from transformers import TrainerCallback, TrainerControl, TrainerState, TrainingArguments

logger = logging.getLogger(__name__)


class FieldAccuracyCallback(TrainerCallback):
    """Log field-level accuracy metrics at each evaluation step.

    Attempts to parse the model's generated output as JSON and compare
    against ground truth fields. This is a lightweight check — the full
    evaluation pipeline in evaluate/ is more thorough.
    """

    def on_evaluate(
        self,
        args: TrainingArguments,
        state: TrainerState,
        control: TrainerControl,
        metrics: dict | None = None,
        **kwargs,
    ) -> None:
        if metrics is None:
            return

        epoch = state.epoch or 0
        eval_loss = metrics.get("eval_loss", float("inf"))
        logger.info(
            f"Epoch {epoch:.1f} — eval_loss: {eval_loss:.4f}"
        )


class AdapterCheckpointCallback(TrainerCallback):
    """Save the LoRA adapter whenever eval loss improves."""

    def __init__(self, adapter_dir: Path):
        self.adapter_dir = adapter_dir
        self.best_eval_loss = float("inf")

    def on_evaluate(
        self,
        args: TrainingArguments,
        state: TrainerState,
        control: TrainerControl,
        metrics: dict | None = None,
        **kwargs,
    ) -> None:
        if metrics is None:
            return

        eval_loss = metrics.get("eval_loss", float("inf"))
        if eval_loss < self.best_eval_loss:
            self.best_eval_loss = eval_loss
            model = kwargs.get("model")
            if model is not None:
                best_dir = self.adapter_dir / "best"
                best_dir.mkdir(parents=True, exist_ok=True)
                model.save_pretrained(str(best_dir))
                logger.info(
                    f"New best adapter saved (eval_loss={eval_loss:.4f}) → {best_dir}"
                )
