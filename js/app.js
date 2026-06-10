/* ===== 工具 ===== */
const $ = (sel) => document.querySelector(sel);
const fmtMoney = (n) =>
  "NT$ " + Math.round(n).toLocaleString("zh-TW");
const fmtPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

const BADGE_CLASS = {
  market: "badge-market",
  dividend: "badge-dividend",
  theme: "badge-theme",
  leveraged: "badge-leveraged",
  active: "badge-active"
};

/* ===== ETF 總覽 ===== */
function renderGrid(filter) {
  const grid = $("#etfGrid");
  grid.innerHTML = "";
  ETF_DATA
    .filter((e) => filter === "all" || e.type === filter)
    .forEach((e) => {
      const card = document.createElement("div");
      card.className = "etf-card";
      card.innerHTML = `
        <div class="code">${e.code} <span class="badge ${BADGE_CLASS[e.type]}">${e.typeLabel}</span></div>
        <div class="name">${e.name}</div>
        <div class="meta">發行：<strong>${e.issuer}</strong>｜配息：<strong>${e.dividend}</strong></div>
        <div class="meta">${e.fee}｜風險：<strong>${e.risk}</strong></div>
        <div class="meta">參考年化報酬：<strong>${e.refReturn > 0 ? "約 " + e.refReturn + "%" : e.refReturn + "%"}</strong></div>
      `;
      card.addEventListener("click", () => {
        selectEtf(e.code);
        document.getElementById("etf-detail").scrollIntoView({ behavior: "smooth" });
      });
      grid.appendChild(card);
    });
}

document.querySelectorAll("#filterTabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#filterTabs .tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    renderGrid(tab.dataset.filter);
  });
});

/* ===== ETF 詳細 ===== */
let currentEtf = null;

function initSelectors() {
  const sel = $("#etfSelect");
  const calcSel = $("#calcEtf");
  ETF_DATA.forEach((e) => {
    sel.add(new Option(`${e.code} ${e.name}（${e.typeLabel}）`, e.code));
    calcSel.add(new Option(`${e.code} ${e.name}（參考年化 ${e.refReturn}%）`, e.code));
  });
  sel.addEventListener("change", () => selectEtf(sel.value));
  calcSel.addEventListener("change", () => {
    const etf = ETF_DATA.find((x) => x.code === calcSel.value);
    if (etf) $("#annualReturn").value = etf.refReturn;
  });
}

function selectEtf(code) {
  const etf = ETF_DATA.find((e) => e.code === code);
  if (!etf) return;
  currentEtf = etf;
  $("#etfSelect").value = code;

  $("#detailCard").innerHTML = `
    <div class="detail-head">
      <span class="code">${etf.code}</span>
      <span class="name">${etf.name}</span>
      <span class="badge ${BADGE_CLASS[etf.type]}">${etf.typeLabel}</span>
    </div>
    <p class="detail-desc">${etf.desc}</p>
    <div class="fact-grid">
      <div class="fact"><div class="label">發行投信</div><div class="value">${etf.issuer}</div></div>
      <div class="fact"><div class="label">成立時間</div><div class="value">${etf.inception}</div></div>
      <div class="fact"><div class="label">費用</div><div class="value">${etf.fee}</div></div>
      <div class="fact"><div class="label">配息頻率</div><div class="value">${etf.dividend}</div></div>
      <div class="fact"><div class="label">風險等級</div><div class="value">${etf.risk}</div></div>
      <div class="fact"><div class="label">參考年化報酬</div><div class="value">${etf.refReturn}%</div></div>
    </div>
    <p class="panel-note" style="margin-top:10px">※ ${etf.refReturnNote}。費用與報酬均為參考值，請以官方公告為準。</p>
    ${etf.warning ? `<div class="detail-warning">⚠️ ${etf.warning}</div>` : ""}
    <div class="detail-actions">
      <button class="btn btn-primary" id="useInCalc">用此 ETF 報酬率試算複利 →</button>
      <a class="btn btn-ghost" href="https://tw.stock.yahoo.com/quote/${etf.code}.TW" target="_blank" rel="noopener">查看即時行情與官方資訊 ↗</a>
    </div>
  `;
  $("#useInCalc").addEventListener("click", () => {
    $("#calcEtf").value = etf.code;
    $("#annualReturn").value = etf.refReturn;
    document.getElementById("calculator").scrollIntoView({ behavior: "smooth" });
    runCalc();
  });

  renderHoldings(etf);
  refreshChartArea(etf);
}

