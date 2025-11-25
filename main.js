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

AFRAME.registerComponent('ghost-wander', {
  schema: {
    radius:        { type: 'number', default: 2.0 },
    minY:          { type: 'number', default: 0.5 },
    maxY:          { type: 'number', default: 2.5 },
    moveDuration:  { type: 'number', default: 4500 },
    pauseDuration: { type: 'number', default: 500 },
    dragDuration:  { type: 'number', default: 2000 } // ms to pull ghost to player
  },

  init() {
    this._onMoveComplete = this.onMoveComplete.bind(this);
    this._onDragStart = this.onDragStart.bind(this);
    this._onDragComplete = this.onDragComplete.bind(this);

    this.el.addEventListener('animationcomplete__move', this._onMoveComplete);
    this.el.addEventListener('ghost-drag-start', this._onDragStart);
    this.el.addEventListener('animationcomplete__drag', this._onDragComplete);

    this.isDragging = false;

    // Start wandering after first frame so initial position is set
    setTimeout(() => this.scheduleNextMove(), 50);
  },

  remove() {
    this.el.removeEventListener('animationcomplete__move', this._onMoveComplete);
    this.el.removeEventListener('ghost-drag-start', this._onDragStart);
    this.el.removeEventListener('animationcomplete__drag', this._onDragComplete);
  },

  scheduleNextMove() {
    if (this.isDragging) return; // don't wander while dragging

    const el = this.el;
    const obj = el.object3D;
    const currentPos = obj.position;

    const roomBox = window.__ROOM_BOUNDING_BOX__;
    if (!roomBox) {
      console.warn("Room bounds not ready, ghost using radius wandering.");
      this.wanderByRadius(currentPos);
      return;
    }

    // Pick a random point inside room bounds
    const targetX = THREE.MathUtils.lerp(roomBox.min.x, roomBox.max.x, Math.random());
    const targetZ = THREE.MathUtils.lerp(roomBox.min.z, roomBox.max.z, Math.random());
    const targetY = THREE.MathUtils.lerp(roomBox.min.y + 0.5, roomBox.max.y - 0.2, Math.random());

    const toStr = `${targetX} ${targetY} ${targetZ}`;

    // Move animation
    el.setAttribute('animation__move', {
      property: 'position',
      to: toStr,
      dur: this.data.moveDuration,
      easing: 'easeInOutSine'
    });

    // Slow spin
    el.setAttribute('animation__spin', {
      property: 'rotation',
      dur: this.data.moveDuration * 2,
      easing: 'linear',
      loop: true,
      to: `0 ${Math.random() < 0.5 ? -360 : 360} 0`
    });
  },

  wanderByRadius(currentPos) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * this.data.radius;

    const targetX = currentPos.x + Math.cos(angle) * dist;
    const targetZ = currentPos.z + Math.sin(angle) * dist;
    const targetY = this.data.minY + Math.random() * (this.data.maxY - this.data.minY);

    const toStr = `${targetX} ${targetY} ${targetZ}`;

    this.el.setAttribute('animation__move', {
      property: 'position',
      to: toStr,
      dur: this.data.moveDuration,
      easing: 'easeInOutSine'
    });
  },

  onMoveComplete() {
    if (this.isDragging) return;
    setTimeout(() => this.scheduleNextMove(), this.data.pauseDuration);
  },

  // Called when selection component emits 'ghost-drag-start'
  onDragStart() {
    if (this.isDragging) return;
    this.isDragging = true;

    // Stop wandering animations
    this.el.removeAttribute('animation__move');
    this.el.removeAttribute('animation__spin');

    const scene = this.el.sceneEl;
    if (!scene) return;

    const cameraEl = scene.camera && scene.camera.el;
    const ghostObj = this.el.object3D;

    const ghostPos = new THREE.Vector3();
    ghostObj.getWorldPosition(ghostPos);

    let camPos = new THREE.Vector3(0, 1.6, 0);
    if (cameraEl && cameraEl.object3D) {
      cameraEl.object3D.getWorldPosition(camPos);
    }

    // Pull ghost toward just in front of the camera
    const dirToCam = new THREE.Vector3().subVectors(camPos, ghostPos).normalize();
    const finalPos = camPos.clone().addScaledVector(dirToCam, -0.4); // ~40cm in front of face

    this.el.setAttribute('animation__drag', {
      property: 'position',
      to: `${finalPos.x} ${finalPos.y} ${finalPos.z}`,
      dur: this.data.dragDuration,
      easing: 'easeInOutCubic'
    });
  },

  // When drag finishes, make ghost disappear
  onDragComplete() {
    const parent = this.el.parentElement;
    if (parent) parent.removeChild(this.el);
  }
});


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
          // --- Compute room bounding box ---
        const box = new THREE.Box3().setFromObject(modelRoot);

        // Save globally for ghost-wander later
        window.__ROOM_BOUNDING_BOX__ = box;

        console.log("Room bounding box:", box.min, box.max);

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

            // Make ghost selectable like other objects
            ghost.classList.add('clickable');
            ghost.setAttribute('hover-highlight', '');


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

            // NEW: endless random floating
            ghost.setAttribute('ghost-wander', 'radius: 2; minY: 0.5; maxY: 2.5; moveDuration: 4500');

            (worldContainer || scene).appendChild(ghost);},
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

