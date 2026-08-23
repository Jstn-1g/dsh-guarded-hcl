"""Exercise the shared JCS vectors through an independent Python oracle."""

import hashlib
import json
import math
import unittest
from pathlib import Path

import rfc8785


VECTORS_PATH = Path(__file__).resolve().parents[1] / "jcs-sha256-v0.1.json"


class VectorInputError(ValueError):
    """An input violates the I-JSON subset required by the vector profile."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def parse_i_json(source):
    """Parse JSON into the binary64 data model used by ECMAScript/JCS."""

    def reject_constant(token):
        raise VectorInputError("INVALID_JSON", f"invalid JSON token: {token}")

    def reject_duplicate_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise VectorInputError(
                    "DUPLICATE_PROPERTY", f"duplicate JSON property: {key!r}"
                )
            result[key] = value
        return result

    try:
        value = json.loads(
            source,
            parse_int=float,
            parse_float=float,
            parse_constant=reject_constant,
            object_pairs_hook=reject_duplicate_pairs,
        )
    except VectorInputError:
        raise
    except (json.JSONDecodeError, UnicodeError) as error:
        raise VectorInputError("INVALID_JSON", str(error)) from error

    validate_i_json(value)
    return value


def validate_i_json(value):
    if isinstance(value, str):
        if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
            raise VectorInputError(
                "LONE_SURROGATE", "lone Unicode surrogate is not valid I-JSON"
            )
        return

    if isinstance(value, float):
        if not math.isfinite(value):
            raise VectorInputError(
                "NON_FINITE_NUMBER", "non-finite number is not valid I-JSON"
            )
        return

    if isinstance(value, list):
        for item in value:
            validate_i_json(item)
        return

    if isinstance(value, dict):
        for key, item in value.items():
            validate_i_json(key)
            validate_i_json(item)


class JcsSha256ConformanceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))

    def test_accepted_vectors(self):
        for vector in self.vectors["accepted"]:
            with self.subTest(vector=vector["id"]):
                value = parse_i_json(vector["input"])
                canonical = rfc8785.dumps(value)
                digest = "sha256:" + hashlib.sha256(canonical).hexdigest()

                self.assertEqual(canonical.hex(), vector["canonicalUtf8Hex"])
                self.assertEqual(canonical.decode("utf-8"), vector["canonical"])
                self.assertEqual(digest, vector["sha256"])

    def test_rejected_vectors(self):
        for vector in self.vectors["rejected"]:
            with self.subTest(vector=vector["id"]):
                with self.assertRaises(VectorInputError) as raised:
                    parse_i_json(vector["input"])
                self.assertEqual(raised.exception.code, vector["errorCode"])


if __name__ == "__main__":
    unittest.main()
