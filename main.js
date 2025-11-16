// main.js

// 1) Import A-Frame
import 'aframe';

// 2) Import your custom components
import './pinchable.js';
import './color-change.js';
import './slider.js';
import './size-change.js';
import './button.js';
import './menu.js';
import './pressable.js';
import './event-manager.js';

// 3) WebXR AR configuration with automatic AR mode request
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // Wait for scene to be fully loaded
  scene.addEventListener('loaded', () => {
    // Check AR support
    if (!('xr' in navigator)) {
      console.warn('WebXR not available in this browser.');
      return;
    }

    navigator.xr.isSessionSupported('immersive-ar').then((arSupported) => {
      console.log('immersive-ar supported:', arSupported);
      if (arSupported) {
        // Override enterVR to request AR mode instead
        const originalEnterVR = scene.enterVR.bind(scene);
        scene.enterVR = async function() {
          try {
            // Request AR session with hand tracking
            const optionalFeatures = ['hand-tracking', 'hit-test'];
            console.log('Requesting AR session with hand tracking...');
            
            const session = await navigator.xr.requestSession('immersive-ar', {
              requiredFeatures: ['local-floor'],
              optionalFeatures: optionalFeatures
            });
            
            // Set up the session properly for A-Frame
            this.xrSession = session;
            this.renderer.xr.enabled = true;
            this.renderer.xr.setSession(session);
            
            // Wait a frame for renderer to initialize, then trigger enter-vr
            requestAnimationFrame(() => {
              this.emit('enter-vr');
            });
            
            console.log('AR session started. Environment blend mode:', session.environmentBlendMode);
            if (session.enabledFeatures) {
              console.log('Hand tracking enabled:', session.enabledFeatures.includes('hand-tracking'));
            }
          } catch (error) {
            console.error('Failed to start AR session, falling back to VR:', error);
            originalEnterVR();
          }
        };
      }
    });
  });

  // Log when we enter XR (VR or AR) and verify hand tracking
  scene.addEventListener('enter-vr', () => {
    const renderer = scene.renderer;
    const xrManager = renderer && renderer.xr;
    const session = xrManager && xrManager.getSession && xrManager.getSession();

    if (session) {
      console.log('XR session started.');
      console.log('Session mode:', session.mode);
      console.log('Environment blend mode:', session.environmentBlendMode);
      
      // Check hand tracking support
      if (session.enabledFeatures) {
        const hasHandTracking = session.enabledFeatures.includes('hand-tracking');
        console.log('Hand tracking enabled in session:', hasHandTracking);
        if (!hasHandTracking) {
          console.warn('Hand tracking was requested but not enabled. Check headset settings.');
        }
      } else {
        // Some browsers don't expose enabledFeatures, check input sources
        session.inputSources.forEach((inputSource, index) => {
          console.log(`Input source ${index}:`, {
            handedness: inputSource.handedness,
            targetRayMode: inputSource.targetRayMode,
            hasHandTracking: !!inputSource.hand
          });
        });
      }
      
      if (session.mode === 'immersive-ar' && session.environmentBlendMode === 'alpha-blend') {
        console.log('AR passthrough is active - camera feed should be visible');
      }
      
      // Verify hand tracking controls are initialized
      const handTrackingControls = scene.querySelectorAll('[hand-tracking-controls]');
      console.log('Hand tracking control entities found:', handTrackingControls.length);
      handTrackingControls.forEach((el, index) => {
        const component = el.components['hand-tracking-controls'];
        if (component) {
          console.log(`Hand tracking control ${index} (${el.getAttribute('hand')}) initialized:`, !!component);
        } else {
          console.warn(`Hand tracking control ${index} component not found`);
        }
      });
    }
  });
});
