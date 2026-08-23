"""Exercise the shared artifact vectors through an independent Python oracle."""

import hashlib
import json
import re
import unittest
from pathlib import Path

import rfc8785


VECTORS_PATH = Path(__file__).resolve().parents[1] / "artifact-sha256-v0.1.json"
PROFILE = "urn:dsh-guarded-hcl:digest-profile:artifact-jcs-sha256:v0.1"
REGULAR_MODES = {"100644", "100755"}
UNSUPPORTED_ENTRY_MODES = {"040000", "120000", "160000"}


class ArtifactVectorError(ValueError):
    """An artifact cannot be represented by the portable profile."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def validate_artifact_path(source):
    if not isinstance(source, str):
        raise ArtifactVectorError("INVALID_PATH", "path must be a string")
    if any(0xD800 <= ord(character) <= 0xDFFF for character in source):
        raise ArtifactVectorError("INVALID_PATH", "path has a lone surrogate")
    if source.startswith("/") or re.match(r"^[A-Za-z]:", source):
        raise ArtifactVectorError("INVALID_PATH", "path is absolute")
    if "\\" in source:
        raise ArtifactVectorError("INVALID_PATH", "path uses a backslash")

    segments = source.split("/")
    for segment in segments:
        if segment == "":
            raise ArtifactVectorError("INVALID_PATH", "path has an empty segment")
        if segment in (".", ".."):
            raise ArtifactVectorError("INVALID_PATH", "path has a dot segment")
        if any(
            ord(character) <= 0x1F or 0x7F <= ord(character) <= 0x9F
            for character in segment
        ):
            raise ArtifactVectorError("INVALID_PATH", "path has a control character")
    return source


def content_digest(content):
    return "sha256:" + hashlib.sha256(content).hexdigest()


def decode_vector_hex(source):
    if not isinstance(source, str) or re.fullmatch(r"(?:[0-9a-f]{2})*", source) is None:
        raise ArtifactVectorError("INVALID_BYTES", "bytesHex is not strict lowercase hex")
    return bytes.fromhex(source)


def create_manifest(source):
    kind = source.get("kind")
    if kind == "blob":
        if set(source) != {"kind", "bytesHex"}:
            raise ArtifactVectorError("INVALID_ARTIFACT", "invalid blob fields")
        content = decode_vector_hex(source["bytesHex"])
        return {
            "profile": PROFILE,
            "kind": "blob",
            "byteLength": len(content),
            "contentDigest": content_digest(content),
        }
    if kind != "tree":
        raise ArtifactVectorError("INVALID_ARTIFACT", "unknown artifact kind")
    if set(source) != {"kind", "entries"} or not isinstance(source["entries"], list):
        raise ArtifactVectorError("INVALID_ARTIFACT", "invalid tree fields")

    entries = []
    for entry in source["entries"]:
        if set(entry) != {"path", "mode", "bytesHex"}:
            raise ArtifactVectorError("INVALID_ARTIFACT", "invalid tree entry fields")
        mode = entry["mode"]
        if mode not in REGULAR_MODES:
            code = (
                "UNSUPPORTED_ENTRY_TYPE"
                if mode in UNSUPPORTED_ENTRY_MODES
                else "INVALID_MODE"
            )
            raise ArtifactVectorError(code, "unsupported tree mode")
        content = decode_vector_hex(entry["bytesHex"])
        entries.append(
            {
                "path": validate_artifact_path(entry["path"]),
                "mode": mode,
                "byteLength": len(content),
                "contentDigest": content_digest(content),
            }
        )

    entries.sort(key=lambda entry: entry["path"].encode("utf-8"))
    for previous, current in zip(entries, entries[1:]):
        if previous["path"] == current["path"]:
            raise ArtifactVectorError("DUPLICATE_PATH", "duplicate path")
    paths = {entry["path"] for entry in entries}
    for entry in entries:
        segments = entry["path"].split("/")
        for index in range(1, len(segments)):
            ancestor = "/".join(segments[:index])
            if ancestor in paths:
                raise ArtifactVectorError(
                    "PATH_PREFIX_COLLISION", "file path is an ancestor of another file"
                )
    return {"profile": PROFILE, "kind": "tree", "entries": entries}


class ArtifactSha256ConformanceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.vectors = json.loads(VECTORS_PATH.read_text(encoding="utf-8"))

    def test_accepted_vectors(self):
        digests = {}
        self.assertEqual(self.vectors["profile"], PROFILE)
        for vector in self.vectors["accepted"]:
            with self.subTest(vector=vector["id"]):
                manifest = create_manifest(vector["input"])
                canonical = rfc8785.dumps(manifest)
                digest = "sha256:" + hashlib.sha256(canonical).hexdigest()
                self.assertEqual(manifest, vector["manifest"])
                self.assertEqual(digest, vector["sha256"])
                digests[vector["id"]] = digest

        for vector in self.vectors["accepted"]:
            for other_id in vector.get("distinctFrom", []):
                self.assertNotEqual(vector["sha256"], digests[other_id])

    def test_rejected_vectors(self):
        for vector in self.vectors["rejected"]:
            with self.subTest(vector=vector["id"]):
                with self.assertRaises(ArtifactVectorError) as raised:
                    create_manifest(vector["input"])
                self.assertEqual(raised.exception.code, vector["errorCode"])


if __name__ == "__main__":
    unittest.main()
