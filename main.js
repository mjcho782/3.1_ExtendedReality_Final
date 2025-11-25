// main.js (new project, merged behaviours)

import 'aframe';

const THREE = window.AFRAME && window.AFRAME.THREE ? window.AFRAME.THREE : window.THREE;
const GHOST_SCALE = 0.5;

/**
 * Hover highlight component (from old project, adapted)
 * Adds an emissive / lightened highlight when raycaster / cursor hovers over an entity.
 */
AFRAME.registerComponent('hover-highlight', {
  schema: {
    color: { type: 'color', default: '#ffffaa' },
    emissiveIntensity: { type: 'number', default: 0.45 },
    lightenAmount: { type: 'number', default: 0.18 }
  },
  init() {
    this._onEnter = this.onEnter.bind(this);
    this._onLeave = this.onLeave.bind(this);

    // Events from cursor & raycaster
    this.el.addEventListener('mouseenter', this._onEnter);
    this.el.addEventListener('mouseleave', this._onLeave);
    this.el.addEventListener('raycaster-intersected', this._onEnter);
    this.el.addEventListener('raycaster-intersected-cleared', this._onLeave);
  },
  remove() {
    this.el.removeEventListener('mouseenter', this._onEnter);
    this.el.removeEventListener('mouseleave', this._onLeave);
    this.restore();
  },
  onEnter() {
    const obj = this.el.getObject3D('mesh');
    if (!obj) return;

    const toProcess = [];
    if (obj.isMesh) toProcess.push(obj);
    else obj.traverse(c => { if (c.isMesh) toProcess.push(c); });

    toProcess.forEach(mesh => {
      if (!mesh.userData) mesh.userData = {};
      if (mesh.userData._hoverOriginalMaterial) return;

      const origMat = mesh.material;
      mesh.userData._hoverOriginalMaterial = origMat;

      const cloneMat = m => (m && m.clone ? m.clone() : m);

      if (Array.isArray(origMat)) {
        const clonedArray = origMat.map(cloneMat);
        mesh.material = clonedArray;
        clonedArray.forEach(cm => {
          if (!cm) return;
          if ('emissive' in cm) {
            cm.emissive.set(this.data.color);
            if ('emissiveIntensity' in cm) cm.emissiveIntensity = this.data.emissiveIntensity;
          } else if ('color' in cm) {
            try { cm.color.offsetHSL(0, 0, this.data.lightenAmount); } catch (e) {}
          }
        });
      } else {
        const cloned = cloneMat(origMat);
        mesh.material = cloned;
        if (cloned && 'emissive' in cloned) {
          cloned.emissive.set(this.data.color);
          if ('emissiveIntensity' in cloned) cloned.emissiveIntensity = this.data.emissiveIntensity;
        } else if (cloned && 'color' in cloned) {
          try { cloned.color.offsetHSL(0, 0, this.data.lightenAmount); } catch (e) {}
        }
      }
    });
  },
  onLeave() {
    this.restore();
  },
  restore() {
    const obj = this.el.getObject3D('mesh');
    if (!obj) return;

    const toProcess = [];
    if (obj.isMesh) toProcess.push(obj);
    else obj.traverse(c => { if (c.isMesh) toProcess.push(c); });

    toProcess.forEach(mesh => {
      const orig = mesh.userData && mesh.userData._hoverOriginalMaterial;
      if (!orig) return;

      const current = mesh.material;
      const disposeOne = m => { if (m && m.dispose) try { m.dispose(); } catch (e) {} };

      if (Array.isArray(current)) current.forEach(disposeOne);
      else disposeOne(current);

      mesh.material = orig;
      delete mesh.userData._hoverOriginalMaterial;
    });
  }
});

