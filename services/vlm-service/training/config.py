"""Centralized training hyperparameters and paths."""

from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────
VLM_SERVICE_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = VLM_SERVICE_ROOT.parent.parent
TEST_DATA_DIR = PROJECT_ROOT / "test-data"
GROUND_TRUTH_TS = (
    PROJECT_ROOT
    / "apps"
    / "api"
    / "src"
    / "modules"
    / "ai"
    / "__tests__"
    / "fixtures"
    / "ground-truth.ts"
)
ANNOTATIONS_DIR = VLM_SERVICE_ROOT / "annotations"
ANNOTATIONS_JSON = ANNOTATIONS_DIR / "ground_truth.json"
CHECKPOINTS_DIR = VLM_SERVICE_ROOT / "checkpoints"
ADAPTERS_DIR = VLM_SERVICE_ROOT / "adapters"
FINAL_ADAPTER_DIR = ADAPTERS_DIR / "final"

# ── Base model ───────────────────────────────────────────────────────
MODEL_NAME = "Qwen/Qwen2.5-VL-7B-Instruct-AWQ"
MAX_IMAGE_RESOLUTION = 1280

# ── LoRA hyperparameters ─────────────────────────────────────────────
LORA_RANK = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05
LORA_TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj"]

# ── Training hyperparameters ─────────────────────────────────────────
NUM_EPOCHS = 10
BATCH_SIZE = 1
GRADIENT_ACCUMULATION_STEPS = 4
LEARNING_RATE = 2e-4
LR_SCHEDULER_TYPE = "cosine"
WARMUP_RATIO = 0.1
WEIGHT_DECAY = 0.01

# ── Memory optimizations ────────────────────────────────────────────
GRADIENT_CHECKPOINTING = True
BF16 = True
MAX_NEW_TOKENS = 4096

# ── Data split ───────────────────────────────────────────────────────
TRAIN_SPLIT_RATIO = 0.85
RANDOM_SEED = 42

# ── Augmentation ─────────────────────────────────────────────────────
AUGMENTATION_FACTOR = 4  # Multiply dataset size by this factor
