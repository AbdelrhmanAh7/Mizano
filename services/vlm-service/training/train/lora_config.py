"""LoRA configuration for Qwen2.5-VL fine-tuning.

Targets attention projections in the language model layers.
AWQ-compatible: LoRA adapters sit on top of quantized weights.
"""

from peft import LoraConfig, TaskType

from training.config import LORA_ALPHA, LORA_DROPOUT, LORA_RANK, LORA_TARGET_MODULES


def get_lora_config() -> LoraConfig:
    """Create the LoRA configuration for Qwen2.5-VL.

    Targets q/k/v/o attention projections — these are the most impactful
    layers for adapting the model to our specific JSON output format and
    Arabic invoice patterns, while keeping VRAM usage minimal.
    """
    return LoraConfig(
        r=LORA_RANK,
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        target_modules=LORA_TARGET_MODULES,
        task_type=TaskType.CAUSAL_LM,
        bias="none",
        modules_to_save=None,  # Don't save full modules, only adapters
    )
