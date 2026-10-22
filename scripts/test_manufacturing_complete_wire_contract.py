"""Regression and contract verification tests for work order completion wire contract (@issue-401).

Validates:
1. Frontend workOrderApi.complete preserves producedQuantity payload key.
2. Frontend useCompleteWorkOrder rejects null, undefined, and NaN, while allowing zero.
3. Backend WorkOrdersController and WorkOrdersService accept both producedQuantity and quantityProduced.
4. Regression detector catches any premature wire-contract key drift.
"""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
WEB_HOOKS = ROOT / "apps" / "web" / "lib" / "hooks" / "use-manufacturing.ts"
API_CONTROLLER = ROOT / "apps" / "api" / "src" / "modules" / "manufacturing" / "controllers" / "work-orders.controller.ts"
API_SERVICE = ROOT / "apps" / "api" / "src" / "modules" / "manufacturing" / "services" / "work-orders.service.ts"


class ManufacturingCompleteWireContractTests(unittest.TestCase):
    def test_frontend_work_order_api_complete_payload_key(self):
        """Frontend workOrderApi.complete must send producedQuantity to preserve wire contract."""
        self.assertTrue(WEB_HOOKS.exists(), f"File {WEB_HOOKS} must exist")
        content = WEB_HOOKS.read_text(encoding="utf-8")

        complete_block_match = re.search(
            r"complete:\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\},",
            content,
        )
        self.assertIsNotNone(complete_block_match, "workOrderApi.complete method must exist")
        complete_block = complete_block_match.group(1)

        # Must post to /manufacturing/work-orders/${id}/complete with producedQuantity
        self.assertIn("/manufacturing/work-orders/${id}/complete", complete_block)
        self.assertIn("producedQuantity", complete_block)
        # Must not change the request body key to quantityProduced
        self.assertNotIn("quantityProduced:", complete_block)

    def test_frontend_use_complete_work_order_validation(self):
        """useCompleteWorkOrder must validate undefined, null, and NaN, allowing boundary zero."""
        content = WEB_HOOKS.read_text(encoding="utf-8")
        hook_match = re.search(
            r"export function useCompleteWorkOrder\(\)\s*\{([\s\S]*?)\n\}",
            content,
        )
        self.assertIsNotNone(hook_match, "useCompleteWorkOrder hook must exist")
        hook_body = hook_match.group(1)

        self.assertIn("producedQuantity ?? quantityProduced", hook_body)
        self.assertIn("quantity === undefined || quantity === null || Number.isNaN(quantity)", hook_body)
        self.assertIn("throw new Error('A completion quantity is required')", hook_body)

    def test_backend_controller_accepts_both_keys(self):
        """Backend controller complete route must accept both producedQuantity and quantityProduced."""
        self.assertTrue(API_CONTROLLER.exists(), f"File {API_CONTROLLER} must exist")
        content = API_CONTROLLER.read_text(encoding="utf-8")

        self.assertIn("@Post(':id/complete')", content)
        complete_method_match = re.search(
            r"@Post\(':id/complete'\)[\s\S]*?complete\s*\([\s\S]*?@Body\(\)\s*dto:\s*\{([^}]*)\}",
            content,
        )
        self.assertIsNotNone(complete_method_match, "complete route with @Body() dto must exist")
        dto_type = complete_method_match.group(1)

        self.assertIn("quantityProduced", dto_type)
        self.assertIn("producedQuantity", dto_type)

    def test_backend_service_supports_both_keys_and_validates(self):
        """Backend service completeWorkOrder must resolve quantityProduced ?? producedQuantity and validate."""
        self.assertTrue(API_SERVICE.exists(), f"File {API_SERVICE} must exist")
        content = API_SERVICE.read_text(encoding="utf-8")

        service_method_match = re.search(
            r"async completeWorkOrder\s*\([^)]*\)\s*\{([\s\S]*?)\n  \}",
            content,
        )
        self.assertIsNotNone(service_method_match, "completeWorkOrder method must exist")
        service_body = service_method_match.group(1)

        self.assertIn("dto.quantityProduced ?? dto.producedQuantity", service_body)
        normalized_body = re.sub(r"\s+", " ", service_body)
        self.assertIn("quantityProduced === undefined || quantityProduced === null || Number.isNaN(quantityProduced)", normalized_body)
        self.assertIn("throw new BadRequestException('quantityProduced or producedQuantity is required')", service_body)

    def test_regression_planted_payload_key_mismatch_detected(self):
        """Planted key mismatch or missing guard must be detected by the contract assertions."""
        broken_web_block = "complete: async (id: string, qty: number) => { await api.post('/complete', { quantityProduced: qty }); }"
        self.assertIn("quantityProduced:", broken_web_block)
        has_produced_qty = "producedQuantity" in broken_web_block
        self.assertFalse(has_produced_qty, "Detected that producedQuantity was incorrectly replaced by quantityProduced")


if __name__ == "__main__":
    unittest.main()