AFRAME.registerComponent('triangle-selector', {
  schema: {
    pinchDistance:      { type: 'number', default: 0.02 }, // meters thumb–index for pinch
    minHandsDistance:   { type: 'number', default: 0.06 }, // min distance between hand centers
    maxHandsDistance:   { type: 'number', default: 0.25 }, // max distance between hand centers
    holdMs:             { type: 'number', default: 150 },  // how long both-hands-pinch must be held (ms)
    cooldownMs:         { type: 'number', default: 800 },  // delay between triggers (ms)
    selectionRadius:    { type: 'number', default: 0.35 }  // how far from the triangle center we search for objects
  },

  init() {
    this.scene = this.el.sceneEl;

    this.leftHandEl = null;
    this.rightHandEl = null;

    this.holdSoFar = 0;
    this.lastTriggerTime = -Infinity;

    // Reusable vectors to avoid GC churn
    this.leftCenter = new THREE.Vector3();
    this.rightCenter = new THREE.Vector3();
    this.triangleCenter = new THREE.Vector3();
    this.tempPos = new THREE.Vector3();
  },

  tick(time, delta) {
    // Only run when in XR mode
    if (!this.scene || !this.scene.is('vr-mode')) return;

    // Lazy-resolve hand entities
    if (!this.leftHandEl)  this.leftHandEl  = this.scene.querySelector('#leftHand');
    if (!this.rightHandEl) this.rightHandEl = this.scene.querySelector('#rightHand');
    if (!this.leftHandEl || !this.rightHandEl) return;

    const leftComp  = this.leftHandEl.components['hand-tracking-controls'];
    const rightComp = this.rightHandEl.components['hand-tracking-controls'];
    if (!leftComp || !rightComp || !leftComp.controller || !rightComp.controller) return;

    const leftJoints  = leftComp.controller.joints;
    const rightJoints = rightComp.controller.joints;
    if (!leftJoints || !rightJoints) return;

    const lThumb = leftJoints['thumb-tip'];
    const lIndex = leftJoints['index-finger-tip'];
    const rThumb = rightJoints['thumb-tip'];
    const rIndex = rightJoints['index-finger-tip'];

    if (!lThumb || !lIndex || !rThumb || !rIndex) return;

    // Distances thumb–index for each hand = pinch check
    const pinchDistL = lThumb.position.distanceTo(lIndex.position);
    const pinchDistR = rThumb.position.distanceTo(rIndex.position);

    // Midpoints of each hand's pinch
    this.leftCenter
      .copy(lThumb.position)
      .add(lIndex.position)
      .multiplyScalar(0.5);

    this.rightCenter
      .copy(rThumb.position)
      .add(rIndex.position)
      .multiplyScalar(0.5);

    // Distance between hands
    const handsDist = this.leftCenter.distanceTo(this.rightCenter);

    const bothPinching =
      pinchDistL < this.data.pinchDistance &&
      pinchDistR < this.data.pinchDistance;

    const handsTriangleLike =
      handsDist > this.data.minHandsDistance &&
      handsDist < this.data.maxHandsDistance;

    if (bothPinching && handsTriangleLike) {
      this.holdSoFar += delta;

      const enoughHold = this.holdSoFar >= this.data.holdMs;
      const cooledDown = (time - this.lastTriggerTime) >= this.data.cooldownMs;

      if (enoughHold && cooledDown) {
        this.lastTriggerTime = time;

        // Triangle center = midpoint between the two midpoints
        this.triangleCenter
          .copy(this.leftCenter)
          .add(this.rightCenter)
          .multiplyScalar(0.5);

        // Fire selection
        this.selectClosestClickable(this.triangleCenter);

        // For debugging / future hooks
        this.el.emit('triangle-select', {
          position: this.triangleCenter.clone()
        });
      }
    } else {
      // Reset hold time when gesture breaks
      this.holdSoFar = 0;
    }
  },

  selectClosestClickable(worldPoint) {
    if (!this.scene) return;

    const clickables = this.scene.querySelectorAll('.clickable');
    if (!clickables.length) return;

    let closestEl = null;
    let closestDist = Infinity;

    clickables.forEach(el => {
      if (!el.object3D) return;

      el.object3D.getWorldPosition(this.tempPos);
      const d = this.tempPos.distanceTo(worldPoint);

      if (d < closestDist) {
        closestDist = d;
        closestEl = el;
      }
    });

    if (closestEl && closestDist <= this.data.selectionRadius) {
      // Simulate a click on that entity
      closestEl.emit(
        'click',
        {
          source: 'triangle-selector',
          position: worldPoint.clone()
        },
        false
      );
      // Optional: log for debugging
      console.log('Triangle-select clicked:', closestEl.id || closestEl);
    }
  }
});


