from pathlib import Path


SUSPICIOUS_EXTENSIONS = {
    ".exe",
    ".dll",
    ".bat",
    ".cmd",
    ".scr",
    ".ps1",
    ".js",
    ".vbs",
    ".jar",
}


EICAR_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"


def scan_attachment_placeholder(uploaded_file) -> tuple[str, str]:
    """Placeholder AV scanning: heuristics-only, no external AV engine."""
    filename = getattr(uploaded_file, "name", "") or ""
    extension = Path(filename).suffix.lower()

    if extension in SUSPICIOUS_EXTENSIONS:
        return "suspicious", f"Estensione potenzialmente pericolosa: {extension}"

    try:
        current_pos = uploaded_file.tell()
    except Exception:
        current_pos = None

    try:
        sample = uploaded_file.read(4096)
    except Exception:
        return "failed", "Impossibile leggere file per scansione placeholder"
    finally:
        try:
            if current_pos is None:
                uploaded_file.seek(0)
            else:
                uploaded_file.seek(current_pos)
        except Exception:
            pass

    if isinstance(sample, str):
        sample_bytes = sample.encode("utf-8", errors="ignore")
    else:
        sample_bytes = sample or b""

    if EICAR_SIGNATURE in sample_bytes:
        return "suspicious", "Signature EICAR rilevata (test malware placeholder)"

    return "clean", "Scansione placeholder completata"
