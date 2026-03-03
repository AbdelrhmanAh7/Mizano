import asyncio
import logging
import time
from abc import ABC, abstractmethod
from typing import Any

from PIL import Image

from app.config import Settings, get_settings
from app.prompts.invoice_extraction import INVOICE_EXTRACTION_PROMPT
from app.utils.json_parser import extract_json_from_vlm_output

logger = logging.getLogger(__name__)

# Realistic bilingual (Arabic/English) mock response used when VLM_MOCK=True.
# This allows the NestJS backend and frontend to be developed without GPU access.
MOCK_RESPONSE: dict[str, Any] = {
    "document_type": "invoice",
    "invoice_number": "INV-2024-001234",
    "invoice_date": "2024-12-15",
    "due_date": "2025-01-14",
    "currency": "SAR",
    "payment_terms": "Net 30",
    "vendor": {
        "name": "Al-Faisal Trading Co. / شركة الفيصل التجارية",
        "address": "King Fahd Road, Riyadh 12345, Saudi Arabia",
        "tax_id": "300123456789003",
        "phone": "+966 11 234 5678",
        "email": None,
    },
    "bill_to": {
        "name": "Sample Customer LLC",
        "address": "123 Business St, Riyadh, Saudi Arabia",
        "tax_id": None,
    },
    "ship_to": {
        "name": None,
        "address": None,
    },
    "line_items": [
        {
            "line_number": 1,
            "description": "Office Supplies / مستلزمات مكتبية",
            "quantity": 10,
            "unit_price": 300.0,
            "taxable_amount": 3000.0,
            "tax_rate_percent": 15.0,
            "tax_amount": 450.0,
            "line_total": 3450.0,
        },
        {
            "line_number": 2,
            "description": "Printer Paper A4 / ورق طباعة",
            "quantity": 20,
            "unit_price": 100.0,
            "taxable_amount": 2000.0,
            "tax_rate_percent": 15.0,
            "tax_amount": 300.0,
            "line_total": 2300.0,
        },
    ],
    "subtotal": 5000.00,
    "tax_total": 750.00,
    "discount": 0.00,
    "total": 5750.00,
    "amount_paid": 0.00,
    "balance_due": 5750.00,
    "notes": None,
    "accounting_entry": {
        "debit_account": "Office Supplies",
        "credit_account": "Accounts Payable",
        "tax_account": "Input VAT",
    },
    "confidence": {
        "overall": 0.95,
        "vendor_name": 0.98,
        "invoice_date": 0.92,
        "total_amount": 0.97,
        "line_items": 0.90,
    },
}


# ------------------------------------------------------------------
# Abstract base engine (with shared metrics & GPU helpers)
# ------------------------------------------------------------------


class BaseEngine(ABC):
    """Abstract base for all VLM inference engines.

    Provides shared metrics tracking (_total_requests, _total_inference_ms,
    total_requests, average_inference_ms) and GPU stats so that subclasses
    don't duplicate this boilerplate.
    """

    def __init__(self) -> None:
        self._total_requests: int = 0
        self._total_inference_ms: float = 0.0

    # -- Metrics --

    def _track_inference(self, elapsed_ms: float) -> None:
        """Record one inference request's timing."""
        self._total_requests += 1
        self._total_inference_ms += elapsed_ms

    @property
    def total_requests(self) -> int:
        return self._total_requests

    @property
    def average_inference_ms(self) -> float:
        if self._total_requests == 0:
            return 0.0
        return round(self._total_inference_ms / self._total_requests, 1)

    # -- GPU helpers --

    def get_gpu_stats(self) -> dict:
        """Return current GPU VRAM usage. Safe to call without a GPU."""
        try:
            import torch

            if not torch.cuda.is_available():
                return {}

            device = torch.cuda.current_device()
            used_bytes = torch.cuda.memory_allocated(device)
            props = torch.cuda.get_device_properties(device)
            total_bytes = props.total_memory

            return {
                "gpu_memory_used_mb": round(used_bytes / 1024 / 1024, 1),
                "gpu_memory_total_mb": round(total_bytes / 1024 / 1024, 1),
            }
        except Exception:
            return {}

    @staticmethod
    def _clear_cuda_cache() -> None:
        """Release CUDA memory if available."""
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info("CUDA cache cleared.")
        except ImportError:
            pass

    # -- Abstract interface --

    @abstractmethod
    async def load_model(self) -> None: ...

    @abstractmethod
    async def unload_model(self) -> None: ...

    @abstractmethod
    async def extract_invoice(self, image: Image.Image) -> dict: ...

    @abstractmethod
    def is_loaded(self) -> bool: ...


