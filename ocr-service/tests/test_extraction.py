"""Tests for OCR extraction logic (parsing, validation, no OCR engines needed)."""

import pytest

from app.models.schemas import ConfidenceScores, LineItem, OcrExtractionResult, OcrTextBlock, ValidationResult
from app.parser import document_parser, table_parser, validator


class TestDateParsing:
    def test_dd_mm_yyyy(self):
        assert document_parser.parse_date("15/01/2026") == "2026-01-15"

    def test_yyyy_mm_dd(self):
        assert document_parser.parse_date("2026-03-15") == "2026-03-15"

    def test_dd_mon_yyyy(self):
        assert document_parser.parse_date("15 Jan 2026") == "2026-01-15"

    def test_mon_dd_yyyy(self):
        assert document_parser.parse_date("January 15, 2026") == "2026-01-15"

    def test_eight_digit(self):
        assert document_parser.parse_date("15012026") == "2026-01-15"

    def test_no_date(self):
        assert document_parser.parse_date("hello world") is None


class TestInvoiceNumberExtraction:
    def test_inv_dash_number(self):
        assert document_parser.extract_invoice_number("INV-12345") == "INV-12345"

    def test_invoice_number_label(self):
        assert document_parser.extract_invoice_number("Invoice Number: INV-00042") == "INV-00042"

    def test_bill_prefix(self):
        assert document_parser.extract_invoice_number("BILL-9876") == "BILL-9876"

    def test_hash_prefix(self):
        result = document_parser.extract_invoice_number("Invoice #: AB-12345")
        assert result is not None


class TestCurrencyExtraction:
    def test_aed(self):
        assert document_parser.extract_currency("Total: AED 135.45") == "AED"

    def test_usd_symbol(self):
        assert document_parser.extract_currency("Total: $135.45") == "USD"

    def test_eur(self):
        assert document_parser.extract_currency("Amount: EUR 200.00") == "EUR"


class TestAmountExtraction:
    def test_simple(self):
        assert document_parser.extract_amount("135.45") == 135.45

    def test_with_commas(self):
        assert document_parser.extract_amount("1,234.56") == 1234.56

    def test_preserves_decimals(self):
        assert document_parser.extract_amount("124.29") == 124.29

    def test_labeled(self):
        assert document_parser.extract_labeled_amount("Total: 135.45", r"total") == 135.45


class TestNumberParsing:
    def test_simple_float(self):
        assert table_parser._parse_number("124.29") == 124.29

    def test_comma_thousands(self):
        assert table_parser._parse_number("1,234.56") == 1234.56

    def test_decimal_comma(self):
        assert table_parser._parse_number("124,29") == 124.29

    def test_integer(self):
        assert table_parser._parse_number("42") == 42.0


class TestValidation:
    def test_correct_line_item_passes(self):
        result = OcrExtractionResult(
            line_items=[
                LineItem(
                    line_number=1,
                    description="Service",
                    quantity=1.22,
                    unit_price=124.29,
                    line_total=151.63,
                )
            ],
            subtotal=151.63,
            total=151.63,
        )
        validated = validator.validate_and_correct(result)
        line_check = [c for c in validated.validation.checks if "qty_x_rate" in c.name]
        assert len(line_check) > 0

    def test_auto_correct_missing_decimal(self):
        """If unit_price=12429 but qty*12429 != total, try dividing by 100."""
        result = OcrExtractionResult(
            line_items=[
                LineItem(
                    line_number=1,
                    description="Service",
                    quantity=1.0,
                    unit_price=12429.0,
                    line_total=124.29,
                )
            ],
            total=124.29,
        )
        validated = validator.validate_and_correct(result)
        assert validated.line_items[0].unit_price == pytest.approx(124.29)
        assert len(validated.validation.corrections_applied) > 0

    def test_auto_correct_quantity(self):
        """If qty=1 but total/rate = 1.22, correct qty to 1.22."""
        result = OcrExtractionResult(
            line_items=[
                LineItem(
                    line_number=1,
                    description="Service",
                    quantity=1.0,
                    unit_price=124.29,
                    line_total=151.63,
                )
            ],
            total=151.63,
        )
        validated = validator.validate_and_correct(result)
        assert validated.line_items[0].quantity == pytest.approx(1.22, abs=0.01)

    def test_tax_rate_calculation(self):
        """Calculate tax rate from tax_amount and taxable_amount."""
        result = OcrExtractionResult(
            line_items=[
                LineItem(
                    line_number=1,
                    description="Service",
                    quantity=1.0,
                    unit_price=120.60,
                    taxable_amount=120.60,
                    tax_amount=6.03,
                    line_total=126.63,
                )
            ],
            subtotal=120.60,
            tax_total=6.03,
            total=126.63,
        )
        validated = validator.validate_and_correct(result)
        assert validated.line_items[0].tax_rate_percent == pytest.approx(5.0, abs=0.1)


class TestConfidenceScoring:
    def test_full_extraction(self):
        result = OcrExtractionResult(
            invoice_number="INV-001",
            invoice_date="2026-01-15",
            due_date="2026-02-15",
            vendor=document_parser.VendorInfo(name="Test Corp", tax_id="123456"),
            line_items=[
                LineItem(
                    line_number=1,
                    description="Service",
                    quantity=1.0,
                    unit_price=100.0,
                    line_total=100.0,
                )
            ],
            subtotal=100.0,
            tax_total=5.0,
            total=105.0,
            validation=ValidationResult(all_passed=True),
        )
        scored = validator.compute_confidence(result)
        assert scored.confidence.overall > 70
        assert scored.confidence.invoice_number > 0
        assert scored.confidence.line_items > 0


class TestDocumentZones:
    def test_detect_zones_empty(self):
        zones = document_parser.detect_zones([], 1000)
        assert zones["header"] == []

    def test_detect_zones_basic(self):
        blocks = [
            OcrTextBlock(text="INVOICE", bbox=[[0, 0], [100, 0], [100, 20], [0, 20]], confidence=0.9),
            OcrTextBlock(text="Description", bbox=[[0, 200], [100, 200], [100, 220], [0, 220]], confidence=0.9),
            OcrTextBlock(text="Service A", bbox=[[0, 240], [100, 240], [100, 260], [0, 260]], confidence=0.9),
            OcrTextBlock(text="Total", bbox=[[0, 400], [100, 400], [100, 420], [0, 420]], confidence=0.9),
        ]
        zones = document_parser.detect_zones(blocks, 500)
        assert len(zones["header"]) > 0
