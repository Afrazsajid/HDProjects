from __future__ import annotations

import os
import re
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

MESSAGE = """Greetings,

I hope you are doing well.

I believe you are on your way to work. Please confirm and share your estimated time of arrival (ETA)."""


def normalise_uk_number(value: str) -> str:
    digits = re.sub(r"\D", "", value.strip())

    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0"):
        digits = "44" + digits[1:]

    if not digits.startswith("44"):
        raise ValueError("Use a UK number beginning with 07, +44, 44, or 0044.")

    return digits


def load_numbers(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"{path} does not exist.")

    output = []
    seen = set()

    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue

        try:
            number = normalise_uk_number(raw)
        except ValueError as exc:
            print(f"[SKIP] Line {line_no}: {exc}")
            continue

        if number not in seen:
            seen.add(number)
            output.append(number)

    return output


def send_text(base_url: str, api_key: str, session_id: str, number: str, timeout: int) -> dict:
    url = f"{base_url.rstrip('/')}/api/sessions/{session_id}/messages/send-text"
    response = requests.post(
        url,
        headers={
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        },
        json={
            "chatId": f"{number}@c.us",
            "text": MESSAGE,
        },
        timeout=timeout,
    )

    try:
        result = response.json()
    except ValueError:
        result = {"raw": response.text}

    if not response.ok:
        raise RuntimeError(f"HTTP {response.status_code}: {result}")

    return result


def main() -> int:
    load_dotenv()

    base_url = os.getenv("OPENWA_BASE_URL", "http://localhost:2785").strip()
    api_key = os.getenv("OPENWA_API_KEY", "").strip()
    session_id = os.getenv("OPENWA_SESSION_ID", "").strip()
    gap_seconds = float(os.getenv("MESSAGE_GAP_SECONDS", "18"))
    timeout = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "30"))
    numbers_file = Path(os.getenv("NUMBERS_FILE", "numbers.txt"))

    if not api_key:
        print("ERROR: OPENWA_API_KEY is missing from .env")
        return 1

    if not session_id:
        print("ERROR: OPENWA_SESSION_ID is missing from .env")
        return 1

    try:
        numbers = load_numbers(numbers_file)
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1

    if not numbers:
        print("ERROR: No valid numbers found in numbers.txt")
        return 1

    sent = 0
    failed = 0

    for index, number in enumerate(numbers, start=1):
        masked = f"+{number[:4]}*****{number[-3:]}"
        print(f"[{index}/{len(numbers)}] Sending to {masked}")

        try:
            result = send_text(base_url, api_key, session_id, number, timeout)
            sent += 1
            print(f"SENT: {result.get('messageId', result)}")
        except Exception as exc:
            failed += 1
            print(f"FAILED: {exc}")

        if index < len(numbers):
            print(f"Waiting {gap_seconds:g} seconds...")
            time.sleep(gap_seconds)

    print(f"Finished. Sent: {sent}, Failed: {failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
