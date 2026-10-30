from pathlib import Path
import runpy
import unittest

parse = runpy.run_path(str(Path(__file__).with_name('verify-apk-certificate.py')))['certificate_fingerprints']
CERT = '01791f940bd231f31d0b1e8a1db94f895a0f51f3633eeb5d7a8fbf42cadeb558'


class CertificateOutputTests(unittest.TestCase):
    def test_legacy_signer_output(self):
        self.assertEqual(parse(f'Signer #1 certificate SHA-256 digest: {CERT}\n'), {CERT})

    def test_android_sdk_targeted_signer_output(self):
        text = f'Signer (minSdkVersion=28, maxSdkVersion=2147483647) certificate SHA-256 digest: {CERT}\n'
        self.assertEqual(parse(text), {CERT})

    def test_scheme_label_and_uppercase_digest(self):
        self.assertEqual(parse(f'V3.0 Signer: certificate SHA-256 digest: {CERT.upper()}\n'), {CERT})

    def test_public_key_and_stamp_are_not_application_signers(self):
        text = f'Signer #1 public key SHA-256 digest: {CERT}\nSource Stamp Signer certificate SHA-256 digest: {CERT}\n'
        self.assertEqual(parse(text), set())

    def test_all_signers_are_checked(self):
        other = 'f' * 64
        text = f'Signer #1 certificate SHA-256 digest: {CERT}\nSigner #2 certificate SHA-256 digest: {other}\n'
        self.assertEqual(parse(text), {CERT, other})


if __name__ == '__main__':
    unittest.main()
