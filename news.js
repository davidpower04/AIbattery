(() => {
  const TOPICS = [
    { id: "battery", label: "이차전지" },
    { id: "chip", label: "반도체" },
    { id: "fx", label: "환율" },
    { id: "market", label: "주식시장" }
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

  const refreshButton = document.createElement("button");
  refreshButton.id = "refreshNews";
  refreshButton.type = "button";
  refreshButton.className = "toolbtn";
  refreshButton.textContent = "지금 새로고침";
  document.querySelector(".tools").append(refreshButton);

  const market = document.querySelector(".markets");
  const marketLabels = [
    ["관심 주제", "4개", "이차전지 · 반도체 · 환율 · 주식"],
    ["전날 기사", "불러오는 중", "한국시간 기준"],
    ["날짜 기준", "전날만", "KST 00:00–23:59"],
    ["마지막 확인", "확인 중", "페이지 방문 시 자동 갱신"]
  ];
  market.setAttribute("aria-label", "전날 기사 자동 갱신 상태");
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

  const kicker = document.querySelector(".kicker");
  if (kicker) kicker.lastChild.textContent = " 전날의 산업과 시장";
  const coverageNote = document.querySelector(".coverage-note");
  if (coverageNote) {
    coverageNote.textContent = "한국시간 기준 전날 00:00–23:59에 발행된 기사만 표시합니다. 전날 기사가 4건보다 적으면 확인된 기사만 보여주며, 다른 날짜 기사로 채우지 않습니다.";
  }
  const footer = document.querySelector(".foot p");
  if (footer) {
    footer.innerHTML = "<b>아침의 맥락</b> · 방문할 때마다 한국시간 전날의 기사 자료를 확인합니다.<br>자동 수집: Google 뉴스 RSS 한국어 검색 결과. 전날이 아닌 기사는 목록에 넣지 않습니다.<br>투자 권유가 아닌 정보 요약입니다. 사건 시각과 내용은 원문에서 확인하세요.";
  }

  const formatDate = (date, options) => new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...options
  }).format(date);

  function kstDateKey(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + "-" + values.month + "-" + values.day;
  }

  function shiftDateKey(dateKey, amount) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + amount));
    return shifted.getUTCFullYear() + "-" +
      String(shifted.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(shifted.getUTCDate()).padStart(2, "0");
  }

  function dateFromKey(dateKey) {
    return new Date(dateKey + "T12:00:00+09:00");
  }

  function updateDateLabels() {
    const today = kstDateKey(new Date());
    const yesterday = shiftDateKey(today, -1);
    document.getElementById("briefDate").textContent = formatDate(new Date(), {
      year: "numeric", month: "long", day: "numeric"
    });
    document.getElementById("briefCoverage").textContent =
      "자료 기준 · " + formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) + " (KST)";
    document.getElementById("coverageWindow").textContent =
      formatDate(dateFromKey(yesterday), { month: "long", day: "numeric" });
    return yesterday;
  }

  const setStatus = (message, state) => {
    status.textContent = message;
    status.dataset.state = state || "ready";
  };

  function normalizeItem(item, yesterday) {
    if (!item || !item.title || !item.source || !item.link ||
        !/[가-힣]/.test(item.title) || !/[가-힣]/.test(item.source)) return null;
    const published = new Date(item.published);
    if (Number.isNaN(published.valueOf()) || kstDateKey(published) !== yesterday) return null;
    let link;
    try {
      link = new URL(item.link);
      if (link.protocol !== "https:" && link.protocol !== "http:") return null;
    } catch {
      return null;
    }
    const summary = String(item.summary || "기사 제목을 눌러 매체 원문에서 자세한 내용을 확인하세요.")
      .replace(/\s+/g, " ").trim();
    return {
      title: String(item.title).trim(),
      source: String(item.source).trim(),
      published: published.toISOString(),
      summary: summary.length > 220 ? summary.slice(0, 217) + "…" : summary,
      link: link.href
    };
  }

  function normalizeBriefing(payload, yesterday) {
    if (payload?.target_date_kst !== yesterday) {
      throw new Error("전날 기사 자료가 아직 갱신되지 않았습니다.");
    }
    const result = {};
    for (const topic of TOPICS) {
      const items = Array.isArray(payload.topics?.[topic.id]) ? payload.topics[topic.id] : [];
      const seen = new Set();
      result[topic.id] = items
        .map((item) => normalizeItem(item, yesterday))
        .filter((item) => {
          if (!item) return false;
          const key = item.title.toLocaleLowerCase("ko").replace(/[^\w가-힣]/g, "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => new Date(b.published) - new Date(a.published))
        .slice(0, 4);
    }
    return { topics: result, generatedAt: payload.generated_at };
  }

  function readCachedBriefing(yesterday) {
    try {
      const cached = sessionStorage.getItem("morning-context-briefing:" + yesterday);
      return cached ? normalizeBriefing(JSON.parse(cached), yesterday) : null;
    } catch {
      return null;
    }
  }

  async function readBriefing(yesterday) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    let payload;
    try {
      const response = await fetch("./news.json?v=" + Date.now(), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error("전날 기사 자료를 불러오지 못했습니다.");
      payload = await response.json();
    } finally {
      window.clearTimeout(timeout);
    }

    const briefing = normalizeBriefing(payload, yesterday);
    try {
      sessionStorage.setItem("morning-context-briefing:" + yesterday, JSON.stringify(payload));
    } catch {
      // Storage can be unavailable in private browsing; live fetching still works.
    }
    return briefing;
  }

  function makeCard(item) {
    const card = document.createElement("a");
    card.className = "card";
    card.href = item.link;
    card.setAttribute("aria-label", item.title + " — " + item.source + " 기사 보기");

    const meta = document.createElement("div");
    meta.className = "cardmeta";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "전날 기사";
    const time = document.createElement("time");
    time.dateTime = item.published;
    time.textContent = formatDate(new Date(item.published), {
      month: "long", day: "numeric", hour: "2-digit", minute: "2-digit"
    }) + " · KST";
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
    const rendered = items.map(makeCard);
    if (!rendered.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = loading
        ? "전날 기사 자료를 불러오고 있습니다…"
        : "해당 날짜에 표시할 전날 기사가 없습니다.";
      rendered.push(empty);
    }
    cards.replaceChildren(...rendered);
    section.querySelector(".count").textContent = "전날 이슈 " + items.length + "건";
    const badge = document.querySelector('.filter-topic[data-filter="' + topic.id + '"] b');
    if (badge) badge.textContent = String(items.length);
  }

  function renderAll(data, yesterday, generatedAt, loading) {
    let total = 0;
    for (const topic of TOPICS) {
      const items = data[topic.id] || [];
      renderTopic(topic, items, loading);
      total += items.length;
    }
    document.querySelector('.filter-topic[data-filter="all"] b').textContent = String(total);
    document.getElementById("storyTotal").textContent = total + "건";
    document.getElementById("updatedAt").textContent = generatedAt
      ? formatDate(new Date(generatedAt), { hour: "2-digit", minute: "2-digit" })
      : "확인 중";
    document.getElementById("briefCoverage").textContent =
      "자료 기준 · " + formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) + " (KST)";
    const result = document.getElementById("resultcount");
    if (result) result.textContent = "전날 이슈 " + total + "건";
    const noResults = document.getElementById("noResults");
    if (noResults) noResults.style.display = total ? "none" : "block";
    document.dispatchEvent(new Event("briefing:updated"));
    return total;
  }

  let refreshInProgress = false;
  let refreshPending = false;
  let lastRefreshStartedAt = 0;
  let automaticRetryCount = 0;
  let retryTimer = null;
  let returnRefreshTimer = null;

  async function refreshNews({ force = false } = {}) {
    if (refreshInProgress) {
      if (force) refreshPending = true;
      return;
    }
    const startedAt = Date.now();
    if (!force && startedAt - lastRefreshStartedAt < 1200) return;
    lastRefreshStartedAt = startedAt;
    refreshInProgress = true;

    const yesterday = updateDateLabels();
    const cached = readCachedBriefing(yesterday);
    const cachedTotal = cached
      ? renderAll(cached.topics, yesterday, cached.generatedAt, false)
      : 0;

    refreshButton.disabled = true;
    refreshButton.textContent = "불러오는 중…";
    if (!cached) {
      for (const topic of TOPICS) renderTopic(topic, [], true);
      setStatus(formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) +
        " (KST) 전날 기사 자료를 확인하고 있습니다…", "loading");
    } else {
      setStatus("저장된 전날 기사 " + cachedTotal + "건을 표시하며 최신 자료를 확인하고 있습니다…", "loading");
    }

    try {
      const briefing = await readBriefing(yesterday);
      automaticRetryCount = 0;
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = null;
      const total = renderAll(briefing.topics, yesterday, briefing.generatedAt, false);
      const fewer = TOPICS.filter((topic) => (briefing.topics[topic.id] || []).length < 4).map((topic) => topic.label);
      if (fewer.length) {
        setStatus(formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) +
          " (KST) 전날 기사 " + total + "건을 표시했습니다. " + fewer.join(", ") +
          " 주제는 4건보다 적은 전날 기사만 확인됐습니다.", "ready");
      } else {
        setStatus(formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) +
          " (KST) 기사 " + total + "건 · 자동 갱신 " +
          (briefing.generatedAt ? formatDate(new Date(briefing.generatedAt), { hour: "2-digit", minute: "2-digit" }) + " (KST)" : "완료"), "ready");
      }
    } catch {
      if (cached) {
        renderAll(cached.topics, yesterday, cached.generatedAt, false);
      } else {
        renderAll({}, yesterday, null, false);
      }

      if (!document.hidden && automaticRetryCount < 2) {
        automaticRetryCount += 1;
        const attempt = automaticRetryCount;
        setStatus(cached
          ? "연결이 잠시 끊겼습니다. 저장된 전날 기사 " + cachedTotal + "건을 표시하며 자동으로 다시 시도합니다…"
          : "뉴스 연결이 잠시 끊겼습니다. 자동으로 다시 시도합니다…", "loading");
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          refreshNews({ force: true });
        }, attempt * 1000);
      } else {
        setStatus(cached
          ? "저장된 전날 기사 " + cachedTotal + "건을 표시 중입니다. 지금 새로고침으로 다시 확인할 수 있습니다."
          : "뉴스 자료를 불러오지 못했습니다. 전날이 아닌 기사는 표시하지 않습니다. 지금 새로고침으로 다시 시도해 주세요.", "error");
      }
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = "지금 새로고침";
      refreshInProgress = false;
      if (refreshPending) {
        refreshPending = false;
        window.setTimeout(() => refreshNews({ force: true }), 0);
      }
    }
  }

  function refreshAfterReturn() {
    automaticRetryCount = 0;
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = null;
    if (returnRefreshTimer) window.clearTimeout(returnRefreshTimer);
    returnRefreshTimer = window.setTimeout(() => {
      returnRefreshTimer = null;
      refreshNews({ force: true });
    }, 120);
  }

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshAfterReturn();
  });

  let pageWasHidden = document.hidden;
  document.addEventListener("visibilitychange", () => {
    const isHidden = document.hidden;
    if (pageWasHidden && !isHidden) refreshAfterReturn();
    pageWasHidden = isHidden;
  });

  refreshButton.addEventListener("click", () => {
    automaticRetryCount = 0;
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = null;
    refreshNews({ force: true });
  });
  refreshNews();
})();

