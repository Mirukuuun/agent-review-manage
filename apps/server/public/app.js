const VIEW_META = {
  dashboard: {
    title: "任务总览",
    subtitle: "统一查看审核任务状态、队列规模与处理进度。"
  },
  workspace: {
    title: "审核工作台",
    subtitle: "按任务逐条处理，快速查看详情并执行审核动作。"
  },
  settings: {
    title: "系统设置",
    subtitle: "维护默认超时策略，统一系统审核行为。"
  }
};

const STATUS_LABEL = {
  pending: "待处理",
  approved: "已通过",
  rejected: "已拒绝",
  timeout: "已超时"
};

const UI_TEXT = {
  emptyTasks: "暂无任务",
  selectTask: "请先在左侧选择一个任务",
  settingsSaved: "设置已保存",
  approvedDone: "任务已通过",
  rejectedDone: "任务已拒绝",
  requestFailedPrefix: "请求失败",
  detail: {
    taskId: "任务ID (task_id)",
    status: "状态 (status)",
    scenario: "场景 (scenario)",
    createdAt: "创建时间 (created_at)",
    reviewText: "审核文本 (review_text)",
    contextInfo: "上下文 (context_info)",
    payload: "原始载荷 (payload)",
    reviewerId: "审核员ID (reviewer_id)",
    reviewerFromSettings: "当前审核员ID (来自设置)",
    reviewerNotSet: "未设置",
    feedback: "反馈 (feedback)",
    feedbackPlaceholder: "可选反馈说明",
    approve: "直接通过",
    reject: "拒绝"
  }
};

const VIEW_TRANSITION_MS = 240;

const state = {
  activeView: "dashboard",
  dashboardFilters: { status: "", scenario: "", task_id: "" },
  workspaceFilters: { status: "pending", task_id: "" },
  workspaceTasks: [],
  selectedTaskId: "",
  settings: {
    default_timeout_seconds: 0,
    default_timeout_action: "auto_reject",
    default_reviewer_id: null
  },
  transitionToken: 0,
  viewTransitionTimer: null
};

init();

function init() {
  bindNav();
  bindHashRouting();
  bindDashboardFilter();
  bindWorkspaceFilter();
  bindSettingsForm();
  const initialView = resolveViewFromHash();
  setActiveView(initialView, { updateHash: window.location.hash.trim() === "" });
  void Promise.all([refreshDashboard(), refreshWorkspace(), loadSettings()]);
}

function bindNav() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.getAttribute("data-view");
      if (!view) {
        return;
      }
      setActiveView(view, { updateHash: true });
    });
  });
}

function bindHashRouting() {
  window.addEventListener("hashchange", () => {
    const targetView = resolveViewFromHash();
    if (targetView !== state.activeView) {
      setActiveView(targetView, { updateHash: false });
    }
  });
}