// AFRAME.registerComponent('custom-gesture', {
//   schema: {
//     hand: { type: 'string', default: 'right' } // just for logging
//   },

//   init() {
//     this.lastGesture = null;
//     this.tempVec = new THREE.Vector3();
//   },

//   tick() {
//     // Only bother when in XR
//     const sceneEl = this.el.sceneEl;
//     if (!sceneEl || !sceneEl.is('vr-mode')) return;

//     // Get the underlying hand-tracking controller
//     const comp = this.el.components['hand-tracking-controls'];
//     if (!comp || !comp.controller) return;

//     const controller = comp.controller;
//     const joints = controller.joints;
//     if (!joints) return;

//     // Grab some key joints
//     const thumbTip = joints['thumb-tip'];
//     const indexTip = joints['index-finger-tip'];
//     const wrist    = joints['wrist'];

//     if (!thumbTip || !indexTip || !wrist) return;

//     // Positions (already in world space for WebXRController joints)
//     const thumbPos = thumbTip.position;
//     const indexPos = indexTip.position;
//     const wristPos = wrist.position;

//     // Distances
//     const thumbIndexDist = thumbPos.distanceTo(indexPos);
//     const indexWristDist = indexPos.distanceTo(wristPos);

//     // --- Very simple gesture classification ---
//     let gesture = 'open';

//     // Small distance between thumb & index → pinch
//     if (thumbIndexDist < 0.02) {
//       gesture = 'pinch';
//     }
//     // Not pinching + index far from wrist → "point"
//     else if (indexWristDist > 0.07) {
//       gesture = 'point';
//     }

//     // If gesture changed, emit an event
//     if (gesture !== this.lastGesture) {
//       this.lastGesture = gesture;
//       console.log(this.data.hand, 'gesture:', gesture);

//       this.el.emit('gesture-changed', { gesture });

//       // Optional: emit more specific events you can listen to
//       if (gesture === 'point') {
//         this.el.emit('gesture-point');
//       } else if (gesture === 'pinch') {
//         this.el.emit('gesture-pinch');
//       }
//     }
//   }
// });


