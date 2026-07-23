#!/usr/bin/env python3
"""Dump all ACP methods while triggering AskUserQuestion on codebuddy --serve."""
from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from http.client import HTTPConnection
from pathlib import Path

PORT = int(os.environ.get("CB_PROBE_PORT", "19878"))
PASS = os.environ.get("CB_PROBE_PASS", "")
BASE = f"http://127.0.0.1:{PORT}"
ROOT = Path(
    os.environ.get(
        "CB_PROBE_ROOT",
        str(Path(os.environ["USERPROFILE"]) / "AppData" / "Local" / "Temp" / "cb-2.125-question-cancel-smoke"),
    )
)
OUT = ROOT / "results"
OUT.mkdir(parents=True, exist_ok=True)

events: list = []
pending: dict = {}
lock = threading.Lock()
connection_id = None
session_token = None
session_id = None
stop = threading.Event()


def log(*a):
    print(*a, flush=True)


def http_json(method, path, body=None, headers=None, timeout=60):
    h = {
        "X-CodeBuddy-Request": "1",
        "Authorization": f"Bearer {PASS}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if headers:
        h.update(headers)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace"), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers)


def acp_headers():
    return {
        "acp-connection-id": connection_id,
        "Authorization": f"Bearer {session_token or PASS}",
        "Accept": "application/json, text/event-stream",
        "X-CodeBuddy-Request": "1",
        "Content-Type": "application/json",
    }


def handle(msg):
    with lock:
        events.append(msg)
    if not isinstance(msg, dict):
        return
    if "id" in msg and ("result" in msg or "error" in msg):
        with lock:
            pending[msg["id"]] = msg
        log("RESULT", msg.get("id"), "err" if "error" in msg else "ok")
        return
    method = msg.get("method")
    if method:
        log("IN", "req" if "id" in msg else "note", method, "id=", msg.get("id"))
        if method != "session/update":
            log("  FULL", json.dumps(msg, ensure_ascii=False)[:1500])
        else:
            u = (msg.get("params") or {}).get("update") or {}
            su = u.get("sessionUpdate")
            meta = u.get("_meta") or {}
            log("  UPD", su, "status=", u.get("status"), "meta=", list(meta.keys()))
            if meta:
                log("  META", json.dumps(meta, ensure_ascii=False)[:1000])
            if su in ("tool_call", "tool_call_update"):
                log(
                    "  TOOL",
                    json.dumps(
                        {
                            "toolCallId": u.get("toolCallId"),
                            "title": u.get("title"),
                            "status": u.get("status"),
                            "rawInput": u.get("rawInput"),
                        },
                        ensure_ascii=False,
                    )[:800],
                )
        # catch any question-like method
        if method and "question" in method.lower():
            log("QUESTION_METHOD", method)
            if "id" in msg:
                st, raw, _ = http_json(
                    "POST",
                    "/api/v1/acp",
                    {"jsonrpc": "2.0", "id": msg["id"], "result": {"outcome": "cancelled"}},
                    headers=acp_headers(),
                )
                log("CANCELLED", st, raw[:200])

    if method == "session/request_permission" and "id" in msg:
        opts = (msg.get("params") or {}).get("options") or []
        oid = "allow_always"
        for prefer in ("allow_always", "allow_once", "allow"):
            for o in opts:
                x = o.get("optionId") or o.get("id")
                if x == prefer:
                    oid = x
                    break
            else:
                continue
            break
        st, raw, _ = http_json(
            "POST",
            "/api/v1/acp",
            {
                "jsonrpc": "2.0",
                "id": msg["id"],
                "result": {"outcome": {"outcome": "selected", "optionId": oid}},
            },
            headers=acp_headers(),
        )
        log("PERM", st, oid)


def sse():
    try:
        conn = HTTPConnection("127.0.0.1", PORT, timeout=300)
        conn.request(
            "GET",
            "/api/v1/acp",
            headers={
                "X-CodeBuddy-Request": "1",
                "Authorization": f"Bearer {session_token or PASS}",
                "Accept": "text/event-stream",
                "acp-connection-id": connection_id,
            },
        )
        resp = conn.getresponse()
        log("SSE", resp.status)
        buf = ""
        while not stop.is_set():
            chunk = resp.read(4096)
            if not chunk:
                time.sleep(0.05)
                continue
            buf += chunk.decode("utf-8", "replace")
            while "\n\n" in buf:
                block, buf = buf.split("\n\n", 1)
                data = "\n".join(l[5:].lstrip() for l in block.splitlines() if l.startswith("data:"))
                if not data or data in (":ok", "ok"):
                    continue
                try:
                    handle(json.loads(data))
                except Exception as e:
                    log("parse", e)
    except Exception as e:
        log("sse exit", e)


def wait(rid, t=90):
    d = time.time() + t
    while time.time() < d:
        with lock:
            if rid in pending:
                return pending.pop(rid)
        time.sleep(0.05)
    raise TimeoutError(rid)


def req(rid, method, params, timeout=180):
    body = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params}
    log("SEND", rid, method)

    def post():
        try:
            data = json.dumps(body).encode()
            r = urllib.request.Request(BASE + "/api/v1/acp", data=data, headers=acp_headers(), method="POST")
            resp = urllib.request.urlopen(r, timeout=timeout)
            buf = ""
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buf += chunk.decode("utf-8", "replace")
                while "\n\n" in buf:
                    block, buf = buf.split("\n\n", 1)
                    data = "\n".join(l[5:].lstrip() for l in block.splitlines() if l.startswith("data:"))
                    if not data or data in (":ok", "ok"):
                        continue
                    try:
                        handle(json.loads(data))
                    except Exception:
                        pass
        except Exception as e:
            log("post err", e)

    th = threading.Thread(target=post, daemon=True)
    th.start()
    try:
        return wait(rid, timeout)
    finally:
        th.join(2)


