#!/usr/bin/env python3
"""Reconcile the reviewed Mizano demo manifest with GitHub, using stdlib only.

Offline: python3 scripts/sync-demo-planning.py --validate
Writes:  python3 scripts/sync-demo-planning.py --apply --output /tmp/planning.json

GH_TOKEN (or GITHUB_TOKEN) needs repository Issues write permission. Optional
MIZANO_PROJECT_TOKEN needs user Projects write access plus repository visibility.
Only one writer should run at a time (use workflow concurrency or a local lock).
Reruns preserve existing label/milestone properties, issue text, title, labels,
milestone, status and assignees. Only the marked dependency section is refreshed.
Explicit issue numbers MUST already carry the matching ownership marker.
No mutation is retried automatically: after an uncertain response, rerun to
discover successful writes. No credentials or remote error bodies are printed.

API contracts verified 2026-09-05:
https://docs.github.com/en/rest/issues/labels
https://docs.github.com/en/rest/issues/milestones
https://docs.github.com/en/rest/issues/issues
https://docs.github.com/en/graphql/reference/projects
https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
"""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


REPOSITORY = "AbdelrhmanAh7/Mizano"
API_ROOT = "https://api.github.com"
API_VERSION = "2026-03-10"
KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z")
ISSUE_MARKERS = re.compile(r"<!-- mizano-plan:([A-Za-z0-9_-]+) -->")
DEP_START = "<!-- mizano-plan-dependencies:start -->"
DEP_END = "<!-- mizano-plan-dependencies:end -->"
MAX_PAGES = 100
MAX_RESPONSE_BYTES = 10 * 1024 * 1024


class PlanningError(Exception):
    """A controlled, credential-free diagnostic suitable for the result file."""


def require(condition, message):
    if not condition:
        raise PlanningError(message)


def checked_text(value, field, limit, allow_empty=False):
    require(isinstance(value, str), f"{field} must be a string")
    require((allow_empty or value.strip()) and len(value) <= limit,
            f"{field} is empty or too long (maximum {limit})")


def unique(items, field, category, folded=False):
    values = [item[field].casefold() if folded else item[field] for item in items]
    require(len(values) == len(set(values)), f"Duplicate {category} {field}")


