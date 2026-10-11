(function () {
  "use strict";

  var KEY = "habit-tracker-v2";
  var LEGACY_KEY = "habit-tracker-v1";
  var WEEK_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  var WEEK_SHORT = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  var HISTORY_DAYS = 14;
  var HABIT_NAME_MAX = 20;
  var PROFILE_NAME_MAX = 10;

  function $(id) { return document.getElementById(id); }

  var els = {
    avatar: $("avatar"), profileName: $("profileName"), profileChip: $("profileChip"),
    dateLabel: $("dateLabel"), doneCount: $("doneCount"), totalCount: $("totalCount"),
    hint: $("hint"), barFill: $("barFill"), profileSub: $("profileSub"),
    listSub: $("listSub"), editToggle: $("editToggle"),
    habitList: $("habitList"), emptyState: $("emptyState"),
    addForm: $("addForm"), newHabit: $("newHabit"), notice: $("notice"),
    historyCard: $("historyCard"), historyList: $("historyList"),
    sheetMask: $("sheetMask"), sheetClose: $("sheetClose"), profileList: $("profileList"),
    addProfileForm: $("addProfileForm"), newProfile: $("newProfile"), sheetNotice: $("sheetNotice"),
    exportBtn: $("exportBtn"), importBtn: $("importBtn"), importFile: $("importFile")
  };

  var data = load();
  var editingHabitId = null;
  var editingProfileId = null;
  var editMode = false;
  var expanded = {};
  var lastDay = todayStr();
  var noticeTimer = null;
  var sheetNoticeTimer = null;

  /* ================================================================== *
   * 日期工具：统一用本地时间，避免跨时区、跨零点错位
   * ================================================================== */
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function parseYmd(s) { var p = s.split("-"); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function shiftDate(s, delta) { var d = parseYmd(s); d.setDate(d.getDate() + delta); return ymd(d); }

  function isDateStr(v) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var d = parseYmd(v);
    return !isNaN(d.getTime()) && ymd(d) === v;
  }

  function uid(prefix) {
    return (prefix || "id") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ================================================================== *
   * 存取、迁移与容错
   * ================================================================== */
  function newProfile(name) {
    return { id: uid("p"), name: name, createdAt: todayStr(), habits: [], records: {} };
  }

  function emptyData() {
    var p = newProfile("我");
    return { version: 2, currentProfileId: p.id, profiles: [p] };
  }

  function readJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function load() {
    var d = readJSON(KEY);
    if (!d) d = readJSON(LEGACY_KEY);   // 老版本（单档案）数据自动升级
    return normalize(d);
  }

  function normalizeHabits(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (h, i) {
      if (!h || typeof h !== "object") return;
      var name = typeof h.name === "string" ? h.name.trim().slice(0, HABIT_NAME_MAX) : "";
      if (!name) return;
      out.push({
        id: (typeof h.id === "string" && h.id) ? h.id : uid("h"),
        name: name,
        createdAt: isDateStr(h.createdAt) ? h.createdAt : todayStr(),
        deletedAt: isDateStr(h.deletedAt) ? h.deletedAt : null,
        order: (typeof h.order === "number" && isFinite(h.order)) ? h.order : i
      });
    });
    return out;
  }

  function normalizeRecords(rec) {
    var out = {};
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) return out;
    Object.keys(rec).forEach(function (k) {
      if (!isDateStr(k) || !Array.isArray(rec[k])) return;
      var ids = [];
      rec[k].forEach(function (x) {
        if (typeof x === "string" && x && ids.indexOf(x) === -1) ids.push(x);
      });
      if (ids.length) out[k] = ids;
    });
    return out;
  }

  function normalize(d) {
    var out = { version: 2, currentProfileId: null, profiles: [] };
    if (!d || typeof d !== "object") return emptyData();

    var sources;
    var legacy = false;
    if (Array.isArray(d.profiles)) {
      sources = d.profiles;
    } else if (Array.isArray(d.habits) || (d.records && typeof d.records === "object")) {
      sources = [d];              // 旧版单档案结构
      legacy = true;
    } else {
      sources = [];
    }

    sources.forEach(function (p) {
      if (!p || typeof p !== "object") return;
      var name = typeof p.name === "string" ? p.name.trim().slice(0, PROFILE_NAME_MAX) : "";
      if (!name) name = legacy ? "我" : "使用者 " + (out.profiles.length + 1);
      out.profiles.push({
        id: (typeof p.id === "string" && p.id) ? p.id : uid("p"),
        name: name,
        createdAt: isDateStr(p.createdAt) ? p.createdAt : todayStr(),
        habits: normalizeHabits(p.habits),
        records: normalizeRecords(p.records)
      });
    });

    if (!out.profiles.length) return emptyData();

    var okCurrent = out.profiles.some(function (p) { return p.id === d.currentProfileId; });
    out.currentProfileId = okCurrent ? d.currentProfileId : out.profiles[0].id;
    return out;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      flash("无法写入浏览器存储，请检查是否开启了无痕模式或存储已满。");
    }
  }

  /* ================================================================== *
   * 派生数据
   * ================================================================== */
  function profile() {
    for (var i = 0; i < data.profiles.length; i++) {
      if (data.profiles[i].id === data.currentProfileId) return data.profiles[i];
    }
    return data.profiles[0];
  }

  function habitById(p, id) {
    for (var i = 0; i < p.habits.length; i++) if (p.habits[i].id === id) return p.habits[i];
    return null;
  }

  function activeHabits(p) {
    return p.habits.filter(function (h) { return !h.deletedAt; })
      .sort(function (a, b) { return a.order - b.order; });
  }

  function isDone(p, dateStr, habitId) {
    var list = p.records[dateStr];
    return !!list && list.indexOf(habitId) !== -1;
  }

  function existsOn(habit, dateStr) {
    if (habit.createdAt > dateStr) return false;
    if (habit.deletedAt && habit.deletedAt <= dateStr) return false;
    return true;
  }

  // 单习惯连续天数：今天没打卡就从昨天往前数
  function streakOf(p, habitId) {
    var n = 0;
    var cur = todayStr();
    if (!isDone(p, cur, habitId)) cur = shiftDate(cur, -1);
    while (isDone(p, cur, habitId)) { n++; cur = shiftDate(cur, -1); }
    return n;
  }

  function todayCount(p) {
    var t = todayStr();
    var list = activeHabits(p);
    var done = 0;
    list.forEach(function (h) { if (isDone(p, t, h.id)) done++; });
    return { done: done, total: list.length };
  }

  /* ================================================================== *
   * 习惯操作（作用于当前使用者）
   * ================================================================== */
  function toggleDone(habitId) {
    var p = profile();
    var t = todayStr();
    var list = p.records[t] || (p.records[t] = []);
    var i = list.indexOf(habitId);
    if (i >= 0) list.splice(i, 1); else list.push(habitId);
    if (!list.length) delete p.records[t];
    save();
    renderAll();
  }

  function addHabit(name) {
    var v = (name || "").trim();
    if (!v) { flash("请先输入习惯名称。"); return false; }
    if (v.length > HABIT_NAME_MAX) { flash("名称请控制在 " + HABIT_NAME_MAX + " 个字以内。"); return false; }
    var p = profile();
    var dup = activeHabits(p).some(function (h) { return h.name === v; });
    if (dup) { flash("已经有同名习惯了。"); return false; }

    var maxOrder = -1;
    p.habits.forEach(function (h) { if (h.order > maxOrder) maxOrder = h.order; });
    p.habits.push({ id: uid("h"), name: v, createdAt: todayStr(), deletedAt: null, order: maxOrder + 1 });
    save();
    renderAll();
    hideNotice();
    return true;
  }

  function commitHabitRename(habitId, value) {
    if (editingHabitId !== habitId) return;
    editingHabitId = null;
    var p = profile();
    var v = (value || "").trim();
    if (!v) { renderHabits(); flash("习惯名称不能为空。"); return; }
    var dup = activeHabits(p).some(function (h) { return h.id !== habitId && h.name === v; });
    if (dup) { renderHabits(); flash("已经有同名习惯了。"); return; }
    var h = habitById(p, habitId);
    if (h && h.name !== v) { h.name = v; save(); }
    renderAll();
  }

  function deleteHabit(habitId) {
    var p = profile();
    var h = habitById(p, habitId);
    if (!h) return;
    if (!confirm("确定删除「" + h.name + "」吗？\n过去的打卡记录会保留在历史里。")) return;
    h.deletedAt = todayStr();
    var t = todayStr();
    if (p.records[t]) {
      p.records[t] = p.records[t].filter(function (x) { return x !== habitId; });
      if (!p.records[t].length) delete p.records[t];
    }
    save();
    renderAll();
  }

  function moveHabit(habitId, delta) {
    var p = profile();
    var list = activeHabits(p);
    var i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].id === habitId) i = k;
    var j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    list.forEach(function (h, idx) { h.order = idx; });
    save();
    renderHabits();
  }

  /* ================================================================== *
   * 使用者操作
   * ================================================================== */
  function switchProfile(id) {
    if (!data.profiles.some(function (p) { return p.id === id; })) return;
    data.currentProfileId = id;
    editingHabitId = null;
    editingProfileId = null;
    editMode = false;
    expanded = {};
    save();
    closeSheet();
    renderAll();
  }

  function addProfile(name) {
    var v = (name || "").trim();
    if (!v) { sheetFlash("请输入使用者名称。"); return false; }
    if (v.length > PROFILE_NAME_MAX) { sheetFlash("名称请控制在 " + PROFILE_NAME_MAX + " 个字以内。"); return false; }
    var dup = data.profiles.some(function (p) { return p.name === v; });
    if (dup) { sheetFlash("已经有同名使用者了。"); return false; }
    var p = newProfile(v);
    data.profiles.push(p);
    data.currentProfileId = p.id;
    editingHabitId = null;
    editMode = false;
    expanded = {};
    save();
    closeSheet();
    renderAll();
    flash("已切换到「" + v + "」，先添加一个想坚持的习惯吧。");
    return true;
  }

  function commitProfileRename(id, value) {
    if (editingProfileId !== id) return;
    editingProfileId = null;
    var v = (value || "").trim();
    if (!v) { renderSheet(); sheetFlash("使用者名称不能为空。"); return; }
    if (v.length > PROFILE_NAME_MAX) { renderSheet(); sheetFlash("名称请控制在 " + PROFILE_NAME_MAX + " 个字以内。"); return; }
    var dup = data.profiles.some(function (p) { return p.id !== id && p.name === v; });
    if (dup) { renderSheet(); sheetFlash("已经有同名使用者了。"); return; }
    data.profiles.forEach(function (p) { if (p.id === id) p.name = v; });
    save();
    renderAll();
    renderSheet();
  }

  function deleteProfile(id) {
    if (data.profiles.length <= 1) { sheetFlash("至少要保留一个使用者。"); return; }
    var target = null;
    data.profiles.forEach(function (p) { if (p.id === id) target = p; });
    if (!target) return;
    if (!confirm("删除使用者「" + target.name + "」？\n他的习惯和全部打卡记录都会被清空，无法恢复。")) return;
    data.profiles = data.profiles.filter(function (p) { return p.id !== id; });
    if (data.currentProfileId === id) {
      data.currentProfileId = data.profiles[0].id;
      editingHabitId = null;
      editMode = false;
      expanded = {};
    }
    save();
    renderAll();
    renderSheet();
  }

  /* ================================================================== *
   * 备份
   * ================================================================== */
  function exportData() {
    try {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "习惯打卡备份-" + todayStr() + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      sheetFlash("已导出备份文件。", true);
    } catch (e) {
      sheetFlash("导出失败，请换一个浏览器再试。");
    }
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      if (!parsed || typeof parsed !== "object") { sheetFlash("这个文件不是有效的备份。"); return; }
      if (!confirm("导入会覆盖当前所有使用者的数据，确定继续吗？")) return;
      data = normalize(parsed);
      save();
      editingHabitId = null;
      editingProfileId = null;
      editMode = false;
      expanded = {};
      renderAll();
      renderSheet();
      sheetFlash("导入完成。", true);
    };
    reader.onerror = function () { sheetFlash("读取文件失败。"); };
    reader.readAsText(file);
  }

  /* ================================================================== *
   * 提示条
   * ================================================================== */
  function flash(msg) {
    els.notice.textContent = msg;
    els.notice.hidden = false;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(hideNotice, 2800);
  }
  function hideNotice() {
    if (noticeTimer) clearTimeout(noticeTimer);
    els.notice.hidden = true;
  }
  function sheetFlash(msg, good) {
    els.sheetNotice.textContent = msg;
    els.sheetNotice.hidden = false;
    els.sheetNotice.style.color = good ? "#1c7f57" : "";
    els.sheetNotice.style.background = good ? "#e8f7f0" : "";
    if (sheetNoticeTimer) clearTimeout(sheetNoticeTimer);
    sheetNoticeTimer = setTimeout(hideSheetNotice, 2800);
  }
  function hideSheetNotice() {
    if (sheetNoticeTimer) clearTimeout(sheetNoticeTimer);
    els.sheetNotice.hidden = true;
  }

  /* ================================================================== *
   * 渲染
   * ================================================================== */
  function renderAll() {
    renderTopbar();
    renderHero();
    renderHabits();
    renderHistory();
  }

  function renderTopbar() {
    var p = profile();
    els.avatar.textContent = p.name.slice(0, 1) || "我";
    els.profileName.textContent = p.name;
    els.profileChip.title = "当前使用者：" + p.name;
  }

  function renderHero() {
    var t = todayStr();
    var d = parseYmd(t);
    els.dateLabel.textContent = d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 · " + WEEK_FULL[d.getDay()];

    var c = todayCount(profile());
    els.doneCount.textContent = String(c.done);
    els.totalCount.textContent = String(c.total);
    els.barFill.style.width = (c.total ? Math.round((c.done / c.total) * 100) : 0) + "%";

    if (!c.total) els.hint.textContent = "";
    else if (c.done === c.total) els.hint.textContent = "今天全部完成，漂亮！";
    else if (c.done === 0) els.hint.textContent = "今天还没开始呢";
    else els.hint.textContent = "还差 " + (c.total - c.done) + " 项";

    els.profileSub.textContent = data.profiles.length > 1 ? "当前：" + profile().name : "";
  }

  function renderHabits() {
    var p = profile();
    var t = todayStr();
    var list = activeHabits(p);

    els.habitList.innerHTML = "";
    els.habitList.className = "habits" + (editMode && list.length ? " editing" : "");
    els.editToggle.hidden = list.length === 0;
    els.editToggle.textContent = editMode ? "完成" : "编辑";
    els.listSub.textContent = editMode && list.length ? "编辑中" : (list.length ? "共 " + list.length + " 项" : "");

    list.forEach(function (h) {
      var done = isDone(p, t, h.id);
      var li = document.createElement("li");
      li.className = "habit" + (done ? " done" : "");
      li.setAttribute("data-id", h.id);

      var check = document.createElement("button");
      check.type = "button";
      check.className = "check";
      check.setAttribute("aria-label", (done ? "取消完成：" : "标记完成：") + h.name);
      li.appendChild(check);

      if (editingHabitId === h.id) {
        var input = document.createElement("input");
        input.className = "rename-input";
        input.type = "text";
        input.maxLength = HABIT_NAME_MAX;
        input.value = h.name;
        input.setAttribute("aria-label", "修改习惯名称");
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); commitHabitRename(h.id, input.value); }
          else if (e.key === "Escape") { e.preventDefault(); editingHabitId = null; renderHabits(); }
        });
        input.addEventListener("blur", function () { commitHabitRename(h.id, input.value); });
        input.addEventListener("click", function (e) { e.stopPropagation(); });
        li.appendChild(input);
        requestAnimationFrame(function () { input.focus(); input.select(); });
      } else {
        var info = document.createElement("div");
        info.className = "info";
        var name = document.createElement("span");
        name.className = "name";
        name.textContent = h.name;
        info.appendChild(name);
        var n = streakOf(p, h.id);
        if (n >= 1) {
          var badge = document.createElement("span");
          badge.className = "streak";
          badge.textContent = "🔥 " + n + " 天";
          info.appendChild(badge);
        }
        li.appendChild(info);
      }

      var actions = document.createElement("div");
      actions.className = "actions";
      [
        { act: "up", label: "上移", text: "↑" },
        { act: "down", label: "下移", text: "↓" },
        { act: "rename", label: "重命名", text: "✏️" },
        { act: "delete", label: "删除", text: "🗑️", danger: true }
      ].forEach(function (a) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "icon" + (a.danger ? " danger" : "");
        b.setAttribute("data-act", a.act);
        b.title = a.label;
        b.setAttribute("aria-label", a.label + "：" + h.name);
        b.textContent = a.text;
        actions.appendChild(b);
      });
      li.appendChild(actions);

      els.habitList.appendChild(li);
    });

    els.emptyState.hidden = list.length > 0;
    els.habitList.hidden = list.length === 0;
  }

  function renderHistory() {
    var p = profile();
    var hasAnyHabit = p.habits.length > 0;
    els.historyCard.hidden = !hasAnyHabit;
    els.historyList.innerHTML = "";
    if (!hasAnyHabit) return;

    var t = todayStr();
    var earliest = null;
    p.habits.forEach(function (h) {
      var d = h.createdAt;
      if (h.deletedAt && h.deletedAt < d) d = h.deletedAt;
      if (!earliest || d < earliest) earliest = d;
    });

    for (var i = 0; i < HISTORY_DAYS; i++) {
      var date = shiftDate(t, -i);
      if (i > 0 && earliest && date < earliest) break;
      var d = parseYmd(date);

      var existed = p.habits.filter(function (h) { return existsOn(h, date); });
      var total = existed.length;
      var doneHere = existed.filter(function (h) { return isDone(p, date, h.id); });

      var li = document.createElement("li");
      li.className = "history-row" + (expanded[date] ? " open" : "");

      var head = document.createElement("div");
      head.className = "history-head";
      head.setAttribute("role", "button");
      head.setAttribute("tabindex", "0");

      var dateEl = document.createElement("span");
      dateEl.className = "history-date";
      dateEl.textContent = (d.getMonth() + 1) + "月" + d.getDate() + "日";
      if (i === 0 || i === 1) {
        var tag = document.createElement("em");
        tag.textContent = i === 0 ? "今天" : "昨天";
        dateEl.appendChild(tag);
      }

      var weekEl = document.createElement("span");
      weekEl.className = "history-week";
      weekEl.textContent = WEEK_SHORT[d.getDay()];

      var textEl = document.createElement("span");
      textEl.className = "history-text" + (total > 0 && doneHere.length === total ? " all" : "");
      textEl.textContent = total ? "完成 " + doneHere.length + " / " + total + " 项" : "无习惯";

      var chev = document.createElement("span");
      chev.className = "chev";
      chev.textContent = "▶";

      head.appendChild(dateEl);
      head.appendChild(weekEl);
      head.appendChild(textEl);
      head.appendChild(chev);
      li.appendChild(head);

      var detail = document.createElement("div");
      detail.className = "history-detail";
      if (!expanded[date]) {
        detail.hidden = true;
      } else if (!doneHere.length) {
        detail.textContent = "这天没有打卡记录。";
      } else {
        doneHere.forEach(function (h) {
          var tag2 = document.createElement("span");
          tag2.className = "tag";
          tag2.textContent = h.name;
          detail.appendChild(tag2);
        });
      }
      li.appendChild(detail);

      (function (key) {
        function toggle() {
          if (expanded[key]) delete expanded[key]; else expanded[key] = true;
          renderHistory();
        }
        head.addEventListener("click", toggle);
        head.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
        });
      })(date);

      els.historyList.appendChild(li);
    }
  }

  function renderSheet() {
    els.profileList.innerHTML = "";
    data.profiles.forEach(function (p) {
      var c = todayCount(p);
      var li = document.createElement("li");
      li.className = "profile-row" + (p.id === data.currentProfileId ? " current" : "");
      li.setAttribute("data-id", p.id);

      var av = document.createElement("span");
      av.className = "avatar";
      av.textContent = p.name.slice(0, 1) || "我";
      li.appendChild(av);

      if (editingProfileId === p.id) {
        var input = document.createElement("input");
        input.className = "profile-input";
        input.type = "text";
        input.maxLength = PROFILE_NAME_MAX;
        input.value = p.name;
        input.setAttribute("aria-label", "修改使用者名称");
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); commitProfileRename(p.id, input.value); }
          else if (e.key === "Escape") { e.preventDefault(); editingProfileId = null; renderSheet(); }
        });
        input.addEventListener("blur", function () { commitProfileRename(p.id, input.value); });
        input.addEventListener("click", function (e) { e.stopPropagation(); });
        li.appendChild(input);
        requestAnimationFrame(function () { input.focus(); input.select(); });
      } else {
        var info = document.createElement("div");
        info.className = "profile-info";
        var nm = document.createElement("span");
        nm.className = "profile-name";
        nm.textContent = p.name + (p.id === data.currentProfileId ? "（当前）" : "");
        var sub = document.createElement("span");
        sub.className = "profile-sub";
        sub.textContent = c.total ? "今天 " + c.done + " / " + c.total + " 项" : "还没有习惯";
        info.appendChild(nm);
        info.appendChild(sub);
        li.appendChild(info);
      }

      var acts = document.createElement("div");
      acts.className = "profile-actions";
      [{ act: "rename", label: "重命名", text: "✏️" },
       { act: "delete", label: "删除", text: "🗑️", danger: true }].forEach(function (a) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "icon" + (a.danger ? " danger" : "");
        b.setAttribute("data-pact", a.act);
        b.title = a.label;
        b.setAttribute("aria-label", a.label + "：" + p.name);
        b.textContent = a.text;
        acts.appendChild(b);
      });
      li.appendChild(acts);

      els.profileList.appendChild(li);
    });
  }

  /* ================================================================== *
   * 面板开关
   * ================================================================== */
  function openSheet() {
    editingProfileId = null;
    els.sheetMask.hidden = false;
    renderSheet();
    hideSheetNotice();
  }
  function closeSheet() {
    els.sheetMask.hidden = true;
    editingProfileId = null;
    els.newProfile.value = "";
    hideSheetNotice();
  }

  /* ================================================================== *
   * 事件绑定
   * ================================================================== */
  els.addForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (addHabit(els.newHabit.value)) els.newHabit.value = "";
    els.newHabit.focus();
  });
  els.newHabit.addEventListener("input", hideNotice);

  els.editToggle.addEventListener("click", function () {
    editMode = !editMode;
    editingHabitId = null;
    renderHabits();
  });

  els.habitList.addEventListener("click", function (e) {
    var li = e.target.closest(".habit");
    if (!li) return;
    if (e.target.closest(".rename-input")) return;

    var id = li.getAttribute("data-id");
    var btn = e.target.closest("[data-act]");
    if (btn) {
      var act = btn.getAttribute("data-act");
      if (act === "up") moveHabit(id, -1);
      else if (act === "down") moveHabit(id, 1);
      else if (act === "rename") { editingHabitId = id; renderHabits(); }
      else if (act === "delete") deleteHabit(id);
      return;
    }
    // 编辑模式下点整行不打勾（避免误触），但圆圈本身仍然可以打勾
    if (editMode && !e.target.closest(".check")) {
      flash("编辑模式下点圆圈可以打勾，点「完成」退出编辑。");
      return;
    }
    toggleDone(id);
  });

  els.profileChip.addEventListener("click", openSheet);
  els.sheetClose.addEventListener("click", closeSheet);
  els.sheetMask.addEventListener("click", function (e) { if (e.target === els.sheetMask) closeSheet(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.sheetMask.hidden) closeSheet();
  });

  els.profileList.addEventListener("click", function (e) {
    var li = e.target.closest(".profile-row");
    if (!li) return;
    if (e.target.closest(".profile-input")) return;
    var id = li.getAttribute("data-id");
    var btn = e.target.closest("[data-pact]");
    if (btn) {
      var act = btn.getAttribute("data-pact");
      if (act === "rename") { editingProfileId = id; renderSheet(); }
      else if (act === "delete") deleteProfile(id);
      return;
    }
    switchProfile(id);
  });

  els.addProfileForm.addEventListener("submit", function (e) {
    e.preventDefault();
    addProfile(els.newProfile.value);
  });
  els.newProfile.addEventListener("input", hideSheetNotice);

  els.exportBtn.addEventListener("click", exportData);
  els.importBtn.addEventListener("click", function () { els.importFile.click(); });
  els.importFile.addEventListener("change", function () {
    var f = els.importFile.files && els.importFile.files[0];
    if (f) importData(f);
    els.importFile.value = "";
  });

  /* ---------- 跨零点 & 多标签同步 ---------- */
  setInterval(function () {
    var t = todayStr();
    if (t !== lastDay) { lastDay = t; expanded = {}; renderAll(); }
  }, 30000);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    var t = todayStr();
    if (t !== lastDay) { lastDay = t; expanded = {}; }
    renderAll();
  });

  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    data = load();
    renderAll();
    if (!els.sheetMask.hidden) renderSheet();
  });

  /* ---------- 离线缓存 ---------- */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  renderAll();
})();
