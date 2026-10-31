// Read-only browser diagnostics injected only by preview-performance.mjs.
(() => {
  if (window.__localPerformanceProbe) return;
  window.__localPerformanceProbe = true;

  const supported = window.PerformanceObserver?.supportedEntryTypes ?? [];
  const paint = {};
  const longTasks = [];
  const sessions = [];
  const observers = [];
  let lcp = null;
  let cls = 0;
  let clsWindow = { start: 0, last: 0, value: 0 };
  let layoutShiftCount = 0;
  let currentSession = null;
  let frame = null;
  let publishTimer = null;
  let reportElement = null;

  const rounded = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

  function observe(type, callback) {
    if (!supported.includes(type)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        callback(list.getEntries());
        schedulePublish();
      });
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // Unsupported entry types are reported, without changing the page.
    }
  }

  observe('paint', (entries) => {
    for (const entry of entries) paint[entry.name] = rounded(entry.startTime);
  });

  observe('largest-contentful-paint', (entries) => {
    const entry = entries.at(-1);
    if (entry) {
      lcp = {
        timeMs: rounded(entry.renderTime || entry.loadTime || entry.startTime),
        size: entry.size,
        url: entry.url || null,
        element: entry.element?.tagName.toLowerCase() ?? null
      };
    }
  });

  observe('layout-shift', (entries) => {
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      layoutShiftCount += 1;
      if (entry.startTime - clsWindow.last > 1000 || entry.startTime - clsWindow.start > 5000) {
        clsWindow = { start: entry.startTime, last: entry.startTime, value: entry.value };
      } else {
        clsWindow.last = entry.startTime;
        clsWindow.value += entry.value;
      }
      cls = Math.max(cls, clsWindow.value);
    }
  });

  observe('longtask', (entries) => {
    for (const entry of entries) {
      longTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
    }
    // Bound diagnostic memory during a long manual session.
    if (longTasks.length > 500) longTasks.splice(0, longTasks.length - 500);
  });

  observe('resource', () => {});
  observe('navigation', () => {});

  function taskSummary(tasks) {
    return {
      count: tasks.length,
      totalDurationMs: rounded(tasks.reduce((sum, task) => sum + task.durationMs, 0)),
      maxDurationMs: rounded(Math.max(0, ...tasks.map((task) => task.durationMs)))
    };
  }

  function sessionSummary(session, now) {
    const intervals = session.intervals;
    const sorted = [...intervals].sort((left, right) => left - right);
    const end = session.endMs ?? now;
    return {
      startMs: rounded(session.startMs),
      endMs: rounded(end),
      active: session.endMs == null,
      scrollEvents: session.scrollEvents,
      frameIntervals: intervals.length,
      p95FrameMs: rounded(sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : 0),
      maxFrameMs: rounded(sorted.at(-1) ?? 0),
      framesOver50Ms: intervals.filter((interval) => interval > 50).length,
      longTasks: taskSummary(longTasks.filter((task) => task.startMs >= session.startMs && task.startMs <= end))
    };
  }

  function navigationReport() {
    const entry = performance.getEntriesByType('navigation')[0];
    if (!entry) return null;
    return {
      type: entry.type,
      responseStatus: entry.responseStatus ?? null,
      protocol: entry.nextHopProtocol,
      // responseStart is the navigation-to-first-byte time; the second value excludes connection setup.
      timeToFirstByteMs: rounded(entry.responseStart - entry.startTime),
      requestToFirstByteMs: rounded(entry.responseStart - entry.requestStart),
      responseDownloadMs: rounded(entry.responseEnd - entry.responseStart),
      domContentLoadedMs: rounded(entry.domContentLoadedEventEnd),
      loadEventEndMs: rounded(entry.loadEventEnd),
      durationMs: rounded(entry.duration),
      transferBytes: entry.transferSize,
      encodedBodyBytes: entry.encodedBodySize,
      decodedBodyBytes: entry.decodedBodySize
    };
  }

  function resourceReport() {
    const entries = performance.getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).pathname !== '/__performance-probe.js');
    return {
      count: entries.length,
      transferBytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0),
      encodedBodyBytes: entries.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      decodedBodyBytes: entries.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
      // Cross-origin resources without Timing-Allow-Origin can report zero bytes.
      entries: entries.map((entry) => ({
        url: entry.name,
        initiator: entry.initiatorType,
        responseStatus: entry.responseStatus ?? null,
        startMs: rounded(entry.startTime),
        durationMs: rounded(entry.duration),
        protocol: entry.nextHopProtocol,
        transferBytes: entry.transferSize,
        encodedBodyBytes: entry.encodedBodySize,
        decodedBodyBytes: entry.decodedBodySize
      }))
    };
  }

  function publish() {
    publishTimer = null;
    if (!document.body) return;
    if (!reportElement?.isConnected) {
      reportElement = document.getElementById('performance-report');
      if (!reportElement) {
        reportElement = document.createElement('output');
        reportElement.id = 'performance-report';
        reportElement.hidden = true;
        reportElement.setAttribute('aria-hidden', 'true');
        document.body.appendChild(reportElement);
      }
    }
    const now = performance.now();
    const sampledSessions = currentSession ? [...sessions, currentSession] : sessions;
    reportElement.textContent = JSON.stringify({
      diagnostic: 'local-preview-only',
      url: location.href,
      capturedAfterNavigationMs: rounded(now),
      visibility: document.visibilityState,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      supportedEntryTypes: supported,
      navigation: navigationReport(),
      paint,
      lcp,
      cls: Number(cls.toFixed(4)),
      layoutShiftCount,
      resources: resourceReport(),
      longTasks: {
        ...taskSummary(longTasks),
        entries: longTasks.map((task) => ({ startMs: rounded(task.startMs), durationMs: rounded(task.durationMs) }))
      },
      scroll: { samplingTailMs: 750, sessions: sampledSessions.map((session) => sessionSummary(session, now)) }
    }, null, 2);
  }

  function schedulePublish() {
    if (publishTimer === null) publishTimer = setTimeout(publish, 250);
  }

  function finishSession(now) {
    if (!currentSession) return;
    currentSession.endMs = now;
    sessions.push(currentSession);
    if (sessions.length > 20) sessions.shift();
    currentSession = null;
    frame = null;
    schedulePublish();
  }

  function sampleFrame(now) {
    frame = null;
    if (!currentSession) return;
    if (currentSession.lastFrameMs !== null) {
      currentSession.intervals.push(now - currentSession.lastFrameMs);
      if (currentSession.intervals.length > 6000) currentSession.intervals.shift();
    }
    currentSession.lastFrameMs = now;
    if (now >= currentSession.untilMs || document.hidden) {
      finishSession(now);
      return;
    }
    frame = requestAnimationFrame(sampleFrame);
  }

  document.addEventListener('scroll', () => {
    if (document.hidden) return;
    const now = performance.now();
    if (!currentSession) {
      currentSession = { startMs: now, endMs: null, untilMs: now + 750, lastFrameMs: null, scrollEvents: 0, intervals: [] };
    }
    currentSession.untilMs = now + 750;
    currentSession.scrollEvents += 1;
    if (frame === null) frame = requestAnimationFrame(sampleFrame);
    schedulePublish();
  }, { passive: true, capture: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && currentSession) {
      if (frame !== null) cancelAnimationFrame(frame);
      finishSession(performance.now());
    }
    schedulePublish();
  });
  document.addEventListener('DOMContentLoaded', schedulePublish, { once: true });
  window.addEventListener('load', () => {
    schedulePublish();
    setTimeout(schedulePublish, 1000);
  }, { once: true });
  schedulePublish();
})();
