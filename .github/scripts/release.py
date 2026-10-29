#!/usr/bin/env python3
"""Resolve the strict versioned release ref, without allowing master to deploy."""
import os
import json
from pathlib import Path
import re
import sys


def resolve(ref, event="push"):
    match = re.fullmatch(r"refs/(?:heads/release/v|tags/aeroframe-v)((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))", ref)
    if match:
        return match.group(1), "true" if event == "push" else "false"
    if ref.startswith(("refs/heads/release/", "refs/tags/aeroframe-v")):
        raise ValueError("Release ref must be release/vMAJOR.MINOR.PATCH")
    return "", "false"


if __name__ == "__main__":
    try:
        version, publish = resolve(os.environ.get("GITHUB_REF", ""), os.environ.get("GITHUB_EVENT_NAME", ""))
        target_path = Path('release-target.json')
        target = json.loads(target_path.read_text()) if target_path.exists() else {"id": "aeroframe", "version": "1.0.3"}
        if set(target) != {"id", "version"} or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", target.get("id", "")) or not re.fullmatch(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)", target.get("version", "")):
            raise ValueError('Invalid release target')
        if os.environ.get('GITHUB_REF', '').startswith('refs/tags/aeroframe-v') and target['id'] != 'aeroframe':
            raise ValueError('AeroFrame tags cannot select another template')
        if version and version != target['version']:
            raise ValueError('Release ref does not match selected template version')
        version = version or target['version']
        output = f"template_id={target['id']}\nversion={version}\npublish={publish}\n"
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as target:
                target.write(output)
        else:
            print(output, end="")
    except ValueError as error:
        sys.exit(str(error))
