// main.js

import 'aframe';

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  scene.addEventListener('loaded', () => {
    console.log('Scene loaded');

    // ===== 1. INTRO PANEL SETUP =====
    const textures = ['#intro1', '#intro2', '#intro3', '#intro4'];

    const img = document.querySelector('#intro-image-3d');
    const btn = document.querySelector('#intro-button-3d');
    const prevBtn = document.querySelector('#intro-prev');
    const nextBtn = document.querySelector('#intro-next');
    const progressBars = Array.from(document.querySelectorAll('.progress-bar'));

    let currentIndex = 0;

    function updateIntroTexture() {
      if (!img) return;
      img.setAttribute('src', textures[currentIndex]);
      console.log('Updated intro texture to', textures[currentIndex]);
    }

    function updateProgressBars() {
      progressBars.forEach((bar, index) => {
        bar.classList.toggle('active', index === currentIndex);
      });
    }

    function goToScreen(index) {
      currentIndex = index;
      updateIntroTexture();
      updateProgressBars();
    }

    updateIntroTexture();
    updateProgressBars();

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % textures.length;
        goToScreen(currentIndex);
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + textures.length) % textures.length;
        goToScreen(currentIndex);
      });
    }

    const ctaText = document.querySelector('#cta-text');

    function showCTAText(message, duration = 2000) {
      if (!ctaText) return;

      ctaText.textContent = message;
      ctaText.style.opacity = '1';

      setTimeout(() => {
        ctaText.style.opacity = '0';
      }, duration);
    }

    function startGame() {
      const introOverlay = document.querySelector('#intro-overlay');
      if (introOverlay) {
        introOverlay.style.opacity = '0';
        introOverlay.style.pointerEvents = 'none';
      }

      showCTAText('Now you must protect the DT student from their reality. ');

      setTimeout(() => {
        const timer = document.querySelector('.timer');
        const minutesSpan = document.querySelector('.minutes');
        const secondsSpan = document.querySelector('.seconds');

        if (!timer || !minutesSpan || !secondsSpan) return;

        timer.style.display = 'block';

        let timeLeft = 5 * 60;

        const timerInterval = setInterval(() => {
          if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timer.style.display = 'none';
            return;
          }

          timeLeft--;

          const minutes = Math.floor(timeLeft / 60);
          const seconds = timeLeft % 60;
          minutesSpan.textContent = String(minutes).padStart(2, '0');
          secondsSpan.textContent = String(seconds).padStart(2, '0');
        }, 1000);
      }, 2000);
    }

    if (btn) {
      btn.addEventListener('click', () => {
        startGame();
      });
    }

    // ===== 2. HAND TRACKING GESTURES (QUEST / XR HANDS) =====
    const rightHand = scene.querySelector('#rightHand');
    const leftHand = scene.querySelector('#leftHand');

    function handlePinch(handEl, side) {
      handEl.addEventListener('pinchstarted', (evt) => {
        const intersection = evt.detail && evt.detail.intersection;
        if (!intersection || !intersection.object) {
          console.warn('No intersection object found on pinch for', side, 'hand');
          return;
        }

        const targetMesh = intersection.object;
        if (!targetMesh.el) {
          console.warn('Intersection object has no A-Frame el for pinch target.');
          return;
        }

        const targetEl = targetMesh.el;
        console.log('Pinch → click on', side, 'hand target:', targetEl);

        if (!targetEl.classList.contains('clickable')) {
          console.warn(
            'Pinched object is not .clickable. Add class="clickable" and a click listener, e.g.:',
            "el.addEventListener('click', () => console.log('clicked!'));"
          );
          return;
        }

        console.log(
          'Pinch → emitting click on',
          targetEl.id || targetEl.tagName
        );
        targetEl.emit('click');
      });
    }

    if (rightHand) handlePinch(rightHand, 'right');
    if (leftHand) handlePinch(leftHand, 'left');

    // ===== 3. AR SESSION OVERRIDE (enterVR → immersive-ar) =====
    if (!('xr' in navigator)) {
      console.warn('WebXR not available in this browser.');
      return;
    }

    navigator.xr.isSessionSupported('immersive-ar').then((arSupported) => {
      console.log('immersive-ar supported:', arSupported);
      if (!arSupported) return;

      const originalEnterVR = scene.enterVR.bind(scene);

      scene.enterVR = async function () {
        try {
          const optionalFeatures = ['hand-tracking', 'hit-test'];
          console.log('Requesting AR session with hand tracking...');

          const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor'],
            optionalFeatures
          });

          this.xrSession = session;
          this.renderer.xr.enabled = true;
          this.renderer.xr.setSession(session);

          requestAnimationFrame(() => {
            this.emit('enter-vr');
          });

          console.log(
            'AR session started. Environment blend mode:',
            session.environmentBlendMode
          );

          if (session.enabledFeatures) {
            console.log(
              'Hand tracking enabled:',
              session.enabledFeatures.includes('hand-tracking')
            );
          }
        } catch (error) {
          console.error(
            'Failed to start AR session, falling back to default enterVR():',
            error
          );
          originalEnterVR();
        }
      };
    });
  });

  // ===== 5. OBJECT DETECTION + DARKEN CENTER OBJECT =====
  const video = document.getElementById('cameraFeed');
  const overlay = document.getElementById('detection-overlay');
  const ctx = overlay ? overlay.getContext('2d') : null;

  let detectionModel = null;
  let detectionRunning = false;

  // 5.1 Resize overlay to match window
  function resizeOverlay() {
    if (!overlay) return;
    overlay.width = window.innerWidth;
    overlay.height = window.innerHeight;
  }
  if (overlay) {
    resizeOverlay();
    window.addEventListener('resize', resizeOverlay);
  }

  // 5.2 Start camera (back camera if available)
  async function startCamera() {
    if (!video) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      console.log('Camera started for object detection.');
    } catch (err) {
      console.error('Failed to start camera for detection:', err);
    }
  }

  // 5.3 Load ML model
  async function loadDetectionModel() {
    try {
      if (window.cocoSsd) {
        detectionModel = await window.cocoSsd.load();
        console.log('COCO-SSD model loaded.');
      } else {
        console.warn('cocoSsd script not found. Make sure it is loaded in index.html.');
      }
    } catch (err) {
      console.error('Failed to load detection model:', err);
    }
  }

  // 5.4 Main detection loop
  async function detectionLoop() {
    if (!detectionRunning || !detectionModel || !video || !overlay || !ctx) {
      requestAnimationFrame(detectionLoop);
      return;
    }

    if (video.readyState < 2) {
      requestAnimationFrame(detectionLoop);
      return;
    }

    try {
      const predictions = await detectionModel.detect(video);

      // Clear overlay
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      const cx = overlay.width / 2;
      const cy = overlay.height / 2;

      const scaleX = overlay.width / video.videoWidth;
      const scaleY = overlay.height / video.videoHeight;

      predictions.forEach((pred) => {
        const [x, y, width, height] = pred.bbox;

        // Scale from video space to screen space
        const sx = x * scaleX;
        const sy = y * scaleY;
        const sw = width * scaleX;
        const sh = height * scaleY;

        // Check if screen center is inside this bounding box
        const centerInside =
          cx >= sx &&
          cx <= sx + sw &&
          cy >= sy &&
          cy <= sy + sh;

        if (centerInside) {
          // Draw dark semi-transparent overlay
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(sx, sy, sw, sh);

          // Optional label
          ctx.font = '16px Arial';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText(pred.class, sx + 4, sy + 18);
        }
      });
    } catch (err) {
      console.error('Error during detection loop:', err);
    }

    requestAnimationFrame(detectionLoop);
  }

  // 5.5 Start everything
  async function initDetection() {
    if (!overlay || !video || !navigator.mediaDevices) {
      console.warn('Detection overlay/video or mediaDevices not available.');
      return;
    }

    try {
      await startCamera();
      await loadDetectionModel();

      detectionRunning = true;
      detectionLoop();
    } catch (err) {
      console.error('Failed to initialize detection:', err);
    }
  }

  // Start detection after DOM content is ready
  initDetection();

  // ===== 4. ENTER-VR DEBUG (optional, just logs) =====
  scene.addEventListener('enter-vr', () => {
    const renderer = scene.renderer;
    const xrManager = renderer && renderer.xr;
    const session =
      xrManager && xrManager.getSession && xrManager.getSession();

    if (!session) {
      console.warn('No XR session found on enter-vr.');
      return;
    }

    console.log('XR session started.');
    console.log('Session mode:', session.mode);
    console.log('Environment blend mode:', session.environmentBlendMode);

    if (session.enabledFeatures) {
      const hasHandTracking =
        session.enabledFeatures.includes('hand-tracking');
      console.log('Hand tracking enabled in session:', hasHandTracking);
    } else {
      session.inputSources.forEach((inputSource, index) => {
        console.log(`Input source ${index}:`, {
          handedness: inputSource.handedness,
          targetRayMode: inputSource.targetRayMode,
          hasHandTracking: !!inputSource.hand
        });
      });
    }
  });
});