def validate_plan(plan):
    require(isinstance(plan, dict), "Manifest must be an object")
    require(plan.get("repository") == REPOSITORY, "Manifest repository must be AbdelrhmanAh7/Mizano")
    project = plan.get("project")
    require(isinstance(project, dict), "project must be an object")
    require(project.get("owner") == REPOSITORY.split("/")[0], "Project must belong to the repository user")
    checked_text(project.get("title"), "project.title", 255)
    checked_text(project.get("description"), "project.description", 256, True)
    for name, limit in (("labels", 100), ("milestones", 20), ("issues", 100)):
        value = plan.get(name)
        require(isinstance(value, list) and len(value) <= limit, f"{name} must be a list of at most {limit}")
        require(all(isinstance(item, dict) for item in value), f"{name} entries must be objects")
    for item in plan["labels"]:
        checked_text(item.get("name"), "label.name", 50)
        checked_text(item.get("description"), "label.description", 100, True)
        require(isinstance(item.get("color"), str) and re.fullmatch(r"[0-9a-fA-F]{6}", item["color"]),
                "Label color must be six hexadecimal digits without #")
    unique(plan["labels"], "name", "label", True)
    for item in plan["milestones"]:
        require(isinstance(item.get("key"), str) and KEY.fullmatch(item["key"]), "Invalid milestone key")
        checked_text(item.get("title"), "milestone.title", 255)
        checked_text(item.get("description"), "milestone.description", 4000, True)
        if "due_on" not in item or item["due_on"] is None:
            continue
        due = item.get("due_on")
        require(isinstance(due, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", due),
                "Milestone due_on must be a UTC timestamp, YYYY-MM-DDTHH:MM:SSZ")
        try:
            dt.datetime.strptime(due, "%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            raise PlanningError("Milestone due_on is not a valid UTC date") from None
    unique(plan["milestones"], "key", "milestone")
    unique(plan["milestones"], "title", "milestone")
    labels = {item["name"] for item in plan["labels"]}
    milestones = {item["key"] for item in plan["milestones"]}
    for item in plan["issues"]:
        require(isinstance(item.get("key"), str) and KEY.fullmatch(item["key"]), "Invalid issue key")
        checked_text(item.get("title"), "issue.title", 256)
        checked_text(item.get("body"), "issue.body", 50000)
        require("<!-- mizano-plan" not in item["body"], "Issue manifest bodies must omit managed markers")
        for name in ("labels", "dependencies"):
            values = item.get(name)
            require(isinstance(values, list) and all(isinstance(v, str) for v in values),
                    f"issue.{name} must be a list of strings")
            require(len(values) == len(set(values)), f"Duplicate issue {name}")
        require(set(item["labels"]) <= labels, "Issue references an undefined label")
        require(item.get("milestone") in milestones, "Issue references an undefined milestone")
        if "number" in item:
            require(type(item["number"]) is int and item["number"] > 0, "Explicit issue number must be positive")
    unique(plan["issues"], "key", "issue")
    unique([item for item in plan["issues"] if "number" in item], "number", "issue")
    graph = {item["key"]: item["dependencies"] for item in plan["issues"]}
    require(all(set(deps) <= graph.keys() for deps in graph.values()), "Undefined issue dependency")
    visited, visiting = set(), set()

    def visit(key):
        require(key not in visiting, "Issue dependency cycle detected")
        if key not in visited:
            visiting.add(key)
            for dependency in graph[key]:
                visit(dependency)
            visiting.remove(key)
            visited.add(key)

    for key in graph:
        visit(key)
    return plan


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise PlanningError("GitHub redirect refused; verify the canonical repository")


class GitHub:
    def __init__(self, token, timeout=20, deadline=None, mutation_interval=1.1):
        require(bool(token), "GitHub credential is not configured")
        self._token = token
        self.timeout = timeout
        self.deadline = deadline if deadline is not None else time.monotonic() + 1200
        self.mutation_interval = mutation_interval
        self.last_mutation = 0
        self.requests = 0
        self.opener = urllib.request.build_opener(NoRedirect())

    @staticmethod
    def safe_url(path):
        url = API_ROOT + path if path.startswith("/") else path
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == "https" and parsed.netloc == "api.github.com" and not parsed.fragment,
                "Refusing a non-GitHub API URL")
        require(parsed.path == "/graphql" or parsed.path == f"/repos/{REPOSITORY}" or
                parsed.path.startswith(f"/repos/{REPOSITORY}/"), "Refusing an out-of-scope API path")
        require(".." not in parsed.path and "%" not in parsed.path, "Refusing an ambiguous API path")
        return url

    def request(self, method, path, data=None, *, mutation=None):
        url = self.safe_url(path)
        mutates = method != "GET" if mutation is None else mutation
        self.requests += 1
        require(self.requests <= 1000, "Request limit exceeded; rerun to continue")
        if mutates:
            pause = max(0, self.last_mutation + self.mutation_interval - time.monotonic())
            require(time.monotonic() + pause < self.deadline, "Run deadline exceeded; rerun to continue")
            if pause:
                time.sleep(pause)
        remaining = self.deadline - time.monotonic()
        require(remaining > 0, "Run deadline exceeded; rerun to continue")
        headers = {"Accept": "application/vnd.github+json", "Authorization": f"Bearer {self._token}",
                   "X-GitHub-Api-Version": API_VERSION, "User-Agent": "mizano-demo-planning"}
        body = None
        if data is not None:
            body = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=min(self.timeout, remaining)) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                require(len(raw) <= MAX_RESPONSE_BYTES, "GitHub response exceeded the size limit")
                result = json.loads(raw) if raw else None
                return result, dict(response.headers)
        except urllib.error.HTTPError as error:
            raise PlanningError(f"GitHub HTTP {error.code}; verify permissions/rate limits, then rerun") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise PlanningError("GitHub transport failed; write outcome may be unknown, rerun to reconcile") from None
        except (ValueError, UnicodeError):
            raise PlanningError("GitHub returned an invalid JSON response") from None
        finally:
            if mutates:
                self.last_mutation = time.monotonic()

    def list_all(self, path):
        url = self.safe_url(path)
        collection_path = urllib.parse.urlsplit(url).path
        url += ("&" if "?" in url else "?") + "per_page=100"
        values, seen = [], set()
        for _ in range(MAX_PAGES):
            require(url not in seen, "Repeated GitHub pagination URL")
            seen.add(url)
            page, headers = self.request("GET", url)
            require(isinstance(page, list), "GitHub collection was not a list")
            values.extend(page)
            link = next((v for k, v in headers.items() if k.lower() == "link"), "")
            matches = re.findall(r'<([^>]+)>;\s*rel="next"', link)
            require(len(matches) <= 1, "Ambiguous GitHub pagination link")
            if not matches:
                return values
            url = self.safe_url(matches[0])
            require(urllib.parse.urlsplit(url).path == collection_path, "Pagination changed API collection")
        raise PlanningError("GitHub page limit exceeded; no complete resource inventory available")

    def graphql(self, query, variables):
        result, _ = self.request("POST", "/graphql", {"query": query, "variables": variables},
                                 mutation=query.lstrip().startswith("mutation"))
        require(isinstance(result, dict) and not result.get("errors") and isinstance(result.get("data"), dict),
                "GitHub GraphQL failed; verify Project token scope and account access")
        return result["data"]


