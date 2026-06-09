/* ===== 工具 ===== */
const $ = (sel) => document.querySelector(sel);
const fmtMoney = (n) =>
  "NT$ " + Math.round(n).toLocaleString("zh-TW");
const fmtPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";

const BADGE_CLASS = {
  market: "badge-market",
  dividend: "badge-dividend",
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
let tvWidget = null;

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
    </div>
  `;
  $("#useInCalc").addEventListener("click", () => {
    $("#calcEtf").value = etf.code;
    $("#annualReturn").value = etf.refReturn;
    document.getElementById("calculator").scrollIntoView({ behavior: "smooth" });
    runCalc();
  });

  renderHoldings(etf);
  renderTvChart(etf);
}

function renderHoldings(etf) {
  $("#holdingsNote").textContent =
    (etf.holdingsNote || "權重為示意參考值（非即時），實際成份股請以投信官網每日公告為準。");
  const body = $("#holdingsBody");
  body.innerHTML = "";
  const maxW = Math.max(...etf.holdings.map((h) => h[1]));
  etf.holdings.forEach((h, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${h[0]}</td>
      <td>${h[1].toFixed(1)}%</td>
      <td class="weight-bar-wrap"><div class="weight-bar" style="width:${(h[1] / maxW) * 100}%"></div></td>
    `;
    body.appendChild(tr);
  });
}

function renderTvChart(etf) {
  const container = $("#tvChart");
  container.innerHTML = "";
  if (typeof TradingView === "undefined") {
    container.innerHTML =
      '<div class="tv-loading">無法載入 TradingView 線圖。<br><small>請確認網路連線或稍後再試。</small></div>';
    return;
  }
  tvWidget = new TradingView.widget({
    container_id: "tvChart",
    symbol: etf.tvSymbol,
    interval: "D",
    autosize: true,
    timezone: "Asia/Taipei",
    theme: "dark",
    style: "1",
    locale: "zh_TW",
    hide_side_toolbar: false,
    allow_symbol_change: false,
    studies: ["MASimple@tv-basicstudies"]
  });
}

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

  // 結果卡片
  $("#resultCards").innerHTML = `
    <div class="result-card"><div class="label">總投入本金</div><div class="value">${fmtMoney(totalInvested)}</div></div>
    <div class="result-card"><div class="label">${years} 年後資產</div><div class="value ${finalValue >= totalInvested ? "pos" : "neg"}">${fmtMoney(finalValue)}</div></div>
    <div class="result-card"><div class="label">累計獲利</div><div class="value ${profit >= 0 ? "pos" : "neg"}">${fmtMoney(profit)}</div></div>
    <div class="result-card"><div class="label">累計報酬率</div><div class="value ${roi >= 0 ? "pos" : "neg"}">${fmtPct(roi)}</div></div>
    <div class="result-card"><div class="label">通膨調整後實質購買力</div><div class="value">${fmtMoney(realValue)}</div></div>
  `;

  // 逐年表格
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

  // 圖表
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
