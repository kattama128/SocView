from __future__ import annotations

import mimetypes
import socket
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from django.conf import settings


EICAR_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

DEFAULT_ALLOWED_EXTENSIONS = {
    ".txt",
    ".log",
    ".json",
    ".csv",
    ".xml",
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".zip",
    ".eml",
    ".msg",
    ".pcap",
    ".pcapng",
    ".yml",
    ".yaml",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
}

DEFAULT_BLOCKED_EXTENSIONS = {
    ".exe",
    ".dll",
    ".bat",
    ".cmd",
    ".scr",
    ".ps1",
    ".js",
    ".vbs",
    ".jar",
    ".com",
    ".cpl",
    ".msi",
    ".hta",
    ".docm",
    ".xlsm",
    ".pptm",
}

DEFAULT_ALLOWED_MIME_TYPES = {
    "text/plain",
    "application/json",
    "text/csv",
    "application/xml",
    "text/xml",
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "application/zip",
    "message/rfc822",
    "application/vnd.ms-outlook",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
}

DEFAULT_BLOCKED_MIME_TYPES = {
    "application/x-msdownload",
    "application/x-dosexec",
    "application/x-sh",
    "application/x-bat",
    "application/javascript",
    "text/javascript",
}

RISKY_CONTENT_PATTERNS = (
    b"<script",
    b"powershell",
    b"cmd.exe",
    b"wscript.shell",
    b"javascript:",
)


@dataclass
class UploadValidationResult:
    filename: str
    extension: str
    content_type: str
    size: int


@dataclass
class AttachmentScanResult:
    status: str
    detail: str


def _normalize_set(value: Iterable[str] | str | None, default_values: set[str]) -> set[str]:
    if value is None:
        return {item.lower() for item in default_values}
    if isinstance(value, str):
        tokens = [item.strip().lower() for item in value.split(",") if item.strip()]
        return set(tokens)
    try:
        return {str(item).strip().lower() for item in value if str(item).strip()}
    except TypeError:
        return {item.lower() for item in default_values}


def _read_bytes(uploaded_file, max_bytes: int) -> bytes:
    try:
        current_pos = uploaded_file.tell()
    except Exception:
        current_pos = None
    try:
        sample = uploaded_file.read(max_bytes)
        if isinstance(sample, str):
            return sample.encode("utf-8", errors="ignore")
        return sample or b""
    finally:
        try:
            if current_pos is None:
                uploaded_file.seek(0)
            else:
                uploaded_file.seek(current_pos)
        except Exception:
            pass


def _sanitize_filename(raw_name: str) -> str:
    sanitized = Path(raw_name or "").name.strip()
    if not sanitized:
        raise ValueError("Nome file non valido")
    return sanitized


def _risky_content_reason(sample: bytes) -> str | None:
    if not sample:
        return None
    if sample.startswith(b"MZ"):
        return "Header PE eseguibile rilevato"
    lowered = sample.lower()
    if EICAR_SIGNATURE in sample:
        return "Signature EICAR rilevata"
    for pattern in RISKY_CONTENT_PATTERNS:
        if pattern in lowered:
            return f"Pattern contenuto rischioso rilevato: {pattern.decode('utf-8', errors='ignore')}"
    return None


