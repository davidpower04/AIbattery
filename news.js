Warning: truncated output (original token count: 3354)
Total output lines: 308

(() => {
  const PROXY = "https://proxy.cors.dev/";
  const CACHE_KEY = "morning-context-news-v1";
  const TOPICS = [
    { id: "battery", label: "이차전지", query: "(이차전지 OR 배터리 OR ESS OR 전기차 배터리)" },
    { id: "chip", label: "반도체", query: "(반도체 OR HBM OR 삼성전자 OR SK하이닉스)" },
    { id: "fx", label: "환율", query: "(환율 OR 원달러 OR 원화 OR 달러 환율)" },
    { id: "market", label: "주식시장", query: "(코스피 OR 코스닥 OR 증시 OR 주식시장)" }
  ];

  const style = document.createElement("style");
  style.textContent = ".card{color:inherit;text-decoration:none}.live-status{margin:-18px 0 26px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--muted);font-size:13px}.live-status[data-state='error']{border-color:#bd4d2c;color:#8b2500;background:#fff7f3}.live-status[data-state='loading']{color:var(--green)}.toolbtn:disabled{opacity:.6;cursor:wait}.empty{grid-column:1/-1}";
  document.head.append(style);

  const status = document.createElement("p");
  status.className = "live-status";
  status.id = "liveStatus";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  document.querySelector(".markets").after(status);

  const tools = document.querySelector(".tools");
  const refreshButton = document.createElement("button");
  refreshButton.id = "refreshNews";
  refreshButton.type = "button";
  refreshButton.className = "toolbtn";
  refreshButton.textContent = "지금 새로고침";
  tools.append(refreshButton);

  const marketLabels = [
    ["관심 주제", "4개", "이차전지 · 반도체 · 환율 · 주식"],
    ["최신 이슈", "불러오는 중", "주제별 한국어 기사"],
    ["자료 기준", "최근 48시간", "부족하면 최근 7일 기사로 보충"],
    ["마지막 확인", "확인 중", "페이지 방문 시 자동 갱신"]
  ];
  const market = document.querySelector(".markets…2354 tokens truncated…led = true;
    refreshButton.textContent = "불러오는 중…";
    setStatus("최신 한국어 기사를 확인하고 있습니다…", "loading");
    const outcomes = await Promise.allSettled(TOPICS.map(loadTopic));
    const next = {};
    const failures = [];
    const windows = [];
    let allSucceeded = true;
    outcomes.forEach((outcome, index) => {
      const topic = TOPICS[index];
      if (outcome.status === "fulfilled") {
        next[topic.id] = outcome.value.items;
        windows.push(outcome.value.window);
      } else {
        allSucceeded = false;
        failures.push(topic.label);
        next[topic.id] = existing?.topics?.[topic.id] || [];
      }
    });
    const updatedAt = Date.now();
    renderAll(next, allSucceeded ? updatedAt : (existing?.updatedAt || null));
    if (allSucceeded) {
      saveCache({ updatedAt, topics: next });
      const fewer = TOPICS.filter((topic) => (next[topic.id] || []).length < 4).map((topic) => topic.label);
      if (fewer.length) {
        setStatus("기사 목록을 갱신했습니다. " + fewer.join(", ") + " 주제는 최근 7일 내 한국어 기사 4건을 찾지 못했습니다.", "ready");
      } else if (windows.includes("7일")) {
        setStatus("최신 기사 갱신 완료 · 일부 주제는 48시간 기사가 부족해 최근 7일 기사로 보충했습니다.", "ready");
      } else {
        setStatus("최신 기사 갱신 완료 · " + formatDate(new Date(updatedAt), { hour: "2-digit", minute: "2-digit" }) + " (KST)", "ready");
      }
    } else {
      if (existing) saveCache({ updatedAt: existing.updatedAt, topics: next });
      setStatus("일부 뉴스 연결에 실패했습니다 (" + failures.join(", ") + "). 저장된 목록은 마지막 갱신 시각과 함께 표시합니다.", "error");
    }
    refreshButton.disabled = false;
    refreshButton.textContent = "지금 새로고침";
  }

  refreshButton.addEventListener("click", () => refreshNews());
  refreshNews();
})();
