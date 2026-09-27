(function () {
  "use strict";

  // ==========================================================================
  // 데이터 정의
  // ==========================================================================

  var METHODS = [
    { id: "friction", name: "마찰 기록법", cycle: "상시 인박스" },
    { id: "jtbd", name: "JTBD (Jobs-to-be-Done)", cycle: "매일 직접선택" },
    { id: "doppelganger", name: "도플갱어", cycle: "매일 직접선택" },
    { id: "trend", name: "트렌드 분석", cycle: "주간" },
    { id: "scamper", name: "SCAMPER", cycle: "매일 직접선택" },
    { id: "simplify", name: "단순화 접근", cycle: "매일 직접선택" },
    { id: "popularize", name: "대중화 접근", cycle: "매일 직접선택" }
  ];

  var CATEGORIES = [
    { id: "professional", name: "1. 전문 서비스", desc: "시간당·건당·프로젝트당 용역" },
    { id: "content", name: "2. 콘텐츠 서비스", desc: "채널 확보 포함" },
    { id: "product", name: "3. 상품판매", desc: "재고 무관, 상품 거래 당사자" },
    { id: "digital", name: "4. 디지털 서비스", desc: "소프트웨어자동화 포함" },
    { id: "labor", name: "6. 단순노무제공", desc: "비교 기준점" }
  ];

  var STORAGE_KEY = "method_book_entries_v1";
  var THEME_KEY = "method_book_theme";

  // ==========================================================================
  // 상태
  // ==========================================================================

  var state = {
    entries: [],       // {id, methodId, fact, maeda, categoryIds:[], memo, done, createdAt}
    selectedId: null,
    searchQuery: "",
    activeTagFilter: null,
    mode: "empty"       // 'empty' | 'quad' | 'card'
  };

  var draft = { methodId: null, categoryIds: [] };

  // ==========================================================================
  // 저장소
  // ==========================================================================

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("불러오기 실패:", e);
      return [];
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
    } catch (e) {
      console.warn("저장 실패(용량 초과 등):", e);
      alert("저장에 실패했습니다. 브라우저 저장공간이 가득 찼을 수 있습니다. 백업 후 오래된 기록을 정리해주세요.");
    }
  }

  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) || "system"; }
    catch (e) { return "system"; }
  }
  function saveTheme(v) {
    try { localStorage.setItem(THEME_KEY, v); } catch (e) {}
  }

  // ==========================================================================
  // 유틸
  // ==========================================================================

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    var days = ["일", "월", "화", "수", "목", "금", "토"];
    return (d.getMonth() + 1) + "." + d.getDate() + " (" + days[d.getDay()] + ")";
  }

  function methodName(id) {
    var m = METHODS.filter(function (x) { return x.id === id; })[0];
    return m ? m.name : id;
  }

  function categoryName(id) {
    var c = CATEGORIES.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : id;
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function titleFromEntry(e) {
    var base = e.fact || e.maeda || methodName(e.methodId);
    base = base.trim().split("\n")[0];
    if (base.length > 28) base = base.slice(0, 28) + "…";
    return base || "(제목 없음)";
  }

  // ==========================================================================
  // DOM 참조
  // ==========================================================================

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var elContent = $("#content");
  var elEntryList = $("#entryList");
  var elTagFilters = $("#tagFilters");
  var elSearchInput = $("#searchInput");
  var elTopbarTitle = $("#topbarTitle");
  var elSidebar = $("#sidebar");

  // ==========================================================================
  // 렌더: 사이드바 태그 필터
  // ==========================================================================

  function renderTagFilters() {
    var html = CATEGORIES.map(function (c) {
      var active = state.activeTagFilter === c.id ? " active" : "";
      return '<button class="tag-chip' + active + '" data-cat="' + c.id + '">' + escapeHtml(c.name.replace(/^\d+\.\s*/, "")) + "</button>";
    }).join("");
    elTagFilters.innerHTML = html;
    $$("[data-cat]", elTagFilters).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cat = btn.getAttribute("data-cat");
        state.activeTagFilter = state.activeTagFilter === cat ? null : cat;
        renderTagFilters();
        renderEntryList();
      });
    });
  }

  // ==========================================================================
  // 렌더: 사이드바 목록
  // ==========================================================================

  function filteredEntries() {
    var q = state.searchQuery.trim().toLowerCase();
    return state.entries
      .filter(function (e) {
        if (state.activeTagFilter && e.categoryIds.indexOf(state.activeTagFilter) === -1) return false;
        if (!q) return true;
        var hay = [e.fact, e.maeda, e.memo, methodName(e.methodId)].join(" ").toLowerCase();
        return hay.indexOf(q) !== -1;
      })
      .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt) || (b.id > a.id ? 1 : -1); });
  }

  function statusIconSvg(done) {
    if (done) {
      return '<svg viewBox="0 0 24 24" class="entry-status-icon"><circle cx="12" cy="12" r="10" fill="var(--wax)"/><path d="M7 12.5l3 3 7-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" class="entry-status-icon"><path d="M6 3h12v17l-6-4-6 4V3z" fill="var(--bookmark)" stroke="var(--bookmark-dark)" stroke-width="1.2"/></svg>';
  }

  function renderEntryList() {
    var list = filteredEntries();
    if (list.length === 0) {
      elEntryList.innerHTML = '<div class="entry-list-empty">' +
        (state.entries.length === 0 ? "아직 기록이 없습니다." : "검색/필터 결과가 없습니다.") +
        "</div>";
      return;
    }
    elEntryList.innerHTML = list.map(function (e) {
      var sel = e.id === state.selectedId ? " selected" : "";
      var catTag = e.categoryIds.length
        ? '<span class="entry-item-tag">' + escapeHtml(categoryName(e.categoryIds[0]).replace(/^\d+\.\s*/, "")) + (e.categoryIds.length > 1 ? " 외" : "") + "</span>"
        : "";
      return '<div class="entry-item' + sel + '" data-id="' + e.id + '">' +
        statusIconSvg(e.done) +
        '<div class="entry-item-body">' +
        '<div class="entry-item-title">' + escapeHtml(titleFromEntry(e)) + "</div>" +
        '<div class="entry-item-meta"><span>' + fmtDate(e.createdAt) + "</span>" + catTag + "</div>" +
        "</div></div>";
    }).join("");

    $$(".entry-item", elEntryList).forEach(function (el) {
      el.addEventListener("click", function () {
        openCard(el.getAttribute("data-id"));
      });
    });
  }

  // ==========================================================================
  // 렌더: 빈 상태
  // ==========================================================================

  function renderEmpty() {
    state.mode = "empty";
    state.selectedId = null;
    elTopbarTitle.textContent = "오늘 뭘 체크해볼까";
    var tpl = $("#tpl-empty").content.cloneNode(true);
    elContent.innerHTML = "";
    elContent.appendChild(tpl);
    renderEntryList();
  }

  // ==========================================================================
  // 렌더: 4구역 입력 모드
  // ==========================================================================

  function renderQuad() {
    state.mode = "quad";
    state.selectedId = null;
    draft = { methodId: null, categoryIds: [] };
    elTopbarTitle.textContent = "오늘 뭘 체크해볼까";

    var tpl = $("#tpl-quad").content.cloneNode(true);
    elContent.innerHTML = "";
    elContent.appendChild(tpl);

    var methodGrid = $("#methodGrid");
    methodGrid.innerHTML = METHODS.map(function (m) {
      return '<button class="method-pill" data-method="' + m.id + '">' +
        '<span class="m-name">' + escapeHtml(m.name) + '</span>' +
        '<span class="m-cycle">' + escapeHtml(m.cycle) + '</span></button>';
    }).join("");
    $$("[data-method]", methodGrid).forEach(function (btn) {
      btn.addEventListener("click", function () {
        draft.methodId = btn.getAttribute("data-method");
        $$("[data-method]", methodGrid).forEach(function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
      });
    });

    var categoryGrid = $("#categoryGrid");
    categoryGrid.innerHTML = CATEGORIES.map(function (c) {
      return '<button class="category-pill" data-cat="' + c.id + '">' +
        escapeHtml(c.name) + '<span class="c-desc">' + escapeHtml(c.desc) + '</span></button>';
    }).join("");
    $$("[data-cat]", categoryGrid).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-cat");
        var idx = draft.categoryIds.indexOf(id);
        if (idx === -1) { draft.categoryIds.push(id); btn.classList.add("selected"); }
        else { draft.categoryIds.splice(idx, 1); btn.classList.remove("selected"); }
      });
    });

    $("#cancelQuadBtn").addEventListener("click", function () {
      state.entries.length ? openCard(state.entries[0].id) : renderEmpty();
    });

    $("#submitQuadBtn").addEventListener("click", function () {
      var fact = $("#inputFact").value.trim();
      var maeda = $("#inputMaeda").value.trim();
      if (!draft.methodId) { alert("방법론을 선택해주세요."); return; }
      if (!fact && !maeda) { alert("사실 또는 마에다화 중 최소 하나는 적어주세요."); return; }

      var entry = {
        id: uid(),
        methodId: draft.methodId,
        fact: fact,
        maeda: maeda,
        categoryIds: draft.categoryIds.slice(),
        memo: "",
        done: false,
        createdAt: todayISO()
      };
      state.entries.push(entry);
      saveEntries();
      renderEntryList();
      openCard(entry.id);
    });

    setupQuadResize();
  }

  function setupQuadResize() {
    // 세로 핸들 (좌우 컬럼 폭 조절)
    $$("[data-resize^='col']").forEach(function (handle) {
      var row = handle.parentElement;
      handle.addEventListener("pointerdown", function (e) {
        handle.classList.add("dragging");
        var cols = $$(".quad-col", row);
        if (cols.length < 2) return;
        var startX = e.clientX;
        var startW = cols[0].getBoundingClientRect().width;
        var totalW = row.getBoundingClientRect().width;

        function onMove(ev) {
          var delta = ev.clientX - startX;
          var newW = Math.max(140, Math.min(totalW - 140, startW + delta));
          cols[0].style.flex = "0 0 " + newW + "px";
          cols[1].style.flex = "1 1 auto";
        }
        function onUp() {
          handle.classList.remove("dragging");
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    });

    // 가로 핸들 (위아래 로우 높이 조절)
    var hHandle = $("[data-resize='row1']");
    if (hHandle) {
      hHandle.addEventListener("pointerdown", function (e) {
        hHandle.classList.add("dragging");
        var wrap = $(".quad-wrap");
        var topRow = $("#quadRowTop");
        var startY = e.clientY;
        var startH = topRow.getBoundingClientRect().height;
        var wrapH = wrap.getBoundingClientRect().height;

        function onMove(ev) {
          var delta = ev.clientY - startY;
          var newH = Math.max(140, Math.min(wrapH - 200, startH + delta));
          topRow.style.flex = "0 0 " + newH + "px";
        }
        function onUp() {
          hHandle.classList.remove("dragging");
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
    }
  }

  // ==========================================================================
  // 렌더: 완성 카드
  // ==========================================================================

  function openCard(id) {
    var entry = state.entries.filter(function (e) { return e.id === id; })[0];
    if (!entry) { renderEmpty(); return; }
    state.mode = "card";
    state.selectedId = id;
    elTopbarTitle.textContent = titleFromEntry(entry);

    var tpl = $("#tpl-page-card").content.cloneNode(true);
    elContent.innerHTML = "";
    elContent.appendChild(tpl);

    $("#cardMethodName").textContent = methodName(entry.methodId) + " · " + fmtDate(entry.createdAt);
    $("#cardTitle").textContent = titleFromEntry(entry);
    $("#cardDate").textContent = entry.createdAt;

    var factEl = $("#cardFact");
    factEl.textContent = entry.fact || "(기록 없음)";
    factEl.classList.toggle("empty", !entry.fact);

    var maedaEl = $("#cardMaeda");
    maedaEl.textContent = entry.maeda || "(기록 없음)";
    maedaEl.classList.toggle("empty", !entry.maeda);

    var catWrap = $("#cardCategories");
    catWrap.innerHTML = entry.categoryIds.length
      ? entry.categoryIds.map(function (id) {
          return '<span class="tag-chip active">' + escapeHtml(categoryName(id)) + "</span>";
        }).join("")
      : '<span class="field-block-value empty">선택 안 함</span>';

    var memoEl = $("#cardMemo");
    memoEl.value = entry.memo || "";
    memoEl.addEventListener("input", debounce(function () {
      entry.memo = memoEl.value;
      saveEntries();
    }, 400));

    var doneToggle = $("#cardDoneToggle");
    doneToggle.checked = !!entry.done;
    doneToggle.addEventListener("change", function () {
      entry.done = doneToggle.checked;
      saveEntries();
      renderEntryList();
      renderBookmarkOrSeal(entry);
    });

    $("#deleteEntryBtn").addEventListener("click", function () {
      if (!confirm("이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
      state.entries = state.entries.filter(function (e) { return e.id !== id; });
      saveEntries();
      renderEntryList();
      state.entries.length ? openCard(state.entries[0].id) : renderEmpty();
    });

    renderBookmarkOrSeal(entry);
    renderEntryList();
  }

  function renderBookmarkOrSeal(entry) {
    var bookmarkSlot = $(".bookmark-slot");
    var sealSlot = $(".seal-slot");
    if (!bookmarkSlot || !sealSlot) return;
    if (entry.done) {
      bookmarkSlot.innerHTML = "";
      sealSlot.innerHTML = '<div class="wax-seal"><svg><use href="#svg-seal"/></svg></div>';
    } else {
      sealSlot.innerHTML = "";
      bookmarkSlot.innerHTML = '<div class="bookmark"><svg><use href="#svg-bookmark"/></svg></div>';
    }
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  // ==========================================================================
  // 사이드바 리사이즈
  // ==========================================================================

  function setupSidebarResize() {
    var handle = $("#sidebarResize");
    handle.addEventListener("pointerdown", function (e) {
      handle.classList.add("dragging");
      var startX = e.clientX;
      var startW = elSidebar.getBoundingClientRect().width;

      function onMove(ev) {
        var delta = ev.clientX - startX;
        var newW = Math.max(200, Math.min(480, startW + delta));
        elSidebar.style.width = newW + "px";
      }
      function onUp() {
        handle.classList.remove("dragging");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  // ==========================================================================
  // 백업 / 복원
  // ==========================================================================

  function exportData() {
    var blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries: state.entries }, null, 2)],
      { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "method-book-backup-" + todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var incoming = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : null);
        if (!incoming) throw new Error("형식이 올바르지 않습니다.");
        if (!confirm("불러온 " + incoming.length + "개 기록을 기존 기록에 합칠까요?\n(같은 ID는 덮어씁니다)")) return;
        var byId = {};
        state.entries.forEach(function (e) { byId[e.id] = e; });
        incoming.forEach(function (e) { if (e && e.id) byId[e.id] = e; });
        state.entries = Object.keys(byId).map(function (k) { return byId[k]; });
        saveEntries();
        renderEntryList();
        alert("복원 완료.");
      } catch (e) {
        alert("파일을 읽을 수 없습니다: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  // ==========================================================================
  // 테마
  // ==========================================================================

  function applyTheme(mode) {
    var root = document.documentElement;
    if (mode === "dark") root.setAttribute("data-theme", "dark");
    else if (mode === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
  }

  function setupTheme() {
    var mode = loadTheme();
    applyTheme(mode);
    $("#themeToggle").addEventListener("click", function () {
      var current = loadTheme();
      var isDark = current === "dark" || (current === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      var next = isDark ? "light" : "dark";
      saveTheme(next);
      applyTheme(next);
    });
  }

  // ==========================================================================
  // 초기화
  // ==========================================================================

  function init() {
    state.entries = loadEntries();
    setupTheme();
    setupSidebarResize();
    renderTagFilters();
    renderEntryList();

    elSearchInput.addEventListener("input", debounce(function () {
      state.searchQuery = elSearchInput.value;
      renderEntryList();
    }, 150));

    $("#newEntryBtn").addEventListener("click", renderQuad);
    $("#sidebarToggle").addEventListener("click", function () {
      elSidebar.classList.toggle("collapsed");
    });

    $("#exportBtn").addEventListener("click", exportData);
    $("#importBtn").addEventListener("click", function () { $("#importFile").click(); });
    $("#importFile").addEventListener("change", function (e) {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    if (state.entries.length > 0) {
      openCard(state.entries.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); })[0].id);
    } else {
      renderEmpty();
    }

    // PWA 서비스워커 등록 (있으면)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
