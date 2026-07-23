#!/usr/bin/env python3
"""
E2E file-changes smoke against live codebuddy 2.125 --serve.

Flow: ACP connect + SSE -> session/new -> set mode -> session/prompt (Write)
      -> POST /internal/file-changes/{checkpoints,diff,revert} -> verify bytes.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.client import HTTPConnection
from pathlib import Path

PORT = int(os.environ.get("CB_PROBE_PORT", "19877"))
PASS = os.environ.get("CB_PROBE_PASS", "ThhZCRYyJEYHFw4avTQx0mJCcWK8_Ol2")
BASE = f"http://127.0.0.1:{PORT}"
ROOT = Path(
    os.environ.get(
        "CB_PROBE_ROOT",
        str(Path(os.environ["USERPROFILE"]) / "AppData" / "Local" / "Temp" / "cb-2.125-checkpoint-smoke"),
    )
)
TARGET = ROOT / "target.txt"
OUT = ROOT / "results"
OUT.mkdir(parents=True, exist_ok=True)
MARKER = "checkpoint-smoke-modified-line"

events: list = []
pending_rpc: dict = {}
lock = threading.Lock()
connection_id = None
session_token = None
session_id = None
stop_sse = threading.Event()
log_path = OUT / "run.log"


def log(*args):
    line = " ".join(str(a) for a in args)
    print(line, flush=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def http_json(method, path, body=None, headers=None, timeout=60, read_full=True):
    h = {
        "X-CodeBuddy-Request": "1",
        "Authorization": f"Bearer {PASS}",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if headers:
        h.update(headers)
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        raw = resp.read().decode("utf-8", "replace") if read_full else ""
        return resp.status, raw, dict(resp.headers), resp
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        return e.code, raw, dict(e.headers), None


def acp_headers():
    return {
        "acp-connection-id": connection_id,
        "Authorization": f"Bearer {session_token or PASS}",
        "Accept": "application/json, text/event-stream",
        "X-CodeBuddy-Request": "1",
        "Content-Type": "application/json",
    }


def feed_sse_text(text: str):
    buf = text if text.endswith("\n\n") else text + "\n\n"
    while "\n\n" in buf:
        block, buf = buf.split("\n\n", 1)
        data_lines = []
        for line in block.splitlines():
            if line.startswith("data:"):
                data_lines.append(line[5:].lstrip())
        if not data_lines:
            continue
        data = "\n".join(data_lines)
        if data in (":ok", "ok", ""):
            continue
        try:
            msg = json.loads(data)
        except Exception:
            with lock:
                events.append({"raw": data})
            continue
        handle_msg(msg)


def handle_msg(msg):
    with lock:
        events.append(msg)
    if not isinstance(msg, dict):
        return
    if "id" in msg and ("result" in msg or "error" in msg):
        with lock:
            pending_rpc[msg["id"]] = msg
        log("RPC_RESULT", msg.get("id"), "error" if "error" in msg else "ok")
        return
    method = msg.get("method")
    # Client-side FS RPCs (if server still asks despite capabilities).
    if method in ("fs/write_text_file", "fs/writeTextFile") and "id" in msg:
        params = msg.get("params") or {}
        path = params.get("path") or params.get("file_path") or params.get("filePath")
        content = params.get("content") or params.get("text") or ""
        log("FS_WRITE", path, "bytes", len(str(content)))
        try:
            p = Path(path)
            if not p.is_absolute():
                p = ROOT / path
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(str(content), encoding="utf-8")
            st, raw, _, _ = http_json(
                "POST",
                "/api/v1/acp",
                {"jsonrpc": "2.0", "id": msg["id"], "result": {}},
                headers=acp_headers(),
                timeout=30,
            )
            log("FS_WRITE_OK", st, raw[:80])
        except Exception as e:
            st, raw, _, _ = http_json(
                "POST",
                "/api/v1/acp",
                {
                    "jsonrpc": "2.0",
                    "id": msg["id"],
                    "error": {"code": -32000, "message": str(e)},
                },
                headers=acp_headers(),
                timeout=30,
            )
            log("FS_WRITE_ERR", e, st)
        return
    if method in ("fs/read_text_file", "fs/readTextFile") and "id" in msg:
        params = msg.get("params") or {}
        path = params.get("path") or params.get("file_path") or params.get("filePath")
        try:
            p = Path(path)
            if not p.is_absolute():
                p = ROOT / path
            content = p.read_text(encoding="utf-8")
            st, raw, _, _ = http_json(
                "POST",
                "/api/v1/acp",
                {"jsonrpc": "2.0", "id": msg["id"], "result": {"content": content}},
                headers=acp_headers(),
                timeout=30,
            )
            log("FS_READ_OK", path, st)
        except Exception as e:
            http_json(
                "POST",
                "/api/v1/acp",
                {
                    "jsonrpc": "2.0",
                    "id": msg["id"],
                    "error": {"code": -32000, "message": str(e)},
                },
                headers=acp_headers(),
                timeout=30,
            )
            log("FS_READ_ERR", e)
        return
    if method == "session/request_permission" and "id" in msg:
        params = msg.get("params") or {}
        log("PERM", json.dumps(params, ensure_ascii=False)[:600])
        options = params.get("options") or []
        option_id = None
        for prefer in ("allow_always", "allow_once", "allow", "allowAll"):
            for opt in options:
                oid = opt.get("optionId") or opt.get("id") or opt.get("value")
                if oid == prefer:
                    option_id = oid
                    break
            if option_id:
                break
        if not option_id and options:
            option_id = options[0].get("optionId") or options[0].get("id") or "allow"
        if not option_id:
            option_id = "allow_always"
        result = {"outcome": {"outcome": "selected", "optionId": option_id}}
        st, raw, _, _ = http_json(
            "POST",
            "/api/v1/acp",
            {"jsonrpc": "2.0", "id": msg["id"], "result": result},
            headers=acp_headers(),
            timeout=30,
        )
        feed_sse_text(raw)
        log("PERM_RESP", st, option_id, raw[:160])
        return
    if method == "_codebuddy.ai/question" and "id" in msg:
        st, raw, _, _ = http_json(
            "POST",
            "/api/v1/acp",
            {"jsonrpc": "2.0", "id": msg["id"], "result": {"outcome": "cancelled"}},
            headers=acp_headers(),
            timeout=30,
        )
        log("Q_CANCEL", st, raw[:100])
        return
    if method == "session/update":
        params = msg.get("params") or {}
        u = params.get("update") or {}
        su = u.get("sessionUpdate") or u.get("session_update")
        if su:
            log("UPD", su, json.dumps(u, ensure_ascii=False)[:220])
        # Some permission prompts arrive as interruption meta, not session/request_permission.
        interruption = (u.get("_meta") or {}).get("codebuddy.ai/interruptionRequest")
        if interruption:
            log("INTERRUPT", json.dumps(interruption, ensure_ascii=False)[:500])
            options = interruption.get("options") or []
            option_id = None
            for prefer in ("allow_always", "allow_once", "allow", "allowAll"):
                for opt in options:
                    oid = opt.get("optionId") or opt.get("id") or opt.get("value")
                    if oid == prefer:
                        option_id = oid
                        break
                if option_id:
                    break
            if not option_id and options:
                option_id = options[0].get("optionId") or options[0].get("id")
            if not option_id:
                option_id = "allow_always"
            # Extension-style response via ACP JSON-RPC if request id present in meta
            req_id = interruption.get("requestId") or interruption.get("rpcRequestId")
            if req_id is not None:
                st, raw, _, _ = http_json(
                    "POST",
                    "/api/v1/acp",
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {"outcome": {"outcome": "selected", "optionId": option_id}},
                    },
                    headers=acp_headers(),
                    timeout=30,
                )
                log("INTERRUPT_RESP", st, option_id, raw[:120])
        global session_id
        sid = params.get("sessionId")
        if sid and not session_id:
            session_id = sid
            log("sessionId from update", session_id)
        return
    if method == "_codebuddy.ai/checkpoint":
        log("CHECKPOINT_EVENT", json.dumps(msg.get("params") or {}, ensure_ascii=False)[:400])


def sse_loop():
    try:
        conn = HTTPConnection("127.0.0.1", PORT, timeout=300)
        headers = {
            "X-CodeBuddy-Request": "1",
            "Authorization": f"Bearer {session_token or PASS}",
            "Accept": "text/event-stream",
            "acp-connection-id": connection_id,
        }
        conn.request("GET", "/api/v1/acp", headers=headers)
        resp = conn.getresponse()
        log("SSE status", resp.status)
        buf = ""
        while not stop_sse.is_set():
            chunk = resp.read(2048)
            if not chunk:
                if resp.closed:
                    break
                time.sleep(0.05)
                continue
            buf += chunk.decode("utf-8", "replace")
            while "\n\n" in buf:
                block, buf = buf.split("\n\n", 1)
                data_lines = []
                for line in block.splitlines():
                    if line.startswith("data:"):
                        data_lines.append(line[5:].lstrip())
                if not data_lines:
                    continue
                data = "\n".join(data_lines)
                if data in (":ok", "ok", ""):
                    continue
                try:
                    handle_msg(json.loads(data))
                except Exception as e:
                    log("SSE parse err", e, data[:120])
        conn.close()
    except Exception as e:
        log("SSE loop exit", e)


def wait_rpc(req_id, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        with lock:
            if req_id in pending_rpc:
                return pending_rpc.pop(req_id)
        time.sleep(0.05)
    raise TimeoutError(f"rpc timeout id={req_id}")


def acp_request(req_id, method, params, timeout=120):
    body = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
    log("RPC_SEND", req_id, method)

    # Streamable-HTTP: POST body may be a long-lived SSE stream for session/prompt.
    # Read it in a background thread so permission replies can still be sent.
    result_holder = {}

    def post_reader():
        try:
            h = acp_headers()
            data = json.dumps(body).encode("utf-8")
            req = urllib.request.Request(BASE + "/api/v1/acp", data=data, headers=h, method="POST")
            resp = urllib.request.urlopen(req, timeout=timeout)
            buf = ""
            while True:
                chunk = resp.read(2048)
                if not chunk:
                    break
                buf += chunk.decode("utf-8", "replace")
                while "\n\n" in buf:
                    block, buf = buf.split("\n\n", 1)
                    data_lines = []
                    for line in block.splitlines():
                        if line.startswith("data:"):
                            data_lines.append(line[5:].lstrip())
                    if not data_lines:
                        continue
                    payload = "\n".join(data_lines)
                    if payload in (":ok", "ok", ""):
                        continue
                    try:
                        handle_msg(json.loads(payload))
                    except Exception:
                        pass
            result_holder["status"] = getattr(resp, "status", 200)
        except Exception as e:
            result_holder["error"] = str(e)
            log("POST reader err", method, e)

    th = threading.Thread(target=post_reader, daemon=True)
    th.start()
    try:
        return wait_rpc(req_id, timeout=timeout)
    finally:
        th.join(timeout=2)


def fc(name, path, body):
    st, raw, _, _ = http_json("POST", path, body, timeout=60)
    log(name, st, raw[:600])
    (OUT / f"{name}.json").write_text(
        json.dumps({"status": st, "body": raw}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    try:
        return st, json.loads(raw)
    except Exception:
        return st, raw


def main():
    global connection_id, session_token, session_id
    if log_path.exists():
        log_path.unlink()

    before = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
    log("ORIGINAL", repr(before))
    (OUT / "before.txt").write_text(before, encoding="utf-8")

    st, raw, _, _ = http_json("POST", "/api/v1/acp/connect", {}, timeout=30)
    log("connect", st, raw)
    conn = json.loads(raw)
    data = conn.get("data") if isinstance(conn.get("data"), dict) else conn
    connection_id = data["connectionId"]
    session_token = data["sessionToken"]

    threading.Thread(target=sse_loop, daemon=True).start()
    time.sleep(0.8)

    # Do NOT advertise client FS write: when true, CLI may delegate Write to
    # fs/write_text_file client RPCs and leave tool_call status=pending.
    # Desktop GUI uses server-side Write; match that so checkpoints track files.
    init = acp_request(
        1,
        "initialize",
        {
            "protocolVersion": 1,
            "clientCapabilities": {
                "fs": {"readTextFile": False, "writeTextFile": False},
                "terminal": False,
            },
            "clientInfo": {"name": "checkpoint-smoke", "version": "0.1.0"},
        },
        timeout=60,
    )
    log("init ok", bool(init.get("result")))

    new = acp_request(2, "session/new", {"cwd": str(ROOT), "mcpServers": []}, timeout=60)
    session_id = (new.get("result") or {}).get("sessionId") or session_id
    if not session_id:
        with lock:
            blob = json.dumps(events)
        m = re.search(r'"sessionId"\s*:\s*"([^"]+)"', blob)
        session_id = m.group(1) if m else None
    log("sessionId", session_id)
    if not session_id:
        raise SystemExit("no session")

    # Prefer fullAccess so Write is not blocked mid-tool.
    for mode in ("fullAccess", "bypassPermissions", "acceptEdits"):
        try:
            r = acp_request(
                10 + (abs(hash(mode)) % 50),
                "session/set_config_option",
                {"sessionId": session_id, "configId": "mode", "value": mode},
                timeout=30,
            )
            log("set mode", mode, "error" if "error" in r else "ok", r.get("error"))
            if "error" not in r:
                break
        except Exception as e:
            log("set mode fail", mode, e)

    try:
        r = acp_request(
            11,
            "session/set_config_option",
            {"sessionId": session_id, "configId": "model", "value": "hy3"},
            timeout=30,
        )
        log("set model", "error" if "error" in r else "ok")
    except Exception as e:
        log("set model skip", e)

    prompt_text = (
        "Overwrite ./target.txt using ONLY the Write tool (never Bash). "
        "file_path must be exactly: target.txt (relative path). "
        "Write these exact two lines as the entire file content:\n"
        f"{MARKER}\n"
        "second-line-after-edit\n"
        "After Write succeeds, reply DONE and stop."
    )
    log("sending prompt...")
    prompt_res = {"pending": True}
    prompt_error = None

    def run_prompt():
        nonlocal prompt_res, prompt_error
        try:
            prompt_res = acp_request(
                20,
                "session/prompt",
                {
                    "sessionId": session_id,
                    "prompt": [{"type": "text", "text": prompt_text}],
                },
                timeout=300,
            )
            log("prompt done", json.dumps(prompt_res, ensure_ascii=False)[:800])
        except Exception as e:
            prompt_error = str(e)
            prompt_res = {"error": str(e)}
            log("prompt error", e)

    prompt_thread = threading.Thread(target=run_prompt, daemon=True)
    prompt_thread.start()

    # Poll file bytes while the agent works — do not require prompt RPC to finish first.
    after_edit = before
    for i in range(120):  # up to ~120s
        if TARGET.exists():
            try:
                after_edit = TARGET.read_text(encoding="utf-8")
            except Exception:
                after_edit = before
            if MARKER in after_edit:
                log("file marker detected at poll", i)
                break
        time.sleep(1)
    else:
        log("file marker not detected within poll window")

    log("AFTER_EDIT", repr(after_edit))
    (OUT / "after_edit.txt").write_text(after_edit, encoding="utf-8")
    if prompt_error:
        log("prompt_error_note", prompt_error)

    st_ck, ck = fc("checkpoints_after_edit", "/internal/file-changes/checkpoints", {})
    st_diff, diff = fc("diff_target", "/internal/file-changes/diff", {"path": "target.txt"})
    fc("diff_target_abs", "/internal/file-changes/diff", {"path": str(TARGET)})

    st_rev, rev = fc("revert_all", "/internal/file-changes/revert", {})
    time.sleep(0.5)
    after_revert = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
    log("AFTER_REVERT", repr(after_revert))
    (OUT / "after_revert.txt").write_text(after_revert, encoding="utf-8")

    checkpoints = []
    if isinstance(ck, dict):
        data = ck.get("data") or ck
        if isinstance(data, dict):
            checkpoints = data.get("checkpoints") or []
        elif isinstance(data, list):
            checkpoints = data

    after_ck = None
    if checkpoints:
        cid = checkpoints[0].get("id") or checkpoints[0].get("checkpointId")
        log("first checkpoint", checkpoints[0])
        # re-apply edit if revert_all already restored, then checkpoint revert matrix
        fc(
            "revert_checkpoint_code",
            "/internal/file-changes/revert",
            {"checkpointId": cid, "scope": "Code"},
        )
        after_ck = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        (OUT / "after_checkpoint_revert.txt").write_text(after_ck or "", encoding="utf-8")
        log("AFTER_CK_REVERT", repr(after_ck))

    summary = {
        "cliVersion": "2.125.0",
        "port": PORT,
        "cwd": str(ROOT),
        "sessionId": session_id,
        "connectionId": connection_id,
        "before": before,
        "after_edit": after_edit,
        "after_revert": after_revert,
        "after_checkpoint_revert": after_ck,
        "marker_in_after_edit": MARKER in after_edit,
        "restored_to_original": after_revert == before,
        "checkpoints_status": st_ck,
        "checkpoints": checkpoints,
        "diff_status": st_diff,
        "diff_body_excerpt": (diff if isinstance(diff, str) else json.dumps(diff, ensure_ascii=False))[:2000],
        "revert_status": st_rev,
        "revert_body_excerpt": (rev if isinstance(rev, str) else json.dumps(rev, ensure_ascii=False))[:1000],
        "prompt_result_excerpt": json.dumps(prompt_res, ensure_ascii=False)[:1500],
        "event_count": len(events),
    }
    (OUT / "smoke_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    log("SUMMARY")
    log(json.dumps(summary, ensure_ascii=False, indent=2)[:3500])
    stop_sse.set()
    log("done")
    # exit 0 even if agent didn't edit — evidence still recorded; caller checks flags
    if not summary["marker_in_after_edit"]:
        sys.exit(2)
    if not summary["restored_to_original"] and st_rev not in (200, 204):
        sys.exit(3)


if __name__ == "__main__":
    main()