function resolveViewFromHash() {
  const key = window.location.hash.replace("#", "").trim();
  return VIEW_META[key] ? key : "dashboard";
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function setActiveView(view, options = {}) {
  if (!VIEW_META[view]) {
    return;
  }

  const { updateHash = true } = options;
  const previousView = state.activeView;
  state.activeView = view;

  document.querySelectorAll(".nav-tab").forEach((item) => {
    const isActive = item.getAttribute("data-view") === view;
    item.classList.toggle("active", isActive);
    if (isActive) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });

  const title = document.getElementById("view-title");
  const subtitle = document.getElementById("view-subtitle");
  if (title) {
    title.textContent = VIEW_META[view].title;
  }
  if (subtitle) {
    subtitle.textContent = VIEW_META[view].subtitle;
  }

  const nextSection = document.getElementById(`view-${view}`);
  const currentSection = document.querySelector(".view.active");
  if (!nextSection) {
    return;
  }

  if (prefersReducedMotion() || previousView === view || currentSection === nextSection || !currentSection) {
    showViewImmediately(nextSection);
  } else {
    transitionToView(currentSection, nextSection);
  }

  if (updateHash) {
    const nextHash = `#${view}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = view;
    }
  }
}

function showViewImmediately(nextSection) {
  cancelViewTransition();
  document.querySelectorAll(".view").forEach((section) => {
    const isActive = section === nextSection;
    section.classList.remove("view-leaving", "view-entering", "view-entering-active");
    section.classList.toggle("active", isActive);
  });
}

function transitionToView(currentSection, nextSection) {
  cancelViewTransition();
  const token = ++state.transitionToken;

  document.querySelectorAll(".view").forEach((section) => {
    section.classList.remove("view-leaving", "view-entering", "view-entering-active");
    if (section !== currentSection && section !== nextSection) {
      section.classList.remove("active");
    }
  });

  currentSection.classList.add("active", "view-leaving");
  nextSection.classList.add("active", "view-entering");

  window.requestAnimationFrame(() => {
    if (token !== state.transitionToken) {
      return;
    }
    nextSection.classList.add("view-entering-active");
  });

  state.viewTransitionTimer = window.setTimeout(() => {
    if (token !== state.transitionToken) {
      return;
    }
    currentSection.classList.remove("active", "view-leaving");
    nextSection.classList.remove("view-entering", "view-entering-active");
  }, VIEW_TRANSITION_MS + 20);
}

function cancelViewTransition() {
  if (state.viewTransitionTimer) {
    window.clearTimeout(state.viewTransitionTimer);
    state.viewTransitionTimer = null;
  }
}

function bindDashboardFilter() {
  const form = document.getElementById("dashboard-filter");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.dashboardFilters = {
      status: String(formData.get("status") || ""),
      scenario: String(formData.get("scenario") || ""),
      task_id: String(formData.get("task_id") || "")
    };
    await refreshDashboard();
  });
}

function bindWorkspaceFilter() {
  const form = document.getElementById("workspace-filter");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    state.workspaceFilters = {
      status: String(formData.get("status") || ""),
      task_id: String(formData.get("task_id") || "")
    };
    await refreshWorkspace();
  });

  syncWorkspaceFilterForm();
}

function bindSettingsForm() {
  const form = document.getElementById("settings-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const settings = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        default_timeout_seconds: Number(formData.get("default_timeout_seconds")),
        default_timeout_action: String(formData.get("default_timeout_action")),
        default_reviewer_id: String(formData.get("default_reviewer_id") || "").trim()
      })
    });
    applySettings(settings);
    toast(UI_TEXT.settingsSaved);
  });
}

function syncWorkspaceFilterForm() {
  const form = document.getElementById("workspace-filter");
  if (!form) {
    return;
  }
  form.status.value = state.workspaceFilters.status;
  form.task_id.value = state.workspaceFilters.task_id;
}

async function refreshDashboard() {
  const query = new URLSearchParams();
  Object.entries(state.dashboardFilters).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });

  const result = await api(`/api/tasks?${query.toString()}`);
  const items = Array.isArray(result.items) ? result.items : [];
  const summary = result.summary || {};

  document.getElementById("stat-pending").textContent = String(summary.pending || 0);
  document.getElementById("stat-approved").textContent = String(summary.approved || 0);
  document.getElementById("stat-rejected").textContent = String(summary.rejected || 0);
  document.getElementById("stat-timeout").textContent = String(summary.timeout || 0);

  const tbody = document.getElementById("dashboard-table-body");
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="placeholder">${escapeHtml(UI_TEXT.emptyTasks)}</td></tr>`;
  } else {
    tbody.innerHTML = items
      .map(
        (task) => `
        <tr class="dashboard-task-item" data-task-id="${escapeHtml(task.task_id)}" role="button" tabindex="0">
          <td>${escapeHtml(task.task_id)}</td>
          <td>${escapeHtml(task.agent_id)}</td>
          <td>${escapeHtml(task.scenario)}</td>
          <td>${renderStatusBadge(task.status)}</td>
          <td>${escapeHtml(sliceText(task.review_text, 80))}</td>
          <td>${escapeHtml(formatTime(task.created_at))}</td>
        </tr>
      `
      )
      .join("");
  }

  const cards = document.getElementById("dashboard-card-list");
  cards.innerHTML =
    items.length === 0
      ? `<article class="task-card"><p class="placeholder">${escapeHtml(UI_TEXT.emptyTasks)}</p></article>`
      : items
          .map(
            (task) => `
            <article class="task-card dashboard-task-item" data-task-id="${escapeHtml(task.task_id)}" role="button" tabindex="0">
              <strong>${escapeHtml(task.task_id)}</strong>
              <span>${renderStatusBadge(task.status)}</span>
              <span class="task-meta">场景: ${escapeHtml(task.scenario)}</span>
              <span class="task-meta">时间: ${escapeHtml(formatTime(task.created_at))}</span>
              <span class="task-meta">审核文本: ${escapeHtml(sliceText(task.review_text, 60))}</span>
            </article>
          `
          )
          .join("");

  document.querySelectorAll(".dashboard-task-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const taskId = item.getAttribute("data-task-id");
      if (!taskId) {
        return;
      }
      await openTaskInWorkspace(taskId);
    });

    item.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      const taskId = item.getAttribute("data-task-id");
      if (!taskId) {
        return;
      }
      await openTaskInWorkspace(taskId);
    });
  });
}