# ------------------------------------------------------------------
# Mock engine
# ------------------------------------------------------------------


class MockEngine(BaseEngine):
    """Returns realistic dummy data without loading any model.

    Used for full-stack development and testing without a GPU.
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__()
        self._settings = settings

    async def load_model(self) -> None:
        logger.info("Mock mode enabled — VLM model will NOT be loaded.")

    async def unload_model(self) -> None:
        logger.info("Mock engine unloaded (no-op).")

    async def extract_invoice(self, image: Image.Image) -> dict:
        start_ms = time.perf_counter() * 1000
        elapsed = time.perf_counter() * 1000 - start_ms
        result = dict(MOCK_RESPONSE)
        result["processing_time_ms"] = round(elapsed, 2)
        self._track_inference(result["processing_time_ms"])
        return result

    def get_gpu_stats(self) -> dict:
        return {}

    def is_loaded(self) -> bool:
        return True


# ------------------------------------------------------------------
# Transformers engine (existing implementation)
# ------------------------------------------------------------------


class TransformersEngine(BaseEngine):
    """Uses HuggingFace transformers for inference.

    Simpler setup with fewer dependencies. Best for development.
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__()
        self._settings = settings
        self.model: Any = None
        self.processor: Any = None

    async def load_model(self) -> None:
        logger.info("Loading model '%s' with transformers engine …", self._settings.MODEL_NAME)
        start = time.perf_counter()

        await asyncio.get_event_loop().run_in_executor(None, self._load_model_sync)

        elapsed_s = time.perf_counter() - start
        gpu_stats = self.get_gpu_stats()
        logger.info(
            "Transformers engine: model loaded in %.1f s. GPU VRAM used: %.0f MB / %.0f MB",
            elapsed_s,
            gpu_stats.get("gpu_memory_used_mb", 0),
            gpu_stats.get("gpu_memory_total_mb", 0),
        )

    def _load_model_sync(self) -> None:
        from transformers import AutoProcessor, Qwen2VLForConditionalGeneration

        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            self._settings.MODEL_NAME,
            device_map="auto",
        )
        self.processor = AutoProcessor.from_pretrained(self._settings.MODEL_NAME)

        # Load LoRA adapter if enabled
        if self._settings.LORA_ENABLED and self._settings.LORA_ADAPTER_PATH:
            from peft import PeftModel

            adapter_path = self._settings.LORA_ADAPTER_PATH
            logger.info("Loading LoRA adapter from %s", adapter_path)
            self.model = PeftModel.from_pretrained(self.model, adapter_path)
            self.model = self.model.merge_and_unload()
            logger.info("LoRA adapter merged — zero-overhead inference enabled")

    async def unload_model(self) -> None:
        if self.model is not None:
            del self.model
            self.model = None
        if self.processor is not None:
            del self.processor
            self.processor = None

        self._clear_cuda_cache()
        logger.info("Transformers engine unloaded.")

    async def extract_invoice(self, image: Image.Image) -> dict:
        start_ms = time.perf_counter() * 1000

        if self.model is None or self.processor is None:
            raise RuntimeError("Model is not loaded. Call load_model() first.")

        raw_output = await asyncio.get_event_loop().run_in_executor(
            None, self._run_inference_sync, image
        )

        elapsed = time.perf_counter() * 1000 - start_ms
        result = extract_json_from_vlm_output(raw_output)
        result["raw_text"] = raw_output
        result["processing_time_ms"] = round(elapsed, 2)

        self._track_inference(result["processing_time_ms"])
        return result

    def _run_inference_sync(self, image: Image.Image) -> str:
        from qwen_vl_utils import process_vision_info

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": INVOICE_EXTRACTION_PROMPT},
                ],
            }
        ]

        text = self.processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        image_inputs, video_inputs = process_vision_info(messages)
        inputs = self.processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to(self.model.device)

        generated_ids = self.model.generate(
            **inputs,
            max_new_tokens=self._settings.MAX_NEW_TOKENS,
            temperature=self._settings.TEMPERATURE,
            top_p=self._settings.TOP_P,
            do_sample=False,
        )

        input_length = inputs["input_ids"].shape[1]
        generated_ids_trimmed = generated_ids[:, input_length:]
        output_text: str = self.processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0]

        return output_text

    def is_loaded(self) -> bool:
        return self.model is not None


