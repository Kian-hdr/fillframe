#!/usr/bin/env python3
"""Validate common Manifest V3 Chrome extension project issues."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


TEXT_SUFFIXES = {
    ".html",
    ".js",
    ".mjs",
    ".cjs",
    ".css",
    ".json",
    ".md",
    ".ts",
    ".tsx",
    ".jsx",
    ".yaml",
    ".yml",
}

BROAD_HOSTS = {"<all_urls>", "http://*/*", "https://*/*", "*://*/*"}
LOCAL_PATH_PARTS = (
    "/" + "Users/",
    "/" + "private/var/",
    "/" + "var/folders/",
    "/" + "tmp/",
    "file:" + "//",
)
LOCAL_PATH_RE = re.compile("|".join(re.escape(part) for part in LOCAL_PATH_PARTS) + r"|[A-Za-z]:\\\\")
TEMP_IMAGE_MARKER = "generated_" + "images"
REMOTE_SCRIPT_RE = re.compile(r"<script[^>]+src=[\"']https?://", re.IGNORECASE)
INLINE_SCRIPT_RE = re.compile(r"<script(?![^>]+src=)[^>]*>(.*?)</script>", re.IGNORECASE | re.DOTALL)
INLINE_HANDLER_RE = re.compile(r"\son[a-z]+\s*=", re.IGNORECASE)
EVAL_RE = re.compile(r"\b(eval|Function)\s*\(")


class Reporter:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def exit_code(self) -> int:
        return 1 if self.errors else 0

    def print(self) -> None:
        if not self.errors and not self.warnings:
            print("OK: no extension validation issues found")
            return
        for message in self.errors:
            print(f"ERROR: {message}")
        for message in self.warnings:
            print(f"WARN: {message}")


def rel(root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def read_json(path: Path, reporter: Reporter) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        reporter.error(f"missing manifest.json at {path}")
    except json.JSONDecodeError as exc:
        reporter.error(f"manifest.json is invalid JSON: {exc}")
    return None


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def check_manifest(root: Path, manifest: dict[str, Any], reporter: Reporter) -> None:
    if manifest.get("manifest_version") != 3:
        reporter.error("manifest_version must be 3")

    for key in ("name", "version"):
        if not manifest.get(key):
            reporter.error(f"manifest.json must include {key!r}")

    if "background" in manifest:
        background = manifest["background"]
        if not isinstance(background, dict) or not background.get("service_worker"):
            reporter.error("MV3 background must use background.service_worker")
        elif "scripts" in background:
            reporter.error("MV3 background must not use background.scripts")
        else:
            require_file(root, background["service_worker"], "background.service_worker", reporter)

    action = manifest.get("action")
    if isinstance(action, dict):
        if action.get("default_popup"):
            require_file(root, action["default_popup"], "action.default_popup", reporter)
        check_icon_map(root, action.get("default_icon"), "action.default_icon", reporter)

    if manifest.get("options_page"):
        require_file(root, manifest["options_page"], "options_page", reporter)

    side_panel = manifest.get("side_panel")
    if isinstance(side_panel, dict) and side_panel.get("default_path"):
        require_file(root, side_panel["default_path"], "side_panel.default_path", reporter)
        if "sidePanel" not in as_list(manifest.get("permissions")):
            reporter.error('side_panel.default_path requires "sidePanel" in permissions')
        if not manifest.get("minimum_chrome_version"):
            reporter.warn("sidePanel is Chrome 114+; consider minimum_chrome_version when targeting store users")

    check_icon_map(root, manifest.get("icons"), "icons", reporter)

    for index, script in enumerate(as_list(manifest.get("content_scripts"))):
        if not isinstance(script, dict):
            reporter.error(f"content_scripts[{index}] must be an object")
            continue
        matches = as_list(script.get("matches"))
        if not matches:
            reporter.error(f"content_scripts[{index}] must declare matches")
        for pattern in matches:
            if pattern in BROAD_HOSTS:
                reporter.warn(f"content_scripts[{index}] uses broad match pattern {pattern!r}")
        for field in ("js", "css"):
            for item in as_list(script.get(field)):
                require_file(root, item, f"content_scripts[{index}].{field}", reporter)

    for index, resource in enumerate(as_list(manifest.get("web_accessible_resources"))):
        if not isinstance(resource, dict):
            reporter.error(f"web_accessible_resources[{index}] must be an object in MV3")
            continue
        for item in as_list(resource.get("resources")):
            if "*" in item:
                reporter.warn(f"web_accessible_resources[{index}] exposes wildcard resource {item!r}")
            else:
                require_file(root, item, f"web_accessible_resources[{index}].resources", reporter)

    permissions = set(as_list(manifest.get("permissions")))
    if "webRequestBlocking" in permissions:
        reporter.error("webRequestBlocking is not appropriate for standard MV3 store extensions")
    for permission in sorted(permissions & {"tabs", "cookies", "history", "downloads", "debugger"}):
        reporter.warn(f"high-sensitivity permission requested: {permission}")

    for field in ("host_permissions", "optional_host_permissions"):
        for pattern in as_list(manifest.get(field)):
            if pattern in BROAD_HOSTS:
                reporter.warn(f"{field} uses broad host pattern {pattern!r}; prefer activeTab or optional grants when possible")

    if "activeTab" not in permissions and any(pattern in BROAD_HOSTS for pattern in as_list(manifest.get("host_permissions"))):
        reporter.warn('broad host access without "activeTab"; confirm this is necessary')


def check_icon_map(root: Path, value: Any, field: str, reporter: Reporter) -> None:
    if isinstance(value, dict):
        for size, path in value.items():
            require_file(root, path, f"{field}.{size}", reporter)
    elif isinstance(value, str):
        require_file(root, value, field, reporter)


def require_file(root: Path, value: Any, field: str, reporter: Reporter) -> None:
    if not isinstance(value, str) or not value:
        reporter.error(f"{field} must be a non-empty relative path")
        return
    blocked_prefixes = ("http://", "https://", "file:" + "//", "/")
    if value.startswith(blocked_prefixes):
        reporter.error(f"{field} must not use absolute or remote path: {value}")
        return
    path = root / value
    if not path.exists():
        reporter.error(f"{field} references missing file: {value}")


def scan_text_files(root: Path, reporter: Reporter) -> None:
    ignored_dirs = {"node_modules", ".git", "dist", "build", ".next", "coverage"}
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        if any(part in ignored_dirs for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        name = rel(root, path)
        if LOCAL_PATH_RE.search(text):
            reporter.error(f"{name} contains a machine-local path")
        if path.suffix == ".html":
            if REMOTE_SCRIPT_RE.search(text):
                reporter.error(f"{name} loads a remote script URL")
            for match in INLINE_SCRIPT_RE.finditer(text):
                if match.group(1).strip():
                    reporter.error(f"{name} contains inline script content")
                    break
            if INLINE_HANDLER_RE.search(text):
                reporter.error(f"{name} contains inline event handlers")
        if path.suffix in {".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"} and EVAL_RE.search(text):
            reporter.error(f"{name} contains eval/new Function pattern")
        if TEMP_IMAGE_MARKER in text:
            reporter.error(f"{name} references temporary ImageGen output")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("extension_dir", type=Path, help="Unpacked Chrome extension directory")
    args = parser.parse_args(argv)

    root = args.extension_dir.resolve()
    reporter = Reporter()
    if not root.exists():
        reporter.error(f"extension directory does not exist: {root}")
        reporter.print()
        return reporter.exit_code()

    manifest = read_json(root / "manifest.json", reporter)
    if manifest is not None:
        check_manifest(root, manifest, reporter)
    scan_text_files(root, reporter)
    reporter.print()
    return reporter.exit_code()


if __name__ == "__main__":
    raise SystemExit(main())
