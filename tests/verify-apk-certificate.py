"""Verify the production APK against the deliberately pinned public certificate."""
import os
from pathlib import Path
import re
import subprocess
import sys

apk, expected_file = map(Path, sys.argv[1:])
tools = sorted((Path(os.environ['ANDROID_HOME']) / 'build-tools').glob('*/apksigner'))
if not tools:
    raise SystemExit('Android apksigner is unavailable.')
result = subprocess.run([str(tools[-1]), 'verify', '--print-certs', str(apk)],
                        check=True, capture_output=True, text=True)
actual = set(re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})$',
                        result.stdout, re.MULTILINE))
expected = {expected_file.read_text().strip().lower()}
if {value.lower() for value in actual} != expected:
    raise SystemExit('Signature does not match the pinned YiDream production certificate; publication refused.')
print('Production APK signature verified against the pinned YiDream certificate.')