# ------------------------------------------------------------------
# vLLM engine (high throughput production engine)
# ------------------------------------------------------------------


class VllmEngine(BaseEngine):
    """Uses vLLM for inference with continuous batching and PagedAttention.

    Provides 3-5x higher throughput compared to transformers. Best for production.
    """

    def __init__(self, settings: Settings) -> None:
        super().__init__()
        self._settings = settings
        self.llm: Any = None
        self._lora_request: Any = None  # vLLM LoRARequest for inference

    async def load_model(self) -> None:
        logger.info("Loading model '%s' with vLLM engine …", self._settings.MODEL_NAME)
        start = time.perf_counter()

        await asyncio.get_event_loop().run_in_executor(None, self._load_model_sync)

        elapsed_s = time.perf_counter() - start
        gpu_stats = self.get_gpu_stats()
        logger.info(
            "vLLM engine: model loaded in %.1f s. GPU VRAM used: %.0f MB / %.0f MB",
            elapsed_s,
            gpu_stats.get("gpu_memory_used_mb", 0),
            gpu_stats.get("gpu_memory_total_mb", 0),
        )

    def _load_model_sync(self) -> None:
        from vllm import LLM

        lora_enabled = self._settings.LORA_ENABLED and self._settings.LORA_ADAPTER_PATH

        self.llm = LLM(
            model=self._settings.MODEL_NAME,
            dtype="auto",
            quantization="awq",
            gpu_memory_utilization=self._settings.VLLM_GPU_MEMORY_UTILIZATION,
            max_model_len=self._settings.VLLM_MAX_MODEL_LEN,
            max_num_seqs=self._settings.VLLM_MAX_NUM_SEQS,
            enforce_eager=self._settings.VLLM_ENFORCE_EAGER,
            trust_remote_code=True,
            enable_lora=lora_enabled,
            max_lora_rank=32 if lora_enabled else None,
        )

        if lora_enabled:
            from vllm.lora.request import LoRARequest

            self._lora_request = LoRARequest(
                lora_name="invoice-lora",
                lora_int_id=1,
                lora_path=self._settings.LORA_ADAPTER_PATH,
            )
            logger.info("vLLM LoRA adapter registered: %s", self._settings.LORA_ADAPTER_PATH)

    async def unload_model(self) -> None:
        if self.llm is not None:
            del self.llm
            self.llm = None

        self._clear_cuda_cache()
        logger.info("vLLM engine unloaded.")

    async def extract_invoice(self, image: Image.Image) -> dict:
        start_ms = time.perf_counter() * 1000

        if self.llm is None:
            raise RuntimeError("vLLM model is not loaded. Call load_model() first.")

        raw_output = await asyncio.get_event_loop().run_in_executor(
            None, self._run_inference_sync, image
        )

        elapsed = time.perf_counter() * 1000 - start_ms
        result = extract_json_from_vlm_output(raw_output)
        result["raw_text"] = raw_output
        result["processing_time_ms"] = round(elapsed, 2)

        self._track_inference(result["processing_time_ms"])
        return result

    def _run_inference_sync(self, image: Image.Image) -> str:
        from vllm import SamplingParams

        sampling_params = SamplingParams(
            temperature=self._settings.TEMPERATURE,
            top_p=self._settings.TOP_P,
            max_tokens=self._settings.MAX_NEW_TOKENS,
        )

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image}},
                    {"type": "text", "text": INVOICE_EXTRACTION_PROMPT},
                ],
            }
        ]

        kwargs = {"sampling_params": sampling_params}
        if self._lora_request is not None:
            kwargs["lora_request"] = self._lora_request

        outputs = self.llm.chat(messages, **kwargs)
        return outputs[0].outputs[0].text

    def is_loaded(self) -> bool:
        return self.llm is not None


# ------------------------------------------------------------------
# Factory
# ------------------------------------------------------------------


def create_engine(settings: Settings | None = None) -> BaseEngine:
    """Create the appropriate VLM engine based on configuration.

    Priority: VLM_MOCK > ENGINE setting.
    """
    if settings is None:
        settings = get_settings()

    if settings.VLM_MOCK:
        logger.info("Creating MockEngine (VLM_MOCK=True)")
        return MockEngine(settings)
    elif settings.ENGINE == "vllm":
        logger.info("Creating VllmEngine (ENGINE=vllm)")
        return VllmEngine(settings)
    else:
        logger.info("Creating TransformersEngine (ENGINE=transformers)")
        return TransformersEngine(settings)
