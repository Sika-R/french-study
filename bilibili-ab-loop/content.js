(() => {
  const state = {
    loopEnabled: false,
    pointA: null,
    pointB: null,
    video: null,
    panel: null,
    observer: null,
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
  };

  function formatTime(seconds) {
    if (seconds === null || isNaN(seconds)) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
  }

  function onTimeUpdate() {
    if (!state.loopEnabled) return;
    if (state.pointA === null || state.pointB === null) return;
    if (state.video.currentTime >= state.pointB) {
      state.video.currentTime = state.pointA;
    }
  }

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'bab-panel';
    panel.innerHTML = `
      <div id="bab-header">
        <span id="bab-title">A-B Loop</span>
      </div>
      <div id="bab-points">
        <button id="bab-set-a">Set A</button>
        <span id="bab-time-a" class="bab-time">A: --:--</span>
        <button id="bab-set-b">Set B</button>
        <span id="bab-time-b" class="bab-time">B: --:--</span>
      </div>
      <div id="bab-controls">
        <button id="bab-toggle">Enable Loop</button>
        <button id="bab-clear">Clear</button>
      </div>
      <div id="bab-speed">
        <label for="bab-speed-select">Speed:</label>
        <select id="bab-speed-select">
          <option value="0.25">0.25x</option>
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1" selected>1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
    `;

    // Drag logic
    const header = panel.querySelector('#bab-header');
    header.addEventListener('mousedown', (e) => {
      state.dragging = true;
      const rect = panel.getBoundingClientRect();
      state.dragOffsetX = e.clientX - rect.left;
      state.dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!state.dragging) return;
      panel.style.left = `${e.clientX - state.dragOffsetX}px`;
      panel.style.top = `${e.clientY - state.dragOffsetY}px`;
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
      state.dragging = false;
    });

    // Button logic
    panel.querySelector('#bab-set-a').addEventListener('click', () => {
      if (!state.video) return;
      state.pointA = state.video.currentTime;
      panel.querySelector('#bab-time-a').textContent = `A: ${formatTime(state.pointA)}`;
    });

    panel.querySelector('#bab-set-b').addEventListener('click', () => {
      if (!state.video) return;
      state.pointB = state.video.currentTime;
      panel.querySelector('#bab-time-b').textContent = `B: ${formatTime(state.pointB)}`;
    });

    panel.querySelector('#bab-toggle').addEventListener('click', () => {
      if (state.pointA === null || state.pointB === null) return;
      const a = Math.min(state.pointA, state.pointB);
      const b = Math.max(state.pointA, state.pointB);
      state.pointA = a;
      state.pointB = b;
      panel.querySelector('#bab-time-a').textContent = `A: ${formatTime(a)}`;
      panel.querySelector('#bab-time-b').textContent = `B: ${formatTime(b)}`;
      state.loopEnabled = !state.loopEnabled;
      const btn = panel.querySelector('#bab-toggle');
      btn.textContent = state.loopEnabled ? 'Disable Loop' : 'Enable Loop';
      btn.classList.toggle('bab-active', state.loopEnabled);
    });

    panel.querySelector('#bab-clear').addEventListener('click', () => {
      state.loopEnabled = false;
      state.pointA = null;
      state.pointB = null;
      panel.querySelector('#bab-time-a').textContent = 'A: --:--';
      panel.querySelector('#bab-time-b').textContent = 'B: --:--';
      const btn = panel.querySelector('#bab-toggle');
      btn.textContent = 'Enable Loop';
      btn.classList.remove('bab-active');
    });

    panel.querySelector('#bab-speed-select').addEventListener('change', (e) => {
      if (!state.video) return;
      state.video.playbackRate = parseFloat(e.target.value);
    });

    return panel;
  }

  function attachToVideo(video) {
    if (state.video === video) return;
    if (state.video) {
      state.video.removeEventListener('timeupdate', onTimeUpdate);
    }
    state.video = video;
    video.addEventListener('timeupdate', onTimeUpdate);

    // Sync speed select to current playback rate
    if (state.panel) {
      const select = state.panel.querySelector('#bab-speed-select');
      if (select) select.value = String(video.playbackRate || 1);
    }
  }

  function injectPanel() {
    if (state.panel && document.body.contains(state.panel)) return;
    const panel = createPanel();
    state.panel = panel;
    document.body.appendChild(panel);
  }

  function findVideo() {
    return (
      document.querySelector('.bilibili-player-video video') ||
      document.querySelector('video')
    );
  }

  function cleanup() {
    if (state.video) {
      state.video.removeEventListener('timeupdate', onTimeUpdate);
      state.video = null;
    }
    if (state.panel && state.panel.parentNode) {
      state.panel.parentNode.removeChild(state.panel);
      state.panel = null;
    }
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    state.loopEnabled = false;
    state.pointA = null;
    state.pointB = null;
  }

  function init() {
    if (!window.location.pathname.startsWith('/video/')) return;

    const video = findVideo();
    if (video) {
      attachToVideo(video);
      injectPanel();
    } else {
      // Wait for video element via MutationObserver
      const observer = new MutationObserver(() => {
        const v = findVideo();
        if (v) {
          observer.disconnect();
          state.observer = null;
          attachToVideo(v);
          injectPanel();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      state.observer = observer;
    }
  }

  // Full-screen support: move panel in/out of fullscreen container
  document.addEventListener('fullscreenchange', () => {
    if (!state.panel) return;
    if (document.fullscreenElement) {
      document.fullscreenElement.appendChild(state.panel);
    } else {
      document.body.appendChild(state.panel);
    }
  });

  // SPA navigation support
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    window.dispatchEvent(new Event('bab-navigate'));
  };
  window.addEventListener('popstate', () => {
    window.dispatchEvent(new Event('bab-navigate'));
  });
  window.addEventListener('bab-navigate', () => {
    cleanup();
    // Small delay to let Bilibili render the new page
    setTimeout(init, 800);
  });

  init();
})();
