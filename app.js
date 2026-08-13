const STORAGE_KEY = "growth-mirror-web-v1";
const MAX_ITEMS = 3;
const MAX_TITLE = 40;
const MAX_COMMENT = 40;
const MAX_NOTE = 40;
const HISTORY_DAYS = 7;

const GRADE = {
  ok: { label: "对", cls: "ok" },
  wrong: { label: "错", cls: "wrong" },
  revise: { label: "需订正", cls: "revise" },
};

const app = document.getElementById("app");

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function keyFromDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function labelFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}月${d}日`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function defaultState() {
  return {
    role: "child",
    dayOffset: 0,
    screen: "home",
    viewingKey: null,
    days: {},
  };
}

const state = Object.assign(defaultState(), loadState() || {});
if (!state.days) state.days = {};
if (state.role !== "parent") state.role = "child";
if (!["home", "history"].includes(state.screen)) state.screen = "home";

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      role: state.role,
      dayOffset: state.dayOffset,
      screen: state.screen,
      viewingKey: state.viewingKey,
      days: state.days,
    }),
  );
}

function clockDate() {
  return addDays(new Date(), state.dayOffset || 0);
}

function todayKey() {
  return keyFromDate(clockDate());
}

function emptyDay() {
  return { packet: "draft", items: [], tomorrowNote: "", submittedAt: null, gradedAt: null };
}

function dayRecord(key) {
  if (!state.days[key]) state.days[key] = emptyDay();
  return state.days[key];
}

function today() {
  return dayRecord(todayKey());
}

function packetStatus(day) {
  if (!day.items.length) return "empty";
  if (day.packet === "graded") return "graded";
  if (day.packet === "submitted") return "submitted";
  return "draft";
}

function newItem() {
  return { id: uid(), title: "", photo: null, grade: null, comment: "", revised: false };
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 720;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("image"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function canSubmit(day) {
  const titled = day.items.filter((item) => item.title.trim());
  return titled.length >= 1 && titled.length <= MAX_ITEMS;
}

function allGraded(day) {
  return day.items.length > 0 && day.items.every((item) => item.grade);
}

function historyKeys() {
  const keys = [];
  const end = clockDate();
  for (let i = 0; i < HISTORY_DAYS; i += 1) {
    keys.push(keyFromDate(addDays(end, -i)));
  }
  return keys;
}

function statusChip(day) {
  const status = packetStatus(day);
  if (status === "graded") return `<span class="chip ok">已批改</span>`;
  if (status === "submitted") return `<span class="chip wait">待批改</span>`;
  if (status === "draft") return `<span class="chip draft">未交</span>`;
  return `<span class="chip draft">无记录</span>`;
}

function photoBlock(item, editable) {
  if (item.photo) {
    return `<div class="photo-row">
      <img src="${item.photo}" alt="作业照片" />
      ${editable ? `<button class="text-btn danger" data-act="photo-clear" data-id="${item.id}">去掉图</button>` : ""}
    </div>`;
  }
  if (!editable) return "";
  return `<label class="file-btn">拍一张作业（可选）
    <input hidden type="file" accept="image/*" capture="environment" data-act="photo" data-id="${item.id}" />
  </label>`;
}

function companionLine() {
  const status = packetStatus(today());
  if (state.screen === "history") {
    return "昨天还在。习惯靠重复，不靠勋章。";
  }
  if (state.role === "parent") {
    if (status === "submitted") return "每条勾对、错或需订正。能写一句短评就写，不要讲题。";
    if (status === "graded") return "今天批完了。短评孩子打开就能看见。";
    return "孩子还没交过来。交过来之后，你勾对错、写一句短评就好。";
  }
  if (status === "submitted") return "已经交给家长了。批完你再回来，就能看见对错和那句话。";
  if (status === "graded") return "家长看过了。需订正的可以勾完成；想改一点就写给明天的自己。";
  return "先把今天要交的作业放到桌上。我只在旁边看着，批改是家长的事。";
}

function playBar() {
  return `<div class="play">
    <button data-act="history">${state.screen === "history" ? "回今天" : "近 7 日"}</button>
    <button data-act="next-day">试玩：下一天</button>
    <button data-act="reset">清空本机</button>
  </div>`;
}

function frame(subtitle, panel) {
  return `<div class="shell">
    <header class="top">
      <div class="brand">
        <img src="./assets/app-icon-192.png" alt="" width="44" height="44" />
        <div>
          <h1>成长镜</h1>
          <p>${esc(subtitle)}</p>
        </div>
      </div>
      <div class="top-actions">
        <span class="pill">${state.role === "parent" ? "家长在批改" : "先交清楚，再看反馈"}</span>
        <button class="pill ${state.role === "child" ? "on" : ""}" data-act="role" data-role="child">我是孩子</button>
        <button class="pill ${state.role === "parent" ? "on" : ""}" data-act="role" data-role="parent">我是家长</button>
      </div>
    </header>
    <div class="board">
      <aside class="companion">
        <img src="./assets/companion.png" alt="阿问" />
        <div class="speech">
          <div class="who"><b>阿问</b><span>在旁边看着</span></div>
          <p>${esc(companionLine())}</p>
        </div>
      </aside>
      <section class="panel">${panel}</section>
    </div>
  </div>`;
}

function itemList(day, mode) {
  return day.items.map((item, i) => {
    if (mode === "edit") {
      return `<div class="item">
        <div class="item-head">
          <span class="index">第 ${i + 1} 条</span>
          ${day.items.length > 1 ? `<button class="kill" data-act="remove" data-id="${item.id}">删除</button>` : ""}
        </div>
        <input class="title" maxlength="${MAX_TITLE}" data-field="title" data-id="${item.id}" placeholder="例如：数学练习册 P12" value="${esc(item.title)}" />
        ${photoBlock(item, true)}
      </div>`;
    }
    const g = item.grade ? GRADE[item.grade] : null;
    return `<div class="item">
      <div class="item-head">
        <span class="index">第 ${i + 1} 条</span>
        ${g ? `<span class="chip ${g.cls}">${g.label}</span>` : ""}
      </div>
      <p class="locked">${esc(item.title || "（未写完）")}</p>
      ${item.comment ? `<p class="quote">「${esc(item.comment)}」</p>` : ""}
      ${item.revised ? `<p class="quote">孩子已勾订正完成。</p>` : ""}
      ${photoBlock(item, false)}
      ${mode === "grade" ? `
        <div class="grades">
          <button data-act="grade" data-id="${item.id}" data-grade="ok" class="${item.grade === "ok" ? "on-ok" : ""}">对</button>
          <button data-act="grade" data-id="${item.id}" data-grade="wrong" class="${item.grade === "wrong" ? "on-wrong" : ""}">错</button>
          <button data-act="grade" data-id="${item.id}" data-grade="revise" class="${item.grade === "revise" ? "on-revise" : ""}">需订正</button>
        </div>
        <textarea class="comment" maxlength="${MAX_COMMENT}" data-field="comment" data-id="${item.id}" placeholder="一句短评，孩子会看见">${esc(item.comment)}</textarea>
        <p class="counter">${(item.comment || "").length}/${MAX_COMMENT}</p>` : ""}
      ${mode === "result" && item.grade === "revise" ? `<button class="secondary" data-act="revised" data-id="${item.id}">${item.revised ? "已订正" : "订正完成"}</button>` : ""}
    </div>`;
  }).join("");
}

function renderChildHome() {
  const day = today();
  const status = packetStatus(day);
  const dateLabel = labelFromKey(todayKey());

  if (status === "submitted") {
    return frame(dateLabel, `
      <p class="eyebrow">已经交出去</p>
      <h2>等家长批改</h2>
      <p class="lede">批完再打开，就能看见对错和那句短评。</p>
      ${itemList(day, "read")}
      ${playBar()}`);
  }

  if (status === "graded") {
    return frame(dateLabel, `
      <p class="eyebrow">家长看过了</p>
      <h2>对错和那句话</h2>
      <p class="lede">需订正的可以勾完成。想改习惯，就写给明天的自己。</p>
      ${itemList(day, "result")}
      <div class="item">
        <span class="index">明天改一点（选填）</span>
        <textarea class="note" maxlength="${MAX_NOTE}" data-field="tomorrow" placeholder="例如：计算题先验算一遍">${esc(day.tomorrowNote)}</textarea>
        <p class="counter">${(day.tomorrowNote || "").length}/${MAX_NOTE}</p>
      </div>
      ${playBar()}`);
  }

  if (!day.items.length) day.items.push(newItem());
  return frame(dateLabel, `
    <p class="eyebrow">先看清，再交给家长</p>
    <h2>把今天的作业放到桌上</h2>
    <p class="lede">拍老师写的作业、作业本，或写下要交的条目。最多 ${MAX_ITEMS} 条。交出去就不能改。</p>
    ${itemList(day, "edit")}
    <p class="hint">任务是边界；什么时候开始、先做哪一条，由孩子自己决定。</p>
    <div class="actions">
      ${day.items.length < MAX_ITEMS ? `<button class="secondary" data-act="add">再加一条</button>` : ""}
      <button class="primary" data-act="submit" ${canSubmit(day) ? "" : "disabled"}>交给家长</button>
    </div>
    ${playBar()}`);
}

function renderParentHome() {
  const day = today();
  const status = packetStatus(day);
  const dateLabel = labelFromKey(todayKey());

  if (status === "empty" || status === "draft") {
    return frame(dateLabel, `
      <p class="eyebrow">还没交过来</p>
      <h2>桌上还是空的</h2>
      <p class="lede">孩子点「交给家长」之后，作业才会出现在这里。</p>
      ${playBar()}`);
  }

  if (status === "graded") {
    return frame(dateLabel, `
      <p class="eyebrow">今天已批完</p>
      <h2>短评孩子能看见</h2>
      <p class="lede">要改结果，等明天的新作业。</p>
      ${itemList(day, "read")}
      ${day.tomorrowNote ? `<p class="quote">孩子写给明天：${esc(day.tomorrowNote)}</p>` : ""}
      ${playBar()}`);
  }

  return frame(dateLabel, `
    <p class="eyebrow">待批改</p>
    <h2>勾对错，写一句</h2>
    <p class="lede">不要评分，不要讲题。孩子打开就能看见你写的那句。</p>
    ${itemList(day, "grade")}
    <div class="actions">
      <button class="primary" data-act="finish-grade" ${allGraded(day) ? "" : "disabled"}>完成批改</button>
    </div>
    ${playBar()}`);
}

function renderHistory() {
  const keys = historyKeys();
  return frame("近 7 日", `
    <p class="eyebrow">回看</p>
    <h2>这几天还在</h2>
    <p class="lede">昨天还在。习惯靠重复，不靠勋章。</p>
    ${keys.map((key) => {
      const day = state.days[key] || emptyDay();
      const isToday = key === todayKey();
      return `<button class="list-row" data-act="open-day" data-key="${key}">
        <span>${labelFromKey(key)}${isToday ? " · 今天" : ""}</span>
        ${statusChip(day)}
      </button>`;
    }).join("")}
    ${playBar()}`);
}

function render() {
  save();
  if (state.screen === "history") {
    app.innerHTML = renderHistory();
    return;
  }
  app.innerHTML = state.role === "parent" ? renderParentHome() : renderChildHome();
}

function itemById(id) {
  return today().items.find((item) => item.id === id);
}

app.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === "role") {
    state.role = btn.dataset.role;
    state.screen = "home";
    render();
    return;
  }
  if (act === "history") {
    state.screen = state.screen === "history" ? "home" : "history";
    render();
    return;
  }
  if (act === "close-peek") {
    state.screen = "history";
    render();
    return;
  }
  if (act === "open-day") {
    const key = btn.dataset.key;
    if (key === todayKey()) {
      state.screen = "home";
      render();
      return;
    }
    peekDay(key);
    return;
  }
  if (act === "add") {
    const day = today();
    if (day.packet !== "draft") return;
    if (day.items.length >= MAX_ITEMS) return;
    day.items.push(newItem());
    render();
    const inputs = app.querySelectorAll(".title");
    inputs[inputs.length - 1]?.focus();
    return;
  }
  if (act === "remove") {
    const day = today();
    if (day.packet !== "draft") return;
    day.items = day.items.filter((item) => item.id !== btn.dataset.id);
    if (!day.items.length) day.items.push(newItem());
    render();
    return;
  }
  if (act === "submit") {
    const day = today();
    day.items = day.items.filter((item) => item.title.trim());
    if (!canSubmit(day)) return;
    day.packet = "submitted";
    day.submittedAt = new Date().toISOString();
    render();
    return;
  }
  if (act === "grade") {
    const item = itemById(btn.dataset.id);
    if (!item || today().packet !== "submitted") return;
    item.grade = btn.dataset.grade;
    render();
    return;
  }
  if (act === "finish-grade") {
    const day = today();
    if (!allGraded(day) || day.packet !== "submitted") return;
    day.packet = "graded";
    day.gradedAt = new Date().toISOString();
    render();
    return;
  }
  if (act === "revised") {
    const item = itemById(btn.dataset.id);
    if (!item || today().packet !== "graded") return;
    item.revised = !item.revised;
    render();
    return;
  }
  if (act === "photo-clear") {
    const item = itemById(btn.dataset.id);
    if (!item || today().packet !== "draft") return;
    item.photo = null;
    render();
    return;
  }
  if (act === "next-day") {
    state.dayOffset = (state.dayOffset || 0) + 1;
    state.screen = "home";
    state.role = "child";
    render();
    return;
  }
  if (act === "reset") {
    if (!confirm("清空这个浏览器里的试玩记录？")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, defaultState());
    render();
  }
});

app.addEventListener("change", async (event) => {
  const input = event.target;
  if (input.dataset.act !== "photo") return;
  const item = itemById(input.dataset.id);
  if (!item || today().packet !== "draft") return;
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    item.photo = await compressImage(file);
    render();
  } catch {
    alert("这张图加不进去，换一张试试。");
  }
});

app.addEventListener("input", (event) => {
  const el = event.target;
  const field = el.dataset.field;
  if (!field) return;
  if (field === "title") {
    const item = itemById(el.dataset.id);
    if (!item) return;
    item.title = el.value.slice(0, MAX_TITLE);
    save();
    const dock = app.querySelector("[data-act=submit]");
    if (dock) dock.disabled = !canSubmit(today());
    return;
  }
  if (field === "comment") {
    const item = itemById(el.dataset.id);
    if (!item) return;
    item.comment = el.value.slice(0, MAX_COMMENT);
    save();
    const counter = el.parentElement.querySelector(".counter");
    if (counter) counter.textContent = `${item.comment.length}/${MAX_COMMENT}`;
    return;
  }
  if (field === "tomorrow") {
    today().tomorrowNote = el.value.slice(0, MAX_NOTE);
    save();
    const counter = el.parentElement.querySelector(".counter");
    if (counter) counter.textContent = `${today().tomorrowNote.length}/${MAX_NOTE}`;
  }
});

function peekDay(key) {
  const day = state.days[key] || emptyDay();
  const status = packetStatus(day);
  app.innerHTML = frame(labelFromKey(key), `
    <p class="eyebrow">回看</p>
    <h2>${status === "empty" ? "那天没有交作业" : "已经发生过的一天"}</h2>
    <p class="lede">${status === "empty" ? "没有记录。" : "只能看，不能改。"}</p>
    ${status === "empty" ? "" : itemList(day, "read")}
    ${day.tomorrowNote ? `<p class="quote">明天改一点：${esc(day.tomorrowNote)}</p>` : ""}
    <div class="actions">
      <button class="secondary" data-act="close-peek">返回近 7 日</button>
    </div>`);
}

render();
