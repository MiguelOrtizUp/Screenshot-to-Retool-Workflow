const categorySelect = document.getElementById("categorySelect");
const hotkeyCategorySelect = document.getElementById("hotkeyCategorySelect");
const toggleManagerButton = document.getElementById("toggleManager");
const managerSection = document.getElementById("manager");
const categoryNameInput = document.getElementById("categoryName");
const categoryEndpointInput = document.getElementById("categoryEndpoint");
const categoryApiKeyInput = document.getElementById("categoryApiKey");
const saveCategoryButton = document.getElementById("saveCategory");
const cancelEditButton = document.getElementById("cancelEdit");
const categoryList = document.getElementById("categoryList");
const contextInput = document.getElementById("contextInput");
const captureSendButton = document.getElementById("captureSend");
const statusEl = document.getElementById("status");
const historyList = document.getElementById("historyList");

const state = {
  categories: [],
  editingId: null,
  hotkeyCategoryId: null,
  recentCategoryIds: []
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#fca5a5" : "#cbd5f5";
}

function sanitizeEndpoint(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const noQuery = trimmed.split("?")[0];
  return noQuery.replace(/\/+$/, "");
}

function sanitizeApiKey(value) {
  return value.trim();
}

function normalizeEndpointAndKey(endpointInput, apiKeyInput) {
  const endpointTrimmed = endpointInput.trim();
  let apiKey = sanitizeApiKey(apiKeyInput);
  let endpoint = sanitizeEndpoint(endpointTrimmed);
  if (endpointTrimmed.includes("workflowApiKey=")) {
    try {
      const url = new URL(endpointTrimmed);
      const extractedKey = url.searchParams.get("workflowApiKey");
      if (extractedKey) {
        apiKey = apiKey || extractedKey;
        url.searchParams.delete("workflowApiKey");
        endpoint = sanitizeEndpoint(url.toString());
      }
    } catch (error) {
      // Ignore invalid URL input.
    }
  }
  return { endpoint, apiKey };
}

function migrateLegacyCategory(category) {
  if (category.apiKey) {
    return category;
  }
  if (!category.endpoint) {
    return category;
  }
  try {
    const url = new URL(category.endpoint);
    const apiKey = url.searchParams.get("workflowApiKey");
    if (apiKey) {
      url.searchParams.delete("workflowApiKey");
      category.endpoint = url.toString().replace(/\?$/, "");
      category.apiKey = apiKey;
    }
  } catch (error) {
    // If URL parsing fails, keep the existing endpoint.
  }
  return category;
}

function loadCategories() {
  chrome.storage.local.get(
    { categories: [], hotkeyCategoryId: null, recentCategoryIds: [] },
    (result) => {
    let migrated = false;
    state.categories = (result.categories || []).map((category) => {
      const before = JSON.stringify(category);
      const updated = migrateLegacyCategory({ ...category });
      if (JSON.stringify(updated) !== before) {
        migrated = true;
      }
      return updated;
    });
    state.hotkeyCategoryId = result.hotkeyCategoryId || null;
    state.recentCategoryIds = result.recentCategoryIds || [];
    renderCategories();
    renderHotkeyPicker();
    if (migrated) {
      chrome.storage.local.set({ categories: state.categories });
    }
    }
  );
}

function saveCategories() {
  chrome.storage.local.set({ categories: state.categories }, () => {
    renderCategories();
    renderHotkeyPicker();
  });
}

function renderCategories() {
  const previousSelection = categorySelect.value;
  categorySelect.innerHTML = "";
  categoryList.innerHTML = "";

  if (!state.categories.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add a category first";
    categorySelect.append(option);
    return;
  }

  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.append(option);

    const item = document.createElement("div");
    item.className = "category-item";
    const maskedKey = category.apiKey
      ? `${category.apiKey.slice(0, 6)}...${category.apiKey.slice(-4)}`
      : "missing";
    item.innerHTML = `
      <div><strong>${category.name}</strong></div>
      <div>${category.endpoint}</div>
      <div class="history-meta">Key: ${maskedKey}</div>
      <div class="category-actions">
        <button data-action="edit" data-id="${category.id}" class="ghost">Edit</button>
        <button data-action="select" data-id="${category.id}" class="ghost">Use</button>
        <button data-action="delete" data-id="${category.id}">Delete</button>
      </div>
    `;
    categoryList.append(item);
  });

  if (previousSelection && state.categories.some((cat) => cat.id === previousSelection)) {
    categorySelect.value = previousSelection;
  } else {
    categorySelect.value = state.categories[0].id;
  }

  chrome.storage.local.set({ lastCategoryId: categorySelect.value });
}

