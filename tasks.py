import json
import subprocess
import sys
from pathlib import Path

from invoke import task


def _read_version() -> str:
    package_json = json.loads(Path("package.json").read_text())
    return package_json["version"]


def _tag_exists(version: str) -> bool:
    result = subprocess.run(
        ["git", "tag", "-l", f"v{version}"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip() != ""


def _extract_changelog_section(version: str) -> str | None:
    """None if CHANGELOG.md or a matching '## <version>' heading is missing.
    '' if the heading exists but has no content before the next heading/EOF.
    """
    changelog = Path("CHANGELOG.md")
    if not changelog.exists():
        return None

    lines = changelog.read_text().splitlines()
    heading = f"## {version}"

    start = None
    for i, line in enumerate(lines):
        if line.strip() == heading:
            start = i + 1
            break
    if start is None:
        return None

    end = len(lines)
    for i in range(start, len(lines)):
        if lines[i].startswith("## "):
            end = i
            break

    return "\n".join(lines[start:end]).strip()


@task
def run(c):
    """Run the dev server (npm run dev)."""
    c.run("npm run dev", pty=True)


@task
def build(c):
    """Build the production bundle (npm run build)."""
    c.run("npm run build", pty=True)


@task
def preview(c):
    """Preview the production build (npm run preview)."""
    c.run("npm run preview", pty=True)


@task
def release(c):
    """Tag the current package.json version and push it to origin."""
    version = _read_version()
    tag = f"v{version}"

    if _tag_exists(version):
        print(f"Tag {tag} already exists — bump the version in package.json before releasing.")
        sys.exit(1)

    section = _extract_changelog_section(version)

    if section is None:
        print(f"No CHANGELOG.md section found for {version} — tagging with just the version number.")
        message = tag
    elif section == "":
        answer = input(
            f"CHANGELOG.md has an empty section for {version}. "
            "Continue tagging with just the version number as the message? [y/N] "
        )
        if answer.strip().lower() != "y":
            print("Aborted.")
            sys.exit(1)
        message = tag
    else:
        message = f"{tag}\n\n{section}"

    subprocess.run(["git", "tag", "-a", tag, "-F", "-"], input=message, text=True, check=True)
    subprocess.run(["git", "push", "origin", tag], check=True)
    print(f"Tagged and pushed {tag}.")