def issue_marker(key):
    return f"<!-- mizano-plan:{key} -->"


def milestone_marker(key):
    return f"<!-- mizano-plan-milestone:{key} -->"


def dependency_body(body, dependencies, resolved):
    require(body.count(DEP_START) == body.count(DEP_END) and body.count(DEP_START) <= 1,
            "Malformed managed dependency section; repair its markers before rerunning")
    lines = [f"- #{resolved[key]['number']} ({key})" for key in dependencies]
    section = DEP_START + "\n### Plan dependencies\n\n" + ("\n".join(lines) or "None.") + "\n" + DEP_END
    if DEP_START not in body:
        return body + "\n\n" + section
    start, end = body.index(DEP_START), body.index(DEP_END)
    require(end > start, "Reversed managed dependency markers")
    return body[:start] + section + body[end + len(DEP_END):]


def make_summary(plan, mode):
    return {"repository": plan["repository"], "mode": mode, "status": "validated" if mode == "validate" else "running",
            "planned": {name: len(plan[name]) for name in ("labels", "milestones", "issues")},
            "counts": {name: 0 for name in ("labels_created", "labels_reused", "milestones_created", "milestones_reused",
                                             "issues_created", "issues_reused", "dependency_sections_updated")},
            "issues": [], "project": {"status": "not_attempted"}, "errors": []}


def reconcile_repository(api, plan, summary):
    prefix = f"/repos/{plan['repository']}"
    labels = api.list_all(prefix + "/labels")
    milestones = api.list_all(prefix + "/milestones?state=all")
    issues = [item for item in api.list_all(prefix + "/issues?state=all&sort=created&direction=asc")
              if "pull_request" not in item]
    owned = {}
    for issue in issues:
        keys = ISSUE_MARKERS.findall(issue.get("body") or "")
        if keys:
            require(len(keys) == 1 and keys[0] not in owned, "Duplicate/ambiguous remote issue ownership marker")
            owned[keys[0]] = issue
    resolved, milestone_map = {}, {}
    # Validate every explicit target before creating any remote resource.
    for item in plan["issues"]:
        current = owned.get(item["key"])
        if "number" in item:
            require(current is not None and current["number"] == item["number"],
                    "Explicit issue number does not match its remote ownership marker")
        if current:
            dependency_body(current.get("body") or "", [], {})
            resolved[item["key"]] = current
    for item in plan["milestones"]:
        matches = [m for m in milestones if milestone_marker(item["key"]) in (m.get("description") or "")]
        if not matches:
            matches = [m for m in milestones if m["title"] == item["title"]]
        require(len(matches) <= 1, "Ambiguous remote milestone; reconcile duplicate titles/markers")
        if matches:
            milestone_map[item["key"]] = matches[0]
    require(len({m["number"] for m in milestone_map.values()}) == len(milestone_map),
            "Multiple plan milestones resolve to the same remote milestone")
    counts = summary["counts"]
    label_names = {item["name"].casefold() for item in labels}
    for item in plan["labels"]:
        if item["name"].casefold() in label_names:
            counts["labels_reused"] += 1
        else:
            api.request("POST", prefix + "/labels", {k: item[k] for k in ("name", "color", "description")})
            counts["labels_created"] += 1
    for item in plan["milestones"]:
        if item["key"] in milestone_map:
            counts["milestones_reused"] += 1
        else:
            data = {k: item[k] for k in ("title", "description", "due_on") if k in item}
            data["description"] += "\n\n" + milestone_marker(item["key"])
            created, _ = api.request("POST", prefix + "/milestones", data)
            milestone_map[item["key"]] = created
            counts["milestones_created"] += 1
    for item in plan["issues"]:
        if item["key"] in resolved:
            counts["issues_reused"] += 1
        else:
            data = {"title": item["title"], "body": item["body"] + "\n\n" + issue_marker(item["key"]),
                    "labels": item["labels"], "milestone": milestone_map[item["milestone"]]["number"]}
            created, _ = api.request("POST", prefix + "/issues", data)
            resolved[item["key"]] = created
            counts["issues_created"] += 1
            # GitHub may silently omit labels/milestones for an underprivileged token.
            actual_labels = {label["name"].casefold() for label in created.get("labels", [])}
            actual_milestone = (created.get("milestone") or {}).get("number")
            require({label.casefold() for label in item["labels"]} <= actual_labels and
                    actual_milestone == data["milestone"],
                    "Issue created but GitHub omitted labels/milestone; repair token permissions and issue metadata")
        current = resolved[item["key"]]
        summary["issues"].append({"key": item["key"], "number": current["number"],
                                  "url": f"https://github.com/{REPOSITORY}/issues/{current['number']}"})
    for item in plan["issues"]:
        path = prefix + f"/issues/{resolved[item['key']]['number']}"
        # Preserve human edits made since the paginated inventory was read.
        current, _ = api.request("GET", path)
        body = current.get("body") or ""
        require(ISSUE_MARKERS.findall(body) == [item["key"]] and "pull_request" not in current,
                "Issue ownership changed during reconciliation; stopped before update")
        new_body = dependency_body(body, item["dependencies"], resolved)
        if body != new_body:
            api.request("PATCH", path, {"body": new_body})
            counts["dependency_sections_updated"] += 1
        resolved[item["key"]] = current
    return resolved


