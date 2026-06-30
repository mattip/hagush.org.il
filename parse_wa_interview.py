#!/usr/bin/env python3
"""
Parse a WhatsApp group chat export into a structured interview JSON.

Keeps the conversational feel: filler messages ("רגע כותב", "מרגש!")
stay in. Each Q&A block has three arrays — question, answer, response —
where every chat message is its own item, rendered as a separate <p>.

Usage:
    python parse_wa_interview.py _chat.txt moshe_r \
        --interviewer "Lyat" --candidate "Moshe Radman" \
        --start "14:00" --end "15:05" --date "2026-06-18" \
        --images interviews/moshe_r
"""

import argparse
import json
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

# ── WhatsApp message parsing ──────────────────────────────────────

MSG_RE = re.compile(
    r"^\[(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}:\d{2})\]\s+(.+?):\s(.*)$"
)

SYSTEM_MARKERS = [
    "Messages and calls are end-to-end encrypted",
    "created group", "added you", "You're now an admin",
    "changed the group", "changed this group", "reset this group",
    "turned on disappearing", "turned off disappearing",
    "You changed the group", "This message was deleted",
    "changed the settings", "left", " removed ",
    " joined using", "You added",
]

ATTACH_RE = re.compile(r"<attached:\s*(.+?)>")

# Threshold: interviewer messages shorter than this are "responses"
# (reactions after the answer), not new questions.
QUESTION_MIN_LEN = 50


@dataclass
class Message:
    date: str
    time: str
    sender: str
    text: str
    image: str = ""   # filename if attachment


def is_system(text: str) -> bool:
    clean = text.replace("\u200e", "").replace("\u200f", "").strip()
    return any(m in clean for m in SYSTEM_MARKERS)


def parse_messages(path: Path) -> list[Message]:
    raw = path.read_text(encoding="utf-8")
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")
    messages: list[Message] = []

    for line in raw.split("\n"):
        # Strip invisible Unicode markers at start of line
        clean_line = line.lstrip("\u200e\u200f\u200b\u200c\u200d\ufeff")
        m = MSG_RE.match(clean_line)
        if m:
            date, time, sender, text = m.groups()
            sender = sender.replace("\u200e", "").replace("\u200f", "").strip()
            text = text.replace("\u200e", "").replace("\u200f", "").strip()

            # Check for image attachment
            att = ATTACH_RE.search(text)
            if att:
                messages.append(Message(date, time, sender, "", image=att.group(1)))
            elif "image omitted" not in text:
                messages.append(Message(date, time, sender, text))
        elif messages:
            messages[-1].text += "\n" + line

    return messages


def time_to_minutes(t: str) -> int:
    parts = t.split(":")
    return int(parts[0]) * 60 + int(parts[1])


# ── Q&A extraction ───────────────────────────────────────────────

