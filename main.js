// main.js

// Import A-Frame
import 'aframe';

document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  scene.addEventListener('loaded', () => {
    console.log('Scene loaded.');

    // ===== 1. INTRO PANEL LOGIC =====
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
        if (!panel.parentNode) return; // already removed

        if (index < textures.length - 1) {
          index += 1;
          updatePanel();
        } else {
          // "Start" clicked → remove intro panel
          panel.parentNode.removeChild(panel);
          console.log('Intro panel removed; game can start.');
        }
      }

      // Initial state
      updatePanel();

      // Normal click (mouse / controller / gaze cursor)
      btn.addEventListener('click', () => {
        console.log('Intro button clicked via cursor / mouse.');
        handleButtonClick();
      });

      // ===== 2. PINCH → CURSOR CLICK MAPPING =====
      // Use the visible circle (cursor entity) as the ray origin
      const cursor = scene.querySelector('[cursor]');
      if (!cursor) {
        console.warn('No [cursor] entity found; pinch → click mapping disabled.');
      } else {
        function triggerCursorClickFromPinch() {
          const raycasterComp = cursor.components.raycaster;
          if (!raycasterComp) {
            console.warn('Cursor has no raycaster component.');
            return;
          }

          const intersections = raycasterComp.intersections || [];
          if (intersections.length === 0) {
            console.log('Pinch detected but cursor not pointing at any .clickable object.');
            return;
          }

          // Get the closest intersected A-Frame entity
          const targetObj = intersections[0].object;
          const targetEl = targetObj && targetObj.el;

          if (!targetEl) {
            console.log('No A-Frame entity associated with intersection.');
            return;
          }

          console.log('Pinch → emitting click on', targetEl.id || targetEl.tagName);

          // Emit a click event on the intersected entity
          targetEl.emit('click');
        }

        // Listen to pinchended on both hands
        const hands = scene.querySelectorAll('[hand-tracking-controls]');
        hands.forEach((handEl, idx) => {
          console.log('Setting pinch listener on hand-tracking entity', idx);

          handEl.addEventListener('pinchended', () => {
            console.log('pinchended from hand', idx, '→ treating as cursor click.');
            triggerCursorClickFromPinch();
          });
        });
      }
    }

    // ===== 3. AR SESSION OVERRIDE (enterVR → immersive-ar with hand tracking) =====
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

  // ===== 4. ENTER-VR DEBUG (optional) =====
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