def main():
    global connection_id, session_token, session_id
    if not PASS:
        raise SystemExit("CB_PROBE_PASS required")
    st, raw, _ = http_json("POST", "/api/v1/acp/connect", {})
    data = json.loads(raw)
    connection_id = data["connectionId"]
    session_token = data["sessionToken"]
    log("conn", connection_id)
    threading.Thread(target=sse, daemon=True).start()
    time.sleep(0.5)

    init = req(
        1,
        "initialize",
        {
            "protocolVersion": 1,
            "clientInfo": {"name": "qprobe", "version": "1"},
            "clientCapabilities": {
                "fs": {"readTextFile": False, "writeTextFile": False},
                "terminal": False,
                "_meta": {"codebuddy.ai": {"question": True, "promptSuggestion": True}},
            },
        },
    )
    log("init result caps", json.dumps((init.get("result") or {}).get("agentCapabilities") or init.get("result"), ensure_ascii=False)[:800])

    new = req(2, "session/new", {"cwd": str(ROOT), "mcpServers": []})
    session_id = (new.get("result") or {}).get("sessionId")
    if not session_id:
        with lock:
            blob = json.dumps(events)
        m = re.search(r'"sessionId"\s*:\s*"([^"]+)"', blob)
        session_id = m.group(1) if m else None
    log("sid", session_id)
    req(10, "session/set_config_option", {"sessionId": session_id, "configId": "mode", "value": "fullAccess"})
    try:
        req(11, "session/set_config_option", {"sessionId": session_id, "configId": "model", "value": "hy3"})
    except Exception as e:
        log("model skip", e)

    try:
        r = req(
            20,
            "session/prompt",
            {
                "sessionId": session_id,
                "prompt": [
                    {
                        "type": "text",
                        "text": (
                            "Call AskUserQuestion tool exactly once with header Smoke, "
                            "question 'Continue?', options Yes and No. Then stop."
                        ),
                    }
                ],
            },
            timeout=120,
        )
        log("prompt done", json.dumps(r, ensure_ascii=False)[:400])
    except Exception as e:
        log("prompt fail", e)

    with lock:
        methods = []
        for e in events:
            if isinstance(e, dict) and e.get("method"):
                methods.append({"method": e["method"], "hasId": "id" in e, "id": e.get("id")})
        (OUT / "events_dump.json").write_text(
            json.dumps(events, ensure_ascii=False, indent=2)[:250000], encoding="utf-8"
        )
        (OUT / "methods.json").write_text(json.dumps(methods, indent=2), encoding="utf-8")
        log("METHODS", methods)
        log("event_count", len(events))
    stop.set()


if __name__ == "__main__":
    main()
