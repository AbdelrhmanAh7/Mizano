"""Offline behavior tests: python3 -m unittest discover -s scripts -p 'test_sync_demo_planning.py'."""

import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import urllib.error


SPEC = importlib.util.spec_from_file_location("sync_demo_planning", Path(__file__).with_name("sync-demo-planning.py"))
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)


def manifest():
    return {
        "repository": "AbdelrhmanAh7/Mizano",
        "project": {"owner": "AbdelrhmanAh7", "title": "Mizano demo", "description": "CPU invoice demo"},
        "labels": [{"name": "demo", "color": "ABC123", "description": "Demo scope"}],
        "milestones": [{"key": "M0", "title": "First demo", "description": "Demo scope", "due_on": "2026-09-15T20:59:59Z"}],
        "issues": [
            {"key": "A", "title": "Intake", "body": "Human-readable intake acceptance", "labels": ["demo"], "milestone": "M0", "dependencies": []},
            {"key": "B", "title": "OCR", "body": "Human-readable OCR acceptance", "labels": ["demo"], "milestone": "M0", "dependencies": ["A"]},
        ],
    }


class FakeREST:
    """Persistent remote state, distinct from manifest and response snapshots."""

    def __init__(self):
        self.labels, self.milestones, self.issues = [], [], []
        self.writes = []
        self.edit_before_get = None

    def list_all(self, path):
        collection = path.split("?")[0].rsplit("/", 1)[-1]
        return copy.deepcopy(getattr(self, collection))

    def request(self, method, path, data=None):
        parts = path.split("/")
        if method == "GET":
            if self.edit_before_get:
                self.edit_before_get(self.issues)
                self.edit_before_get = None
            return copy.deepcopy(next(i for i in self.issues if i["number"] == int(parts[-1]))), {}
        self.writes.append((method, path, copy.deepcopy(data)))
        if method == "PATCH":
            issue = next(i for i in self.issues if i["number"] == int(parts[-1]))
            issue.update(data)
            return copy.deepcopy(issue), {}
        collection = parts[-1]
        created = copy.deepcopy(data)
        if collection == "milestones":
            created.update(number=len(self.milestones) + 1, state="open")
        elif collection == "issues":
            created.update(number=len(self.issues) + 1, node_id=f"I_{len(self.issues) + 1}", state="open", assignees=[])
            created["labels"] = [{"name": value} for value in data["labels"]]
            created["milestone"] = {"number": data["milestone"]}
        getattr(self, collection).append(created)
        return copy.deepcopy(created), {}


def connection(nodes, cursor=None):
    return {"nodes": nodes, "pageInfo": {"hasNextPage": cursor is not None, "endCursor": cursor}}


class FakeProject:
    def __init__(self, fail_item=None):
        self.fail_item = fail_item
        self.items = set()
        self.project = None
        self.linked = False
        self.calls = []

    def graphql(self, query, variables):
        self.calls.append((query, variables))
        if "projectsV2(first:" in query:
            return {"user": {"id": "U_1", "projectsV2": connection([self.project] if self.project else [])}, "repository": {"id": "R_1"}}
        if "createProjectV2(" in query:
            self.project = {"id": "P_1", "title": variables["title"], "url": "https://github.com/users/AbdelrhmanAh7/projects/99", "public": False, "closed": False}
            return {"createProjectV2": {"projectV2": self.project}}
        if "updateProjectV2(" in query:
            return {"updateProjectV2": {"projectV2": {"id": "P_1", "public": False}}}
        if "repositories(first:" in query:
            return {"node": {"repositories": connection([{"id": "R_1"}] if self.linked else [])}}
        if "linkProjectV2ToRepository(" in query:
            self.linked = True
            return {"linkProjectV2ToRepository": {"repository": {"id": "R_1"}}}
        if "items(first:" in query:
            return {"node": {"items": connection([{"content": {"id": node_id}} for node_id in self.items])}}
        if "addProjectV2ItemById(" in query:
            if variables["issue"] == self.fail_item:
                raise sync.PlanningError("GitHub GraphQL failed; verify Project token scope and account access")
            self.items.add(variables["issue"])
            return {"addProjectV2ItemById": {"item": {"id": "ITEM_1"}}}
        raise AssertionError("Unexpected test GraphQL operation")