def extract_interview(
    messages: list[Message],
    interviewer: str,
    candidate: str,
    start_time: str | None = None,
    end_time: str | None = None,
) -> list[dict]:
    """Extract Q&A blocks with question/answer/response arrays."""

    def is_iv(msg):
        return interviewer.lower() in msg.sender.lower()
    def is_cd(msg):
        return candidate.lower() in msg.sender.lower()

    # Filter to interview window + relevant senders
    filtered: list[Message] = []
    in_window = False

    for msg in messages:
        if is_system(msg.text) and not msg.image:
            continue
        if not is_iv(msg) and not is_cd(msg):
            continue

        if start_time:
            mins = time_to_minutes(msg.time)
            s = time_to_minutes(start_time)
            e = time_to_minutes(end_time) if end_time else 24 * 60
            if mins < s or mins > e:
                continue

        # Auto-detect start: first substantial interviewer message
        if not in_window:
            if is_iv(msg) and len(msg.text) > 30:
                in_window = True
            else:
                continue

        filtered.append(msg)

    # State machine: QUESTION → ANSWER → RESPONSE → (flush) → QUESTION
    blocks: list[dict] = []
    q_parts: list = []    # list of str | {"type":"image","file":...}
    a_parts: list = []
    r_parts: list = []
    state = "QUESTION"    # QUESTION | ANSWER | RESPONSE

    def msg_item(msg):
        if msg.image:
            return {"type": "image", "file": msg.image}
        return msg.text.strip()

    def flush():
        if q_parts and a_parts:
            blocks.append({
                "question": list(q_parts),
                "answer": list(a_parts),
                "response": list(r_parts),
            })
        q_parts.clear()
        a_parts.clear()
        r_parts.clear()

    for msg in filtered:
        item = msg_item(msg)

        if is_iv(msg):
            is_long = len(msg.text) >= QUESTION_MIN_LEN

            if state == "QUESTION":
                q_parts.append(item)

            elif state == "ANSWER":
                if is_long:
                    # New question — flush previous block
                    flush()
                    q_parts.append(item)
                    state = "QUESTION"
                else:
                    # Short reaction → response
                    r_parts.append(item)
                    state = "RESPONSE"

            elif state == "RESPONSE":
                if is_long:
                    flush()
                    q_parts.append(item)
                    state = "QUESTION"
                else:
                    r_parts.append(item)

        elif is_cd(msg):
            if state == "QUESTION":
                a_parts.append(item)
                state = "ANSWER"
            elif state == "ANSWER":
                a_parts.append(item)
            elif state == "RESPONSE":
                # Candidate speaking after interviewer response — still same answer block
                a_parts.extend(r_parts)
                r_parts.clear()
                a_parts.append(item)
                state = "ANSWER"

    flush()
    return blocks


def build_json(candidate_id: str, blocks: list[dict], date: str) -> dict:
    questions = []
    for i, b in enumerate(blocks):
        questions.append({
            "id": f"q{i + 1}",
            "question": b["question"],
            "answer": b["answer"],
            "response": b["response"],
        })
    return {
        "candidate_id": candidate_id,
        "date": date,
        "questions": questions,
    }


def main():
    ap = argparse.ArgumentParser(description="Parse WhatsApp interview → JSON")
    ap.add_argument("chat", help="WhatsApp chat export .txt")
    ap.add_argument("candidate_id", help="candidate id (e.g. moshe_r)")
    ap.add_argument("--interviewer", required=True)
    ap.add_argument("--candidate", required=True)
    ap.add_argument("--start", default=None, help="HH:MM")
    ap.add_argument("--end", default=None, help="HH:MM")
    ap.add_argument("--date", default="")
    ap.add_argument("--images", default=None,
                    help="directory to copy attached images into")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    chat_path = Path(args.chat)
    if not chat_path.exists():
        sys.exit(f"error: {chat_path} not found")

    out_path = Path(args.out) if args.out else Path("interviews") / f"{args.candidate_id}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Parsing {chat_path}...")
    messages = parse_messages(chat_path)
    print(f"  {len(messages)} raw messages")

    blocks = extract_interview(
        messages,
        interviewer=args.interviewer,
        candidate=args.candidate,
        start_time=args.start,
        end_time=args.end,
    )
    print(f"  {len(blocks)} Q&A blocks")

    data = build_json(args.candidate_id, blocks, args.date)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_path}")

    # Copy images if --images given
    if args.images:
        img_dir = Path(args.images)
        img_dir.mkdir(parents=True, exist_ok=True)
        chat_dir = chat_path.parent
        for b in blocks:
            for part in b["answer"] + b["question"] + b["response"]:
                if isinstance(part, dict) and part.get("type") == "image":
                    src = chat_dir / part["file"]
                    if src.exists():
                        shutil.copy2(src, img_dir / part["file"])
                        print(f"  Copied {part['file']}")

    # Summary
    for i, q in enumerate(data["questions"]):
        q_preview = q["question"][0] if q["question"] else "?"
        if isinstance(q_preview, str):
            q_preview = q_preview[:60].replace("\n", " ")
        a_count = len(q["answer"])
        r_count = len(q["response"])
        print(f"  {i+1}. Q[{len(q['question'])}] A[{a_count}] R[{r_count}] {q_preview}…")


if __name__ == "__main__":
    main()
