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
          const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor'],
            optionalFeatures: ['hand-tracking', 'hit-test']
          });
          this.xrSession = session;
          this.renderer.xr.enabled = true;
          this.renderer.xr.setSession(session);
          console.log('AR session started. Environment blend mode:', session.environmentBlendMode);
        } catch (error) {
          console.error('Failed to start AR session, falling back to VR:', error);
          originalEnterVR();
        }
      };
    }
  });

  // Log when we enter XR (VR or AR)
  scene.addEventListener('enter-vr', () => {
    const renderer = scene.renderer;
    const xrManager = renderer && renderer.xr;
    const session = xrManager && xrManager.getSession && xrManager.getSession();

    if (session) {
      console.log('XR session started.');
      console.log('Session mode:', session.mode);
      console.log('Environment blend mode:', session.environmentBlendMode);
      if (session.mode === 'immersive-ar' && session.environmentBlendMode === 'alpha-blend') {
        console.log('AR passthrough is active - camera feed should be visible');
      }
    }
  });
});
