
def parse_event(raw_event):
    if isinstance(raw_event, dict) and raw_event.get("force_parse_error"):
        raise ValueError(raw_event.get("parse_error_message", "Errore parser placeholder"))

    if isinstance(raw_event, dict):
        return raw_event

    return {"message": str(raw_event)}
