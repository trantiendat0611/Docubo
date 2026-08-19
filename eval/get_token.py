"""Print a Supabase access token for the eval harness.

    .venv/Scripts/python -m eval.get_token

Prompts for your email and password, signs in, and prints the access token that
`run_eval.py --api ...` needs. Nothing is stored and the password is never
echoed — this exists so a token can be obtained without digging a chunked
session cookie out of the browser.

Tokens are short-lived, so re-run this if a long eval starts returning 401.
"""

from __future__ import annotations

import getpass

from supabase import create_client

from ingest import config


def main() -> None:
    anon = _anon_key()
    if not anon:
        raise SystemExit(
            "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from .env.\n"
            "Copy it from Supabase: Settings -> API Keys -> publishable (or anon)."
        )

    email = input("Email: ").strip()
    password = getpass.getpass("Mật khẩu: ")

    client = create_client(config.SUPABASE_URL, anon)
    try:
        session = client.auth.sign_in_with_password(
            {"email": email, "password": password}
        )
    except Exception as exc:
        raise SystemExit(f"Đăng nhập thất bại: {exc}") from exc

    token = session.session.access_token
    print("\nToken (dán vào lệnh dưới đây):\n")
    print(f'$env:EVAL_ACCESS_TOKEN = "{token}"')
    # --api mặc định là localhost. Một lần chạy full 26 câu quên cờ này đã đo
    # máy local rồi ghi vào report như thể là số production, và chỉ lộ ra khi
    # đọc lại trường "api" trong file. Gợi ý ở đây vì thế luôn ghi rõ endpoint.
    print("\nRồi chạy — nhớ --api, mặc định là localhost:")
    print(
        "  .venv/Scripts/python -m eval.run_eval --limit 8"
        " --api https://docubo.vercel.app/api/chat"
    )


def _anon_key() -> str:
    """Read the browser key from .env.

    ingest/config.py does not carry it — the Python pipeline uses the
    service-role key and has no reason to know about the public one.
    """
    import os
    import re
    from pathlib import Path

    if os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY"):
        return os.environ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

    env = Path(config.ROOT) / ".env"
    if not env.exists():
        return ""
    match = re.search(
        r"^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$", env.read_text(encoding="utf-8"), re.M
    )
    return match.group(1).strip() if match else ""


if __name__ == "__main__":
    main()
