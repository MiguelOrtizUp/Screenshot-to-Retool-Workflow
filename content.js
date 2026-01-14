const CAPTURE_DELAY = 700;
const SLICE_PADDING = 40;
const SCROLL_WAIT_TIMEOUT = 1500;
const SCROLL_SETTLE_FRAMES = 2;

let captureInProgress = false;

function max(nums) {
  return Math.max.apply(
    Math,
    nums.filter((x) => x)
  );
}

function canActuallyScroll(element) {
  if (!element) {
    return false;
  }
  const delta = element.scrollHeight - element.clientHeight;
  if (delta <= 80) {
    return false;
  }
  const prev = element.scrollTop;
  element.scrollTop = prev + 100;
  const moved = element.scrollTop !== prev;
  element.scrollTop = prev;
  return moved;
}

function isVisible(element) {
  if (!element) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") {
    return false;
  }
  return true;
}

function getZIndex(element) {
  const zIndex = window.getComputedStyle(element).zIndex;
  if (zIndex === "auto") {
    return 0;
  }
  const parsed = Number.parseInt(zIndex, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function findOverlayContainer() {
  const elements = Array.from(document.querySelectorAll("body *"));
  const candidates = elements.filter((el) => {
    if (!isVisible(el)) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "absolute") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const largeEnough =
      rect.width >= window.innerWidth * 0.6 && rect.height >= window.innerHeight * 0.6;
    if (!largeEnough) {
      return false;
    }
    return true;
  });

  if (!candidates.length) {
    return null;
  }

  let best = null;
  candidates.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const score = rect.width * rect.height + getZIndex(el) * 1000;
    if (!best || score > best.score) {
      best = { element: el, score };
    }
  });

  return best ? best.element : null;
}

function findModalContainer() {
  const modalSelectors = [
    "[aria-modal='true']",
    "[role='dialog']",
    ".modal",
    ".Modal",
    ".dialog",
    ".Dialog",
    "[class*='modal']",
    "[class*='Modal']"
  ];

  const candidates = modalSelectors
    .map((selector) => Array.from(document.querySelectorAll(selector)))
    .flat()
    .filter(isVisible);

  const modalCandidate = (() => {
    if (!candidates.length) {
      return null;
    }
    let best = null;
    candidates.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const score = rect.width * rect.height + getZIndex(el) * 1000;
      if (!best || score > best.score) {
        best = { element: el, score };
      }
    });
    return best ? best.element : null;
  })();

  return modalCandidate || findOverlayContainer();
}

function findScrollableWithin(root) {
  const candidates = Array.from(root.querySelectorAll("*"));
  let best = null;
  const consider = (el) => {
    if (!isVisible(el)) {
      return;
    }
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const scrollableStyle =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    const bigEnough =
      el.clientHeight >= window.innerHeight * 0.4 &&
      el.clientWidth >= window.innerWidth * 0.4;
    if (!scrollableStyle || !bigEnough || !canActuallyScroll(el)) {
      return;
    }
    const score = el.scrollHeight * el.clientWidth;
    if (!best || score > best.score) {
      best = { element: el, score };
    }
  };

  candidates.forEach(consider);
  return best ? best.element : null;
}

function findScrollableElement() {
  const scrollingElement = document.scrollingElement || document.documentElement;
  if (scrollingElement && canActuallyScroll(scrollingElement)) {
    return null;
  }

  const modal = findModalContainer();
  if (modal) {
    const modalScrollable = findScrollableWithin(modal);
    return modalScrollable || modal;
  }

  const selectorCandidates = [
    "main",
    "article",
    "[role='main']",
    ".scaffold-layout__main",
    ".scaffold-layout__content",
    ".scaffold-layout",
    ".application-outlet",
    ".post",
    ".post-content",
    ".reader-content",
    ".main-content"
  ];

  const candidates = selectorCandidates
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);

  let best = null;
  const consider = (el) => {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const scrollableStyle =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    const bigEnough =
      el.clientHeight >= window.innerHeight * 0.4 &&
      el.clientWidth >= window.innerWidth * 0.4;
    if (!scrollableStyle || !bigEnough || !canActuallyScroll(el)) {
      return;
    }
    const score = el.scrollHeight * el.clientWidth;
    if (!best || score > best.score) {
      best = { element: el, score };
    }
  };

  candidates.forEach(consider);

  if (!best) {
    const all = Array.from(document.querySelectorAll("body *"));
    all.forEach(consider);
  }

  return best ? best.element : null;
}

function findStickyHeaderHeight() {
  const elements = Array.from(document.querySelectorAll("body *"));
  let maxHeight = 0;
  elements.forEach((el) => {
    if (!isVisible(el)) {
      return;
    }
    const style = window.getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") {
      return;
    }
    const rect = el.getBoundingClientRect();
    const nearTop = rect.top >= -5 && rect.top <= 5;
    const wideEnough = rect.width >= window.innerWidth * 0.6;
    if (!nearTop || !wideEnough) {
      return;
    }
    maxHeight = Math.max(maxHeight, rect.height);
  });
  return Math.floor(maxHeight);
}