def graphql_pages(api, query, variables, connection_path):
    cursor, seen, values = None, set(), []
    last_data = None
    for _ in range(MAX_PAGES):
        data = api.graphql(query, {**variables, "cursor": cursor})
        connection = data
        for key in connection_path:
            require(isinstance(connection, dict) and key in connection, "Missing GitHub GraphQL connection")
            connection = connection[key]
        require(isinstance(connection, dict) and isinstance(connection.get("nodes"), list),
                "Invalid GitHub GraphQL connection")
        values.extend(node for node in connection["nodes"] if node is not None)
        last_data = data
        page = connection.get("pageInfo") or {}
        require(type(page.get("hasNextPage")) is bool, "Missing GraphQL page information")
        if not page["hasNextPage"]:
            return values, last_data
        cursor = page.get("endCursor")
        require(isinstance(cursor, str) and cursor and cursor not in seen, "Invalid/repeated GraphQL cursor")
        seen.add(cursor)
    raise PlanningError("GraphQL page limit exceeded")


PROJECTS_QUERY = """query($owner: String!, $repoOwner: String!, $repo: String!, $cursor: String) {
  user(login: $owner) { id projectsV2(first: 100, after: $cursor) {
    nodes { id title url public closed shortDescription }
    pageInfo { hasNextPage endCursor }
  } }
  repository(owner: $repoOwner, name: $repo) { id }
}"""
PROJECT_REPOSITORIES_QUERY = """query($project: ID!, $cursor: String) {
  node(id: $project) { ... on ProjectV2 { repositories(first: 100, after: $cursor) {
    nodes { id } pageInfo { hasNextPage endCursor }
  } } }
}"""
PROJECT_ITEMS_QUERY = """query($project: ID!, $cursor: String) {
  node(id: $project) { ... on ProjectV2 {
    items(first: 100, after: $cursor, archivedStates: [ARCHIVED, NOT_ARCHIVED]) {
      nodes { content { ... on Issue { id } } } pageInfo { hasNextPage endCursor }
    }
  } }
}"""


