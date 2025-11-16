// Import A-Frame
import 'aframe';

// Import A-Frame environment component (optional, if you want to use it)
// You can install it via npm: npm install aframe-environment-component
// Or use via CDN in index.html if preferred

// Import your custom components
import './pinchable.js';
import './color-change.js';
import './slider.js';
import './size-change.js';
import './button.js';
import './menu.js';
import './pressable.js';
import './event-manager.js';

// Configure WebXR AR passthrough
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  
  // Override A-Frame's VR entry to request AR mode
  scene.addEventListener('loaded', () => {
    // Check if AR is supported
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
        if (supported) {
          console.log('AR mode is supported');
        } else {
          console.warn('AR mode is not supported on this device');
        }
      });
    }
  });
  
  // Monitor when entering VR/AR
  scene.addEventListener('enter-vr', () => {
    const xrSession = scene.xrSession || scene.renderer.xr.getSession();
    if (xrSession) {
      console.log('XR session active. Mode:', xrSession.mode);
      console.log('Environment blend mode:', xrSession.environmentBlendMode);
      
      if (xrSession.mode === 'immersive-ar') {
        if (xrSession.environmentBlendMode === 'alpha-blend') {
          console.log('AR passthrough enabled - camera feed should be visible');
        } else {
          console.warn('AR session active but passthrough may not work. Blend mode:', xrSession.environmentBlendMode);
          console.warn('This might be a headset setting issue. Check if passthrough is enabled in headset settings.');
        }
      } else {
        console.warn('Session is not in AR mode. Current mode:', xrSession.mode);
        console.warn('You may need to use the AR button instead of VR button, or check headset settings.');
      }
    }
  });
  
  // Try to request AR mode when VR button is clicked
  const vrButton = scene.querySelector('[vr-mode-ui]');
  if (vrButton) {
    // Override the default VR entry to prefer AR
    const originalEnterVR = scene.enterVR.bind(scene);
    scene.enterVR = async function() {
      try {
        if (navigator.xr) {
          const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
          if (arSupported) {
            // Request AR session
            const session = await navigator.xr.requestSession('immersive-ar', {
              requiredFeatures: ['local-floor'],
              optionalFeatures: ['hand-tracking', 'hit-test']
            });
            this.xrSession = session;
            this.renderer.xr.enabled = true;
            this.renderer.xr.setSession(session);
            console.log('AR session started');
          } else {
            // Fall back to VR
            originalEnterVR();
          }
        } else {
          originalEnterVR();
        }
      } catch (error) {
        console.error('Error entering AR:', error);
        originalEnterVR();
      }
    };
  }
});