async function refreshWorkspace() {
  syncWorkspaceFilterForm();

  const query = new URLSearchParams();
  if (state.workspaceFilters.status) {
    query.set("status", state.workspaceFilters.status);
  }
  if (state.workspaceFilters.task_id) {
    query.set("task_id", state.workspaceFilters.task_id);
  }

  const result = await api(`/api/tasks?${query.toString()}`);
  state.workspaceTasks = Array.isArray(result.items) ? result.items : [];

  if (!state.workspaceTasks.some((task) => task.task_id === state.selectedTaskId)) {
    state.selectedTaskId = state.workspaceTasks[0]?.task_id || "";
  }

  const list = document.getElementById("workspace-task-list");
  if (state.workspaceTasks.length === 0) {
    list.innerHTML = `<li><p class="placeholder">${escapeHtml(UI_TEXT.emptyTasks)}</p></li>`;
  } else {
    list.innerHTML = state.workspaceTasks
      .map(
        (task) => `
        <li>
          <button class="workspace-task-item ${task.task_id === state.selectedTaskId ? "active" : ""}" data-task-id="${
            task.task_id
          }" aria-pressed="${task.task_id === state.selectedTaskId ? "true" : "false"}">
            <strong>${escapeHtml(task.task_id)}</strong>
            <span>${renderStatusBadge(task.status)}</span>
            <small>${escapeHtml(task.scenario)} · ${escapeHtml(formatTime(task.created_at))}</small>
          </button>
        </li>
      `
      )
      .join("");
  }

  list.querySelectorAll(".workspace-task-item").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.getAttribute("data-task-id");
      if (!taskId) {
        return;
      }
      state.selectedTaskId = taskId;
      renderWorkspaceTaskSelection();
      await showWorkspaceDetail(taskId);
    });
  });

  renderWorkspaceTaskSelection();
  if (state.selectedTaskId) {
    await showWorkspaceDetail(state.selectedTaskId);
  } else {
    document.getElementById("workspace-detail").innerHTML = `<p class="placeholder">${escapeHtml(UI_TEXT.selectTask)}</p>`;
  }
}

