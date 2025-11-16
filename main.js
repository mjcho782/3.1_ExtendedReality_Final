// main.js

// 1) Import A-Frame
import 'aframe';

// 2) WebXR AR configuration + 3D intro panel
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // ----- 3D INTRO PANEL LOGIC -----
  // Uses the <a-assets> images with ids: #intro1, #intro2, #intro3, #intro4
  scene.addEventListener('loaded', () => {
    const textures = ['#intro1', '#intro2', '#intro3', '#intro4'];

    const img = document.querySelector('#intro-image-3d');
    const btn = document.querySelector('#intro-button-3d');
    const panel = document.querySelector('#intro-panel');

    if (!img || !btn || !panel) {
      console.warn('Intro panel elements not found (check ids and scene markup).');
      return;
    }

    let index = 0;

    function updatePanel() {
      // Set current image as material
      img.setAttribute(
        'material',
        `src: ${textures[index]}; transparent: true; side: double`
      );

      // Change button label for last slide
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

    // Initial image + label
    updatePanel();

    // Click handler for the 3D button (via cursor/raycaster)
    btn.addEventListener('click', () => {
      if (index < textures.length - 1) {
        index += 1;
        updatePanel();
      } else {
        // "Start" clicked → remove the intro panel from the scene
        if (panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }
        // At this point you can also start your actual game logic if needed
      }
    });
  });

  // ----- EXISTING A-FRAME / AR LOGIC -----
  // Override enterVR to request immersive AR with hand tracking when available
  scene.addEventListener('loaded', () => {
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

          // Let A-Frame know we "entered vr"
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

  // Log when we enter XR (VR or AR) and verify hand tracking
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

    // Check hand tracking support
    if (session.enabledFeatures) {
      const hasHandTracking = session.enabledFeatures.includes('hand-tracking');
      console.log('Hand tracking enabled in session:', hasHandTracking);
      if (!hasHandTracking) {
        console.warn(
          'Hand tracking was requested but not enabled. Check headset settings.'
        );
      }
    } else {
      // Some browsers don't expose enabledFeatures; log input sources instead
      session.inputSources.forEach((inputSource, index) => {
        console.log(`Input source ${index}:`, {
          handedness: inputSource.handedness,
          targetRayMode: inputSource.targetRayMode,
          hasHandTracking: !!inputSource.hand
        });
      });
    }

    if (
      session.mode === 'immersive-ar' &&
      session.environmentBlendMode === 'alpha-blend'
    ) {
      console.log('AR passthrough is active - camera feed should be visible');
    }

    // Verify hand tracking control entities
    const handTrackingControls = scene.querySelectorAll(
      '[hand-tracking-controls]'
    );
    console.log(
      'Hand tracking control entities found:',
      handTrackingControls.length
    );
    handTrackingControls.forEach((el, index) => {
      const component = el.components['hand-tracking-controls'];
      if (component) {
        console.log(
          `Hand tracking control ${index} (${el.getAttribute('hand')}) initialized:`,
          !!component
        );
      } else {
        console.warn(
          `Hand tracking control ${index} component not found`
        );
      }
    });
  });
});