class ValidationTests(unittest.TestCase):
    def test_real_manifest_validates(self):
        path = Path(__file__).resolve().parents[1] / "docs/planning/demo-plan.json"
        if not path.exists():
            self.skipTest("Manifest not present in this checkout")
        sync.validate_plan(json.loads(path.read_text()))

    def test_validate_never_constructs_api_or_reads_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "plan.json"
            output = Path(temporary) / "result.json"
            path.write_text(json.dumps(manifest()))
            with mock.patch.object(sync, "GitHub") as api, mock.patch.dict(sync.os.environ, {}, clear=True), mock.patch("sys.stdout", new_callable=io.StringIO):
                status = sync.main(["--validate", "--manifest", str(path), "--output", str(output)])
            self.assertEqual(status, 0)
            api.assert_not_called()
            result = json.loads(output.read_text())
            self.assertEqual(result["status"], "validated")
            self.assertFalse(any(result["counts"].values()))

    def test_rejects_cycles_unknown_labels_and_bad_dates(self):
        for change in (lambda p: p["issues"][0]["dependencies"].append("B"),
                       lambda p: p["issues"][0]["labels"].append("unknown"),
                       lambda p: p["milestones"][0].update(due_on="2026-02-30T00:00:00Z"),
                       lambda p: p["milestones"][0].update(due_on="2026-09-15T23:59:59+03:00")):
            with self.subTest(change=change):
                plan = manifest()
                change(plan)
                with self.assertRaises(sync.PlanningError):
                    sync.validate_plan(plan)

    def test_future_milestone_can_omit_date(self):
        plan = manifest()
        del plan["milestones"][0]["due_on"]
        sync.validate_plan(plan)
        api = FakeREST()
        self.assertEqual(sync.apply_plan(plan, api)["status"], "completed")
        self.assertNotIn("due_on", api.milestones[0])


class ReconciliationTests(unittest.TestCase):
    def test_idempotency_and_correct_dependency_numbers(self):
        api, plan = FakeREST(), manifest()
        first = sync.apply_plan(plan, api)
        self.assertEqual(first["status"], "completed")
        self.assertEqual(first["counts"]["issues_created"], 2)
        self.assertEqual(first["project"]["status"], "not_configured")
        self.assertIn("- #1 (A)", api.issues[1]["body"])
        writes = len(api.writes)
        second = sync.apply_plan(plan, api)
        self.assertEqual(len(api.writes), writes)
        self.assertEqual(second["counts"]["issues_reused"], 2)
        self.assertEqual(second["counts"]["dependency_sections_updated"], 0)

    def test_preserves_human_edits_title_labels_milestone_state_assignees(self):
        api, plan = FakeREST(), manifest()
        sync.apply_plan(plan, api)
        current = api.issues[1]
        current.update(title="Accountant's corrected scope", state="closed", labels=[{"name": "human-label"}], milestone=None, assignees=[{"login": "accountant"}])
        current["body"] = "New human introduction\n" + current["body"] + "\nHuman trailing note\n"
        before = copy.deepcopy(current)
        plan["issues"][1]["dependencies"] = []
        plan["issues"][1]["body"] = "New manifest text must not overwrite human edits"
        result = sync.apply_plan(plan, api)
        self.assertEqual(result["status"], "completed")
        after = api.issues[1]
        for field in ("title", "labels", "milestone", "state", "assignees"):
            self.assertEqual(before[field], after[field])
        self.assertTrue(after["body"].startswith("New human introduction\n"))
        self.assertTrue(after["body"].endswith("\nHuman trailing note\n"))
        self.assertIn("Human-readable OCR acceptance", after["body"])
        self.assertNotIn("New manifest text", after["body"])
        self.assertNotIn("- #1 (A)", after["body"])

    def test_fetches_current_body_before_dependency_patch(self):
        api, plan = FakeREST(), manifest()
        sync.apply_plan(plan, api)
        api.edit_before_get = lambda issues: issues[1].update(body=issues[1]["body"] + "\nEdited after inventory")
        plan["issues"][1]["dependencies"] = []
        sync.apply_plan(plan, api)
        self.assertTrue(api.issues[1]["body"].endswith("\nEdited after inventory"))

    def test_explicit_number_requires_matching_marker_before_any_writes(self):
        api, plan = FakeREST(), manifest()
        api.issues = [{"number": 99, "body": "Unowned historical issue", "title": "Intake"}]
        plan["issues"][0]["number"] = 99
        result = sync.apply_plan(plan, api)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(api.writes, [])

    def test_duplicate_markers_fail_before_any_writes(self):
        api = FakeREST()
        api.issues = [{"number": n, "body": sync.issue_marker("A")} for n in (2, 3)]
        self.assertEqual(sync.apply_plan(manifest(), api)["status"], "failed")
        self.assertEqual(api.writes, [])

    def test_pull_request_marker_is_not_adopted(self):
        api = FakeREST()
        api.issues = [{"number": 10, "body": sync.issue_marker("A"), "pull_request": {}}]
        result = sync.apply_plan(manifest(), api)
        self.assertEqual(result["counts"]["issues_created"], 2)


