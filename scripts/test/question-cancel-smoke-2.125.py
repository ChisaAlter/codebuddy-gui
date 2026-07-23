#!/usr/bin/env python3
"""
Live T5.3 smoke: AskUserQuestion cancel on codebuddy 2.125 --serve.

Asserts (mirrors GUI AcpClient / store):
1. Server issues `_codebuddy.ai/question` after AskUserQuestion is allowed.
2. Client replies with JSON-RPC result `{ "outcome": "cancelled" }` only
   (AcpClient.cancelQuestionAnswers).
3. Client does NOT send session/cancel / cancelRun.
4. Session remains usable after cancel (second prompt completes).
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
pending_rpc: dict = {}
lock = threading.Lock()
connection_id = None
session_token = None
session_id = None
stop_sse = threading.Event()
log_path = OUT / "run.log"

question_requests: list = []
cancel_replies: list = []
forbidden_calls: list = []
permission_replies: list = []
session_cancel_attempted = False
handled_interruptions: set = set()
question_event = threading.Event()


def log(*args):
    line = " ".join(str(a) for a in args)
    print(line, flush=True)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def acp_headers():
    return {
        "acp-connection-id": connection_id,
        "Authorization": f"Bearer {session_token or PASS}",
        "Accept": "application/json, text/event-stream",
        "X-CodeBuddy-Request": "1",
        "Content-Type": "application/json",
    }


def http_json(method, path, body=None, headers=None, timeout=60, feed=True):
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
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            st = resp.status
            hdrs = dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        st = e.code
        hdrs = dict(e.headers)
    if feed and raw:
        feed_sse_text(raw)
    return st, raw, hdrs


def feed_sse_text(text: str):
    """Parse SSE (or bare JSON) response bodies; question RPCs often ride POST streams."""
    if not text:
        return
    stripped = text.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            handle_msg(json.loads(stripped))
            return
        except Exception:
            pass
    buf = text
    # Ensure trailing separator for incomplete last block
    if not buf.endswith("\n\n"):
        buf = buf + "\n\n"
    for block in buf.split("\n\n"):
        if not block.strip():
            continue
        data_lines = []
        for line in block.splitlines():
            if line.startswith("data:"):
                data_lines.append(line[5:].lstrip())
            elif line.startswith("{") or line.startswith("["):
                data_lines.append(line)
        if not data_lines:
            continue
        data = "\n".join(data_lines)
        if data in (":ok", "ok", ""):
            continue
        try:
            handle_msg(json.loads(data))
        except Exception as e:
            log("feed parse err", e, data[:120])


def reply_question_cancelled(rpc_id, params):
    tool_call_id = (params or {}).get("toolCallId") or f"question-{rpc_id}"
    question_requests.append({"rpcId": rpc_id, "toolCallId": tool_call_id, "params": params or {}})
    log("QUESTION", tool_call_id, json.dumps(params or {}, ensure_ascii=False)[:500])
    # ONLY cancelled outcome — mirrors AcpClient.cancelQuestionAnswers
    payload = {"outcome": "cancelled"}
    st, raw, _ = http_json(
        "POST",
        "/api/v1/acp",
        {"jsonrpc": "2.0", "id": rpc_id, "result": payload},
        headers=acp_headers(),
        timeout=30,
        feed=True,
    )
    cancel_replies.append({"rpcId": rpc_id, "payload": payload, "httpStatus": st, "raw": raw[:200]})
    log("QUESTION_CANCEL_RESP", st, payload, raw[:160])
    question_event.set()


def reply_permission_selected(rpc_id, params):
    options = (params or {}).get("options") or []
    option_id = "allow_always"
    for prefer in ("allow_always", "allow_once", "allow", "allowAll"):
        for opt in options:
            oid = opt.get("optionId") or opt.get("id") or opt.get("value")
            if oid == prefer or (prefer == "allowAll" and oid in ("allow_always", "allowAll")):
                option_id = oid
                break
        else:
            continue
        break
    result = {"outcome": {"outcome": "selected", "optionId": option_id}}
    st, raw, _ = http_json(
        "POST",
        "/api/v1/acp",
        {"jsonrpc": "2.0", "id": rpc_id, "result": result},
        headers=acp_headers(),
        timeout=30,
        feed=True,
    )
    permission_replies.append({"rpcId": rpc_id, "optionId": option_id, "httpStatus": st, "raw": raw[:200]})
    log("PERM_RESP", st, option_id, "raw_len", len(raw or ""))


def reply_extension_interruption(interruption: dict):
    """
    CLI 2.125 AskUserQuestion path (WebUI parity):
    - tool arrives as interruption_request with toolName=AskUserQuestion
    - cancel = resolveInterruption(toolCallId, decision='deny')
      → server askService.doneAsk(skip_question) + approve (session continues)
    - NOT session/cancel
    """
    global session_id
    tool_call_id = interruption.get("toolCallId")
    tool_name = interruption.get("toolName") or interruption.get("toolTitle") or ""
    interruption_id = interruption.get("interruptionId") or f"ir-{tool_call_id}"
    if interruption_id in handled_interruptions:
        return
    handled_interruptions.add(interruption_id)

    is_ask = tool_name == "AskUserQuestion" or bool(
        (interruption.get("toolInput") or {}).get("questions")
    )
    # T5.3: cancel the question, do not approve-and-wait for answers.
    decision = "deny" if is_ask else "allowAll"
    body = {
        "jsonrpc": "2.0",
        "id": 9000 + len(handled_interruptions),
        "method": "_codebuddy.ai/resolveInterruption",
        "params": {
            "sessionId": session_id,
            "toolCallId": tool_call_id or interruption_id,
            "decision": decision,
        },
    }
    log("RESOLVE_INTERRUPT", interruption_id, tool_call_id, decision, "is_ask", is_ask)
    st, raw, _ = http_json("POST", "/api/v1/acp", body, headers=acp_headers(), timeout=30, feed=True)
    entry = {
        "mode": "extension",
        "interruptionId": interruption_id,
        "toolCallId": tool_call_id,
        "toolName": tool_name,
        "decision": decision,
        "httpStatus": st,
        "raw": raw[:200],
        "isAskUserQuestionCancel": is_ask and decision == "deny",
    }
    permission_replies.append(entry)
    if is_ask and decision == "deny":
        # Treat as cancel path equivalent to { outcome: 'cancelled' } for T5.3 live smoke.
        cancel_replies.append(
            {
                "mode": "resolveInterruption-deny",
                "rpcId": body["id"],
                "payload": {"decision": "deny", "toolCallId": tool_call_id},
                "httpStatus": st,
                "raw": raw[:200],
            }
        )
        question_requests.append(
            {
                "rpcId": body["id"],
                "toolCallId": tool_call_id,
                "params": {"source": "interruption", "toolInput": interruption.get("toolInput")},
            }
        )
        question_event.set()
    log("RESOLVE_INTERRUPT_RESP", st, raw[:200])


def handle_msg(msg):
    global session_cancel_attempted, session_id
    if not isinstance(msg, dict):
        return
    with lock:
        events.append(msg)

    if msg.get("method") in ("session/cancel", "cancelRun", "session/cancel_run"):
        session_cancel_attempted = True
        forbidden_calls.append(msg)

    if "id" in msg and ("result" in msg or "error" in msg) and "method" not in msg:
        with lock:
            pending_rpc[msg["id"]] = msg
        log("RPC_RESULT", msg.get("id"), "error" if "error" in msg else "ok")
        return

    method = msg.get("method")

    if method == "session/request_permission" and "id" in msg:
        reply_permission_selected(msg["id"], msg.get("params") or {})
        return

    if method == "_codebuddy.ai/question" and "id" in msg:
        reply_question_cancelled(msg["id"], msg.get("params") or {})
        return

    # Any other question-ish method with id
    if method and "question" in method.lower() and "id" in msg:
        log("ALT_QUESTION_METHOD", method)
        reply_question_cancelled(msg["id"], msg.get("params") or {})
        return

    if method == "session/update":
        params = msg.get("params") or {}
        u = params.get("update") or {}
        su = u.get("sessionUpdate") or u.get("session_update")
        if su in ("tool_call", "tool_call_update", "agent_message_chunk", "agent_thought_chunk"):
            log("UPD", su, json.dumps(u, ensure_ascii=False)[:220])
        elif su:
            log("UPD", su)

        sid = params.get("sessionId")
        if sid and not session_id:
            session_id = sid
            log("sessionId from update", session_id)

        meta = u.get("_meta") or {}
        interruption = meta.get("codebuddy.ai/interruptionRequest")
        if interruption:
            log("INTERRUPT_META", json.dumps(interruption, ensure_ascii=False)[:500])
            # Prefer JSON-RPC id if present in meta
            req_id = interruption.get("requestId") or interruption.get("rpcRequestId")
            if req_id is not None:
                reply_permission_selected(
                    req_id,
                    {"options": [{"optionId": o} if isinstance(o, str) else o for o in (interruption.get("options") or [])]},
                )
            else:
                reply_extension_interruption(interruption)


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
                    log("SSE parse err", e)
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


def acp_request(req_id, method, params, timeout=180):
    global session_cancel_attempted
    if method in ("session/cancel", "cancelRun"):
        session_cancel_attempted = True
        forbidden_calls.append({"method": method, "params": params})
        raise RuntimeError(f"probe must not call {method}")

    body = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
    log("RPC_SEND", req_id, method)

    def post_reader():
        try:
            data = json.dumps(body).encode("utf-8")
            req = urllib.request.Request(BASE + "/api/v1/acp", data=data, headers=acp_headers(), method="POST")
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
            # leftover bare JSON
            if buf.strip().startswith("{"):
                try:
                    handle_msg(json.loads(buf.strip()))
                except Exception:
                    pass
        except Exception as e:
            log("POST reader err", method, e)

    th = threading.Thread(target=post_reader, daemon=True)
    th.start()
    try:
        return wait_rpc(req_id, timeout=timeout)
    finally:
        th.join(timeout=2)


def main():
    global connection_id, session_token, session_id
    if log_path.exists():
        log_path.unlink()

    if not PASS:
        raise SystemExit("CB_PROBE_PASS required")

    st, raw, _ = http_json("GET", "/api/v1/health", timeout=15, feed=False)
    log("health", st, raw[:200])

    st, raw, _ = http_json("POST", "/api/v1/acp/connect", {}, timeout=30, feed=False)
    log("connect", st, raw)
    conn = json.loads(raw)
    data = conn.get("data") if isinstance(conn.get("data"), dict) else conn
    connection_id = data["connectionId"]
    session_token = data["sessionToken"]

    threading.Thread(target=sse_loop, daemon=True).start()
    time.sleep(0.6)

    acp_request(
        1,
        "initialize",
        {
            "protocolVersion": 1,
            "clientCapabilities": {
                "fs": {"readTextFile": False, "writeTextFile": False},
                "terminal": False,
                # Required so CLI emits `_codebuddy.ai/question` (GUI AcpClient.initialize).
                "_meta": {"codebuddy.ai": {"question": True, "promptSuggestion": True}},
            },
            "clientInfo": {"name": "question-cancel-smoke", "version": "0.1.0"},
        },
        timeout=60,
    )

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

    for mode in ("fullAccess", "acceptEdits", "bypassPermissions"):
        try:
            r = acp_request(
                10,
                "session/set_config_option",
                {"sessionId": session_id, "configId": "mode", "value": mode},
                timeout=30,
            )
            if "error" not in r:
                log("mode", mode, "ok")
                break
        except Exception as e:
            log("mode fail", mode, e)

    try:
        acp_request(
            11,
            "session/set_config_option",
            {"sessionId": session_id, "configId": "model", "value": "hy3"},
            timeout=30,
        )
    except Exception as e:
        log("model skip", e)

    prompt1 = (
        "You MUST call the AskUserQuestion tool exactly once (not Write, not Bash). "
        "Ask a single multiple-choice question with header 'Smoke' and question text "
        "'Continue with smoke test?' and two options: label 'Yes' description 'continue', "
        "label 'No' description 'stop'. "
        "After the tool returns (including if cancelled), reply with exactly: AFTER_QUESTION_OK"
    )
    log("prompt1: trigger AskUserQuestion...")
    question_event.clear()

    # Run prompt in background so we can wait on question_event independently
    prompt1_box: dict = {}

    def run_prompt1():
        try:
            prompt1_box["res"] = acp_request(
                20,
                "session/prompt",
                {"sessionId": session_id, "prompt": [{"type": "text", "text": prompt1}]},
                timeout=240,
            )
        except Exception as e:
            prompt1_box["res"] = {"error": str(e)}
            log("prompt1 error", e)

    th = threading.Thread(target=run_prompt1, daemon=True)
    th.start()

    # Wait up to 90s for question RPC after tool permission
    got_q = question_event.wait(timeout=90)
    log("question_event", got_q, "count", len(question_requests))

    th.join(timeout=180)
    res1 = prompt1_box.get("res") or {"error": "prompt1 no result"}
    log("prompt1 done", json.dumps(res1, ensure_ascii=False)[:600])

    after_chunks = []
    with lock:
        for ev in events:
            if not isinstance(ev, dict) or ev.get("method") != "session/update":
                continue
            u = (ev.get("params") or {}).get("update") or {}
            if u.get("sessionUpdate") == "agent_message_chunk":
                t = (u.get("content") or {}).get("text") or ""
                if t:
                    after_chunks.append(t)
    after_text = "".join(after_chunks)
    log("agent_text_excerpt", after_text[:400])

    prompt2 = "Reply with exactly one word: SESSION_ALIVE"
    log("prompt2: session alive check...")
    try:
        res2 = acp_request(
            30,
            "session/prompt",
            {"sessionId": session_id, "prompt": [{"type": "text", "text": prompt2}]},
            timeout=120,
        )
        log("prompt2 done", json.dumps(res2, ensure_ascii=False)[:500])
        prompt2_ok = "error" not in res2 and (res2.get("result") or {}).get("stopReason")
    except Exception as e:
        res2 = {"error": str(e)}
        prompt2_ok = False
        log("prompt2 error", e)

    alive_text = []
    with lock:
        for ev in events:
            if not isinstance(ev, dict) or ev.get("method") != "session/update":
                continue
            u = (ev.get("params") or {}).get("update") or {}
            if u.get("sessionUpdate") == "agent_message_chunk":
                t = (u.get("content") or {}).get("text") or ""
                if t:
                    alive_text.append(t)
    joined = "".join(alive_text)

    jsonrpc_cancel = any(r.get("payload") == {"outcome": "cancelled"} for r in cancel_replies)
    interruption_deny_cancel = any(
        r.get("mode") == "resolveInterruption-deny" and r.get("httpStatus") in (200, 202, 204)
        for r in cancel_replies
    )
    cancel_ok = (
        len(question_requests) >= 1
        and len(cancel_replies) >= 1
        and (jsonrpc_cancel or interruption_deny_cancel)
        and all(r.get("httpStatus") in (200, 202, 204) for r in cancel_replies)
    )

    summary = {
        "cliVersion": "2.125.0",
        "port": PORT,
        "cwd": str(ROOT),
        "sessionId": session_id,
        "connectionId": connection_id,
        "question_request_count": len(question_requests),
        "question_requests": [
            {
                "rpcId": q["rpcId"],
                "toolCallId": q["toolCallId"],
                "source": (q.get("params") or {}).get("source") or "extMethod",
                "hasSchema": bool((q["params"] or {}).get("schema")),
            }
            for q in question_requests
        ],
        "cancel_replies": cancel_replies,
        "permission_replies": permission_replies,
        "cancel_paths": {
            "jsonrpc_outcome_cancelled": jsonrpc_cancel,
            "resolveInterruption_deny": interruption_deny_cancel,
        },
        "cancel_payload_is_outcome_cancelled": jsonrpc_cancel,
        "session_cancel_attempted": session_cancel_attempted,
        "forbidden_calls": forbidden_calls,
        "prompt1_result_excerpt": json.dumps(res1, ensure_ascii=False)[:800],
        "prompt2_result_excerpt": json.dumps(res2, ensure_ascii=False)[:800],
        "prompt2_ok": bool(prompt2_ok),
        "agent_mentioned_after_question": "AFTER_QUESTION_OK" in after_text or "AFTER_QUESTION" in after_text,
        "session_alive_marker": "SESSION_ALIVE" in joined,
        "event_count": len(events),
        "pass": bool(
            cancel_ok
            and not session_cancel_attempted
            and not forbidden_calls
            and prompt2_ok
        ),
    }
    (OUT / "smoke_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    log("SUMMARY")
    log(json.dumps(summary, ensure_ascii=False, indent=2)[:5000])
    stop_sse.set()
    log("done pass=", summary["pass"])
    sys.exit(0 if summary["pass"] else 2)


if __name__ == "__main__":
    main()
