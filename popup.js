const categorySelect = document.getElementById("categorySelect");
const hotkeyCategorySelect = document.getElementById("hotkeyCategorySelect");
const categoryPanel = document.getElementById("categoryPanel");
const hotkeyCategoryPanel = document.getElementById("hotkeyCategoryPanel");
const contextPanel = document.getElementById("contextPanel");
const actionPanel = document.getElementById("actionPanel");
const historyPanel = document.getElementById("historyPanel");
const toggleManagerButton = document.getElementById("toggleManager");
const toggleHistoryButton = document.getElementById("toggleHistory");
const managerSection = document.getElementById("manager");
const categoryNameInput = document.getElementById("categoryName");
const categoryEndpointInput = document.getElementById("categoryEndpoint");
const categoryApiKeyInput = document.getElementById("categoryApiKey");
const categoryTextOnlyCheckbox = document.getElementById("categoryTextOnly");
const saveCategoryButton = document.getElementById("saveCategory");
const cancelEditButton = document.getElementById("cancelEdit");
const categoryList = document.getElementById("categoryList");
const contextInput = document.getElementById("contextInput");
const screenshotModeContainer = document.getElementById("screenshotModeContainer");
const screenshotModeToggle = document.getElementById("screenshotModeToggle");
const captureButton = document.getElementById("captureButton");
const uploadButton = document.getElementById("uploadButton");
const fileInput = document.getElementById("fileInput");
const selectedFileLine = document.getElementById("selectedFileLine");
const fileNameText = document.getElementById("fileNameText");
const clearFileButton = document.getElementById("clearFileButton");
const sendMessageButton = document.getElementById("sendMessageButton");
const statusEl = document.getElementById("status");
const historyList = document.getElementById("historyList");

const state = {
  categories: [],
  editingId: null,
  hotkeyCategoryId: null,
  recentCategoryIds: [],
  screenshotMode: "visible-area",
  pendingFile: null
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#fca5a5" : "#cbd5f5";
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  if (!button.dataset.label) {
    button.dataset.label = button.textContent || "";
  }
  button.classList.toggle("loading", isLoading);
  button.disabled = isLoading;
  if (isLoading) {
    button.textContent = "Sending...";
  } else {
    button.textContent = button.dataset.label;
  }
}

function setPendingFile(file) {
  state.pendingFile = file;
  if (file) {
    fileNameText.textContent = `Selected: ${file.name}`;
    selectedFileLine.style.display = "flex";
    captureButton.disabled = true;
    uploadButton.textContent = "Send File";
  } else {
    fileNameText.textContent = "";
    selectedFileLine.style.display = "none";
    captureButton.disabled = false;
    uploadButton.textContent = uploadButton.dataset.label || "Upload File";
    fileInput.value = "";
  }
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
    return { ...category, textOnly: category.textOnly || false };
  }
  if (!category.endpoint) {
    return { ...category, textOnly: category.textOnly || false };
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
  return { ...category, textOnly: category.textOnly || false };
}

