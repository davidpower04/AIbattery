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
  const market = document.querySelector(".markets");
  market.setAttribute("aria-label", "방문 시 자동 갱신되는 브리핑 상태");
  market.replaceChildren(...marketLabels.map((row, index) => {
    const box = document.createElement("div");
    box.className = "metric";
    const label = document.createElement("label");
    label.textContent = row[0];
    const strong = document.createElement("strong");
    strong.id = ["topicTotal", "storyTotal", "coverageWindow", "updatedAt"][index];
    strong.textContent = row[1];
    const note = document.createElement("span");
    note.textContent = row[2];
    box.append(label, strong, note);
    return box;
  }));

  const datebox = document.querySelector(".datebox");
  datebox.querySelector("small").textContent = "오늘 브리핑 · KST";
  datebox.querySelector("strong").id = "briefDate";
  datebox.querySelector("span").id = "briefCoverage";
  datebox.querySelector("span").textContent = "최근 48시간 · 한국어 기사";

  const kicker = document.querySelector(".kicker");
  if (kicker) kicker.lastChild.textContent = " 최근 48시간의 산업과 시장";
  const coverageNote = document.querySelector(".coverage-note");
  if (coverageNote) {
    coverageNote.textContent = "방문할 때마다 최신 한국어 기사를 불러옵니다. 최근 48시간 기사를 우선하고, 주제별 4건이 부족하면 최근 7일 이내 기사로 보충합니다.";
  }
  const footer = document.querySelector(".foot p");
  if (footer) {
    footer.innerHTML = "<b>아침의 맥락</b> · 방문할 때마다 최신 한국어 기사를 불러옵니다.<br>자동 수집: Google 뉴스 RSS 검색 결과. 목록 순서는 Google 뉴스 결과이며, 요약은 RSS 설명을 짧게 정리한 내용입니다.<br>투자 권유가 아닌 정보 요약입니다. 수치와 사건 시각은 원문에서 확인하세요.";
  }

  const formatDate = (date, options) => new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...options
  }).format(date);
  const now = new Date();
  document.getElementById("briefDate").textContent = formatDate(now, {
    year: "numeric", month: "long", day: "numeric"
  });

  const setStatus = (message, state) => {
    status.textContent = message;
    status.dataset.state = state || "ready";
  };

  function safeLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  const pageFallback = Object.fromEntries(TOPICS.map((topic) => {
    const section = document.getElementById(topic.id);
    const items = [...section.querySelectorAll(".card")].map((card) => {
      const time = card.querySelector("time");
      const day = time?.getAttribute("datetime") || new Date().toISOString().slice(0, 10);
      return {
        title: card.querySelector("h3")?.textContent.trim() || "",
        link: safeLink(card.dataset.href || card.href),
        date: day,
        published: new Date(day + "T09:00:00+09:00").toISOString(),
        summary: card.querySelector("p")?.textContent.trim() || "",
        source: (card.querySelector(".source")?.textContent || "").replace(/^기사:\s*/, "").trim(),
        isFallback: true
      };
    }).filter((item) => item.title && item.link && item.source);
    return [topic.id, items];
  }));

  function fillToFour(current, saved, fallback) {
    const items = [...current];
    const seen = new Set(items.map((item) => item.title.toLocaleLowerCase("ko").replace(/[^\w가-힣]/g, "")));
    for (const item of [...(saved || []), ...(fallback || [])]) {
      const key = item.title.toLocaleLowerCase("ko").replace(/[^\w가-힣]/g, "");
      if (!key || seen.has(key)) continue;
      items.push({ ...item, isFallback: true });
      seen.add(key);
      if (items.length >= 4) break;
    }
    return items.slice(0, 4);
  }
  function plainText(html) {
    const parsed = new DOMParser().parseFromString(html || "", "text/html");
    return (parsed.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function parseFeed(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("RSS 형식 오류");
    return [...xml.querySelectorAll("item")].map((entry) => {
      const text = (tag) => entry.getElementsByTagName(tag)[0]?.textContent.trim() || "";
      return {
        title: plainText(text("title")),
        link: safeLink(text("link")),
        date: text("pubDate"),
        summary: plainText(text("description")),
        source: plainText(text("source"))
      };
    });
  }

  async function fetchFeed(topic, period) {
    const params = new URLSearchParams({
      q: topic.query + " when:" + period,
      hl: "ko",
      gl: "KR",
      ceid: "KR:ko"
    });
    const rssUrl = "https://news.google.com/rss/search?" + params.toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(PROXY + rssUrl, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        headers: { Accept: "application/rss+xml, application/xml, text/xml" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error("뉴스 피드 연결 실패");
      return parseFeed(await response.text());
    } finally {
      clearTimeout(timer);
    }
  }

  function selectStories(items) {
    const seen = new Set();
    const unique = [];
    for (const item of items) {
      const key = item.title.toLocaleLowerCase("ko").replace(/[^\w가-힣]/g, "");
      if (!item.title || !item.link || !item.source || !/[가-힣]/.test(item.title) ||
          !/[가-힣]/.test(item.source) || seen.has(key)) continue;
      const published = new Date(item.date);
      if (Number.isNaN(published.valueOf())) continue;
      item.published = published.toISOString();
      item.summary = item.summary.replace(item.title, "").replace(/^[\s|·:：\-–—]+/, "").trim();
      if (item.summary.length > 220) item.summary = item.summary.slice(0, 217) + "…";
      if (!item.summary) item.summary = "기사 제목을 눌러 매체 원문에서 자세한 내용을 확인하세요.";
      seen.add(key);
      unique.push(item);
    }
    return unique.sort((a, b) => new Date(b.published) - new Date(a.published));
  }

  async function loadTopic(topic) {
    const stories = selectStories(await fetchFeed(topic, "7d"));
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const recent = stories.filter((item) => new Date(item.published).getTime() >= cutoff);
    const older = stories.filter((item) => new Date(item.published).getTime() < cutoff);
    return {
      items: [...recent, ...older].slice(0, 4),
      window: recent.length >= 4 ? "48시간" : "7일"
    };
  }
  function makeCard(item, topic) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = item.link;
    card.setAttribute("aria-label", item.title + " — " + item.source + " 기사 보기");

    const meta = document.createElement("div");
    meta.className = "cardmeta";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = item.isFallback ? "이전 기사" : "주요 기사";
    const time = document.createElement("time");
    time.dateTime = item.published;
    time.textContent = formatDate(new Date(item.published), {
      month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
    }) + " · 한국";
    meta.append(label, time);

    const heading = document.createElement("h3");
    heading.textContent = item.title;
    const summary = document.createElement("p");
    summary.textContent = item.summary;

    const foot = document.createElement("div");
    foot.className = "cardfoot";
    const source = document.createElement("span");
    source.className = "source";
    source.textContent = "기사: " + item.source;
    const read = document.createElement("span");
    read.className = "read";
    read.append(document.createTextNode("원문 보기 "));
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    read.append(arrow);
    foot.append(source, read);
    card.append(meta, heading, summary, foot);
    return card;
  }

  function renderTopic(topic, items, loading) {
    const section = document.getElementById(topic.id);
    const cards = section.querySelector(".cards");
    const rendered = items.map((item) => makeCard(item, topic));
    if (!rendered.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = loading ? "최신 한국어 기사를 불러오고 있습니다…" : "현재 새 한국어 기사를 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.";
      rendered.push(empty);
    }
    cards.replaceChildren(...rendered);
    section.querySelector(".count").textContent = "주요 이슈 " + items.length + "건";
    const badge = document.querySelector('.filter-topic[data-filter="' + topic.id + '"] b');
    if (badge) badge.textContent = String(items.length);
  }

  function renderAll(data, updatedAt) {
    let total = 0;
    for (const topic of TOPICS) {
      const items = data[topic.id] || [];
      renderTopic(topic, items);
      total += items.length;
    }
    document.querySelector('.filter-topic[data-filter="all"] b').textContent = String(total);
    document.getElementById("storyTotal").textContent = total + "건";
    document.getElementById("updatedAt").textContent = updatedAt
      ? formatDate(new Date(updatedAt), { hour: "2-digit", minute: "2-digit" })
      : "확인 중";
    document.getElementById("briefCoverage").textContent =
      "최근 48시간 · 부족하면 7일 이내 보충";
    const result = document.getElementById("resultcount");
    if (result) result.textContent = "전체 이슈 " + total + "건";
  }

  function readCache() {
    try {
      const data = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      return data && data.topics ? data : null;
    } catch {
      return null;
    }
  }

  function saveCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Storage can be disabled or full; the current page still works.
    }
  }

  const cache = readCache();
  if (cache) {
    renderAll(cache.topics, cache.updatedAt);
    setStatus("저장된 기사 목록을 먼저 표시하고 최신 기사를 확인합니다. 마지막 전체 갱신: " +
      formatDate(new Date(cache.updatedAt), { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " (KST)", "loading");
  } else {
    for (const topic of TOPICS) renderTopic(topic, [], true);
    setStatus("최신 한국어 기사를 불러오고 있습니다…", "loading");
  }

  async function refreshNews() {
    const existing = readCache();
    refreshButton.disabled = true;
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
        next[topic.id] = fillToFour(outcome.value.items, existing?.topics?.[topic.id], pageFallback[topic.id]);
        if (outcome.value.items.length < 4 || next[topic.id].some((item) => item.isFallback)) failures.push(topic.label + " 기사 보충");
        windows.push(outcome.value.window);
      } else {
        allSucceeded = false;
        failures.push(topic.label);
        const saved = existing?.topics?.[topic.id] || [];
        next[topic.id] = fillToFour([], saved, pageFallback[topic.id]);
      }
    });
    const updatedAt = Date.now();
    renderAll(next, allSucceeded ? updatedAt : (existing?.updatedAt || null));
    if (allSucceeded) {
      if (TOPICS.every((topic) => (next[topic.id] || []).length >= 4 && !(next[topic.id] || []).some((item) => item.isFallback))) saveCache({ updatedAt, topics: Object.fromEntries(TOPICS.map((topic) => [topic.id, next[topic.id]])) });
      const fewer = TOPICS.filter((topic) => (next[topic.id] || []).some((item) => item.isFallback)).map((topic) => topic.label);
      if (fewer.length) {
        setStatus("최신 기사를 확인했습니다. 기사 수가 적거나 연결이 불안정한 주제에는 이전 기사를 보충해 4건씩 표시했습니다: " + fewer.join(", ") + ".", "ready");
      } else if (windows.includes("7일")) {
        setStatus("최신 기사 갱신 완료 · 일부 주제는 48시간 기사가 부족해 최근 7일 기사로 보충했습니다.", "ready");
      } else {
        setStatus("최신 기사 갱신 완료 · " + formatDate(new Date(updatedAt), { hour: "2-digit", minute: "2-digit" }) + " (KST)", "ready");
      }
    } else {
      if (existing) saveCache({ updatedAt: existing.updatedAt, topics: next });
      setStatus("일부 뉴스 연결에 실패했습니다 (" + failures.join(", ") + "). 이전 기사나 저장된 기사를 보충해 표시합니다. 기사 날짜를 확인해 주세요.", "error");
    }
    refreshButton.disabled = false;
    refreshButton.textContent = "지금 새로고침";
  }

  refreshButton.addEventListener("click", () => refreshNews());
  refreshNews();
})();