function getPositions() {
  const body = document.body;
  const originalBodyOverflowYStyle = body ? body.style.overflowY : "";
  const originalX = window.scrollX;
  const originalY = window.scrollY;
  const originalOverflowStyle = document.documentElement.style.overflow;
  const originalScrollBehavior = document.documentElement.style.scrollBehavior;
  const originalBodyScrollBehavior = body ? body.style.scrollBehavior : "";
  const scrollTarget = findScrollableElement();
  const useWindow = !scrollTarget;
  const originalScrollTop = scrollTarget ? scrollTarget.scrollTop : 0;
  const headerHeight = findStickyHeaderHeight();

  if (body) {
    body.style.overflowY = "visible";
  }
  document.documentElement.style.scrollBehavior = "auto";
  if (body) {
    body.style.scrollBehavior = "auto";
  }

  let fullWidth = 0;
  let fullHeight = 0;
  let windowWidth = window.innerWidth;
  let windowHeight = window.innerHeight;
  let clipRect = null;

  if (useWindow) {
    const widths = [
      document.documentElement.clientWidth,
      body ? body.scrollWidth : 0,
      document.documentElement.scrollWidth,
      body ? body.offsetWidth : 0,
      document.documentElement.offsetWidth
    ];
    const heights = [
      document.documentElement.clientHeight,
      body ? body.scrollHeight : 0,
      document.documentElement.scrollHeight,
      body ? body.offsetHeight : 0,
      document.documentElement.offsetHeight
    ];
    fullWidth = max(widths);
    fullHeight = max(heights);
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
  } else {
    const rect = scrollTarget.getBoundingClientRect();
    fullWidth = scrollTarget.clientWidth;
    fullHeight = scrollTarget.scrollHeight;
    windowHeight = scrollTarget.clientHeight;
    clipRect = {
      x: Math.max(0, Math.floor(rect.left)),
      y: Math.max(0, Math.floor(rect.top)),
      width: Math.floor(rect.width),
      height: Math.floor(rect.height)
    };
  }
  const arrangements = [];
  const scrollPad = 200;
  const yDelta = windowHeight - (windowHeight > scrollPad ? scrollPad : 0) - SLICE_PADDING;
  const xDelta = windowWidth;
  let yPos = 0;
  let xPos;

  if (fullWidth <= xDelta + 1) {
    fullWidth = xDelta;
  }

  document.documentElement.style.overflow = "hidden";

  while (yPos <= fullHeight - windowHeight) {
    xPos = 0;
    while (xPos < fullWidth) {
      arrangements.push([xPos, yPos]);
      xPos += xDelta;
    }
    yPos += yDelta;
  }

  if (!arrangements.length || arrangements[arrangements.length - 1][1] !== fullHeight - windowHeight) {
    arrangements.push([0, Math.max(0, fullHeight - windowHeight)]);
  }

  const numArrangements = arrangements.length;

  function cleanUp() {
    document.documentElement.style.overflow = originalOverflowStyle;
    document.documentElement.style.scrollBehavior = originalScrollBehavior;
    if (body) {
      body.style.overflowY = originalBodyOverflowYStyle;
      body.style.scrollBehavior = originalBodyScrollBehavior;
    }
    window.scrollTo(originalX, originalY);
    if (scrollTarget) {
      scrollTarget.scrollTop = originalScrollTop;
    }
  }

  return {
    arrangements,
    numArrangements,
    fullWidth,
    fullHeight,
    windowWidth,
    cleanUp,
    useWindow,
    clipRect,
    scrollTarget,
    headerHeight
  };
}

function waitForScroll(targetX, targetY, scrollTarget, useWindow) {
  return new Promise((resolve) => {
    let stableFrames = 0;
    const start = Date.now();

    function tick() {
      const currentX = useWindow ? window.scrollX : 0;
      const currentY = useWindow ? window.scrollY : scrollTarget.scrollTop;
      const dx = Math.abs(currentX - targetX);
      const dy = Math.abs(currentY - targetY);
      if (dx <= 1 && dy <= 1) {
        stableFrames += 1;
        if (stableFrames >= SCROLL_SETTLE_FRAMES) {
          resolve();
          return;
        }
      } else {
        stableFrames = 0;
      }

      if (Date.now() - start > SCROLL_WAIT_TIMEOUT) {
        resolve();
        return;
      }

      window.requestAnimationFrame(tick);
    }

    window.requestAnimationFrame(tick);
  });
}

async function startCapture() {
  if (captureInProgress) {
    throw new Error("Capture already in progress.");
  }

  captureInProgress = true;
  const {
    arrangements,
    numArrangements,
    fullWidth,
    fullHeight,
    windowWidth,
    cleanUp,
    useWindow,
    clipRect,
    scrollTarget,
    headerHeight
  } = getPositions();

  return new Promise((resolve, reject) => {
    (function processArrangements() {
      if (!arrangements.length) {
        cleanUp();
        captureInProgress = false;
        chrome.runtime.sendMessage({ type: "CAPTURE_DONE" }, () => resolve());
        return;
      }

      const next = arrangements.shift();
      const x = next[0];
      const y = next[1];

      if (useWindow) {
        window.scrollTo(x, y);
      } else {
        scrollTarget.scrollTop = y;
      }

      const data = {
        x: useWindow ? window.scrollX : 0,
        y: useWindow ? window.scrollY : scrollTarget.scrollTop,
        complete: (numArrangements - arrangements.length) / numArrangements,
        windowWidth,
        totalWidth: fullWidth,
        totalHeight: fullHeight,
        devicePixelRatio: window.devicePixelRatio,
        useWindow,
        clipRect,
        headerHeight
      };

      window.setTimeout(() => {
        waitForScroll(x, y, scrollTarget, useWindow).then(() => {
          chrome.runtime.sendMessage({ type: "CAPTURE_SLICE", data }, (response) => {
            if (!response || response.ok === false) {
              cleanUp();
              captureInProgress = false;
              const message = response?.error || "Capture failed.";
              reject(new Error(message));
              return;
            }
            processArrangements();
          });
        });
      }, CAPTURE_DELAY);
    })();
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "START_CAPTURE") {
    return;
  }

  startCapture()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
