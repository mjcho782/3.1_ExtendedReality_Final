// main.js (new project, merged behaviours)

import 'aframe';

const THREE = window.AFRAME && window.AFRAME.THREE ? window.AFRAME.THREE : window.THREE;
const GHOST_SCALE = 3.0;

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

    /* ===== 1B. HAND TRACKING → CLICK ===== */
    const rightHand = scene.querySelector('#rightHand');
    const leftHand = scene.querySelector('#leftHand');

    // Raycast from camera centre, find first .clickable and emit 'click'
    function clickCenterObject() {
      const cameraEl = scene.camera && scene.camera.el;
      if (!cameraEl || !scene.object3D) return;

      const raycaster = new THREE.Raycaster();

      // Origin: camera world position
      const origin = new THREE.Vector3();
      cameraEl.object3D.getWorldPosition(origin);

      // Direction: camera forward (-Z in local space)
      const direction = new THREE.Vector3(0, 0, -1);
      const worldQuat = new THREE.Quaternion();
      cameraEl.object3D.getWorldQuaternion(worldQuat);
      direction.applyQuaternion(worldQuat).normalize();

      raycaster.set(origin, direction);

      const intersects = raycaster.intersectObjects(scene.object3D.children, true);

      for (let i = 0; i < intersects.length; i++) {
        const obj = intersects[i].object;
        if (!obj) continue;

        // Climb to A-Frame entity
        let targetEl = obj.el;
        let parentObj = obj.parent;
        while (!targetEl && parentObj) {
          targetEl = parentObj.el;
          parentObj = parentObj.parent;
        }

        if (targetEl && targetEl.classList && targetEl.classList.contains('clickable')) {
          console.log('Pinch → click on', targetEl.id || targetEl.tagName);
          targetEl.emit('click');
          return;
        }
      }
    }

    function handlePinch(handEl, side) {
      if (!handEl) return;
      handEl.addEventListener('pinchstarted', () => {
        console.log('Pinch started on', side, 'hand → casting ray from camera center');
        clickCenterObject();
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

          scene.appendChild(partEl);
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

            const eulerG = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
            const rotY = THREE.MathUtils.radToDeg(eulerG.y);
            ghost.setAttribute('rotation', `0 ${rotY} 0`);

            const riseTo = `${worldPos.x} ${worldPos.y + 2} ${worldPos.z}`;
            ghost.setAttribute(
              'animation__rise',
              `property: position; to: ${riseTo}; dur: 3000; easing: linear`
            );

            scene.appendChild(ghost);

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

  /* ======================================================
   * 2. GENERIC CAMERA OBJECT DETECTION OVERLAY (from new project)
   * ====================================================== */
  const video = document.getElementById('cameraFeed');
  const overlay = document.getElementById('detection-overlay');
  const ctx = overlay ? overlay.getContext('2d') : null;

  let detectionModel = null;
  let detectionRunning = false;

  function resizeOverlay() {
    if (!overlay) return;
    overlay.width = window.innerWidth;
    overlay.height = window.innerHeight;
  }

  if (overlay) {
    resizeOverlay();
    window.addEventListener('resize', resizeOverlay);
  }

  async function startCamera() {
    if (!video) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      video.srcObject = stream;
      await video.play();
      console.log('Camera started for object detection.');
    } catch (err) {
      console.error('Failed to start camera for detection:', err);
    }
  }

  async function loadDetectionModel() {
    try {
      if (window.cocoSsd) {
        detectionModel = await window.cocoSsd.load();
        console.log('COCO-SSD model loaded (used only for bounding boxes).');
      } else {
        console.warn(
          'cocoSsd script not found. Make sure it is loaded in index.html.'
        );
      }
    } catch (err) {
      console.error('Failed to load detection model:', err);
    }
  }

  async function detectionLoop() {
    if (!detectionRunning || !detectionModel || !video || !overlay || !ctx) {
      requestAnimationFrame(detectionLoop);
      return;
    }

    if (
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      requestAnimationFrame(detectionLoop);
      return;
    }

    try {
      const predictions = await detectionModel.detect(video);

      ctx.clearRect(0, 0, overlay.width, overlay.height);

      const cx = overlay.width / 2;
      const cy = overlay.height / 2;

      const scaleX = overlay.width / video.videoWidth;
      const scaleY = overlay.height / video.videoHeight;

      predictions.forEach(pred => {
        const [x, y, width, height] = pred.bbox;

        const sx = x * scaleX;
        const sy = y * scaleY;
        const sw = width * scaleX;
        const sh = height * scaleY;

        // Debug outline
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        ctx.strokeRect(sx, sy, sw, sh);

        const centerInside =
          cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh;

        if (centerInside) {
          // Darken object under screen center
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.fillRect(sx, sy, sw, sh);
        }
      });
    } catch (err) {
      console.error('Error during detection loop:', err);
    }

    requestAnimationFrame(detectionLoop);
  }

  async function initDetection() {
    if (!overlay || !video || !navigator.mediaDevices) {
      console.warn('Detection overlay / video / mediaDevices not available.');
      return;
    }

    try {
      await startCamera();
      await loadDetectionModel();

      detectionRunning = true;
      detectionLoop();
    } catch (err) {
      console.error('Failed to initialize detection:', err);
    }
  }

  initDetection();
});
