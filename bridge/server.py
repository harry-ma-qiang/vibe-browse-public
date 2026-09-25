"""The one process between an agent and the extension, and the whole of what it does.

    uv run server.py                    listen, print the token, wait
    uv run server.py --print-token      print the token and exit

Two listeners, both on the loopback address and neither reachable from another host.
The extension dials in over a websocket; an agent, a script or curl sends a command
over HTTP and waits for the answer to come back through the same websocket.

    agent --HTTP(127.0.0.1:8766)--> here --WS(127.0.0.1:8765)--> extension

Nothing is stored and nothing is logged but the fact that a command was answered. The
tree that passes through has already had what it carries taken out of it, in the
extension, before it reached this process.
"""

from __future__ import annotations

import argparse
import asyncio
import hmac
import json
import os
import secrets
import sys
import uuid
from pathlib import Path
from typing import Any

import websockets
from websockets.asyncio.server import ServerConnection

#: Where the shared secret is kept, readable by its owner and nobody else.
TOKEN_FILE = Path(os.environ.get("VIBE_BROWSE_TOKEN_FILE", Path.home() / ".vibe-browse-token"))

#: How long a command may take before the caller is told the extension did not answer.
TIMEOUT = 30.0

_extension: ServerConnection | None = None
_waiting: dict[str, asyncio.Future[dict[str, Any]]] = {}


def token() -> str:
    """The shared secret, made on first use and kept at 0600 for its owner alone."""
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text().strip()
    made = secrets.token_urlsafe(32)
    TOKEN_FILE.touch(mode=0o600)
    TOKEN_FILE.write_text(made)
    return made


def authorised(headers: dict[str, str], secret: str) -> bool:
    """Whether a request carried the secret. Compared in constant time, not by equality."""
    offered = headers.get("authorization", "")
    prefix = "bearer "
    if not offered.lower().startswith(prefix):
        return False
    return hmac.compare_digest(offered[len(prefix) :], secret)


def local(origin: str) -> bool:
    """Whether a browser origin may be served. Anything with an origin at all may not.

    A page cannot set this header, so a request carrying one came from a page, and no
    page has business driving a debugger. This is what a DNS rebinding attack trips on.
    """
    return origin == ""


async def extension(connection: ServerConnection) -> None:
    """Hold the one extension connection, and route every answer back to its caller."""
    global _extension
    _extension = connection
    print("extension connected", file=sys.stderr)
    try:
        async for raw in connection:
            answer = json.loads(raw)
            waiting = _waiting.pop(answer.get("id", ""), None)
            if waiting and not waiting.done():
                waiting.set_result(answer)
    except websockets.ConnectionClosed:
        pass
    finally:
        _extension = None
        print("extension gone", file=sys.stderr)


async def relay(command: dict[str, Any]) -> dict[str, Any]:
    """Send one command to the extension and wait for the answer that carries its id."""
    if _extension is None:
        return {"ok": False, "error": "no extension connected"}
    asked = str(uuid.uuid4())
    answer: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
    _waiting[asked] = answer
    await _extension.send(json.dumps({**command, "id": asked}))
    try:
        return await asyncio.wait_for(answer, TIMEOUT)
    except TimeoutError:
        _waiting.pop(asked, None)
        return {"ok": False, "error": f"the extension did not answer in {TIMEOUT:g}s"}


def response(code: int, body: dict[str, Any]) -> bytes:
    """One HTTP response, with the headers that keep a browser from reading it."""
    said = json.dumps(body).encode()
    head = (
        f"HTTP/1.1 {code} \r\n"
        "content-type: application/json\r\n"
        f"content-length: {len(said)}\r\n"
        "x-content-type-options: nosniff\r\n"
        "cache-control: no-store\r\n"
        "connection: close\r\n\r\n"
    )
    return head.encode() + said


async def http(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, secret: str) -> None:
    """Answer one HTTP request: refuse it, or relay it and return what came back.

    Four routes and no more. `GET /health` says whether an extension is connected and
    needs no secret, because a caller has to be able to ask before it has one.
    """
    try:
        head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 10.0)
    except (TimeoutError, asyncio.IncompleteReadError):
        writer.close()
        return

    lines = head.decode("latin-1").split("\r\n")
    method, path, *_ = (lines[0].split(" ") + ["", ""])[:3]
    headers = {
        name.lower(): value.strip()
        for name, _, value in (line.partition(":") for line in lines[1:] if ":" in line)
    }

    if method == "GET" and path == "/health":
        writer.write(response(200, {"ok": True, "extension": _extension is not None}))
    elif not local(headers.get("origin", "")):
        # why: a page set that header, and no page has business driving a debugger.
        writer.write(response(403, {"ok": False, "error": "a browser origin is refused"}))
    elif not authorised(headers, secret):
        writer.write(response(401, {"ok": False, "error": "no bearer token, or the wrong one"}))
    elif method == "POST" and path == "/command":
        size = int(headers.get("content-length", "0"))
        body = await reader.readexactly(size) if size else b"{}"
        try:
            asked = json.loads(body)
        except json.JSONDecodeError as err:
            writer.write(response(400, {"ok": False, "error": f"the body is not json: {err}"}))
        else:
            writer.write(response(200, await relay(asked)))
    else:
        writer.write(response(404, {"ok": False, "error": f"no route {method} {path}"}))

    await writer.drain()
    writer.close()


async def serve(ws_port: int, http_port: int, secret: str) -> None:
    """Hold both listeners open until the process is stopped."""

    async def one(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        await http(reader, writer, secret)

    async with websockets.serve(extension, "127.0.0.1", ws_port):
        server = await asyncio.start_server(one, "127.0.0.1", http_port)
        print(f"extension: ws://127.0.0.1:{ws_port}", file=sys.stderr)
        print(f"commands:  http://127.0.0.1:{http_port}/command", file=sys.stderr)
        async with server:
            await server.serve_forever()


def main() -> int:
    """Read the arguments, make the secret if there is none, and serve."""
    ask = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ask.add_argument("--ws-port", type=int, default=8765, help="where the extension dials in")
    ask.add_argument("--http-port", type=int, default=8766, help="where commands are sent")
    ask.add_argument("--print-token", action="store_true", help="print the secret and exit")
    said = ask.parse_args()

    secret = token()
    if said.print_token:
        print(secret)
        return 0
    print(f"token:     {TOKEN_FILE}", file=sys.stderr)
    try:
        asyncio.run(serve(said.ws_port, said.http_port, secret))
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