// ===============================
// Two-hand select with center glow
// ===============================
// ===============================
// Two-hand select with center glow + ghost drag
// ===============================
AFRAME.registerComponent('two-hand-select-circle', {
  init() {
    const scene = this.el.sceneEl;
    this.scene = scene;

    // Find hands & camera
    this.leftHand  = scene.querySelector('#leftHand');
    this.rightHand = scene.querySelector('#rightHand');
    this.camera    = scene.querySelector('a-camera');

    this.leftPinching  = false;
    this.rightPinching = false;

    this.wasActive        = false;
    this.isHoldingGhost   = false;
    this.dragStarted      = false;
    this.heldGhostEl      = null;
    this.baseScale        = 1.0;
    this.currentScale     = 1.0;
    this.growthRate       = 0.0004; // scale per ms (~0.4 per second)
    this.dragThreshold    = 1.2;    // 20% bigger

    // --- Create the glowing circle preview (outline only) ---
    this.preview = document.createElement('a-entity');
    this.preview.setAttribute(
      'geometry',
      'primitive: ring; radiusInner: 0.11; radiusOuter: 0.13; segmentsTheta: 64'
    );
    this.preview.setAttribute(
      'material',
      'color: #00ffff; shader: flat; opacity: 0.5; side: double; transparent: true'
    );
    this.preview.setAttribute('visible', 'false');

    if (this.camera) {
      this.camera.appendChild(this.preview);
      this.preview.setAttribute('position', '0 0 -1.2');
    } else {
      scene.appendChild(this.preview);
      this.preview.setAttribute('position', '0 1.6 -1.5');
    }

    // --- Listen for pinch events from hand-tracking-controls ---
    const addPinchListeners = (handEl, side) => {
      if (!handEl) return;
      handEl.addEventListener('pinchstarted', () => {
        if (side === 'left') this.leftPinching = true;
        else this.rightPinching = true;
      });
      handEl.addEventListener('pinchended', () => {
        if (side === 'left') this.leftPinching = false;
        else this.rightPinching = false;
      });
    };

    addPinchListeners(this.leftHand, 'left');
    addPinchListeners(this.rightHand, 'right');
  },

  getRaycastTarget() {
    if (!this.camera) return null;
    const cursor = this.camera.querySelector('[raycaster]');
    const rc = cursor && cursor.components && cursor.components.raycaster;
    if (!rc) return null;

    const intersections = rc.intersections || [];
    if (!intersections.length) return null;

    const hit = intersections[0];
    if (hit.object && hit.object.el) return hit.object.el;
    if (hit.el) return hit.el;
    if (hit.object && hit.object.parent && hit.object.parent.el) return hit.object.parent.el;
    return null;
  },

  isGhost(target) {
    if (!target) return false;
    const modelAttr = target.getAttribute('gltf-model');
    return modelAttr === '#ghost';
  },

  tick(time, delta) {
    const scene = this.scene;
    if (!scene) return;

    // Only in XR
    if (!scene.is('vr-mode')) {
      if (this.preview) this.preview.setAttribute('visible', 'false');
      this.wasActive      = false;
      this.isHoldingGhost = false;
      this.dragStarted    = false;
      this.heldGhostEl    = null;
      this.currentScale   = this.baseScale;
      if (this.preview && this.preview.object3D) {
        this.preview.object3D.scale.set(this.baseScale, this.baseScale, this.baseScale);
      }
      return;
    }

    const active = this.leftPinching && this.rightPinching;

    // On pinch start: decide what we're selecting
    if (active && !this.wasActive) {
      const target = this.getRaycastTarget();
      if (this.isGhost(target)) {
        // Start ghost hold mode
        this.isHoldingGhost = true;
        this.dragStarted    = false;
        this.heldGhostEl    = target;
        this.currentScale   = this.baseScale;
        if (this.preview && this.preview.object3D) {
          this.preview.object3D.scale.set(this.baseScale, this.baseScale, this.baseScale);
        }
        if (this.preview) this.preview.setAttribute('visible', 'true');
      } else {
        // Normal object: just fire click once, like before
        this.isHoldingGhost = false;
        this.dragStarted    = false;
        this.heldGhostEl    = null;
        if (this.preview) this.preview.setAttribute('visible', 'false');
        if (target) {
          target.emit('click');
        }
      }
    }

    // While pinch is held
    if (active) {
      if (this.isHoldingGhost && this.preview && this.preview.object3D) {
        // Circle keeps growing while holding ghost
        const dt = (delta || 16);
        this.currentScale += this.growthRate * dt;
        this.preview.object3D.scale.set(this.currentScale, this.currentScale, this.currentScale);

        // When circle 20% bigger, start dragging ghost toward player
        if (!this.dragStarted && this.currentScale >= this.dragThreshold) {
          this.dragStarted = true;
          if (this.heldGhostEl) {
            this.heldGhostEl.emit('ghost-drag-start');
          }
        }

        // Keep it visible during hold
        this.preview.setAttribute('visible', 'true');
      }
    } else {
      // Pinch released → reset preview & ghost-hold state
      if (this.preview && this.preview.object3D) {
        this.preview.object3D.scale.set(this.baseScale, this.baseScale, this.baseScale);
      }
      if (this.preview) this.preview.setAttribute('visible', 'false');
      this.isHoldingGhost = false;
      this.dragStarted    = false;
      this.heldGhostEl    = null;
    }

    this.wasActive = active;
  }
});