def reconcile_project(api, plan, resolved, result):
    settings = plan["project"]
    owner, repo = plan["repository"].split("/")
    projects, data = graphql_pages(api, PROJECTS_QUERY,
                                   {"owner": settings["owner"], "repoOwner": owner, "repo": repo},
                                   ("user", "projectsV2"))
    matches = [project for project in projects if project["title"] == settings["title"]]
    require(len(matches) <= 1, "Multiple user Projects share the planned title; choose one before rerunning")
    repository_id = (data.get("repository") or {}).get("id")
    require(repository_id, "Project token cannot read the repository")
    if matches:
        project = matches[0]
        require(not project["public"], "Matching Project is public; private Project required")
        require(not project["closed"], "Matching Project is closed; it was preserved")
        result["created"] = False
    else:
        created = api.graphql("""mutation($owner: ID!, $title: String!) {
          createProjectV2(input: {ownerId: $owner, title: $title}) {
            projectV2 { id title url public closed shortDescription }
          }
        }""", {"owner": data["user"]["id"], "title": settings["title"]})
        project = created["createProjectV2"]["projectV2"]
        result.update({"created": True, "url": project["url"]})
        updated = api.graphql("""mutation($project: ID!, $description: String!) {
          updateProjectV2(input: {projectId: $project, public: false, shortDescription: $description}) {
            projectV2 { id public }
          }
        }""", {"project": project["id"], "description": settings["description"]})
        require(updated["updateProjectV2"]["projectV2"]["public"] is False,
                "Could not verify private Project visibility; no issues added")
    result.update({"url": project["url"], "items_added": 0, "items_reused": 0})
    repositories, _ = graphql_pages(api, PROJECT_REPOSITORIES_QUERY, {"project": project["id"]},
                                    ("node", "repositories"))
    if repository_id not in {r["id"] for r in repositories}:
        api.graphql("""mutation($project: ID!, $repository: ID!) {
          linkProjectV2ToRepository(input: {projectId: $project, repositoryId: $repository}) {
            repository { id }
          }
        }""", {"project": project["id"], "repository": repository_id})
    result["repository_linked"] = True
    items, _ = graphql_pages(api, PROJECT_ITEMS_QUERY, {"project": project["id"]}, ("node", "items"))
    content_ids = {(item.get("content") or {}).get("id") for item in items}
    for issue in resolved.values():
        node_id = issue.get("node_id")
        require(node_id, "An issue lacks its GitHub node ID; rerun repository reconciliation")
        if node_id in content_ids:
            result["items_reused"] += 1
        else:
            api.graphql("""mutation($project: ID!, $issue: ID!) {
              addProjectV2ItemById(input: {projectId: $project, contentId: $issue}) { item { id } }
            }""", {"project": project["id"], "issue": node_id})
            result["items_added"] += 1
            content_ids.add(node_id)
    result["status"] = "completed"


def apply_plan(plan, api, project_api=None):
    summary = make_summary(plan, "apply")
    try:
        resolved = reconcile_repository(api, plan, summary)
    except (PlanningError, KeyError, TypeError) as error:
        summary["status"] = "failed"
        summary["errors"].append(str(error) if isinstance(error, PlanningError) else "Unexpected GitHub repository response shape")
        return summary
    summary["status"] = "completed"
    if project_api is None:
        summary["project"] = {"status": "not_configured", "reason": "Optional Project token environment variable is unset"}
    else:
        summary["project"] = {"status": "running"}
        try:
            reconcile_project(project_api, plan, resolved, summary["project"])
        except (PlanningError, KeyError, TypeError) as error:
            summary["status"] = "partial"
            summary["project"]["status"] = "failed"
            summary["project"]["error"] = str(error) if isinstance(error, PlanningError) else "Unexpected GitHub Project response shape"
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--validate", action="store_true", help="Offline manifest validation only; no network or credentials")
    mode.add_argument("--apply", action="store_true", help="Explicitly apply missing GitHub resources")
    parser.add_argument("--manifest", "--plan", type=Path,
                        default=Path(__file__).resolve().parents[1] / "docs/planning/demo-plan.json")
    parser.add_argument("--output", type=Path, help="Write a credential-free JSON result to this file")
    parser.add_argument("--project-token-env", default="MIZANO_PROJECT_TOKEN", help="Optional user Project token environment variable")
    args = parser.parse_args(argv)
    try:
        require(args.manifest.stat().st_size <= 2 * 1024 * 1024, "Manifest exceeds 2 MiB")
        plan = validate_plan(json.loads(args.manifest.read_text(encoding="utf-8")))
        if args.validate:
            summary = make_summary(plan, "validate")
        else:
            require(re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", args.project_token_env), "Invalid Project token environment variable name")
            token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
            require(token, "Set GH_TOKEN or GITHUB_TOKEN with repository Issues write permission")
            project_token = os.environ.get(args.project_token_env)
            deadline = time.monotonic() + 1200
            summary = apply_plan(plan, GitHub(token, deadline=deadline),
                                 GitHub(project_token, deadline=deadline) if project_token else None)
    except (PlanningError, OSError, ValueError) as error:
        summary = {"status": "failed", "errors": [str(error) if isinstance(error, PlanningError) else "Cannot read a valid manifest file"]}
    result_text = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        try:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(result_text, encoding="utf-8")
        except OSError:
            print("Cannot write requested JSON result file", file=sys.stderr)
            print(result_text, end="")
            return 1
    print(result_text, end="")
    return {"failed": 1, "partial": 2}.get(summary["status"], 0)


if __name__ == "__main__":
    sys.exit(main())
