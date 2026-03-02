import email
import imaplib
from email.header import decode_header


def _decode_mime(value):
    if not value:
        return ""
    decoded_parts = decode_header(value)
    chunks = []
    for content, encoding in decoded_parts:
        if isinstance(content, bytes):
            chunks.append(content.decode(encoding or "utf-8", errors="ignore"))
        else:
            chunks.append(content)
    return "".join(chunks)


def _extract_email_parts(message):
    body = ""
    attachments = []

    if message.is_multipart():
        for part in message.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition") or "")

            if "attachment" in disposition.lower():
                filename = part.get_filename()
                if filename:
                    attachments.append(_decode_mime(filename))
                continue

            if content_type == "text/plain" and not body:
                payload = part.get_payload(decode=True)
                if payload:
                    body = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
    else:
        payload = message.get_payload(decode=True)
        if payload:
            body = payload.decode(message.get_content_charset() or "utf-8", errors="ignore")

    return body, attachments


def fetch_imap_events(source):
    config = source.config.config_json or {}

    if config.get("use_mock", False):
        return config.get("mock_messages", [])

    host = config.get("host")
    port = int(config.get("port", 993))
    use_tls = bool(config.get("tls", True))
    username = config.get("user")
    password = config.get("pass")
    folder = config.get("folder", "INBOX")
    search_criteria = config.get("search", "UNSEEN")

    if not host or not username or not password:
        raise ValueError("Configurazione IMAP incompleta: host/user/pass obbligatori")

    if use_tls:
        client = imaplib.IMAP4_SSL(host, port)
    else:
        client = imaplib.IMAP4(host, port)

    try:
        client.login(username, password)
        client.select(folder)

        status, message_ids = client.search(None, search_criteria)
        if status != "OK":
            return []

        events = []
        for message_id in message_ids[0].split():
            fetch_status, payload = client.fetch(message_id, "(RFC822)")
            if fetch_status != "OK" or not payload:
                continue

            raw_email = payload[0][1]
            message = email.message_from_bytes(raw_email)

            body, attachments = _extract_email_parts(message)
            headers = {
                "subject": _decode_mime(message.get("Subject")),
                "from": _decode_mime(message.get("From")),
                "to": _decode_mime(message.get("To")),
                "date": _decode_mime(message.get("Date")),
                "message_id": _decode_mime(message.get("Message-ID")),
            }

            events.append(
                {
                    "event_id": headers.get("message_id") or message_id.decode("utf-8", errors="ignore"),
                    "subject": headers.get("subject"),
                    "from": headers.get("from"),
                    "to": headers.get("to"),
                    "date": headers.get("date"),
                    "message_id": headers.get("message_id"),
                    "headers": headers,
                    "body": body,
                    "attachments": attachments,
                }
            )

        return events
    finally:
        try:
            client.logout()
        except Exception:
            pass


def test_imap_connection(source):
    config = source.config.config_json or {}

    if config.get("use_mock", False):
        return {"ok": True, "detail": "Mock IMAP attivo"}

    host = config.get("host")
    port = int(config.get("port", 993))
    use_tls = bool(config.get("tls", True))
    username = config.get("user")
    password = config.get("pass")

    if not host or not username or not password:
        return {"ok": False, "detail": "Configurazione IMAP incompleta"}

    try:
        if use_tls:
            client = imaplib.IMAP4_SSL(host, port)
        else:
            client = imaplib.IMAP4(host, port)
        client.login(username, password)
        client.logout()
        return {"ok": True, "detail": "Connessione IMAP riuscita"}
    except Exception as exc:
        return {"ok": False, "detail": str(exc)}