def validate_attachment_upload(uploaded_file, *, max_size_mb: int) -> UploadValidationResult:
    filename = _sanitize_filename(getattr(uploaded_file, "name", "") or "")
    extension = Path(filename).suffix.lower()
    size = int(getattr(uploaded_file, "size", 0) or 0)
    if size <= 0:
        raise ValueError("File vuoto o dimensione non valida")

    max_bytes = int(max_size_mb) * 1024 * 1024
    if size > max_bytes:
        raise ValueError(f"File troppo grande: massimo {max_size_mb}MB")

    blocked_extensions = _normalize_set(getattr(settings, "ATTACHMENT_BLOCKED_EXTENSIONS", None), DEFAULT_BLOCKED_EXTENSIONS)
    if extension in blocked_extensions:
        raise ValueError(f"Estensione non consentita: {extension}")

    allowed_extensions = _normalize_set(getattr(settings, "ATTACHMENT_ALLOWED_EXTENSIONS", None), DEFAULT_ALLOWED_EXTENSIONS)
    if extension and allowed_extensions and extension not in allowed_extensions:
        raise ValueError(f"Estensione non ammessa: {extension}")

    incoming_content_type = (getattr(uploaded_file, "content_type", "") or "").strip().lower()
    guessed_content_type, _encoding = mimetypes.guess_type(filename)
    guessed_content_type = (guessed_content_type or "").lower()
    content_type = incoming_content_type or guessed_content_type or "application/octet-stream"

    blocked_mime_types = _normalize_set(getattr(settings, "ATTACHMENT_BLOCKED_MIME_TYPES", None), DEFAULT_BLOCKED_MIME_TYPES)
    if content_type in blocked_mime_types:
        raise ValueError(f"MIME type bloccato: {content_type}")

    allowed_mime_types = _normalize_set(getattr(settings, "ATTACHMENT_ALLOWED_MIME_TYPES", None), DEFAULT_ALLOWED_MIME_TYPES)
    if allowed_mime_types and content_type not in allowed_mime_types:
        if guessed_content_type and guessed_content_type in allowed_mime_types:
            content_type = guessed_content_type
        else:
            raise ValueError(f"MIME type non ammesso: {content_type}")

    sample = _read_bytes(uploaded_file, max_bytes=8192)
    risky_reason = _risky_content_reason(sample)
    if risky_reason:
        raise ValueError(risky_reason)

    return UploadValidationResult(
        filename=filename,
        extension=extension,
        content_type=content_type,
        size=size,
    )


class AttachmentScannerAdapter:
    name = "base"

    def scan(self, uploaded_file) -> AttachmentScanResult:  # pragma: no cover
        raise NotImplementedError


class PlaceholderScannerAdapter(AttachmentScannerAdapter):
    name = "placeholder"

    def scan(self, uploaded_file) -> AttachmentScanResult:
        if not getattr(settings, "ENABLE_DEV_ATTACHMENT_SCANNER", False):
            return AttachmentScanResult(
                status="failed",
                detail="Scanner placeholder disabilitato (abilitare ENABLE_DEV_ATTACHMENT_SCANNER solo in dev)",
            )
        sample = _read_bytes(uploaded_file, max_bytes=4096)
        reason = _risky_content_reason(sample)
        if reason:
            return AttachmentScanResult(status="suspicious", detail=reason)
        return AttachmentScanResult(status="clean", detail="Scansione placeholder completata")


class ClamAVScannerAdapter(AttachmentScannerAdapter):
    name = "clamav"

    def scan(self, uploaded_file) -> AttachmentScanResult:
        host = getattr(settings, "CLAMAV_HOST", "clamav")
        port = int(getattr(settings, "CLAMAV_PORT", 3310))
        timeout = int(getattr(settings, "CLAMAV_TIMEOUT_SECONDS", 5))
        chunk_size = 1024 * 32

        try:
            current_pos = uploaded_file.tell()
        except Exception:
            current_pos = None

        try:
            with socket.create_connection((host, port), timeout=timeout) as sock:
                sock.sendall(b"zINSTREAM\0")
                while True:
                    chunk = uploaded_file.read(chunk_size)
                    if not chunk:
                        break
                    if isinstance(chunk, str):
                        chunk = chunk.encode("utf-8", errors="ignore")
                    sock.sendall(struct.pack(">I", len(chunk)))
                    sock.sendall(chunk)
                sock.sendall(struct.pack(">I", 0))
                response = sock.recv(4096).decode("utf-8", errors="ignore")
        except Exception as exc:
            return AttachmentScanResult(status="failed", detail=f"Scanner AV non disponibile: {exc}")
        finally:
            try:
                if current_pos is None:
                    uploaded_file.seek(0)
                else:
                    uploaded_file.seek(current_pos)
            except Exception:
                pass

        if "FOUND" in response:
            return AttachmentScanResult(status="suspicious", detail=response.strip())
        if "OK" in response:
            return AttachmentScanResult(status="clean", detail="Scansione AV completata")
        return AttachmentScanResult(status="failed", detail=f"Risposta AV non valida: {response.strip()}")


def scan_attachment(uploaded_file) -> AttachmentScanResult:
    backend = (getattr(settings, "ATTACHMENT_SCAN_BACKEND", "clamav") or "clamav").strip().lower()
    if backend == "none":
        return AttachmentScanResult(status="clean", detail="Scansione disabilitata da configurazione")
    if backend == "placeholder":
        scanner = PlaceholderScannerAdapter()
    else:
        scanner = ClamAVScannerAdapter()
    return scanner.scan(uploaded_file)
