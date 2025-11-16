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

// 3) Minimal WebXR config + debug (no manual session override)
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  // Let A-Frame manage WebXR, just make sure we request hand-tracking
  // and a reasonable reference space.
  scene.setAttribute(
    'webxr',
    'requiredFeatures: local-floor; optionalFeatures: hand-tracking'
  );

  // Simple console debug so you can see what the device supports
  if (!('xr' in navigator)) {
    console.warn('WebXR not available in this browser.');
    return;
  }

  navigator.xr.isSessionSupported('immersive-vr').then((vrSupported) => {
    console.log('immersive-vr supported:', vrSupported);
  });

  navigator.xr.isSessionSupported('immersive-ar').then((arSupported) => {
    console.log('immersive-ar supported:', arSupported);
  });

  // Log when we enter XR (VR or AR), just for inspection
  scene.addEventListener('enter-vr', () => {
    const renderer = scene.renderer;
    const xrManager = renderer && renderer.xr;
    const session = xrManager && xrManager.getSession && xrManager.getSession();

    if (!session) {
      console.log('Entered VR/AR, but no XR session found (yet).');
      return;
    }

    console.log('XR session started.');
    console.log('Session mode (if exposed):', session.mode); // may be undefined
    console.log('Environment blend mode:', session.environmentBlendMode);
  });
});