function renderWorkspaceTaskSelection() {
  document.querySelectorAll(".workspace-task-item").forEach((button) => {
    const isActive = button.getAttribute("data-task-id") === state.selectedTaskId;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

async function showWorkspaceDetail(taskId) {
  const task = await api(`/api/tasks/${taskId}`);
  const isPending = task.status === "pending";

  document.getElementById("workspace-detail").innerHTML = `
    <div class="detail-block">
      <strong>${UI_TEXT.detail.taskId}</strong>
      <div>${escapeHtml(task.task_id)}</div>
    </div>
    <div class="detail-block">
      <strong>${UI_TEXT.detail.status}</strong>
      <div>${renderStatusBadge(task.status)}</div>
    </div>
    <div class="detail-block">
      <strong>${UI_TEXT.detail.scenario}</strong>
      <div>${escapeHtml(task.scenario)}</div>
    </div>
    <div class="detail-block">
      <strong>${UI_TEXT.detail.createdAt}</strong>
      <div>${escapeHtml(formatTime(task.created_at))}</div>
    </div>
    <div class="detail-block">
      <strong>${UI_TEXT.detail.reviewText}</strong>
      <pre>${escapeHtml(task.review_text)}</pre>
    </div>
    <div class="detail-block">
      <strong>${UI_TEXT.detail.contextInfo}</strong>
      <pre>${escapeHtml(task.context_info || "")}</pre>
    </div>
    <div class="detail-block">
      <strong>${UI_TEXT.detail.payload}</strong>
      <pre>${escapeHtml(JSON.stringify(task.payload, null, 2))}</pre>
    </div>
    <div class="detail-block">
      <strong>${UI_TEXT.detail.reviewerFromSettings}</strong>
      <div>${escapeHtml(state.settings.default_reviewer_id || UI_TEXT.detail.reviewerNotSet)}</div>
    </div>
    <div class="detail-block">
      <label>
        ${UI_TEXT.detail.feedback}
        <textarea id="workspace-feedback" rows="3" placeholder="${UI_TEXT.detail.feedbackPlaceholder}"></textarea>
      </label>
    </div>
    <div class="actions">
      <button class="approve" id="workspace-approve" ${isPending ? "" : "disabled"}>${UI_TEXT.detail.approve}</button>
      <button class="reject" id="workspace-reject" ${isPending ? "" : "disabled"}>${UI_TEXT.detail.reject}</button>
    </div>
  `;

  const approveButton = document.getElementById("workspace-approve");
  const rejectButton = document.getElementById("workspace-reject");

  approveButton?.addEventListener("click", async () => {
    await submitWorkspaceAction(task.task_id, "approve");
  });

  rejectButton?.addEventListener("click", async () => {
    await submitWorkspaceAction(task.task_id, "reject");
  });
}

async function openTaskInWorkspace(taskId) {
  state.workspaceFilters = { status: "", task_id: taskId };
  state.selectedTaskId = taskId;
  syncWorkspaceFilterForm();
  setActiveView("workspace", { updateHash: true });
  await refreshWorkspace();
}

async function submitWorkspaceAction(taskId, action) {
  const reviewerId = state.settings.default_reviewer_id || undefined;
  const feedback = document.getElementById("workspace-feedback")?.value?.trim() || undefined;

  await api(`/api/tasks/${taskId}/${action}`, {
    method: "POST",
    body: JSON.stringify({
      reviewer_id: reviewerId,
      feedback
    })
  });

  toast(action === "approve" ? UI_TEXT.approvedDone : UI_TEXT.rejectedDone);
  await Promise.all([refreshWorkspace(), refreshDashboard()]);
}

async function loadSettings() {
  const settings = await api("/api/settings");
  applySettings(settings);
}

function applySettings(settings) {
  state.settings = {
    default_timeout_seconds: Number(settings.default_timeout_seconds) || 0,
    default_timeout_action: String(settings.default_timeout_action || "auto_reject"),
    default_reviewer_id: normalizeReviewerId(settings.default_reviewer_id)
  };

  const form = document.getElementById("settings-form");
  if (!form) {
    return;
  }

  form.default_timeout_seconds.value = String(state.settings.default_timeout_seconds);
  form.default_timeout_action.value = state.settings.default_timeout_action;
  form.default_reviewer_id.value = state.settings.default_reviewer_id || "";

  if (state.selectedTaskId && state.activeView === "workspace") {
    void showWorkspaceDetail(state.selectedTaskId);
  }
}

function normalizeReviewerId(value) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || `${UI_TEXT.requestFailedPrefix}: ${response.status}`;
    toast(message);
    throw new Error(message);
  }

  return payload;
}

function renderStatusBadge(status) {
  const normalizedStatus = normalizeStatus(status);
  const label = STATUS_LABEL[normalizedStatus] || normalizedStatus;
  return `<span class="status-badge status-${normalizedStatus}">${escapeHtml(label)}</span>`;
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "approved" || value === "rejected" || value === "timeout" || value === "pending") {
    return value;
  }
  return "pending";
}

function formatTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function sliceText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("visible");
  window.clearTimeout(window.__toastTimer);
  window.__toastTimer = window.setTimeout(() => {
    element.classList.remove("visible");
  }, 2000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