function renderHotkeyPicker() {
  hotkeyCategorySelect.innerHTML = "";
  if (!state.categories.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add a category first";
    hotkeyCategorySelect.append(option);
    return;
  }

  const recent = state.recentCategoryIds
    .map((id) => state.categories.find((cat) => cat.id === id))
    .filter(Boolean)
    .slice(0, 3);

  const options = recent.length ? recent : state.categories.slice(0, 3);

  options.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    hotkeyCategorySelect.append(option);
  });

  if (state.hotkeyCategoryId && options.some((cat) => cat.id === state.hotkeyCategoryId)) {
    hotkeyCategorySelect.value = state.hotkeyCategoryId;
  } else {
    hotkeyCategorySelect.value = options[0].id;
    chrome.storage.local.set({ hotkeyCategoryId: options[0].id });
  }
}

function resetForm() {
  state.editingId = null;
  categoryNameInput.value = "";
  categoryEndpointInput.value = "";
  categoryApiKeyInput.value = "";
  saveCategoryButton.textContent = "Save";
}

toggleManagerButton.addEventListener("click", () => {
  managerSection.classList.toggle("hidden");
});

saveCategoryButton.addEventListener("click", () => {
  const name = categoryNameInput.value.trim();
  const normalized = normalizeEndpointAndKey(
    categoryEndpointInput.value,
    categoryApiKeyInput.value
  );
  const endpoint = normalized.endpoint;
  const apiKey = normalized.apiKey;
  if (!name || !endpoint || !apiKey) {
    setStatus("Category name, endpoint, and API key are required.", true);
    return;
  }

  if (state.editingId) {
    const target = state.categories.find((cat) => cat.id === state.editingId);
    if (target) {
      target.name = name;
      target.endpoint = endpoint;
      target.apiKey = apiKey;
    }
  } else {
    state.categories.push({ id: crypto.randomUUID(), name, endpoint, apiKey });
  }

  saveCategories();
  resetForm();
  setStatus("Category saved.");
});

cancelEditButton.addEventListener("click", resetForm);

categoryList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) {
    return;
  }

  if (action === "delete") {
    state.categories = state.categories.filter((cat) => cat.id !== id);
    saveCategories();
    if (state.editingId === id) {
      resetForm();
    }
    setStatus("Category removed.");
    return;
  }

  if (action === "edit") {
    const cat = state.categories.find((item) => item.id === id);
    if (cat) {
      state.editingId = id;
      categoryNameInput.value = cat.name;
      categoryEndpointInput.value = cat.endpoint;
      categoryApiKeyInput.value = cat.apiKey || "";
      saveCategoryButton.textContent = "Update";
    }
    return;
  }

  if (action === "select") {
    categorySelect.value = id;
    setStatus(`Selected ${categorySelect.selectedOptions[0].textContent}.`);
  }
});

captureSendButton.addEventListener("click", () => {
  const categoryId = categorySelect.value;
  const category = state.categories.find((cat) => cat.id === categoryId);
  if (!category) {
    setStatus("Select a category first.", true);
    return;
  }

  const context = contextInput.value.trim();
  const updatedRecent = [categoryId, ...state.recentCategoryIds.filter((id) => id !== categoryId)];
  state.recentCategoryIds = updatedRecent.slice(0, 3);
  chrome.storage.local.set({
    lastCategoryId: categoryId,
    lastContext: context,
    recentCategoryIds: state.recentCategoryIds
  });
  renderHotkeyPicker();

  setStatus("Capturing and sending...");
  captureSendButton.disabled = true;

  chrome.runtime.sendMessage(
    {
      type: "CAPTURE_AND_SEND",
      categoryId,
      endpoint: category.endpoint,
      apiKey: category.apiKey,
      context
    },
    (response) => {
      captureSendButton.disabled = false;
      if (!response) {
        setStatus("No response from background.", true);
        return;
      }
      if (!response.ok) {
        setStatus(response.error || "Capture failed.", true);
        loadHistory();
        return;
      }
      if (response.result.ok) {
        setStatus(`Sent successfully (${response.result.status}).`);
      } else {
        setStatus(`Send failed (${response.result.status}). ${response.result.responseText}`, true);
      }
      loadHistory();
    }
  );
});

loadCategories();
loadHistory();

categorySelect.addEventListener("change", () => {
  chrome.storage.local.set({ lastCategoryId: categorySelect.value });
});

hotkeyCategorySelect.addEventListener("change", () => {
  chrome.storage.local.set({ hotkeyCategoryId: hotkeyCategorySelect.value });
});

function loadHistory() {
  chrome.storage.local.get({ history: [] }, (data) => {
    const history = data.history || [];
    historyList.innerHTML = "";
    if (!history.length) {
      historyList.textContent = "No sends yet.";
      return;
    }
    history.forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `
        <div><strong>${item.categoryName}</strong> - ${item.ok ? "Sent" : "Failed"}</div>
        <div class="history-meta">${new Date(item.capturedAt).toLocaleString()}</div>
        <div class="history-meta">${item.title || item.url || ""}</div>
      `;
      historyList.append(row);
    });
  });
}

