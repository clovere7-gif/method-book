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
    { id: "labor", name: "5. 단순노무제공", desc: "비교 기준점" }
  ];

  var STORAGE_KEY = "method_book_entries_v1";
  var THEME_KEY = "method_book_theme";

  // ==========================================================================
  // 상태
  // ==========================================================================

  var state = {
    entries: [],       // {id, seq, methodId, fact, maeda, categoryIds:[], memo, done, createdAt}
    selectedId: null,
    searchQuery: "",
    filters: {
      methodIds: [],     // 선택된 방법론 id 목록 (빈 배열 = 전체)
      categoryIds: [],   // 선택된 카테고리 id 목록 (빈 배열 = 전체)
      dateFrom: "",
      dateTo: "",
      done: [],         // ["done","undone"] 중 선택된 값들 (빈 배열 = 전체)
      seqs: []          // 선택된 기록번호(seq) 목록 (빈 배열 = 전체)
    },
    sort: { key: "createdAt", dir: "desc" }, // key: 'createdAt' | 'seq', dir: 'asc'|'desc'
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
      var list = Array.isArray(parsed) ? parsed : [];
      return migrateSeq(list);
    } catch (e) {
      console.warn("불러오기 실패:", e);
      return [];
    }
  }

  function migrateSeq(list) {
    // 과거 데이터(seq 없음)에 생성일시 순서로 번호를 부여
    var needsSeq = list.some(function (e) { return !e.seq; });
    if (!needsSeq) return list;
    var sorted = list.slice().sort(function (a, b) {
      return (a.createdAt || "").localeCompare(b.createdAt || "") || String(a.id).localeCompare(String(b.id));
    });
    var next = 1;
    sorted.forEach(function (e) { if (!e.seq) e.seq = next; next++; });
    return list;
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
    return isoFromDate(new Date());
  }

  function isoFromDate(d) {
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
  var elSidebar = $("#sidebar");

  // ==========================================================================
  // 렌더: 사이드바 엑셀 스타일 드롭다운 필터
  // ==========================================================================

  function closeAllFilterDropdowns(exceptEl) {
    $$(".filter-dropdown-panel.open", elTagFilters).forEach(function (p) {
      if (p !== exceptEl) p.classList.remove("open");
    });
  }

  function filterButtonLabel(name, count, total) {
    if (count === 0 || count === total) return name;
    return name + " (" + count + ")";
  }

  function renderTagFilters() {
    var methodTotal = METHODS.length;
    var catTotal = CATEGORIES.length;
    var doneTotal = 2;
    var seqTotal = state.entries.length;

    elTagFilters.innerHTML =
      renderFilterDropdown("done", "완료여부", filterButtonLabel("완료여부", state.filters.done.length, doneTotal), state.filters.done.length > 0) +
      renderFilterDropdown("seq", "기록번호", filterButtonLabel("기록번호", state.filters.seqs.length, seqTotal), state.filters.seqs.length > 0) +
      renderFilterDropdown("method", "방법론", filterButtonLabel("방법론", state.filters.methodIds.length, methodTotal), state.filters.methodIds.length > 0) +
      renderFilterDropdown("category", "카테고리", filterButtonLabel("카테고리", state.filters.categoryIds.length, catTotal), state.filters.categoryIds.length > 0) +
      renderFilterDropdown("date", "날짜", "날짜", !!(state.filters.dateFrom || state.filters.dateTo));

    setupFilterDropdown("done");
    setupFilterDropdown("seq");
    setupFilterDropdown("method");
    setupFilterDropdown("category");
    setupFilterDropdown("date");
  }

  function renderFilterDropdown(key, label, buttonLabel, active) {
    return '<div class="filter-dropdown" data-filter-key="' + key + '">' +
      '<button class="filter-dropdown-btn' + (active ? " active" : "") + '" data-filter-btn="' + key + '">' +
      escapeHtml(buttonLabel) + ' <span class="filter-caret">▾</span></button>' +
      '<div class="filter-dropdown-panel" data-filter-panel="' + key + '"></div>' +
      "</div>";
  }

  function filterPanelBody(key) {
    if (key === "method") {
      return METHODS.map(function (m) {
        var checked = state.filters.methodIds.indexOf(m.id) !== -1;
        return '<label class="filter-check-row"><input type="checkbox" data-fval="' + m.id + '"' + (checked ? " checked" : "") + '><span>' + escapeHtml(m.name) + "</span></label>";
      }).join("") + filterPanelFooter("method");
    }
    if (key === "category") {
      return CATEGORIES.map(function (c) {
        var checked = state.filters.categoryIds.indexOf(c.id) !== -1;
        return '<label class="filter-check-row"><input type="checkbox" data-fval="' + c.id + '"' + (checked ? " checked" : "") + '><span>' + escapeHtml(c.name) + "</span></label>";
      }).join("") + filterPanelFooter("category");
    }
    if (key === "done") {
      var opts = [{ id: "done", name: "완료" }, { id: "undone", name: "미완료" }];
      return opts.map(function (o) {
        var checked = state.filters.done.indexOf(o.id) !== -1;
        return '<label class="filter-check-row"><input type="checkbox" data-fval="' + o.id + '"' + (checked ? " checked" : "") + '><span>' + escapeHtml(o.name) + "</span></label>";
      }).join("") + filterPanelFooter("done");
    }
    if (key === "date") {
      return '<div class="filter-date-body">' +
        '<label class="filter-date-label">시작일<input type="date" id="filterDateFrom" value="' + escapeHtml(state.filters.dateFrom) + '"></label>' +
        '<label class="filter-date-label">종료일<input type="date" id="filterDateTo" value="' + escapeHtml(state.filters.dateTo) + '"></label>' +
        '<div class="filter-date-actions">' +
        '<button type="button" class="filter-mini-btn" data-date-preset="today">오늘</button>' +
        '<button type="button" class="filter-mini-btn" data-date-preset="week">이번주</button>' +
        '<button type="button" class="filter-mini-btn" data-date-preset="month">이번달</button>' +
        '<button type="button" class="filter-mini-btn" data-date-preset="clear">전체</button>' +
        "</div></div>";
    }
    if (key === "seq") {
      var isAsc = state.sort.key === "seq" && state.sort.dir === "asc";
      var isDesc = state.sort.key === "seq" && state.sort.dir === "desc";
      var sortRow = '<div class="filter-sort-body">' +
        '<button type="button" class="filter-mini-btn' + (isAsc ? " active" : "") + '" data-sort-dir="asc">오름차순 (오래된순)</button>' +
        '<button type="button" class="filter-mini-btn' + (isDesc ? " active" : "") + '" data-sort-dir="desc">내림차순 (최근순)</button>' +
        "</div>";
      var seqList = state.entries.slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
      var checkRows = seqList.map(function (e) {
        var checked = state.filters.seqs.indexOf(e.seq) !== -1;
        return '<label class="filter-check-row"><input type="checkbox" data-fseq="' + e.seq + '"' + (checked ? " checked" : "") + '><span>#' + e.seq + "</span></label>";
      }).join("");
      return sortRow + '<div class="filter-seq-checklist">' + checkRows + "</div>" + filterPanelFooter("seq");
    }
    return "";
  }

  function filterPanelFooter(key) {
    return '<div class="filter-panel-footer"><button type="button" class="filter-mini-btn" data-fclear="' + key + '">전체선택 해제</button></div>';
  }

  function setupFilterDropdown(key) {
    var btn = $('[data-filter-btn="' + key + '"]', elTagFilters);
    var panel = $('[data-filter-panel="' + key + '"]', elTagFilters);
    if (!btn || !panel) return;

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = panel.classList.contains("open");
      closeAllFilterDropdowns();
      if (!isOpen) {
        panel.innerHTML = filterPanelBody(key);
        panel.classList.add("open");
        bindFilterPanelEvents(key, panel);
      }
    });
  }

  function filterListKey(key) {
    if (key === "method") return "methodIds";
    if (key === "category") return "categoryIds";
    if (key === "seq") return "seqs";
    return "done";
  }

  function bindFilterPanelEvents(key, panel) {
    $$("[data-fval]", panel).forEach(function (cb) {
      cb.addEventListener("change", function () {
        var val = cb.getAttribute("data-fval");
        var list = state.filters[filterListKey(key)];
        var idx = list.indexOf(val);
        if (cb.checked && idx === -1) list.push(val);
        else if (!cb.checked && idx !== -1) list.splice(idx, 1);
        renderTagFilters();
        renderEntryList();
      });
    });

    $$("[data-fseq]", panel).forEach(function (cb) {
      cb.addEventListener("change", function () {
        var val = parseInt(cb.getAttribute("data-fseq"), 10);
        var list = state.filters.seqs;
        var idx = list.indexOf(val);
        if (cb.checked && idx === -1) list.push(val);
        else if (!cb.checked && idx !== -1) list.splice(idx, 1);
        renderTagFilters();
        renderEntryList();
      });
    });

    var clearBtn = $("[data-fclear]", panel);
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        state.filters[filterListKey(key)] = [];
        renderTagFilters();
        renderEntryList();
      });
    }

    if (key === "date") {
      var fromEl = $("#filterDateFrom", panel);
      var toEl = $("#filterDateTo", panel);
      if (fromEl) fromEl.addEventListener("change", function () {
        state.filters.dateFrom = fromEl.value;
        renderTagFilters();
        renderEntryList();
      });
      if (toEl) toEl.addEventListener("change", function () {
        state.filters.dateTo = toEl.value;
        renderTagFilters();
        renderEntryList();
      });
      $$("[data-date-preset]", panel).forEach(function (b) {
        b.addEventListener("click", function () {
          var preset = b.getAttribute("data-date-preset");
          var today = new Date();
          if (preset === "today") {
            var iso = todayISO();
            state.filters.dateFrom = iso;
            state.filters.dateTo = iso;
          } else if (preset === "week") {
            var day = today.getDay();
            var monday = new Date(today);
            monday.setDate(today.getDate() - ((day + 6) % 7));
            state.filters.dateFrom = isoFromDate(monday);
            state.filters.dateTo = todayISO();
          } else if (preset === "month") {
            var first = new Date(today.getFullYear(), today.getMonth(), 1);
            state.filters.dateFrom = isoFromDate(first);
            state.filters.dateTo = todayISO();
          } else {
            state.filters.dateFrom = "";
            state.filters.dateTo = "";
          }
          renderTagFilters();
          renderEntryList();
        });
      });
    }

    if (key === "seq") {
      $$("[data-sort-dir]", panel).forEach(function (b) {
        b.addEventListener("click", function () {
          state.sort.key = "seq";
          state.sort.dir = b.getAttribute("data-sort-dir");
          renderTagFilters();
          renderEntryList();
        });
      });
    }
  }

  document.addEventListener("click", function () { closeAllFilterDropdowns(); });

  // ==========================================================================
  // 렌더: 사이드바 목록
  // ==========================================================================

  function filteredEntries() {
    var q = state.searchQuery.trim().toLowerCase();
    var f = state.filters;
    var list = state.entries.filter(function (e) {
      if (f.methodIds.length && f.methodIds.indexOf(e.methodId) === -1) return false;
      if (f.categoryIds.length && !e.categoryIds.some(function (c) { return f.categoryIds.indexOf(c) !== -1; })) return false;
      if (f.seqs.length && f.seqs.indexOf(e.seq) === -1) return false;
      if (f.dateFrom && e.createdAt < f.dateFrom) return false;
      if (f.dateTo && e.createdAt > f.dateTo) return false;
      if (f.done.length) {
        var wantDone = f.done.indexOf("done") !== -1;
        var wantUndone = f.done.indexOf("undone") !== -1;
        if (!((wantDone && e.done) || (wantUndone && !e.done))) return false;
      }
      if (!q) return true;
      var hay = [e.fact, e.maeda, e.memo, methodName(e.methodId)].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    list.sort(function (a, b) {
      var av, bv;
      if (state.sort.key === "seq") { av = a.seq; bv = b.seq; }
      else { av = a.createdAt + "_" + a.seq; bv = b.createdAt + "_" + b.seq; }
      if (av < bv) return state.sort.dir === "asc" ? -1 : 1;
      if (av > bv) return state.sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
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
        ? '<span class="entry-item-tag">' + escapeHtml(categoryName(e.categoryIds[0])) + (e.categoryIds.length > 1 ? " 외" : "") + "</span>"
        : "";
      return '<div class="entry-item' + sel + '" data-id="' + e.id + '">' +
        statusIconSvg(e.done) +
        '<div class="entry-item-body">' +
        '<div class="entry-item-title"><span class="entry-item-seq">#' + e.seq + "</span> " + escapeHtml(titleFromEntry(e)) + "</div>" +
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

    var tpl = $("#tpl-quad").content.cloneNode(true);
    elContent.innerHTML = "";
    elContent.appendChild(tpl);

    var methodGrid = $("#methodGrid");
    methodGrid.innerHTML = METHODS.map(function (m) {
      return '<button class="method-pill" data-method="' + m.id + '">' +
        '<span class="m-name">' + escapeHtml(m.name) + '</span></button>';
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

      var maxSeq = state.entries.reduce(function (m, e) { return Math.max(m, e.seq || 0); }, 0);
      var entry = {
        id: uid(),
        seq: maxSeq + 1,
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

    var tpl = $("#tpl-page-card").content.cloneNode(true);
    elContent.innerHTML = "";
    elContent.appendChild(tpl);

    $("#cardSeq").textContent = "기록 #" + entry.seq;
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
        state.entries = migrateSeq(Object.keys(byId).map(function (k) { return byId[k]; }));
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
