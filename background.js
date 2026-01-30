const MAX_CANVAS_DIMENSION = 16000;
const CAPTURE_THROTTLE_MS = 650;

const captureSessions = new Map();

function dataUriToBlob(dataUri) {
  const parts = dataUri.split(",");
  const base64 = parts[1];
  const mime = parts[0].split(":")[1].split(";")[0];
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

function buildEndpoint(endpoint, apiKey) {
  if (!endpoint || !apiKey) {
    return endpoint || "";
  }
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}workflowApiKey=${encodeURIComponent(apiKey)}`;
}

async function sendToRetool(endpoint, payload, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const timeoutMs = options.timeoutMs || 15000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const responseText = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        responseText
      };
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      const delay = 500 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Request failed.");
}

function storeHistory(entry) {
  chrome.storage.local.get({ history: [], categories: [] }, (data) => {
    const categories = data.categories || [];
    const category = categories.find((item) => item.id === entry.categoryId);
    const historyEntry = {
      id: crypto.randomUUID(),
      capturedAt: entry.capturedAt,
      categoryId: entry.categoryId,
      categoryName: category ? category.name : "Unknown",
      url: entry.url,
      title: entry.title,
      status: entry.status,
      ok: entry.ok
    };
    const next = [historyEntry, ...(data.history || [])].slice(0, 10);
    chrome.storage.local.set({ history: next });
  });
}

function startCaptureSession(tabId, resolve, reject) {
  const timeoutId = setTimeout(() => {
    const session = captureSessions.get(tabId);
    if (session) {
      captureSessions.delete(tabId);
      reject(new Error("Capture timed out."));
    }
  }, 60000);

  captureSessions.set(tabId, {
    canvas: null,
    ctx: null,
    totalWidth: 0,
    totalHeight: 0,
    lastCaptureAt: 0,
    resolve,
    reject,
    timeoutId
  });
}

function endCaptureSession(tabId) {
  const session = captureSessions.get(tabId);
  if (session?.timeoutId) {
    clearTimeout(session.timeoutId);
  }
  captureSessions.delete(tabId);
}

async function captureFullPage(tabId) {
  return new Promise((resolve, reject) => {
    startCaptureSession(tabId, resolve, reject);

    chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
      if (chrome.runtime.lastError) {
        endCaptureSession(tabId);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      chrome.tabs.sendMessage(tabId, { type: "START_CAPTURE" }, (response) => {
        if (chrome.runtime.lastError) {
          endCaptureSession(tabId);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.ok === false) {
          endCaptureSession(tabId);
          reject(new Error(response.error || "Capture failed."));
        }
      });
    });
  });
}

async function runCaptureAndSend({ categoryId, endpoint, apiKey, context, screenshotMode = "visible-area" }) {
  const tab = await new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!tabs || !tabs.length) {
        reject(new Error("No active tab found."));
        return;
      }
      resolve(tabs[0]);
    });
  });

  let screenshotBase64;
  if (screenshotMode === "visible-area") {
    // Direct visible area capture without stitching
    screenshotBase64 = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 85 }, (dataUri) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        const base64 = dataUri.split(",")[1];
        resolve(base64);
      });
    });
  } else {
    // Full page capture with stitching
    screenshotBase64 = await captureFullPage(tab.id);
  }

  const capturedAt = new Date().toISOString();
  const body = {
    categoryId,
    context: context || "",
    url: tab.url,
    title: tab.title,
    capturedAt,
    file: {
      base64Data: screenshotBase64,
      name: "screenshot.jpg",
      type: "image/jpeg",
      sizeBytes: Math.ceil((screenshotBase64.length * 3) / 4)
    }
  };
  const result = await sendToRetool(buildEndpoint(endpoint, apiKey), body, { maxAttempts: 3, timeoutMs: 15000 });
  return { result, meta: { url: tab.url, title: tab.title, capturedAt } };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CAPTURE_AND_SEND") {
    (async () => {
      setBadge("", "#38bdf8");
    return await runCaptureAndSend({
      categoryId: message.categoryId,
      endpoint: message.endpoint,
      apiKey: message.apiKey,
      context: message.context,
      screenshotMode: message.screenshotMode || "visible-area"
    });
  })()
      .then((payload) => {
        setBadge("", "#38bdf8");
        storeHistory({
          categoryId: message.categoryId,
          capturedAt: payload.meta.capturedAt,
          url: payload.meta.url,
          title: payload.meta.title,
          status: payload.result.status,
          ok: payload.result.ok
        });
        sendResponse({ ok: true, result: payload.result });
      })
      .catch((error) => {
        setBadge("!", "#ef4444");
        storeHistory({
          categoryId: message.categoryId,
          capturedAt: new Date().toISOString(),
          url: "",
          title: "",
          status: 0,
          ok: false
        });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "FILE_UPLOAD") {
    (async () => {
      setBadge("", "#38bdf8");
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!tabs || !tabs.length) {
            reject(new Error("No active tab found."));
            return;
          }
          resolve(tabs[0]);
        });
      });

      const capturedAt = new Date().toISOString();
      const body = {
        categoryId: message.categoryId,
        context: message.context || "",
        title: tab.title,
        capturedAt,
        file: {
          base64Data: message.base64Data,
          name: message.fileName,
          type: message.fileType,
          sizeBytes: message.sizeBytes
        }
      };
      const result = await sendToRetool(buildEndpoint(message.endpoint, message.apiKey), body, { maxAttempts: 3, timeoutMs: 15000 });
      return { result, meta: { url: tab.url, title: tab.title, capturedAt } };
    })()
      .then((payload) => {
        setBadge("", "#38bdf8");
        storeHistory({
          categoryId: message.categoryId,
          capturedAt: payload.meta.capturedAt,
          url: payload.meta.url,
          title: payload.meta.title,
          status: payload.result.status,
          ok: payload.result.ok
        });
        sendResponse({ ok: true, result: payload.result });
      })
      .catch((error) => {
        setBadge("!", "#ef4444");
        storeHistory({
          categoryId: message.categoryId,
          capturedAt: new Date().toISOString(),
          url: "",
          title: "",
          status: 0,
          ok: false
        });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "SEND_MESSAGE") {
    (async () => {
      setBadge("", "#38bdf8");
      const tab = await new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!tabs || !tabs.length) {
            reject(new Error("No active tab found."));
            return;
          }
          resolve(tabs[0]);
        });
      });

      const capturedAt = new Date().toISOString();
      const body = {
        categoryId: message.categoryId,
        url: tab.url,
        title: tab.title,
        capturedAt,
        message: message.context || ""
      };
      const result = await sendToRetool(buildEndpoint(message.endpoint, message.apiKey), body, { maxAttempts: 3, timeoutMs: 15000 });
      return { result, meta: { url: tab.url, title: tab.title, capturedAt } };
    })()
      .then((payload) => {
        setBadge("", "#38bdf8");
        storeHistory({
          categoryId: message.categoryId,
          capturedAt: payload.meta.capturedAt,
          url: payload.meta.url,
          title: payload.meta.title,
          status: payload.result.status,
          ok: payload.result.ok
        });
        sendResponse({ ok: true, result: payload.result });
      })
      .catch((error) => {
        setBadge("!", "#ef4444");
        storeHistory({
          categoryId: message.categoryId,
          capturedAt: new Date().toISOString(),
          url: "",
          title: "",
          status: 0,
          ok: false
        });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type === "CAPTURE_SLICE") {
    const tabId = sender?.tab?.id;
    const windowId = sender?.tab?.windowId;
    const session = captureSessions.get(tabId);
    if (!session) {
      sendResponse({ ok: false, error: "No active capture session." });
      return true;
    }

    (async () => {
      if (session.lastCaptureAt && Date.now() - session.lastCaptureAt < CAPTURE_THROTTLE_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, CAPTURE_THROTTLE_MS - (Date.now() - session.lastCaptureAt))
        );
      }
      const dataUri = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 85 });
      session.lastCaptureAt = Date.now();
      const bitmap = await createImageBitmap(dataUriToBlob(dataUri));

      let { x, y, totalWidth, totalHeight, windowWidth, useWindow, clipRect, headerHeight } =
        message.data;
      let scale = 1;
      if (windowWidth && windowWidth !== bitmap.width) {
        scale = bitmap.width / windowWidth;
      }
      let headerCrop = y > 0 && headerHeight ? Math.floor(headerHeight * scale) : 0;
      if (headerCrop > bitmap.height - 1) {
        headerCrop = Math.max(0, bitmap.height - 1);
      }

      if (useWindow === false && clipRect) {
        const rectX = Math.floor(clipRect.x * scale);
        const rectY = Math.floor(clipRect.y * scale) + headerCrop;
        const rectW = Math.floor(clipRect.width * scale);
        const rectH = Math.max(1, Math.floor(clipRect.height * scale) - headerCrop);
        let targetWidth = Math.floor(totalWidth * scale);
        let targetHeight = Math.floor(totalHeight * scale);
        if (!targetWidth || Math.abs(targetWidth - rectW) > 4) {
          targetWidth = rectW;
        }
        if (!targetHeight) {
          targetHeight = rectH;
        }
        const drawY = Math.floor(y * scale) + headerCrop;

        if (!session.canvas) {
          if (targetWidth > MAX_CANVAS_DIMENSION || targetHeight > MAX_CANVAS_DIMENSION) {
            throw new Error("Page too large to capture.");
          }
          session.totalWidth = targetWidth;
          session.totalHeight = targetHeight;
          session.canvas = new OffscreenCanvas(targetWidth, targetHeight);
          session.ctx = session.canvas.getContext("2d");
        }

        session.ctx.drawImage(bitmap, rectX, rectY, rectW, rectH, 0, drawY, rectW, rectH);
      } else {
        x = Math.floor(x * scale);
        y = Math.floor(y * scale) + headerCrop;
        totalWidth = Math.floor(totalWidth * scale);
        totalHeight = Math.floor(totalHeight * scale);

        if (!session.canvas) {
          if (totalWidth > MAX_CANVAS_DIMENSION || totalHeight > MAX_CANVAS_DIMENSION) {
            throw new Error("Page too large to capture.");
          }
          session.totalWidth = totalWidth;
          session.totalHeight = totalHeight;
          session.canvas = new OffscreenCanvas(totalWidth, totalHeight);
          session.ctx = session.canvas.getContext("2d");
        }

        const sourceY = headerCrop;
        const sourceHeight = Math.max(1, bitmap.height - headerCrop);
        session.ctx.drawImage(bitmap, 0, sourceY, bitmap.width, sourceHeight, x, y, bitmap.width, sourceHeight);
      }
      return true;
    })()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        endCaptureSession(tabId);
        sendResponse({ ok: false, error: error.message });
      });

    return true;
  }

  if (message?.type === "CAPTURE_DONE") {
    const tabId = sender?.tab?.id;
    const session = captureSessions.get(tabId);
    if (!session || !session.canvas) {
      sendResponse({ ok: false, error: "No capture data available." });
      return true;
    }

    (async () => {
      const blob = await session.canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
      const buffer = await blob.arrayBuffer();
      return arrayBufferToBase64(buffer);
    })()
      .then((base64) => {
        endCaptureSession(tabId);
        session.resolve(base64);
        sendResponse({ ok: true });
      })
      .catch((error) => {
        endCaptureSession(tabId);
        session.reject(error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "capture-send") {
    return;
  }

  chrome.storage.local.get(
    { categories: [], lastCategoryId: null, lastContext: "", hotkeyCategoryId: null },
    async (data) => {
      try {
        const selectedId = data.hotkeyCategoryId || data.lastCategoryId;
        const category = data.categories.find((item) => item.id === selectedId);
        if (!category) {
          setBadge("!", "#ef4444");
          return;
        }
        setBadge("...", "#38bdf8");
        const payload = await runCaptureAndSend({
          categoryId: category.id,
          endpoint: category.endpoint,
          apiKey: category.apiKey,
          context: data.lastContext
        });
        if (payload.result.ok) {
          setBadge("", "#38bdf8");
        } else {
          setBadge("!", "#ef4444");
        }
        storeHistory({
          categoryId: category.id,
          capturedAt: payload.meta.capturedAt,
          url: payload.meta.url,
          title: payload.meta.title,
          status: payload.result.status,
          ok: payload.result.ok
        });
      } catch (error) {
        setBadge("!", "#ef4444");
      }
    }
  );
});
