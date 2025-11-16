// main.js

// 1) Import A-Frame
import 'aframe';

// 2) Intro images (served from public/images)
const INTRO_IMAGES = [
  '/images/intro1.png',
  '/images/intro2.png',
  '/images/intro3.png',
  '/images/intro4.png'
];

// 3) A-Frame component: 3D intro panel inside the scene
AFRAME.registerComponent('intro-panel', {
  init: function () {
    this.currentIndex = 0;

    // Create image plane
    const imgPlane = document.createElement('a-plane');
    imgPlane.setAttribute('id', 'vr-intro-image');
    imgPlane.setAttribute('width', '1.4');
    imgPlane.setAttribute('height', '0.9');
    imgPlane.setAttribute(
      'material',
      `src: ${INTRO_IMAGES[0]}; transparent: true; side: double`
    );
    imgPlane.setAttribute('position', '0 0.25 0');
    this.el.appendChild(imgPlane);

    // Create button plane
    const btn = document.createElement('a-plane');
    btn.setAttribute('id', 'vr-intro-button');
    btn.classList.add('clickable');
    btn.setAttribute('width', '0.7');
    btn.setAttribute('height', '0.22');
    btn.setAttribute('position', '0 -0.45 0.01');
    btn.setAttribute('material', 'color: #2196F3; side: double');
    btn.setAttribute(
      'text',
      'value: Next; align: center; color: #FFFFFF; width: 2'
    );
    this.el.appendChild(btn);

    // Handle clicks
    btn.addEventListener('click', () => this.onClick());
  },

  onClick: function () {
    this.currentIndex++;

    const imgPlane = this.el.querySelector('#vr-intro-image');
    const btn = this.el.querySelector('#vr-intro-button');

    // Still within image list → update image and maybe label
    if (this.currentIndex < INTRO_IMAGES.length) {
      imgPlane.setAttribute(
        'material',
        `src: ${INTRO_IMAGES[this.currentIndex]}; transparent: true; side: double`
      );

      if (this.currentIndex === INTRO_IMAGES.length - 1) {
        btn.setAttribute(
          'text',
          'value: Start; align: center; color: #FFFFFF; width: 2'
        );
      }
      return;
    }

    // After last image → remove the panel
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
});

// 4) WebXR AR configuration with automatic AR mode request
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // When we enter VR/AR, create the intro panel in front of the camera
  scene.addEventListener('enter-vr', () => {
    const renderer = scene.renderer;
    const xrManager = renderer && renderer.xr;
    const session =
      xrManager && xrManager.getSession && xrManager.getSession();

    console.log('XR session started.', session ? session.mode : 'no session');

    // Set up a cursor so we can click the button in VR/AR
    const camEl = scene.camera && scene.camera.el;
    if (camEl && !camEl.querySelector('[cursor]')) {
      const cursor = document.createElement('a-entity');
      cursor.setAttribute('cursor', 'fuse: false');
      cursor.setAttribute('position', '0 0 -1');
      cursor.setAttribute(
        'geometry',
        'primitive: ring; radiusInner: 0.01; radiusOuter: 0.015'
      );
      cursor.setAttribute(
        'material',
        'color: white; shader: flat'
      );
      cursor.setAttribute('raycaster', 'objects: .clickable');
      camEl.appendChild(cursor);
    }

    // Create intro panel once per session, attached to camera
    if (camEl && !camEl.querySelector('#vr-intro-panel')) {
      const panel = document.createElement('a-entity');
      panel.setAttribute('id', 'vr-intro-panel');
      panel.setAttribute('position', '0 0 -1.5'); // 1.5m in front of camera
      panel.setAttribute('intro-panel', '');      // use our component
      camEl.appendChild(panel);
    }

    // (existing logging + hand tracking debug)
    if (session) {
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

      if (
        session.mode === 'immersive-ar' &&
        session.environmentBlendMode === 'alpha-blend'
      ) {
        console.log('AR passthrough is active - camera feed should be visible');
      }

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
            `Hand tracking control ${index} (${el.getAttribute(
              'hand'
            )}) initialized:`,
            !!component
          );
        } else {
          console.warn(
            `Hand tracking control ${index} component not found`
          );
        }
      });
    }
  });

  // Keep your existing AR override logic
  scene.addEventListener('loaded', () => {
    if (!('xr' in navigator)) {
      console.warn('WebXR not available in this browser.');
      return;
    }

    navigator.xr.isSessionSupported('immersive-ar').then((arSupported) => {
      console.log('immersive-ar supported:', arSupported);
      if (arSupported) {
        const originalEnterVR = scene.enterVR.bind(scene);
        scene.enterVR = async function () {
          try {
            const optionalFeatures = ['hand-tracking', 'hit-test'];
            console.log('Requesting AR session with hand tracking...');

            const session = await navigator.xr.requestSession('immersive-ar', {
              requiredFeatures: ['local-floor'],
              optionalFeatures: optionalFeatures
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
              'Failed to start AR session, falling back to VR:',
              error
            );
            originalEnterVR();
          }
        };
      }
    });
  });
});
