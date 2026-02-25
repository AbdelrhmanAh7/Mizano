from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MODEL_NAME: str = "Qwen/Qwen2.5-VL-7B-Instruct-AWQ"
    DEVICE: str = "cuda"  # "cuda" or "cpu"
    MAX_NEW_TOKENS: int = 4096
    TEMPERATURE: float = 0.1  # Low temp for deterministic JSON output
    TOP_P: float = 0.9
    HOST: str = "0.0.0.0"
    PORT: int = 8100
    LOG_LEVEL: str = "info"
    VLM_MOCK: bool = False  # If True, return dummy data (testing without GPU)
    MAX_IMAGE_RESOLUTION: int = 1280  # Max pixels on longest side

    # Engine selection: "transformers" or "vllm"
    ENGINE: str = "transformers"

    # vLLM-specific settings
    VLLM_GPU_MEMORY_UTILIZATION: float = 0.85
    VLLM_MAX_MODEL_LEN: int = 4096
    VLLM_MAX_NUM_SEQS: int = 4  # Max concurrent sequences
    VLLM_ENFORCE_EAGER: bool = True  # Disable CUDA graphs (more stable with AWQ)

    model_config = SettingsConfigDict(env_file=".env")


@lru_cache
def get_settings() -> Settings:
    return Settings()
