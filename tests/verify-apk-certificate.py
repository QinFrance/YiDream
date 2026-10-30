"""Verify the production APK against the deliberately pinned public certificate."""
import os
from pathlib import Path
import re
import subprocess
import sys

def certificate_fingerprints(output):
    # apksigner labels signers differently across versions and signing schemes.
    # Exclude public-key digests and source-stamp certificates from this check.
    pattern = r'^(?:Signer(?: #\d+| \([^\r\n]*\))|V\d+(?:\.\d+)? Signer:?) certificate SHA-256 digest:\s*([0-9a-fA-F]{64})\s*$'
    return {value.lower() for value in re.findall(pattern, output, re.MULTILINE)}


def main():
    apk, expected_file = map(Path, sys.argv[1:])
    tools = sorted((Path(os.environ['ANDROID_HOME']) / 'build-tools').glob('*/apksigner'))
    if not tools:
        raise SystemExit('Android apksigner is unavailable.')
    result = subprocess.run([str(tools[-1]), 'verify', '--print-certs', str(apk)],
                            check=True, capture_output=True, text=True)
    actual = certificate_fingerprints(result.stdout)
    expected = {expected_file.read_text().strip().lower()}
    if actual != expected:
        print(result.stdout)  # Contains public certificate information only.
        raise SystemExit('Signature does not match the pinned YiDream production certificate; publication refused.')
    print('Production APK signature verified against the pinned YiDream certificate.')


if __name__ == '__main__':
    main()
