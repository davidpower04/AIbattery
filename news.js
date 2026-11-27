(() => {
  const PROXY = "https://proxy.cors.dev/";
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
    footer.innerHTML = "<b>아침의 맥락</b> · 방문할 때마다 한국시간 전날의 기사를 다시 확인합니다.<br>자동 수집: Google 뉴스 RSS 한국어 검색 결과. 오래된 기사는 전날 기사 목록에 섞지 않습니다.<br>투자 권유가 아닌 정보 요약입니다. 사건 시각과 내용은 원문에서 확인하세요.";
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
    return { today, yesterday };
  }

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state || "ready";
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
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

  async function fetchFeed(topic) {
    const params = new URLSearchParams({
      q: topic.query + " when:7d",
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

  function selectYesterdayStories(items, yesterday) {
    const seen = new Set();
    const selected = [];
    for (const item of items) {
      if (!item.title || !item.link || !item.source ||
          !/[가-힣]/.test(item.title) || !/[가-힣]/.test(item.source)) continue;
      const published = new Date(item.date);
      if (Number.isNaN(published.valueOf()) || kstDateKey(published) !== yesterday) continue;
      const key = item.title.toLocaleLowerCase("ko").replace(/[^\w가-힣]/g, "");
      if (seen.has(key)) continue;
      item.published = published.toISOString();
      item.summary = item.summary.replace(item.title, "").replace(/^[\s|·:：\-–—]+/, "").trim();
      if (item.summary.length > 220) item.summary = item.summary.slice(0, 217) + "…";
      if (!item.summary) item.summary = "기사 제목을 눌러 매체 원문에서 자세한 내용을 확인하세요.";
      seen.add(key);
      selected.push(item);
    }
    return selected.sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 4);
  }

  async function loadTopic(topic, yesterday) {
    const feedItems = await fetchFeed(topic);
    return selectYesterdayStories(feedItems, yesterday);
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
        ? "전날의 한국어 기사를 확인하고 있습니다…"
        : "해당 날짜에 표시할 전날 기사가 없습니다.";
      rendered.push(empty);
    }
    cards.replaceChildren(...rendered);
    section.querySelector(".count").textContent = "전날 이슈 " + items.length + "건";
    const badge = document.querySelector('.filter-topic[data-filter="' + topic.id + '"] b');
    if (badge) badge.textContent = String(items.length);
  }

  function renderAll(data, yesterday, updatedAt, loading) {
    let total = 0;
    for (const topic of TOPICS) {
      const items = data[topic.id] || [];
      renderTopic(topic, items, loading);
      total += items.length;
    }
    document.querySelector('.filter-topic[data-filter="all"] b').textContent = String(total);
    document.getElementById("storyTotal").textContent = total + "건";
    document.getElementById("updatedAt").textContent = updatedAt
      ? formatDate(new Date(updatedAt), { hour: "2-digit", minute: "2-digit" })
      : "확인 중";
    document.getElementById("briefCoverage").textContent =
      "자료 기준 · " + formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) + " (KST)";
    const result = document.getElementById("resultcount");
    if (result) result.textContent = "전날 이슈 " + total + "건";
  }

  async function refreshNews() {
    const { today, yesterday } = updateDateLabels();
    refreshButton.disabled = true;
    refreshButton.textContent = "불러오는 중…";
    setStatus(formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) +
      " (KST) 기사만 확인하고 있습니다…", "loading");
    for (const topic of TOPICS) renderTopic(topic, [], true);

    const outcomes = await Promise.allSettled(TOPICS.map((topic) => loadTopic(topic, yesterday)));
    const next = {};
    const failures = [];
    let total = 0;
    outcomes.forEach((outcome, index) => {
      const topic = TOPICS[index];
      if (outcome.status === "fulfilled") {
        next[topic.id] = outcome.value;
      } else {
        failures.push(topic.label);
        next[topic.id] = [];
      }
      total += next[topic.id].length;
    });

    const updatedAt = Date.now();
    renderAll(next, yesterday, updatedAt, false);
    const fewer = TOPICS.filter((topic) => (next[topic.id] || []).length < 4).map((topic) => topic.label);
    if (failures.length) {
      setStatus("뉴스 연결에 실패한 주제: " + failures.join(", ") +
        ". 전날이 아닌 기사는 대신 표시하지 않았습니다. 새로고침으로 다시 시도해 주세요.", "error");
    } else if (fewer.length) {
      setStatus(formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) +
        " (KST) 전날 기사는 총 " + total + "건입니다. " + fewer.join(", ") +
        " 주제는 전날 기사가 4건보다 적어 확인된 기사만 표시했습니다.", "ready");
    } else {
      setStatus(formatDate(dateFromKey(yesterday), { year: "numeric", month: "long", day: "numeric" }) +
        " (KST) 기사 " + total + "건 갱신 완료 · " +
        formatDate(new Date(updatedAt), { hour: "2-digit", minute: "2-digit" }) + " (KST)", "ready");
    }
    refreshButton.disabled = false;
    refreshButton.textContent = "지금 새로고침";
  }

  refreshButton.addEventListener("click", refreshNews);
  refreshNews();
})();
