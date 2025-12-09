// main.js (new project, merged behaviours)

import 'aframe';

const THREE = window.AFRAME && window.AFRAME.THREE ? window.AFRAME.THREE : window.THREE;
const GHOST_SCALE = 0.5;

/**
 * Hover highlight component (from old project, adapted)
 * Darkens an entity slightly when raycaster / cursor hovers over it.
 */
AFRAME.registerComponent('hover-highlight', {
  schema: {
    // Multiplicative factor for lightness; <1.0 darkens, >1.0 would lighten
    darkenFactor: { type: 'number', default: 0.6 }
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

    const darkenColor = color => {
      if (!color || !color.getHSL) return;
      const hsl = { h: 0, s: 0, l: 0 };
      color.getHSL(hsl);
      hsl.l = Math.max(0, Math.min(1, hsl.l * this.data.darkenFactor));
      color.setHSL(hsl.h, hsl.s, hsl.l);
    };

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
          if ('color' in cm) {
            try { darkenColor(cm.color); } catch (e) {}
          }
          if ('emissive' in cm) {
            try { darkenColor(cm.emissive); } catch (e) {}
          }
        });
      } else {
        const cloned = cloneMat(origMat);
        mesh.material = cloned;
        if (cloned && 'color' in cloned) {
          try { darkenColor(cloned.color); } catch (e) {}
        }
        if (cloned && 'emissive' in cloned) {
          try { darkenColor(cloned.emissive); } catch (e) {}
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
    radius:       { type: 'number', default: 2.0 },   // how far it can drift from current pos (in x/z)
    minY:         { type: 'number', default: 0.5 },   // lower vertical bound
    maxY:         { type: 'number', default: 2.5 },   // upper vertical bound
    moveDuration: { type: 'number', default: 4500 },  // ms per move
    pauseDuration:{ type: 'number', default: 500 }    // ms pause between moves
  },

  init() {
    this.isDragging = false;

    this._onMoveComplete = this.onMoveComplete.bind(this);
    this._onDragComplete = this.onDragComplete.bind(this);
    this._onDragStart = this.startDrag.bind(this);
    this._onDragStop  = this.stopDrag.bind(this);
    this.hasExploded = false;

    this.el.addEventListener('animationcomplete__move', this._onMoveComplete);
    this.el.addEventListener('animationcomplete__drag', this._onDragComplete);
    this.el.addEventListener('ghost-drag-start', this._onDragStart);
    this.el.addEventListener('ghost-drag-stop', this._onDragStop);

    // Reusable vectors for distance checks
    this._ghostPos = new THREE.Vector3();
    this._camPos   = new THREE.Vector3();

    // Start wandering after first frame so initial position is set
    setTimeout(() => this.scheduleNextMove(), 50);
  },

  remove() {
    this.el.removeEventListener('animationcomplete__move', this._onMoveComplete);
    this.el.removeEventListener('animationcomplete__drag', this._onDragComplete);
    this.el.removeEventListener('ghost-drag-start', this._onDragStart);
    this.el.removeEventListener('ghost-drag-stop', this._onDragStop);
  },

  scheduleNextMove() {
    // If currently being dragged, don't schedule wandering
    if (this.isDragging) return;

    const el = this.el;
    const obj = el.object3D;
    const currentPos = obj.position;

    // If room bounds not ready, fallback to radius
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
    if (this.isDragging) return;

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
    // If dragging now, don't schedule wandering
    if (this.isDragging) return;
    // Little pause, then move again
    setTimeout(() => this.scheduleNextMove(), this.data.pauseDuration);
  },

  startDrag() {
    if (this.isDragging) return;
    this.isDragging = true;

    // Stop wandering animations
    this.el.removeAttribute('animation__move');
    this.el.removeAttribute('animation__spin');

    const scene = this.el.sceneEl;
    const cameraEl = scene && (scene.camera && scene.camera.el);
    if (!cameraEl || !cameraEl.object3D) return;

    const camObj = cameraEl.object3D;

    // Target: very close in front of the camera
    const target = new THREE.Vector3(0, 0, -0.25); // 25cm in front
    camObj.localToWorld(target);

    // Slower drag: 3.5–4s feels dramatic
    this.el.setAttribute('animation__drag', {
      property: 'position',
      to: `${target.x} ${target.y} ${target.z}`,
      dur: 5000,
      easing: 'easeInOutQuad'
    });
  },

  stopDrag() {
    // Called when pinch is released
    if (!this.isDragging) return;

    this.isDragging = false;
    // Stop drag animation
    this.el.removeAttribute('animation__drag');

    // Resume wandering from current position
    this.scheduleNextMove();
  },

  spawnExplosionAndRemoveGhost() {
    // Prevent double-trigger
    if (this.hasExploded) return;
    this.hasExploded = true;

    const scene = this.el.sceneEl;
    if (!scene) {
      if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
      return;
    }

    // Get ghost's world position
    this.el.object3D.getWorldPosition(this._ghostPos);

    // Create explosion entity
    const explosion = document.createElement('a-entity');
    explosion.setAttribute('gltf-model', '#explosion');
    explosion.setAttribute(
      'position',
      `${this._ghostPos.x} ${this._ghostPos.y} ${this._ghostPos.z}`
    );
    explosion.setAttribute('scale', '0.6 0.6 0.6');

    // Play all clips once & freeze on last frame (if needed)
    explosion.setAttribute(
      'animation-mixer',
      'clip: *; loop: once; clampWhenFinished: true'
    );

    const worldRoot = scene.querySelector('#world-root');
    (worldRoot || scene).appendChild(explosion);

    // Remove the ghost itself
    if (this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }

    // Remove explosion after 2 seconds
    setTimeout(() => {
      if (explosion.parentNode) {
        explosion.parentNode.removeChild(explosion);
      }
    }, 2000);
  },

  onDragComplete() {
    // If drag completed while still dragging, "ghost reached the player" → explode + disappear
    if (!this.isDragging) return;

    this.isDragging = false;
    this.spawnExplosionAndRemoveGhost();
  },

  // EXTRA SAFETY: if the ghost gets very close to the camera while dragging,
  // remove it even if the animation event doesn't fire.
  tick() {
    if (!this.isDragging) return;

    const scene = this.el.sceneEl;
    if (!scene) return;

    const cameraEl = scene.camera && scene.camera.el;
    if (!cameraEl || !cameraEl.object3D) return;

    // Get world positions
    this.el.object3D.getWorldPosition(this._ghostPos);
    cameraEl.object3D.getWorldPosition(this._camPos);

    const dist = this._ghostPos.distanceTo(this._camPos);

        // If ghost is within 10cm of the camera, treat as "reached player"
      if (dist < 0.1) {
        this.isDragging = false;
        this.spawnExplosionAndRemoveGhost();
      }    
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
          const isDoor = groupName === 'door' || groupName.includes('door') || groupName === 'door';
          const isTable = groupName === 'table' || groupName.includes('table') || groupName === 'table';
          const isShelf = groupName === 'shelf' || groupName.includes('shelf') || groupName === 'shelf';
          const isCabinet = groupName === 'cabinet' || groupName.includes('cabinet') || groupName === 'cabinet';

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

          if (!isWall && !isDoor && !isTable && !isShelf && !isCabinet) {
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

                // Pick up to 3 random parts as "fake" objects that spawn ghosts
        const ghostModelIds = ['#ghost1', '#ghost2', '#ghost3'];
        if (!createdParts.length) {
          console.warn('[GLB Split] No non-wall parts created.');
          return;
        }

        const shuffledParts = createdParts.slice().sort(() => Math.random() - 0.5);
        const numGhosts = Math.min(ghostModelIds.length, shuffledParts.length);

        for (let i = 0; i < numGhosts; i++) {
          const fakeEl = shuffledParts[i];
          const modelId = ghostModelIds[i];

          if (!fakeEl) continue;

          fakeEl.setAttribute('data-fake', 'true');
          fakeEl.setAttribute('data-ghost-model', modelId);

          fakeEl.addEventListener(
            'click',
            e => {
              if (e && e.stopPropagation) e.stopPropagation();
              if (fakeEl.getAttribute('data-fake-handled') === 'true') return;
              fakeEl.setAttribute('data-fake-handled', 'true');

              // Get world transform of the clicked part
              const worldPos = new THREE.Vector3();
              const worldQuat = new THREE.Quaternion();
              const worldScale = new THREE.Vector3();
              fakeEl.object3D.updateWorldMatrix(true, false);
              fakeEl.object3D.matrixWorld.decompose(worldPos, worldQuat, worldScale);

              // Hide the original part
              fakeEl.setAttribute('visible', 'false');

              // Spawn that part's assigned ghost model
              const ghost = document.createElement('a-entity');
              const ghostModel = fakeEl.getAttribute('data-ghost-model') || modelId;
              ghost.setAttribute('gltf-model', ghostModel);
              ghost.setAttribute(
                'position',
                `${worldPos.x} ${worldPos.y} ${worldPos.z}`
              );
              ghost.setAttribute(
                'scale',
                `${GHOST_SCALE} ${GHOST_SCALE} ${GHOST_SCALE}`
              );

              // Mark as ghost + make it selectable
              ghost.setAttribute('data-is-ghost', 'true');
              ghost.classList.add('selectable', 'clickable');
              ghost.setAttribute('hover-highlight', '');

              // Face roughly toward the camera
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

              // Endless random floating (within room bounds)
              ghost.setAttribute(
                'ghost-wander',
                'radius: 2; minY: 0.5; maxY: 2.5; moveDuration: 4500'
              );

              (worldContainer || scene).appendChild(ghost);
            },
            { once: true }
          );
        }

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
// Two-hand select with center glow + ghost dragging
// ===============================
// ===============================
// Two-hand select with center glow + latched ghost dragging
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
    this.wasActive     = false;

    // Ghost hold state
    this.currentTarget   = null;
    this.isHoldingGhost  = false;
    this.holdTimeMs      = 0;
    this.hasTriggeredDrag = false;

    // --- Glowing circle preview (in the center of view) ---
    this.preview = document.createElement('a-entity');
    this.preview.setAttribute('geometry', 'primitive: circle; radius: 0.12');
    this.preview.setAttribute(
      'material',
      'color: #00ffff; shader: flat; opacity: 0.35; side: double; transparent: true'
    );
    this.preview.setAttribute('visible', 'false');
    this.preview.setAttribute(
      'animation__pulse',
      'property: opacity; dir: alternate; dur: 500; loop: true; from: 0.25; to: 0.6'
    );

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
        this.onGestureEnd(); // pinch ended on either hand
      });
    };

    addPinchListeners(this.leftHand, 'left');
    addPinchListeners(this.rightHand, 'right');
  },

  // Helper: which entity is under the center ray?
  getRaycastTarget() {
    if (!this.camera) return null;

    const cursor = this.camera.querySelector('[raycaster]');
    const rc = cursor && cursor.components && cursor.components.raycaster;
    if (!rc) return null;

    const intersections = rc.intersections || [];
    if (!intersections.length) return null;

    const hit = intersections[0];
    let target = null;

    if (hit.object && hit.object.el) {
      target = hit.object.el;
    } else if (hit.el) {
      target = hit.el;
    } else if (hit.object && hit.object.parent && hit.object.parent.el) {
      target = hit.object.parent.el;
    }

    return target || null;
  },

  isGhost(target) {
    if (!target) return false;
    return (
      target.getAttribute('data-is-ghost') === 'true' ||
      target.getAttribute('gltf-model') === '#ghost'
    );
  },

  tick(time, timeDelta) {
    const scene = this.scene;
    if (!scene) return;

    // Only in XR mode
    if (!scene.is('vr-mode')) {
      if (this.preview) this.preview.setAttribute('visible', 'false');
      this.wasActive = false;
      return;
    }

    const active = this.leftPinching && this.rightPinching;

    // If not pinching on this frame, do nothing here (onGestureEnd handles cleanup)
    if (!active) {
      if (this.preview) this.preview.setAttribute('visible', 'false');
      this.wasActive = false;
      return;
    }

    // Pinch just started this frame
    if (active && !this.wasActive) {
      const target = this.getRaycastTarget();

      if (this.isGhost(target)) {
        // Latch onto this ghost until pinch ends
        this.currentTarget    = target;
        this.isHoldingGhost   = true;
        this.holdTimeMs       = 0;
        this.hasTriggeredDrag = false;

        if (this.preview) {
          this.preview.setAttribute('visible', 'true');
          this.preview.setAttribute('scale', '1 1 1');
        }
      } else if (target) {
        // Normal clickable: behave like a one-shot click
        this.currentTarget    = null;
        this.isHoldingGhost   = false;
        this.holdTimeMs       = 0;
        this.hasTriggeredDrag = false;

        if (this.preview) {
          this.preview.setAttribute('visible', 'false');
        }

        target.emit('click');
      } else {
        // Nothing under cursor
        this.currentTarget    = null;
        this.isHoldingGhost   = false;
        this.holdTimeMs       = 0;
        this.hasTriggeredDrag = false;

        if (this.preview) {
          this.preview.setAttribute('visible', 'false');
        }
      }
    }

    // While pinch is held and we've latched onto a ghost
    if (this.isHoldingGhost && this.currentTarget) {
      const dt = timeDelta || 0;
      this.holdTimeMs += dt;

      const progress = Math.min(this.holdTimeMs / 1000, 1); // 1s to full
      const s = 1 + 0.2 * progress; // up to +20% scale

      if (this.preview) {
        this.preview.setAttribute('visible', 'true');
        this.preview.setAttribute('scale', `${s} ${s} ${s}`);
      }

      // After 1 second of continuous pinch, start dragging
      if (!this.hasTriggeredDrag && this.holdTimeMs >= 1000) {
        this.hasTriggeredDrag = true;
        this.currentTarget.emit('ghost-drag-start');
      }
    }

    this.wasActive = true;
  },

  onGestureEnd() {
    // Called when either hand stops pinching
    if (this.isHoldingGhost && this.currentTarget) {
      this.currentTarget.emit('ghost-drag-stop');
    }

    this.currentTarget    = null;
    this.isHoldingGhost   = false;
    this.holdTimeMs       = 0;
    this.hasTriggeredDrag = false;

    if (this.preview) {
      this.preview.setAttribute('scale', '1 1 1');
      this.preview.setAttribute('visible', 'false');
    }

    this.wasActive = false;
  }
});
