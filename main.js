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
    const panel = document.querySelector('#intro-panel');

    if (!img || !btn || !panel) {
      console.warn('Intro panel elements not found (check ids in index.html).');
    } else {
      let index = 0;

      function updatePanel() {
        img.setAttribute(
          'material',
          `src: ${textures[index]}; transparent: true; side: double`
        );

        if (index === textures.length - 1) {
          btn.setAttribute(
            'text',
            'value: Start; align: center; color: #FFFFFF; width: 2'
          );
        } else {
          btn.setAttribute(
            'text',
            'value: Next; align: center; color: #FFFFFF; width: 2'
          );
        }
      }

      function handleButtonClick() {
        // If panel already removed, ignore
        if (!panel.parentNode) return;

        if (index < textures.length - 1) {
          index += 1;
          updatePanel();
        } else {
          // "Start" → remove intro panel
          panel.parentNode.removeChild(panel);
          console.log('Intro panel removed; game can start.');
        }
      }

      // Initial image + button text
      updatePanel();

      // Normal click (mouse / controller / VR cursor)
      btn.addEventListener('click', () => {
        console.log('Intro button clicked via cursor / mouse.');
        handleButtonClick();
      });

      // ===== 2. HAND RAYS + PINCH → CLICK =====
      // Hands have raycaster="objects: .clickable; showLine: true"
      const hands = [
        document.querySelector('#leftHand'),
        document.querySelector('#rightHand')
      ].filter(Boolean);

      hands.forEach((handEl, idx) => {
        console.log('Registering pinch listener on hand', idx);

        handEl.addEventListener('pinchended', () => {
          console.log('pinchended from hand', idx);

          const ray = handEl.components.raycaster;
          if (!ray) {
            console.warn('This hand has no raycaster component.');
            return;
          }

          const intersections = ray.intersections || [];
          if (!intersections.length) {
            console.log('Hand ray not hitting any .clickable when pinched.');
            return;
          }

          // Take the closest intersection
          const targetObj = intersections[0].object;
          const targetEl = targetObj && targetObj.el;

          if (!targetEl) {
            console.log('Intersection has no A-Frame entity attached.');
            return;
          }

          // Optional: only act if it's actually clickable
          if (!targetEl.classList || !targetEl.classList.contains('clickable')) {
            console.log(
              'Pinch hit something, but it is not .clickable (id=',
              targetEl.id,
              ').'
            );
            return;
          }

          console.log(
            'Pinch → emitting click on',
            targetEl.id || targetEl.tagName
          );
          targetEl.emit('click');
        });
      });
    }

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
