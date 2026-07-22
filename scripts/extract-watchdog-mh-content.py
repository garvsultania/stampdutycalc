#!/usr/bin/env python3
"""Extract deterministic, non-citable Maharashtra PDF keyword-triage receipts.

The output records extraction coverage and page-level keyword hits without
storing the extracted legal text. It is discovery metadata only: a hit cannot
establish legal effect, a pinpoint citation, or an amendment/commencement chain.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import multiprocessing
import re
import signal
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

import pypdf
from pypdf import PdfReader


EXPECTED_PYPDF_VERSION = "6.14.2"
EXTRACTION_TIMEOUT_SECONDS = 120
OUTPUT_PATH = Path("WATCHDOG-MH-CONTENT-EXTRACTION.json")
SOURCE_CONFIGS = (
    {
        "source_id": "mh-egazette-part8",
        "occurrence_source_ids": ("mh-egazette",),
        "index_path": Path("watchdog-data/index/documents.jsonl"),
        "manifest_path": Path("watchdog-data/state/blob-manifest.json"),
        "blob_root": Path("watchdog-data/blobs"),
    },
    {
        "source_id": "mh-egazette-part4b",
        "occurrence_source_ids": ("mh-egazette-part4b",),
        "index_path": Path("watchdog-data/sources/mh-egazette-part4b/index/documents.jsonl"),
        "manifest_path": Path("watchdog-data/sources/mh-egazette-part4b/state/blob-manifest.json"),
        "blob_root": Path("watchdog-data/sources/mh-egazette-part4b/blobs"),
    },
)

# Keep IDs aligned with packages/watchdog/src/triage.ts. These patterns select
# candidates for human review; they are deliberately not legal classifiers.
TAXONOMY = (
    (
        "stamp",
        "domain",
        (
            ("stamp", re.compile(r"\bstamps?\b", re.IGNORECASE)),
            ("mudrank_latin", re.compile(r"\bmudrank\b", re.IGNORECASE)),
            ("mudrank_marathi", re.compile(r"मुद्रांक|मुद्राक", re.IGNORECASE)),
        ),
    ),
    (
        "registration",
        "domain",
        (
            ("registration", re.compile(r"\b(?:registration|registrar|sub[- ]registrar)\b", re.IGNORECASE)),
            ("nondani", re.compile(r"नोंदणी|दुय्यम निबंधक|निबंधक", re.IGNORECASE)),
        ),
    ),
    (
        "valuation",
        "domain",
        (
            ("valuation", re.compile(r"\b(?:valuation|market value|ready reckoner|annual statement of rates)\b", re.IGNORECASE)),
            ("mulyankan", re.compile(r"मूल्यांकन|बाजार ?मूल्य", re.IGNORECASE)),
        ),
    ),
    (
        "surcharge_cess",
        "domain",
        (
            ("surcharge_cess", re.compile(r"\b(?:surcharge|cess)\b", re.IGNORECASE)),
            ("adhibhar_upkar", re.compile(r"अधिभार|उपकर", re.IGNORECASE)),
        ),
    ),
    (
        "concession_remission",
        "domain",
        (
            (
                "concession_remission",
                re.compile(r"\b(?:concession|remission|exempt(?:ion|ed)?|reduction|rebate|waiver)\b", re.IGNORECASE),
            ),
            ("savalat_maphi", re.compile(r"सवलत|माफी|सूट", re.IGNORECASE)),
        ),
    ),
    (
        "amendment",
        "context",
        (
            ("amendment", re.compile(r"\bamend(?:ment|ed|ing)?\b", re.IGNORECASE)),
            ("sudharana", re.compile(r"सुधारण|दुरुस्ती", re.IGNORECASE)),
        ),
    ),
    (
        "commencement",
        "context",
        (
            (
                "commencement",
                re.compile(r"\b(?:commencement|come into force|effective (?:from|on))\b", re.IGNORECASE),
            ),
            ("prarambh", re.compile(r"प्रारंभ|अंमलात", re.IGNORECASE)),
        ),
    ),
)
DOMAIN_CATEGORIES = {category for category, role, _ in TAXONOMY if role == "domain"}
BILL_TITLE = re.compile(r"\b(?:L\.?\s*A\.?\s*)?BILL\b", re.IGNORECASE)
NOTIFICATION_OR_ORDER_TITLE = re.compile(r"\b(?:notification|order)\b|अधिसूचना|आदेश", re.IGNORECASE)
ACT_TITLE = re.compile(r"\b(?:MAHARASHTRA\s+)?ACT\b", re.IGNORECASE)
CURATED_DEPENDENCY_TARGETS = {
    (
        "mh-egazette-part8",
        "cc1ffaec3d7f2b32413c08994dadbc492481b61e21e173081172e3e8052b0646",
        "e0f9303510462e1e557e3fa2acfdd9c3a1b26317c9a7e7094ed54cbab6c91c98",
    ),
    (
        "mh-egazette-part8",
        "b6f268deb4cfa5eaaa602f6340558329ab888244700f316630173b7ca37b8727",
        "d6b74b7dd8585dd25ea6eaa7e4346a3e292e19e2dbd8f939597d3dc88869acca",
    ),
}


def sha256_bytes(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def normalized_page_text(page: Any) -> str:
    text = page.extract_text() or ""
    return unicodedata.normalize("NFKC", text).replace("\r\n", "\n").replace("\r", "\n")


def has_domain_match(text: str) -> bool:
    return any(
        pattern.search(text)
        for category, _, terms in TAXONOMY
        if category in DOMAIN_CATEGORIES
        for _, pattern in terms
    )


def is_enacted_law_title(text: str) -> bool:
    """Stay aligned with triage.ts publicationStage()."""
    if BILL_TITLE.search(text) or NOTIFICATION_OR_ORDER_TITLE.search(text):
        return False
    return bool(ACT_TITLE.search(text))


def quiet_worker() -> None:
    # Malformed-but-readable government PDFs can emit thousands of duplicate
    # dictionary diagnostics. The extraction status/receipt remains explicit.
    logging.disable(logging.CRITICAL)
    if hasattr(signal, "SIGALRM"):
        signal.signal(signal.SIGALRM, extraction_timeout)


def extraction_timeout(_signum: int, _frame: Any) -> None:
    raise TimeoutError(f"PDF extraction exceeded {EXTRACTION_TIMEOUT_SECONDS} seconds")


def extract_task(task: dict[str, Any]) -> dict[str, Any]:
    path = Path(task["path"])
    timeout_seconds = int(task.get("timeout_seconds", EXTRACTION_TIMEOUT_SECONDS))
    try:
        if hasattr(signal, "alarm"):
            signal.alarm(timeout_seconds)
        reader = PdfReader(path, strict=False)
        pages = [normalized_page_text(page) for page in reader.pages]
        joined = "\n\f\n".join(pages)
        match_pages: dict[str, dict[str, set[int]]] = defaultdict(lambda: defaultdict(set))
        for page_number, text in enumerate(pages, 1):
            for category, _, terms in TAXONOMY:
                for term_id, pattern in terms:
                    if pattern.search(text):
                        match_pages[category][term_id].add(page_number)
        matches = []
        for category, _, terms in TAXONOMY:
            if category not in match_pages:
                continue
            term_order = [term_id for term_id, _ in terms]
            term_hits = match_pages[category]
            matches.append(
                {
                    "category": category,
                    "terms": [term_id for term_id in term_order if term_id in term_hits],
                    "pages": sorted({page for values in term_hits.values() for page in values}),
                }
            )
        return {
            "source_id": task["source_id"],
            "sha256": task["sha256"],
            "occurrences": task["occurrences"],
            "status": "text" if joined.strip() else "empty",
            "pages": len(pages),
            "pages_with_text": sum(bool(page.strip()) for page in pages),
            "text_characters": len(joined),
            "text_sha256": sha256_bytes(joined.encode("utf-8")),
            "content_matches": matches,
        }
    except Exception as error:  # A failed body remains explicit and review-ineligible.
        return {
            "source_id": task["source_id"],
            "sha256": task["sha256"],
            "occurrences": task["occurrences"],
            "status": "failed",
            "pages": 0,
            "pages_with_text": 0,
            "text_characters": 0,
            "text_sha256": None,
            "content_matches": [],
            "error": f"{type(error).__name__}: {str(error)[:300]}",
        }
    finally:
        if hasattr(signal, "alarm"):
            signal.alarm(0)


def load_tasks(scope: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    tasks: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    for config in SOURCE_CONFIGS:
        index_body = config["index_path"].read_bytes()
        index_sha256 = sha256_bytes(index_body)
        documents = [json.loads(line) for line in index_body.decode("utf-8").splitlines() if line]
        manifest_body = config["manifest_path"].read_bytes()
        manifest = json.loads(manifest_body)
        if manifest["source_id"] != config["source_id"] or manifest["index_sha256"] != index_sha256:
            raise RuntimeError(f"stale or mismatched blob manifest: {config['manifest_path']}")
        expected = {entry["sha256"]: entry["bytes"] for entry in manifest["blobs"]}
        occurrences: dict[str, list[dict[str, str]]] = defaultdict(list)
        selected_candidate_blobs: set[str] = set()
        for document in documents:
            if document["source_id"] not in config["occurrence_source_ids"]:
                raise RuntimeError(f"unexpected occurrence source in {config['index_path']}: {document['source_id']}")
            occurrences[document["sha256"]].append(
                {"source_id": document["source_id"], "source_row_id": document["source_row_id"]}
            )
            if has_domain_match(document["title"]) or (
                config["source_id"] == "mh-egazette-part8" and is_enacted_law_title(document["title"])
            ) or (
                config["source_id"], document["source_row_id"], document["sha256"]
            ) in CURATED_DEPENDENCY_TARGETS:
                selected_candidate_blobs.add(document["sha256"])
        if set(occurrences) != set(expected):
            raise RuntimeError(f"manifest/index blob set mismatch: {config['source_id']}")
        for blob_sha256 in sorted(occurrences):
            if scope == "title-candidates" and blob_sha256 not in selected_candidate_blobs:
                continue
            path = config["blob_root"] / blob_sha256[:2] / f"{blob_sha256}.pdf"
            body_size = path.stat().st_size
            if body_size != expected[blob_sha256]:
                raise RuntimeError(f"blob size mismatch: {path}")
            tasks.append(
                {
                    "source_id": config["source_id"],
                    "sha256": blob_sha256,
                    "path": str(path),
                    "occurrences": sorted(
                        occurrences[blob_sha256], key=lambda value: (value["source_id"], value["source_row_id"])
                    ),
                }
            )
        sources.append(
            {
                "source_id": config["source_id"],
                "index_path": str(config["index_path"]),
                "index_sha256": index_sha256,
                "manifest_path": str(config["manifest_path"]),
                "manifest_sha256": sha256_bytes(manifest_body),
                "document_occurrences": len(documents),
                "archive_unique_blobs": len(occurrences),
                "selected_blobs": len(occurrences) if scope == "all" else len(selected_candidate_blobs),
            }
        )
    return tasks, sorted(sources, key=lambda value: value["source_id"])


def build_report(results: list[dict[str, Any]], sources: list[dict[str, Any]], scope: str) -> dict[str, Any]:
    results.sort(key=lambda value: (value["source_id"], value["sha256"]))
    status_blobs = {status: sum(result["status"] == status for result in results) for status in ("text", "empty", "failed")}
    category_blobs = {
        category: sum(
            any(match["category"] == category for match in result["content_matches"]) for result in results
        )
        for category, _, _ in TAXONOMY
    }
    candidate_blobs = sum(
        any(match["category"] in DOMAIN_CATEGORIES for match in result["content_matches"]) for result in results
    )
    return {
        "schema_version": 1,
        "jurisdiction": "MH",
        "extractor": {
            "tool": "pypdf",
            "version": pypdf.__version__,
            "text_method": "PdfReader(strict=False); page.extract_text()",
            "normalization": "Unicode NFKC; CRLF/CR converted to LF; pages joined by LF-FF-LF",
        },
        "policy": {
            "effect": "triage_only",
            "citation_eligible": False,
            "ocr_performed": False,
            "scan_scope": (
                "all_archive_blobs"
                if scope == "all"
                else "title_candidates_enacted_law_backstop_and_curated_dependency_targets"
            ),
            "limitation": "Content keyword hits and extraction success do not establish legal effect, a pinpoint citation, completeness, or an amendment/commencement chain.",
        },
        "taxonomy": [
            {
                "category": category,
                "role": role,
                "term_ids": [term_id for term_id, _ in terms],
            }
            for category, role, terms in TAXONOMY
        ],
        "sources": sources,
        "summary": {
            "archive_unique_blobs": sum(source["archive_unique_blobs"] for source in sources),
            "selected_blobs": len(results),
            "unscanned_blobs": sum(source["archive_unique_blobs"] for source in sources) - len(results),
            "status_blobs": status_blobs,
            "candidate_blobs": candidate_blobs,
            "category_blobs": category_blobs,
        },
        "blobs": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=max(1, min(8, multiprocessing.cpu_count())))
    parser.add_argument("--scope", choices=("title-candidates", "all"), default="title-candidates")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="preserve exact successful entries in the existing output and retry only failed blobs",
    )
    parser.add_argument("--timeout-seconds", type=int, default=EXTRACTION_TIMEOUT_SECONDS)
    args = parser.parse_args()
    if pypdf.__version__ != EXPECTED_PYPDF_VERSION:
        raise RuntimeError(
            f"pypdf {EXPECTED_PYPDF_VERSION} is required; found {pypdf.__version__}. "
            "Install requirements-watchdog-content.txt."
        )
    if args.workers < 1 or args.workers > 32:
        raise RuntimeError("--workers must be between 1 and 32")
    if args.timeout_seconds < 30 or args.timeout_seconds > 600:
        raise RuntimeError("--timeout-seconds must be between 30 and 600")
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    tasks, sources = load_tasks(args.scope)
    for task in tasks:
        task["timeout_seconds"] = args.timeout_seconds
    results: list[dict[str, Any]] = []
    if args.retry_failed:
        if not args.output.exists():
            raise RuntimeError(f"--retry-failed requires an existing receipt: {args.output}")
        previous = json.loads(args.output.read_text(encoding="utf-8"))
        if (
            previous.get("schema_version") != 1
            or previous.get("jurisdiction") != "MH"
            or previous.get("extractor", {}).get("version") != EXPECTED_PYPDF_VERSION
        ):
            raise RuntimeError("existing retry receipt has an incompatible schema or extractor")
        expected_keys = {(task["source_id"], task["sha256"]) for task in tasks}
        previous_by_key = {
            (result["source_id"], result["sha256"]): result for result in previous.get("blobs", [])
        }
        if set(previous_by_key) != expected_keys:
            raise RuntimeError("existing retry receipt does not match the current selected blob set")
        retry_keys = {key for key, result in previous_by_key.items() if result.get("status") == "failed"}
        results.extend(result for key, result in previous_by_key.items() if key not in retry_keys)
        tasks = [task for task in tasks if (task["source_id"], task["sha256"]) in retry_keys]
        print(f"retrying {len(tasks)} failed extraction(s)", file=sys.stderr, flush=True)
    with multiprocessing.Pool(processes=args.workers, initializer=quiet_worker) as pool:
        for count, result in enumerate(pool.imap_unordered(extract_task, tasks), 1):
            results.append(result)
            if count % 100 == 0 or count == len(tasks):
                print(f"extracted {count}/{len(tasks)}", file=sys.stderr, flush=True)
    report = build_report(results, sources, args.scope)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {args.output}: {report['summary']['selected_blobs']} selected blobs, "
        f"{report['summary']['candidate_blobs']} content candidates, "
        f"statuses={report['summary']['status_blobs']}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