function loadCategories() {
  chrome.storage.local.get(
    { categories: [], hotkeyCategoryId: null, recentCategoryIds: [], screenshotMode: "visible-area" },
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
    state.screenshotMode = result.screenshotMode || "visible-area";
    renderCategories();
    renderHotkeyPicker();
    renderScreenshotMode();
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
    renderActionButtons();
    return;
  }

  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.append(option);

    const item = document.createElement("div");
    item.className = "category-item";
    const typeLabel = category.textOnly ? "Text only" : "Screenshot & File";
    const maskedKey = category.apiKey
      ? `${category.apiKey.slice(0, 6)}...${category.apiKey.slice(-4)}`
      : "missing";
    item.innerHTML = `
      <div><strong>${category.name}</strong> <span class="category-type">[${typeLabel}]</span></div>
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

  renderActionButtons();
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
  categoryTextOnlyCheckbox.checked = false;
  saveCategoryButton.textContent = "Save";
  updateCategoryFormVisibility();
}

function updateCategoryFormVisibility() {
  // No longer hiding endpoint/apiKey - all categories need them
  // This function can stay for future use if needed
}

function renderScreenshotMode() {
  screenshotModeToggle.checked = state.screenshotMode === "full-page";
}

function renderActionButtons() {
  const categoryId = categorySelect.value;
  const category = state.categories.find((cat) => cat.id === categoryId);

  // Hide all button containers first
  screenshotModeContainer.style.display = "none";
  captureButton.style.display = "none";
  uploadButton.style.display = "none";
  sendMessageButton.style.display = "none";

  if (!category) {
    return;
  }

  if (category.textOnly) {
    sendMessageButton.style.display = "block";
    setPendingFile(null);
  } else {
    screenshotModeContainer.style.display = "block";
    captureButton.style.display = "block";
    uploadButton.style.display = "block";
  }
}

toggleManagerButton.addEventListener("click", () => {
  managerSection.classList.toggle("hidden");
  const isManagerOpen = !managerSection.classList.contains("hidden");
  categoryPanel.classList.toggle("hidden", isManagerOpen);
  hotkeyCategoryPanel.classList.toggle("hidden", isManagerOpen);
  contextPanel.classList.toggle("hidden", isManagerOpen);
  actionPanel.classList.toggle("hidden", isManagerOpen);
  historyPanel.classList.toggle("hidden", isManagerOpen);
});

toggleHistoryButton.addEventListener("click", () => {
  historyList.classList.toggle("hidden");
  toggleHistoryButton.textContent = historyList.classList.contains("hidden") ? "Show" : "Hide";
});

saveCategoryButton.addEventListener("click", () => {
  const name = categoryNameInput.value.trim();
  const isTextOnly = categoryTextOnlyCheckbox.checked;

  if (!name) {
    setStatus("Category name is required.", true);
    return;
  }

  const normalized = normalizeEndpointAndKey(
    categoryEndpointInput.value,
    categoryApiKeyInput.value
  );
  const endpoint = normalized.endpoint;
  const apiKey = normalized.apiKey;

  if (!endpoint || !apiKey) {
    setStatus("Category name, endpoint, and API key are required.", true);
    return;
  }

  if (state.editingId) {
    const target = state.categories.find((cat) => cat.id === state.editingId);
    if (target) {
      target.name = name;
      target.endpoint = endpoint;
      target.apiKey = apiKey;
      target.textOnly = isTextOnly;
    }
  } else {
    state.categories.push({ id: crypto.randomUUID(), name, endpoint, apiKey, textOnly: isTextOnly });
  }

  saveCategories();
  resetForm();
  managerSection.classList.add("hidden");
  categoryPanel.classList.remove("hidden");
  hotkeyCategoryPanel.classList.remove("hidden");
  contextPanel.classList.remove("hidden");
  actionPanel.classList.remove("hidden");
  historyPanel.classList.remove("hidden");
  setStatus("Category saved.");
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  managerSection.classList.add("hidden");
  categoryPanel.classList.remove("hidden");
  hotkeyCategoryPanel.classList.remove("hidden");
  contextPanel.classList.remove("hidden");
  actionPanel.classList.remove("hidden");
  historyPanel.classList.remove("hidden");
});

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
      categoryEndpointInput.value = cat.endpoint || "";
      categoryApiKeyInput.value = cat.apiKey || "";
      categoryTextOnlyCheckbox.checked = cat.textOnly || false;
      saveCategoryButton.textContent = "Update";
      updateCategoryFormVisibility();
    }
    return;
  }

  if (action === "select") {
    categorySelect.value = id;
    renderActionButtons();
    setStatus(`Selected ${categorySelect.selectedOptions[0].textContent}.`);
  }
});

function captureScreenshot() {
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
  setButtonLoading(captureButton, true);

  chrome.runtime.sendMessage(
    {
      type: "CAPTURE_AND_SEND",
      categoryId,
      endpoint: category.endpoint,
      apiKey: category.apiKey,
      context,
      screenshotMode: state.screenshotMode
    },
    (response) => {
      setButtonLoading(captureButton, false);
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
}

captureButton.addEventListener("click", captureScreenshot);

uploadButton.addEventListener("click", () => {
  if (state.pendingFile) {
    sendPendingFile();
    return;
  }
  fileInput.click();
});

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const maxSizeBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSizeBytes) {
    setStatus(`File too large. Maximum size: 10MB. Your file: ${(file.size / (1024 * 1024)).toFixed(2)}MB`, true);
    fileInput.value = "";
    return;
  }

  setPendingFile(file);
  setStatus("File selected. Add context and click Send File.");
});

clearFileButton.addEventListener("click", () => {
  setPendingFile(null);
  setStatus("File cleared.");
});

function sendPendingFile() {
  const file = state.pendingFile;
  if (!file) return;

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

  setStatus("Reading file and sending...");
  setButtonLoading(uploadButton, true);

  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target?.result?.split(",")?.[1];
      if (!base64Data) {
        setStatus("Failed to read file.", true);
        setButtonLoading(uploadButton, false);
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "FILE_UPLOAD",
          categoryId,
          endpoint: category.endpoint,
          apiKey: category.apiKey,
          context,
          fileName: file.name,
          fileType: file.type,
          base64Data,
          sizeBytes: file.size
        },
        (response) => {
          setButtonLoading(uploadButton, false);
          fileInput.value = "";
          setPendingFile(null);
          if (!response) {
            setStatus("No response from background.", true);
            return;
          }
          if (!response.ok) {
            setStatus(response.error || "Upload failed.", true);
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
    };
    reader.onerror = () => {
      setStatus("Failed to read file.", true);
      setButtonLoading(uploadButton, false);
    };
    reader.readAsDataURL(file);
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
    setButtonLoading(uploadButton, false);
  }
}

sendMessageButton.addEventListener("click", () => {
  const categoryId = categorySelect.value;
  const category = state.categories.find((cat) => cat.id === categoryId);
  if (!category) {
    setStatus("Select a category first.", true);
    return;
  }

  const context = contextInput.value.trim();
  if (!context) {
    setStatus("Please enter a message.", true);
    return;
  }

  const updatedRecent = [categoryId, ...state.recentCategoryIds.filter((id) => id !== categoryId)];
  state.recentCategoryIds = updatedRecent.slice(0, 3);
  chrome.storage.local.set({
    lastCategoryId: categoryId,
    lastContext: context,
    recentCategoryIds: state.recentCategoryIds
  });
  renderHotkeyPicker();

  setStatus("Sending message...");
  setButtonLoading(sendMessageButton, true);

  chrome.runtime.sendMessage(
    {
      type: "SEND_MESSAGE",
      categoryId,
      endpoint: category.endpoint,
      apiKey: category.apiKey,
      context
    },
    (response) => {
      setButtonLoading(sendMessageButton, false);
      if (!response) {
        setStatus("No response from background.", true);
        return;
      }
      if (!response.ok) {
        setStatus(response.error || "Send failed.", true);
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

screenshotModeToggle.addEventListener("change", () => {
  state.screenshotMode = screenshotModeToggle.checked ? "full-page" : "visible-area";
  chrome.storage.sync.set({ screenshotMode: state.screenshotMode });
});

categoryTextOnlyCheckbox.addEventListener("change", updateCategoryFormVisibility);

categorySelect.addEventListener("change", () => {
  chrome.storage.local.set({ lastCategoryId: categorySelect.value });
  renderActionButtons();
});

loadCategories();
loadHistory();

categorySelect.addEventListener("change", () => {
  chrome.storage.local.set({ lastCategoryId: categorySelect.value });
  renderActionButtons();
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

