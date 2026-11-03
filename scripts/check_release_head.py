"""Prevent a superseded GitHub Actions run from publishing an old catalog.

The latest main commit is read from the Git remote, not a cached local branch.
A network failure fails closed; a newer main commit is a safe no-op because a
new push queues a newer publish run under the Pages concurrency group.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

SHA = re.compile(r"^[0-9a-f]{40}$")


def release_is_current(release_sha: str, remote_sha: str) -> bool:
    if not SHA.fullmatch(release_sha or ""):
        raise ValueError("Invalid release commit SHA")
    if not SHA.fullmatch(remote_sha or ""):
        raise ValueError("Invalid remote main SHA")
    return release_sha == remote_sha


def remote_main_sha() -> str:
    result = subprocess.run(
        ["git", "ls-remote", "origin", "refs/heads/main"],
        check=True, capture_output=True, text=True, timeout=20,
    )
    parts = result.stdout.strip().split()
    if len(parts) != 2 or parts[1] != "refs/heads/main":
        raise RuntimeError("Unable to identify current origin/main")
    return parts[0]


def main() -> None:
    release = os.environ.get("GITHUB_SHA", "")
    output = os.environ.get("GITHUB_OUTPUT", "")
    if not output:
        raise RuntimeError("GITHUB_OUTPUT required for release gate")
    remote = remote_main_sha()
    is_current = release_is_current(release, remote)
    with Path(output).open("a", encoding="utf-8") as file:
        file.write(f"publish={'true' if is_current else 'false'}\n")
        file.write(f"main_sha={remote}\n")
    if is_current:
        print(f"PASS: candidate {release} is current main; release may proceed")
    else:
        print(
            f"::notice::Superseded release {release[:12]} "
            f"(main {remote[:12]}): skipping deployment. "
            "A newer main push will trigger a separate release."
        )


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired) as exc:
        print(f"::error::Release freshness unknown; fail closed: {exc}", file=sys.stderr)
        sys.exit(1)