/* ===== 成份股（全部列出＋搜尋） ===== */
function renderHoldings(etf, keyword = "") {
  $("#holdingsNote").textContent =
    etf.holdingsNote ||
    "已列出全部成份股，權重為示意參考值（非即時），實際成份與權重請以投信官網每日公告為準。";

  const list = etf.holdings.filter(
    (h) => !keyword || h[0].toLowerCase().includes(keyword.toLowerCase())
  );
  $("#holdingsCount").textContent =
    keyword
      ? `符合「${keyword}」：${list.length} 檔（共 ${etf.holdings.length} 檔）`
      : `共 ${etf.holdings.length} 檔`;

  const body = $("#holdingsBody");
  body.innerHTML = "";
  const maxW = Math.max(...etf.holdings.map((h) => h[1]));
  list.forEach((h) => {
    const idx = etf.holdings.indexOf(h);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${h[0]}</td>
      <td>${h[1].toFixed(1)}%</td>
      <td class="weight-bar-wrap"><div class="weight-bar" style="width:${(h[1] / maxW) * 100}%"></div></td>
    `;
    body.appendChild(tr);
  });
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#9fb0c9">找不到符合的成份股</td></tr>`;
  }
}

$("#holdingsSearch").addEventListener("input", (e) => {
  if (currentEtf) renderHoldings(currentEtf, e.target.value.trim());
});

/* =====================================================================
   技術線圖
   主來源：臺灣證券交易所公開 API（STOCK_DAY），自行繪製收盤價＋均線。
   備用：TradingView 嵌入圖（部分環境可能被擋）＋外開連結。
===================================================================== */
const TWSE_API = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY";
const monthCache = {};      // "code-YYYYMM" -> [{date, close}]
let priceChart = null;
let chartRange = 3;         // 月數：1 / 3 / 6 / 12
let chartSource = "twse";   // "twse" | "tv"
let loadToken = 0;          // 防止快速切換 ETF 時的競態

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rocToDate(s) {
  // "115/06/09" -> "2026/06/09"
  const [y, m, d] = s.split("/");
  return `${parseInt(y, 10) + 1911}/${m}/${d}`;
}

async function fetchMonth(code, ym) {
  const key = `${code}-${ym}`;
  if (monthCache[key]) return monthCache[key];
  const url = `${TWSE_API}?date=${ym}01&stockNo=${code}&response=json&_=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  let rows = [];
  if (j.stat === "OK" && Array.isArray(j.data)) {
    rows = j.data
      .map((r) => ({
        date: rocToDate(r[0]),
        close: parseFloat(String(r[6]).replace(/,/g, ""))
      }))
      .filter((r) => Number.isFinite(r.close) && r.close > 0);
  }
  monthCache[key] = rows;
  return rows;
}

function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function movingAvg(values, n) {
  return values.map((_, i) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += values[j];
    return s / n;
  });
}

async function renderTwseChart(etf) {
  const token = ++loadToken;
  const status = $("#chartStatus");
  const canvasWrap = $("#twseChartWrap");
  canvasWrap.style.display = "block";
  $("#tvContainer").style.display = "none";
  status.textContent = `載入 ${etf.code} 行情資料中…（資料來源：臺灣證券交易所）`;
  status.className = "chart-status";

  try {
    // 多抓 1 個月當作均線暖身資料
    const months = lastMonths(chartRange + 1);
    let rows = [];
    for (const ym of months) {
      if (token !== loadToken) return;
      const wasCached = !!monthCache[`${etf.code}-${ym}`];
      const part = await fetchMonth(etf.code, ym);
      rows = rows.concat(part);
      if (!wasCached) await sleep(220); // 避免觸發證交所流量限制
    }
    if (token !== loadToken) return;

    if (rows.length < 5) {
      status.textContent = "查無此檔近期交易資料（新上市 ETF 可能尚無足夠資料），請改用 TradingView 分頁或外部連結查看。";
      status.className = "chart-status chart-error";
      if (priceChart) { priceChart.destroy(); priceChart = null; }
      return;
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - chartRange);
    const closes = rows.map((r) => r.close);
    const ma5 = movingAvg(closes, 5);
    const ma20 = movingAvg(closes, 20);
    const ma60 = movingAvg(closes, 60);

    // 只顯示選定區間，但均線已用前面的資料暖身
    const visible = rows
      .map((r, i) => ({ ...r, ma5: ma5[i], ma20: ma20[i], ma60: ma60[i] }))
      .filter((r) => new Date(r.date) >= cutoff);

    const first = visible[0].close;
    const last = visible[visible.length - 1].close;
    const chg = ((last - first) / first) * 100;
    status.innerHTML = `${etf.code} ${etf.name}｜近 ${chartRange} 個月收盤：<strong>${last}</strong>（區間 ${fmtPct(chg)}）`;
    status.className = "chart-status " + (chg >= 0 ? "chart-up" : "chart-down");

    if (priceChart) priceChart.destroy();
    priceChart = new Chart($("#priceChart").getContext("2d"), {
      type: "line",
      data: {
        labels: visible.map((r) => r.date.slice(5)),
        datasets: [
          { label: "收盤價", data: visible.map((r) => r.close), borderColor: "#4f8cff",
            backgroundColor: "rgba(79,140,255,0.12)", fill: true, tension: 0.15,
            pointRadius: 0, borderWidth: 2 },
          { label: "MA5", data: visible.map((r) => r.ma5), borderColor: "#ffd166",
            fill: false, tension: 0.15, pointRadius: 0, borderWidth: 1.2 },
          { label: "MA20", data: visible.map((r) => r.ma20), borderColor: "#38d9a9",
            fill: false, tension: 0.15, pointRadius: 0, borderWidth: 1.2 },
          { label: "MA60", data: visible.map((r) => r.ma60), borderColor: "#ff8fab",
            fill: false, tension: 0.15, pointRadius: 0, borderWidth: 1.2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: "#e8edf6", boxWidth: 18 } },
          tooltip: {
            callbacks: { label: (c) => c.parsed.y == null ? null : `${c.dataset.label}：${c.parsed.y.toFixed(2)}` }
          }
        },
        scales: {
          x: { ticks: { color: "#9fb0c9", maxTicksLimit: 8, maxRotation: 0 }, grid: { color: "rgba(42,54,80,.4)" } },
          y: { ticks: { color: "#9fb0c9" }, grid: { color: "rgba(42,54,80,.4)" } }
        }
      }
    });
  } catch (err) {
    if (token !== loadToken) return;
    status.textContent = "無法載入證交所行情資料（可能是網路或流量限制），請稍後再試，或改用 TradingView 分頁／外部連結。";
    status.className = "chart-status chart-error";
  }
}

function renderTradingView(etf) {
  $("#twseChartWrap").style.display = "none";
  const c = $("#tvContainer");
  c.style.display = "block";
  c.innerHTML = `
    <div class="tradingview-widget-container" style="height:100%;width:100%">
      <div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>
    </div>`;
  const s = document.createElement("script");
  s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  s.async = true;
  s.text = JSON.stringify({
    autosize: true,
    symbol: etf.tvSymbol,
    interval: "D",
    timezone: "Asia/Taipei",
    theme: "dark",
    style: "1",
    locale: "zh_TW",
    allow_symbol_change: false,
    hide_top_toolbar: false,
    support_host: "https://www.tradingview.com"
  });
  c.querySelector(".tradingview-widget-container").appendChild(s);
  $("#chartStatus").innerHTML =
    `TradingView 嵌入圖（部分瀏覽器或廣告攔截器可能擋住）。看不到圖？` +
    `<a href="https://tw.tradingview.com/chart/?symbol=${encodeURIComponent(etf.tvSymbol)}" target="_blank" rel="noopener">點此在 TradingView 開新視窗 ↗</a>` +
    `，或切回「走勢圖」分頁。`;
  $("#chartStatus").className = "chart-status";
}

function refreshChartArea(etf) {
  if (chartSource === "twse") renderTwseChart(etf);
  else renderTradingView(etf);
}

document.querySelectorAll("#chartTabs .ctab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#chartTabs .ctab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    chartSource = tab.dataset.src;
    $("#rangeBtns").style.display = chartSource === "twse" ? "flex" : "none";
    if (currentEtf) refreshChartArea(currentEtf);
  });
});

document.querySelectorAll("#rangeBtns .rbtn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#rangeBtns .rbtn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    chartRange = parseInt(btn.dataset.m, 10);
    if (currentEtf && chartSource === "twse") renderTwseChart(currentEtf);
  });
});

/* ===== 複利計算機 ===== */
let growthChart = null;

function runCalc() {
  const P0 = Math.max(0, parseFloat($("#initialAmount").value) || 0);
  const PMT = Math.max(0, parseFloat($("#monthlyAmount").value) || 0);
  const annual = parseFloat($("#annualReturn").value) || 0;
  const years = Math.min(60, Math.max(1, parseInt($("#years").value) || 1));
  const inflation = parseFloat($("#inflation").value) || 0;

  const rm = Math.pow(1 + annual / 100, 1 / 12) - 1; // 月複利率

  const labels = ["第0年"];
  const investedSeries = [P0];
  const valueSeries = [P0];
  const rows = [];

  let value = P0;
  let invested = P0;

  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      value = value * (1 + rm) + PMT; // 月底投入
      invested += PMT;
    }
    labels.push(`第${y}年`);
    investedSeries.push(invested);
    valueSeries.push(value);
    rows.push({
      year: y,
      invested,
      value,
      profit: value - invested,
      roi: invested > 0 ? ((value - invested) / invested) * 100 : 0
    });
  }

  const finalValue = value;
  const totalInvested = invested;
  const profit = finalValue - totalInvested;
  const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
  const realValue = finalValue / Math.pow(1 + inflation / 100, years);

  $("#resultCards").innerHTML = `
    <div class="result-card"><div class="label">總投入本金</div><div class="value">${fmtMoney(totalInvested)}</div></div>
    <div class="result-card"><div class="label">${years} 年後資產</div><div class="value ${finalValue >= totalInvested ? "pos" : "neg"}">${fmtMoney(finalValue)}</div></div>
    <div class="result-card"><div class="label">累計獲利</div><div class="value ${profit >= 0 ? "pos" : "neg"}">${fmtMoney(profit)}</div></div>
    <div class="result-card"><div class="label">累計報酬率</div><div class="value ${roi >= 0 ? "pos" : "neg"}">${fmtPct(roi)}</div></div>
    <div class="result-card"><div class="label">通膨調整後實質購買力</div><div class="value">${fmtMoney(realValue)}</div></div>
  `;

  $("#yearTableBody").innerHTML = rows
    .map(
      (r) => `<tr>
        <td>第 ${r.year} 年</td>
        <td>${fmtMoney(r.invested)}</td>
        <td>${fmtMoney(r.value)}</td>
        <td style="color:${r.profit >= 0 ? "#38d9a9" : "#ff6b6b"}">${fmtMoney(r.profit)}</td>
        <td>${fmtPct(r.roi)}</td>
      </tr>`
    )
    .join("");

  if (typeof Chart === "undefined") return;
  const ctx = $("#growthChart").getContext("2d");
  if (growthChart) growthChart.destroy();
  growthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "資產價值",
          data: valueSeries,
          borderColor: "#4f8cff",
          backgroundColor: "rgba(79,140,255,0.15)",
          fill: true,
          tension: 0.25,
          pointRadius: 0
        },
        {
          label: "累計投入本金",
          data: investedSeries,
          borderColor: "#9fb0c9",
          borderDash: [6, 4],
          fill: false,
          tension: 0,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#e8edf6" } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}：${fmtMoney(c.parsed.y)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: "#9fb0c9", maxTicksLimit: 13 }, grid: { color: "rgba(42,54,80,.5)" } },
        y: {
          ticks: {
            color: "#9fb0c9",
            callback: (v) => (v >= 10000 ? (v / 10000).toLocaleString("zh-TW") + " 萬" : v)
          },
          grid: { color: "rgba(42,54,80,.5)" }
        }
      }
    }
  });
}

$("#calcBtn").addEventListener("click", runCalc);

/* ===== 初始化 ===== */
renderGrid("all");
initSelectors();
selectEtf("0050");
runCalc();
