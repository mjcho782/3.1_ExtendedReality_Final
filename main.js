// main.js

import 'aframe';

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // =========================
  // 1. SCENE LOADED HANDLER
  // =========================
  scene.addEventListener('loaded', () => {
    console.log('Scene loaded');

    // ===== 1A. INTRO PANEL SETUP =====
    const textures = ['#intro1', '#intro2', '#intro3', '#intro4'];

    const img = document.querySelector('#intro-image-3d');
    const btn = document.querySelector('#intro-button-3d');
    const prevBtn = document.querySelector('#intro-prev');
    const nextBtn = document.querySelector('#intro-next');
    const progressBars = Array.from(document.querySelectorAll('.progress-bar'));
    const ctaText = document.querySelector('#cta-text');

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

    // Initial state
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

        let timeLeft = 5 * 60; // 5 minutes

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

    // =========================
    // 2. HAND TRACKING → CLICK
    // =========================

    const rightHand = scene.querySelector('#rightHand');
    const leftHand = scene.querySelector('#leftHand');

    // Helper: raycast from camera center to find first `.clickable`
    function clickCenterObject() {
      const cameraEl = scene.camera && scene.camera.el;
      if (!cameraEl || !scene.object3D) return;

      const THREE = AFRAME.THREE;
      const raycaster = new THREE.Raycaster();

      // Origin = camera world position
      const origin = new THREE.Vector3();
      cameraEl.object3D.getWorldPosition(origin);

      // Direction = camera forward (-Z in local space)
      const direction = new THREE.Vector3(0, 0, -1);
      const worldQuat = new THREE.Quaternion();
      cameraEl.object3D.getWorldQuaternion(worldQuat);
      direction.applyQuaternion(worldQuat).normalize();

      raycaster.set(origin, direction);

      // Intersect with entire scene
      const intersects = raycaster.intersectObjects(
        scene.object3D.children,
        true
      );

      for (let i = 0; i < intersects.length; i++) {
        const obj = intersects[i].object;
        if (!obj) continue;

        // Climb up to the A-Frame entity
        let targetEl = obj.el;
        let parentObj = obj.parent;
        while (!targetEl && parentObj) {
          targetEl = parentObj.el;
          parentObj = parentObj.parent;
        }

        if (targetEl && targetEl.classList && targetEl.classList.contains('clickable')) {
          console.log('Pinch → click on', targetEl.id || targetEl.tagName);
          targetEl.emit('click');
          return;
        }
      }
    }

    function handlePinch(handEl, side) {
      if (!handEl) return;

      handEl.addEventListener('pinchstarted', () => {
        console.log('Pinch started on', side, 'hand → casting ray from camera center');
        clickCenterObject();
      });
    }

    handlePinch(rightHand, 'right');
    handlePinch(leftHand, 'left');

    // =========================
    // 3. AR SESSION OVERRIDE
    // =========================

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

    // =========================
    // 4. ENTER-VR DEBUG LOGS
    // =========================
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

  // ==========================================
  // 5. GENERIC OBJECT DETECTION OVERLAY
  // ==========================================

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

  // 5.2 Start camera (back camera if possible)
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

  // 5.3 Load detection model (COCO-SSD, but we only use boxes)
  async function loadDetectionModel() {
    try {
      if (window.cocoSsd) {
        detectionModel = await window.cocoSsd.load();
        console.log('COCO-SSD model loaded (used only for bounding boxes).');
      } else {
        console.warn(
          'cocoSsd script not found. Make sure it is loaded in index.html.'
        );
      }
    } catch (err) {
      console.error('Failed to load detection model:', err);
    }
  }

  // 5.4 Main detection loop (generic objects)
  async function detectionLoop() {
    if (!detectionRunning || !detectionModel || !video || !overlay || !ctx) {
      requestAnimationFrame(detectionLoop);
      return;
    }

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
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

        // Convert from video coords → screen coords
        const sx = x * scaleX;
        const sy = y * scaleY;
        const sw = width * scaleX;
        const sh = height * scaleY;

        // Draw an outline box for ALL detected objects
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; // green outline for debugging
        ctx.strokeRect(sx, sy, sw, sh);

        // Check if screen center is inside this bounding box
        const centerInside =
          cx >= sx &&
          cx <= sx + sw &&
          cy >= sy &&
          cy <= sy + sh;

        if (centerInside) {
          // Darken the object under the center
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(sx, sy, sw, sh);
        }
      });
    } catch (err) {
      console.error('Error during detection loop:', err);
    }

    requestAnimationFrame(detectionLoop);
  }

  // 5.5 Initialize detection
  async function initDetection() {
    if (!overlay || !video || !navigator.mediaDevices) {
      console.warn('Detection overlay / video / mediaDevices not available.');
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

  // Start detection after DOM is ready
  initDetection();
});
