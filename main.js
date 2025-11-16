// main.js

// 1) Import A-Frame (from npm)
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

// 3) Let A-Frame handle WebXR; just configure & log support
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // Ask for the features we care about
  scene.setAttribute(
    'webxr',
    'requiredFeatures: local-floor; optionalFeatures: hand-tracking, hit-test'
  );

  // Simple debug so you can check what Quest Browser exposes
  if (!('xr' in navigator)) {
    console.warn('WebXR not available in this browser.');
    return;
  }

  navigator.xr.isSessionSupported('immersive-vr')
    .then(supported => console.log('immersive-vr supported:', supported))
    .catch(err => console.warn('immersive-vr check failed:', err));

  navigator.xr.isSessionSupported('immersive-ar')
    .then(supported => console.log('immersive-ar supported:', supported))
    .catch(err => console.warn('immersive-ar check failed:', err));

  scene.addEventListener('enter-vr', () => {
    const renderer = scene.renderer;
    const xrManager = renderer && renderer.xr;
    const session = xrManager && xrManager.getSession && xrManager.getSession();

    if (!session) {
      console.log('XR session started but no session object yet.');
      return;
    }

    console.log('XR session started.');
    console.log('environmentBlendMode:', session.environmentBlendMode);
  });
});