/* ======================================================
 * DOMContentLoaded: set up scene behaviours
 * ====================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  /* --------------------------------------
   * 1. Scene loaded
   * -------------------------------------- */
  scene.addEventListener('loaded', () => {
    console.log('Scene loaded');

    /* ===== 1A. INTRO PANEL (3D, kept) ===== */
    const textures = ['#intro1', '#intro2', '#intro3', '#intro4'];
    const img = document.querySelector('#intro-image-3d');
    const btn = document.querySelector('#intro-button-3d');

    let currentIndex = 0;

    function updateIntroTexture() {
      if (!img) return;
      // a-plane uses material.src
      img.setAttribute('material', 'src', textures[currentIndex]);
    }

    // Wait a frame to ensure elements are ready, then show panel
    requestAnimationFrame(() => {
      const introPanel = document.getElementById('intro-panel');
      if (introPanel) {
        // Explicitly ensure the panel is visible
        introPanel.setAttribute('visible', 'true');
      }
      updateIntroTexture();
    });

    if (btn) {
      btn.addEventListener('click', () => {
        // Step through intro images, then hide panel to "start" the game
        if (currentIndex < textures.length - 1) {
          currentIndex++;
          updateIntroTexture();
        } else {
          const introPanel = document.getElementById('intro-panel');
          if (introPanel) introPanel.setAttribute('visible', 'false');
        }
      });
    }

    function pressIntroButton() {
      if (!btn) return false;
      const introPanelVisible =
        !introPanel || introPanel.getAttribute('visible') !== 'false';
      if (!introPanelVisible) return false;
      btn.emit('click');
      return true;
    }

    /* ===== 1B. HAND TRACKING → INTRO BUTTON PINCH ===== */
    const rightHand = scene.querySelector('#rightHand');
    const leftHand = scene.querySelector('#leftHand');

    function handlePinch(handEl, side) {
      if (!handEl) return;
      handEl.addEventListener('pinchstarted', () => {
        console.log('Pinch started on', side, 'hand → trying intro button');
        if (!pressIntroButton()) {
          console.log('Intro button not active; pinch ignored.');
        }
      });
    }

    handlePinch(rightHand, 'right');
    handlePinch(leftHand, 'left');

    /* ===== 1C. AR SESSION OVERRIDE (from your new project) ===== */
    if (!('xr' in navigator)) {
      console.warn('WebXR not available in this browser.');
    } else {
      navigator.xr.isSessionSupported('immersive-ar').then(arSupported => {
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

            console.log('AR session started. Environment blend mode:', session.environmentBlendMode);

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
    }

    /* ===== 1D. ENTER-VR DEBUG LOGS + HAND POSITION FIX ===== */
    scene.addEventListener('enter-vr', () => {
      const renderer = scene.renderer;
      const xrManager = renderer && renderer.xr;
      const session = xrManager && xrManager.getSession && xrManager.getSession();

      if (!session) {
        console.warn('No XR session found on enter-vr.');
        return;
      }

      console.log('XR session started.');
      console.log('Session mode:', session.mode);
      console.log('Environment blend mode:', session.environmentBlendMode);

      if (session.enabledFeatures) {
        const hasHandTracking = session.enabledFeatures.includes('hand-tracking');
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

      // Fix right hand position if it's offset incorrectly
      // The hand-tracking-controls component should handle positioning, but sometimes
      // the right hand gets an incorrect offset. Reset it periodically.
      let positionFixAttempts = 0;
      const maxFixAttempts = 10;
      
      const fixRightHandPosition = () => {
        const rightHandEl = scene.querySelector('#rightHand');
        const leftHandEl = scene.querySelector('#leftHand');
        
        if (rightHandEl && leftHandEl && positionFixAttempts < maxFixAttempts) {
          const rightPos = rightHandEl.getAttribute('position');
          const leftPos = leftHandEl.getAttribute('position');
          
          // Check if right hand has a significant Y offset (way down)
          if (rightPos && rightPos.y < -0.5) {
            // Reset to match left hand position
            rightHandEl.setAttribute('position', leftPos || '0 0 0');
            console.log('Fixed right hand position - was offset down');
            
            // Also check and fix the object3D position if needed
            const rightObj3D = rightHandEl.object3D;
            if (rightObj3D && rightObj3D.position.y < -0.5) {
              rightObj3D.position.set(0, 0, 0);
              console.log('Fixed right hand object3D position');
            }
            
            positionFixAttempts++;
          } else if (!rightPos || (rightPos.x === 0 && rightPos.y === 0 && rightPos.z === 0)) {
            // Position looks correct, but keep checking
            positionFixAttempts++;
          }
          
          if (positionFixAttempts < maxFixAttempts) {
            setTimeout(fixRightHandPosition, 200);
          }
        }
      };
      
      // Start fixing after a short delay to let hand tracking initialize
      setTimeout(fixRightHandPosition, 200);
    });

    /* --------------------------------------
     * 1E. GLB SPLIT + GHOST SPAWN (old behaviour)
     * -------------------------------------- */
    const roomEntity = document.getElementById('roomEntity');
    const worldContainer = document.getElementById('world-root');

    if (roomEntity) {
      const onModelLoaded = e => {
        if (roomEntity.getAttribute('data-split') === 'true') {
          console.log('[GLB Split] Already split. Skipping.');
          return;
        }

        const modelRoot =
          (e.detail && e.detail.model) || roomEntity.getObject3D('mesh');
        if (!modelRoot) return;

        // Group meshes by their parent node (layer/group in GLB)
        // Strategy: Find the top-level group that contains each mesh
        const groups = new Map();
        
        // First, find all meshes and determine their grouping
        const allMeshes = [];
        modelRoot.traverse(obj => {
          if (obj.isMesh) {
            allMeshes.push(obj);
          }
        });

        // For each mesh, find its top-level parent group (not the root)
        allMeshes.forEach(mesh => {
          let parent = mesh.parent;
          let topLevelGroup = null;
          
          // Walk up the hierarchy to find the top-level group (closest to root that's not root)
          while (parent && parent !== modelRoot) {
            topLevelGroup = parent;
            parent = parent.parent;
          }
          
          // Use the top-level group as the key, or the mesh itself if directly under root
          const groupKey = topLevelGroup ? topLevelGroup.uuid : (mesh.name || mesh.uuid);
          
          if (!groups.has(groupKey)) {
            groups.set(groupKey, { 
              node: topLevelGroup || mesh, 
              meshes: [],
              isDirectMesh: !topLevelGroup
            });
          }
          groups.get(groupKey).meshes.push(mesh);
        });

        console.log('[GLB Split] Found groups:', groups.size);
        if (!groups.size) {
          console.warn('[GLB Split] No groups found in model.');
          return;
        }

        const tempPos = new THREE.Vector3();
        const tempQuat = new THREE.Quaternion();
        const tempScale = new THREE.Vector3();

        const createdParts = [];

        // Create one entity per group (layer)
        groups.forEach((groupData, groupKey) => {
          const groupNode = groupData.node;
          const groupMeshes = groupData.meshes;
          const isDirectMesh = groupData.isDirectMesh;
          
          if (!groupMeshes.length) return;

          // Check if this group should be excluded (check first mesh name or group name)
          const groupName = (groupNode.name || groupMeshes[0].name || '').toLowerCase();
          const isWall = groupName === 'wall' || groupName.includes('wall') || groupName === 'wall exterior';

          const partEl = document.createElement('a-entity');

          // Create a group to hold all meshes from this layer
          const meshGroup = new THREE.Group();
          
          if (isDirectMesh) {
            // Single mesh directly under root - use its own transform
            const mesh = groupMeshes[0];
            mesh.updateWorldMatrix(true, false);
            mesh.matrixWorld.decompose(tempPos, tempQuat, tempScale);
            
            partEl.setAttribute('position', `${tempPos.x} ${tempPos.y} ${tempPos.z}`);
            const euler = new THREE.Euler().setFromQuaternion(tempQuat, 'YXZ');
            const deg = {
              x: THREE.MathUtils.radToDeg(euler.x),
              y: THREE.MathUtils.radToDeg(euler.y),
              z: THREE.MathUtils.radToDeg(euler.z)
            };
            partEl.setAttribute('rotation', `${deg.x} ${deg.y} ${deg.z}`);
            partEl.setAttribute('scale', `${tempScale.x} ${tempScale.y} ${tempScale.z}`);
            
            // Clone the mesh and reset its transform (entity handles transform)
            const meshClone = mesh.clone();
            meshClone.position.set(0, 0, 0);
            meshClone.quaternion.set(0, 0, 0, 1);
            meshClone.scale.set(1, 1, 1);
            meshGroup.add(meshClone);
          } else {
            // Group node - use group's world transform
            groupNode.updateWorldMatrix(true, false);
            groupNode.matrixWorld.decompose(tempPos, tempQuat, tempScale);
            
            partEl.setAttribute('position', `${tempPos.x} ${tempPos.y} ${tempPos.z}`);
            const euler = new THREE.Euler().setFromQuaternion(tempQuat, 'YXZ');
            const deg = {
              x: THREE.MathUtils.radToDeg(euler.x),
              y: THREE.MathUtils.radToDeg(euler.y),
              z: THREE.MathUtils.radToDeg(euler.z)
            };
            partEl.setAttribute('rotation', `${deg.x} ${deg.y} ${deg.z}`);
            partEl.setAttribute('scale', `${tempScale.x} ${tempScale.y} ${tempScale.z}`);
            
            // Clone all meshes from this group and calculate their local transforms
            groupMeshes.forEach(mesh => {
              const meshClone = mesh.clone();
              // Get local transform relative to group
              mesh.updateWorldMatrix(true, false);
              const localMatrix = new THREE.Matrix4();
              localMatrix.copy(groupNode.matrixWorld).invert().multiply(mesh.matrixWorld);
              localMatrix.decompose(meshClone.position, meshClone.quaternion, meshClone.scale);
              meshGroup.add(meshClone);
            });
          }
          
          partEl.setObject3D('mesh', meshGroup);

          if (!isWall) {
            // These are the interactive parts
            partEl.classList.add('selectable', 'clickable');
            partEl.setAttribute('hover-highlight', '');
            createdParts.push(partEl);
          }

          (worldContainer || scene).appendChild(partEl);
        });

        console.log('[GLB Split] Created entities:', createdParts.length);
        roomEntity.setAttribute('visible', 'false');
        roomEntity.setAttribute('data-split', 'true');

        // Refresh raycasters (camera + hands) so they see new clickable entities
        const camEl = scene.querySelector('a-camera');
        const camRC = camEl && camEl.components && camEl.components.raycaster;
        if (camRC && camRC.refreshObjects) camRC.refreshObjects();
        ['#leftHand', '#rightHand'].forEach(sel => {
          const hand = scene.querySelector(sel);
          const rc = hand && hand.components && hand.components.raycaster;
          if (rc && rc.refreshObjects) rc.refreshObjects();
        });

        if (!createdParts.length) {
          console.warn('[GLB Split] No non-wall parts created.');
          return;
        }

        // Pick one random part as the "fake" object that spawns the ghost
        const fakeIdx = Math.floor(Math.random() * createdParts.length);
        const fakeEl = createdParts[fakeIdx];
        if (!fakeEl) return;

        fakeEl.setAttribute('data-fake', 'true');
        fakeEl.addEventListener(
          'click',
          e => {
            if (e && e.stopPropagation) e.stopPropagation();
            if (fakeEl.getAttribute('data-fake-handled') === 'true') return;
            fakeEl.setAttribute('data-fake-handled', 'true');

            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3();
            fakeEl.object3D.updateWorldMatrix(true, false);
            fakeEl.object3D.matrixWorld.decompose(worldPos, worldQuat, worldScale);

            fakeEl.setAttribute('visible', 'false');

            const ghost = document.createElement('a-entity');
            ghost.setAttribute('gltf-model', '#ghost');
            ghost.setAttribute(
              'position',
              `${worldPos.x} ${worldPos.y} ${worldPos.z}`
            );
            ghost.setAttribute(
              'scale',
              `${GHOST_SCALE} ${GHOST_SCALE} ${GHOST_SCALE}`
            );

            let rotY = 0;
            const cameraEl = scene.camera && scene.camera.el;
            if (cameraEl && cameraEl.object3D) {
              const camPos = new THREE.Vector3();
              cameraEl.object3D.getWorldPosition(camPos);
              const dirToCamera = new THREE.Vector3().subVectors(camPos, worldPos);
              rotY = THREE.MathUtils.radToDeg(Math.atan2(dirToCamera.x, dirToCamera.z));
            } else {
              const eulerFallback = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
              rotY = THREE.MathUtils.radToDeg(eulerFallback.y);
            }
            ghost.setAttribute('rotation', `0 ${rotY} 0`);

            const riseTo = `${worldPos.x} ${worldPos.y + 2} ${worldPos.z}`;
            ghost.setAttribute(
              'animation__rise',
              `property: position; to: ${riseTo}; dur: 3000; easing: linear`
            );

            (worldContainer || scene).appendChild(ghost);

            setTimeout(() => {
              if (ghost.parentElement) ghost.parentElement.removeChild(ghost);
            }, 3000);
          },
          { once: true }
        );
      };

      if (roomEntity.hasLoaded) {
        const existing = roomEntity.getObject3D('mesh');
        if (existing) onModelLoaded({ detail: { model: existing } });
        else roomEntity.addEventListener('model-loaded', onModelLoaded, { once: true });
      } else {
        roomEntity.addEventListener(
          'loaded',
          () => {
            const existing = roomEntity.getObject3D('mesh');
            if (existing) onModelLoaded({ detail: { model: existing } });
            else roomEntity.addEventListener('model-loaded', onModelLoaded, { once: true });
          },
          { once: true }
        );
      }
    }
  });

});
