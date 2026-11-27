#!/usr/bin/env python3
"""Build a Korean-only briefing from articles published on the previous KST day."""
from __future__ import annotations

import html
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "news.json"

TOPICS = {
    "battery": {
        "label": "이차전지",
        "queries": ["(이차전지 OR 배터리 OR ESS OR 전기차 배터리)", "이차전지", "배터리 ESS"],
    },
    "chip": {
        "label": "반도체",
        "queries": ["(반도체 OR HBM OR 삼성전자 OR SK하이닉스)", "반도체 HBM", "메모리 반도체"],
    },
    "fx": {
        "label": "환율",
        "queries": ["(환율 OR 원달러 OR 원화 OR 달러 환율)", "원달러 환율", "엔화 환율"],
    },
    "market": {
        "label": "주식시장",
        "queries": ["(코스피 OR 코스닥 OR 증시 OR 주식시장)", "코스피 증시", "뉴욕 증시"],
    },
}


def plain_text(value: str) -> str:
    value = re.sub(r"<[^>]*>", " ", value or "")
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def fetch_feed(query: str) -> list[dict]:
    params = urlencode({
        "q": query + " when:7d",
        "hl": "ko",
        "gl": "KR",
        "ceid": "KR:ko",
    })
    url = "https://news.google.com/rss/search?" + params
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MorningContext/1.0)",
            "Accept": "application/rss+xml, application/xml, text/xml",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        root = ET.fromstring(response.read())

    items = []
    for node in root.findall("./channel/item"):
        title = plain_text(node.findtext("title", default=""))
        link = (node.findtext("link", default="") or "").strip()
        source = plain_text(node.findtext("source", default=""))
        pub_date = node.findtext("pubDate", default="") or ""
        description = plain_text(node.findtext("description", default=""))
        try:
            published = parsedate_to_datetime(pub_date)
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
            published = published.astimezone(KST)
        except (TypeError, ValueError, OverflowError):
            continue
        if not title or not source or not re.search(r"[가-힣]", title) or not re.search(r"[가-힣]", source):
            continue
        if not link.startswith(("https://", "http://")):
            continue
        if description.startswith(title):
            description = description[len(title):].lstrip(" |·:-–—")
        if not description:
            description = "기사 제목을 눌러 매체 원문에서 자세한 내용을 확인하세요."
        items.append({
            "title": title,
            "source": source,
            "published": published.isoformat(timespec="seconds"),
            "date": published.strftime("%Y-%m-%d"),
            "summary": description[:217] + ("…" if len(description) > 220 else ""),
            "link": link,
        })
    return items


def collect_topic(topic: dict, target_date: str) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()
    for query in topic["queries"]:
        try:
            batch = fetch_feed(query)
        except Exception as exc:  # retain other query results if one feed is unavailable
            print(f"Feed warning [{topic['label']} / {query}]: {exc}")
            time.sleep(1)
            continue
        for item in batch:
            if item["date"] != target_date:
                continue
            key = re.sub(r"[\W_]+", "", item["title"].lower())
            if not key or key in seen:
                continue
            seen.add(key)
            results.append(item)
        if len(results) >= 12:
            break
        time.sleep(0.5)

    results.sort(key=lambda item: item["published"], reverse=True)
    return results[:4]


def main() -> None:
    now = datetime.now(KST)
    target_date = (now.date() - timedelta(days=1)).isoformat()
    topics = {}
    for key, topic in TOPICS.items():
        topics[key] = collect_topic(topic, target_date)
        print(f"{topic['label']}: {len(topics[key])} stories for {target_date}")

    payload = {
        "generated_at": now.isoformat(timespec="seconds"),
        "target_date_kst": target_date,
        "topics": topics,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
