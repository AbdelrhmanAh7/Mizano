#!/usr/bin/env python3
"""
scripts/test_employee_jobtitle_position.py

Hygiene and regression test verifying that employee type definitions across
payslip templates, shared-types, frontend hooks, and Prisma schema consistently
define both `jobTitle` and `position` properties.

This prevents the regression flagged in PR #305 (finding 1dd672bf5a3d / issue #370):
'The code uses payslip.employee.position ?? payslip.employee.jobTitle but the
employee type definition doesn't show jobTitle as a valid property.'
"""

import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def validate_payslip_template_employee(content: str) -> list[str]:
    violations = []

    # Check PayslipData interface employee definition
    payslip_data_match = re.search(
        r"export\s+interface\s+PayslipData\s*\{([\s\S]*?)\n\}", content
    )
    if not payslip_data_match:
        violations.append("PayslipData interface not found")
        return violations

    payslip_data_body = payslip_data_match.group(1)
    employee_block_match = re.search(
        r"employee:\s*\{([\s\S]*?)\};", payslip_data_body
    )
    if not employee_block_match:
        violations.append("employee block not found in PayslipData")
        return violations

    employee_block = employee_block_match.group(1)
    if not re.search(r"\bjobTitle\??\s*:\s*string", employee_block):
        violations.append("PayslipData.employee is missing 'jobTitle?: string'")
    if not re.search(r"\bposition\??\s*:\s*string", employee_block):
        violations.append("PayslipData.employee is missing 'position?: string'")

    # Check fallback logic in HTML generation
    if not re.search(
        r"payslip\.employee\.position\s*(?:\|\||\?\?)\s*payslip\.employee\.jobTitle",
        content,
    ):
        violations.append(
            "generatePayslipHtml does not fall back from position to jobTitle"
        )

    return violations


def validate_shared_types_employee(content: str) -> list[str]:
    violations = []
    emp_match = re.search(
        r"export\s+interface\s+Employee\s+extends\s+OrganizationEntity\s*\{([\s\S]*?)\n\}",
        content,
    )
    if not emp_match:
        violations.append("Employee interface not found in shared-types")
        return violations

    emp_body = emp_match.group(1)
    if not re.search(r"\bjobTitle\??\s*:", emp_body):
        violations.append("shared-types Employee interface missing jobTitle")
    if not re.search(r"\bposition\??\s*:", emp_body):
        violations.append("shared-types Employee interface missing position")
    return violations


def validate_web_hooks_employee(content: str) -> list[str]:
    violations = []
    emp_match = re.search(
        r"export\s+interface\s+Employee\s*\{([\s\S]*?)\n\}", content
    )
    if not emp_match:
        violations.append("Employee interface not found in use-hr.ts")
        return violations

    emp_body = emp_match.group(1)
    if not re.search(r"\bjobTitle\??\s*:", emp_body):
        violations.append("use-hr.ts Employee interface missing jobTitle")
    if not re.search(r"\bposition\??\s*:", emp_body):
        violations.append("use-hr.ts Employee interface missing position")
    return violations


def validate_prisma_schema_employee(content: str) -> list[str]:
    violations = []
    model_match = re.search(r"model\s+Employee\s*\{([\s\S]*?)\n\}", content)
    if not model_match:
        violations.append("model Employee not found in schema.prisma")
        return violations

    model_body = model_match.group(1)
    if not re.search(r"^\s*jobTitle\s+String\?", model_body, re.MULTILINE):
        violations.append("schema.prisma Employee model missing jobTitle")
    if not re.search(r"^\s*position\s+String\?", model_body, re.MULTILINE):
        violations.append("schema.prisma Employee model missing position")
    return violations


class EmployeeJobTitlePositionTests(unittest.TestCase):
    def test_payslip_template_employee_has_jobtitle_and_position(self):
        template_file = (
            REPO_ROOT
            / "apps"
            / "api"
            / "src"
            / "modules"
            / "documents"
            / "templates"
            / "payslip.template.ts"
        )
        self.assertTrue(template_file.exists(), f"{template_file} must exist")
        violations = validate_payslip_template_employee(
            template_file.read_text(encoding="utf-8")
        )
        self.assertEqual(
            violations,
            [],
            f"payslip.template.ts violations: {violations}",
        )

    def test_packages_shared_types_employee_has_jobtitle_and_position(self):
        shared_file = (
            REPO_ROOT / "packages" / "shared-types" / "src" / "entities" / "hr.ts"
        )
        self.assertTrue(shared_file.exists(), f"{shared_file} must exist")
        violations = validate_shared_types_employee(
            shared_file.read_text(encoding="utf-8")
        )
        self.assertEqual(
            violations,
            [],
            f"shared-types hr.ts violations: {violations}",
        )

    def test_web_hr_hooks_employee_has_jobtitle_and_position(self):
        web_file = REPO_ROOT / "apps" / "web" / "lib" / "hooks" / "use-hr.ts"
        self.assertTrue(web_file.exists(), f"{web_file} must exist")
        violations = validate_web_hooks_employee(
            web_file.read_text(encoding="utf-8")
        )
        self.assertEqual(
            violations,
            [],
            f"use-hr.ts violations: {violations}",
        )

    def test_prisma_schema_employee_has_jobtitle_and_position(self):
        schema_file = REPO_ROOT / "apps" / "api" / "prisma" / "schema.prisma"
        self.assertTrue(schema_file.exists(), f"{schema_file} must exist")
        violations = validate_prisma_schema_employee(
            schema_file.read_text(encoding="utf-8")
        )
        self.assertEqual(
            violations,
            [],
            f"schema.prisma violations: {violations}",
        )

    def test_regression_planted_missing_jobtitle_detected(self):
        # Sample code missing jobTitle on employee block (the exact base code state)
        planted_code = (
            "export interface PayslipData {\n"
            "  employee: {\n"
            "    name: string;\n"
            "    employeeId: string;\n"
            "    department?: string;\n"
            "    position?: string;\n"
            "  };\n"
            "}\n"
            "function generatePayslipHtml() {\n"
            "  const p = payslip.employee.position;\n"
            "}\n"
        )
        violations = validate_payslip_template_employee(planted_code)
        self.assertEqual(len(violations), 2)
        self.assertIn("missing 'jobTitle?: string'", violations[0])
        self.assertIn("does not fall back from position to jobTitle", violations[1])


if __name__ == "__main__":
    unittest.main()