class TransportTests(unittest.TestCase):
    def test_rest_pagination_reads_second_page(self):
        api = sync.GitHub("never-print-this", mutation_interval=0)
        second = "https://api.github.com/repos/AbdelrhmanAh7/Mizano/issues?state=all&per_page=100&page=2"
        api.request = mock.Mock(side_effect=[([{"number": 1}], {"Link": f'<{second}>; rel="next"'}), ([{"number": 2}], {})])
        self.assertEqual(api.list_all("/repos/AbdelrhmanAh7/Mizano/issues?state=all"), [{"number": 1}, {"number": 2}])
        self.assertEqual(api.request.call_count, 2)

    def test_pagination_cannot_exfiltrate_credential_or_change_collection(self):
        for target in ("https://attacker.example/steal", "https://api.github.com/repos/other/repo/issues", "https://api.github.com/repos/AbdelrhmanAh7/Mizano/labels"):
            with self.subTest(target=target):
                api = sync.GitHub("never-print-this", mutation_interval=0)
                api.request = mock.Mock(return_value=([], {"Link": f'<{target}>; rel="next"'}))
                with self.assertRaises(sync.PlanningError):
                    api.list_all("/repos/AbdelrhmanAh7/Mizano/issues")
                self.assertEqual(api.request.call_count, 1)

    def test_redirect_is_refused_and_http_error_body_not_exposed(self):
        with self.assertRaises(sync.PlanningError):
            sync.NoRedirect().redirect_request(None, None, 302, "", {}, "https://attacker.example")
        api = sync.GitHub("never-print-this", mutation_interval=0)
        api.opener.open = mock.Mock(side_effect=urllib.error.HTTPError("https://api.github.com", 403, "never-print-this", {}, io.BytesIO(b"never-print-this")))
        with self.assertRaises(sync.PlanningError) as caught:
            api.request("GET", "/repos/AbdelrhmanAh7/Mizano")
        self.assertNotIn("never-print-this", str(caught.exception))
        self.assertIn("403", str(caught.exception))

    def test_graphql_pagination_and_cycle_detection(self):
        api = mock.Mock()
        api.graphql.side_effect = [{"node": {"items": connection([{"id": "one"}], "next")}}, {"node": {"items": connection([{"id": "two"}])}}]
        values, _ = sync.graphql_pages(api, "query", {}, ("node", "items"))
        self.assertEqual(values, [{"id": "one"}, {"id": "two"}])
        self.assertEqual(api.graphql.call_args_list[1].args[1]["cursor"], "next")
        api.graphql.side_effect = None
        api.graphql.return_value = {"node": {"items": connection([], "loop")}}
        with self.assertRaises(sync.PlanningError):
            sync.graphql_pages(api, "query", {}, ("node", "items"))


class ProjectTests(unittest.TestCase):
    def test_project_creation_and_rerun_are_idempotent(self):
        api, project, plan = FakeREST(), FakeProject(), manifest()
        first = sync.apply_plan(plan, api, project)
        self.assertEqual(first["project"]["status"], "completed")
        self.assertEqual(first["project"]["items_added"], 2)
        self.assertTrue(project.linked)
        mutations = len([query for query, _ in project.calls if query.startswith("mutation")])
        second = sync.apply_plan(plan, api, project)
        self.assertEqual(second["project"]["items_reused"], 2)
        self.assertEqual(len([query for query, _ in project.calls if query.startswith("mutation")]), mutations)

    def test_partial_project_failure_keeps_repository_results_and_item_progress(self):
        api, project, plan = FakeREST(), FakeProject(fail_item="I_2"), manifest()
        result = sync.apply_plan(plan, api, project)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["counts"]["issues_created"], 2)
        self.assertEqual(result["project"]["status"], "failed")
        self.assertEqual(result["project"]["items_added"], 1)
        self.assertIn("url", result["project"])
        project.fail_item = None
        retried = sync.apply_plan(plan, api, project)
        self.assertEqual(retried["status"], "completed")
        self.assertEqual(retried["project"]["items_added"], 1)
        self.assertEqual(retried["project"]["items_reused"], 1)

    def test_public_matching_project_is_preserved_without_adding_issues(self):
        project = FakeProject()
        project.project = {"id": "P_1", "title": "Mizano demo", "url": "https://github.com/users/AbdelrhmanAh7/projects/99", "public": True, "closed": False}
        result = sync.apply_plan(manifest(), FakeREST(), project)
        self.assertEqual(result["project"]["status"], "failed")
        self.assertFalse(any(query.startswith("mutation") for query, _ in project.calls))


if __name__ == "__main__":
    unittest.main()
