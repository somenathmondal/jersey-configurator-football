// This script handles the 3D visualization of the jersey

// DEBUG MODE: Add #debug to the URL to enable (e.g., http://localhost:8080/jersey-configurator/index.html#debug)
const DEBUG_MODE = window.location.hash === '#debug';

// Debug logging helper - only logs when DEBUG_MODE is enabled
function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}

// Import Three.js using import map
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Model mapping configuration
const MODEL_MAP = {
    'round_reglan': 'round_collar_reglan_01.glb',
    'round_set_in': 'round_collar_set_in_02.glb',
    'insert_reglan': 'insert_collar_reglan_01.glb',
    'insert_set_in': 'insert_collar_set_in_03.glb',
    'v_neck_reglan': 'v_neck_reglan_01.glb',
    'v_neck_set_in': 'v_neck_set_in_01.glb',
    'v_neck_crossed_reglan': 'v_neck_crossed_reglan_01.glb',
    'v_neck_crossed_set_in': 'v_neck_crossed_set_in_01.glb'
};

const CAMERA_POSITION_FOR_PART = {
    'front': { x: 0.00, y: 0.45, z: 4.80 },
    'back': { x: 0.00, y: 0.45, z: -4.80 },
    'left-sleeve': { x: 2.21, y: 1.97, z: -0.01 },
    'right-sleeve': { x: -2.37, y: 1.97, z: -0.17 },
    'collar': { x: 0.0, y: 1.25, z: 1.80 },
    'collar2': { x: 0.0, y: 1.25, z: 1.70 },
    'hem': { x: 0.0, y: 0.75, z: 2.5 },
};

// Camera target (lookAt) positions for each part
const CAMERA_TARGET_FOR_PART = {
    'front': { x: 0.0, y: 0.0, z: 0.0 },
    'back': { x: 0.0, y: 0.0, z: 0.0 },
    'left-sleeve': { x: -0.01, y: 0.23, z: -0.17 },
    'right-sleeve': { x: 0.15, y: 0.19, z: -0.13 },
    'collar': { x: 0.0, y: 0.70, z: -0.20 },
    'collar2': { x: 0.0, y: 0.70, z: -0.20 },
    'hem': { x: 0.0, y: 0.25, z: -0.05 },
};

// Helper function to get URL parameters
function getURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        collar: urlParams.get('collar') || 'v_neck',
        shoulder: urlParams.get('shoulder') || 'reglan'
    };
}


// Helper function to calculate the correct base path
function getBasePath() {
    return ''; // All assets are relative to the root in this repository
}

// Helper function to get model path based on selections
function getModelPath(collar, shoulder) {
    const basePath = getBasePath();
    return `${basePath}jersey_3d_models/messi_statue.glb`;
}


// Make getModelPath available globally for use in script.js
window.getModelPath = getModelPath;

// Make getBasePath available globally for use in script.js
window.getBasePath = getBasePath;

class JerseyViewer {
    constructor(containerId) {
        this.container = document.querySelector(containerId);
        if (!this.container) {
            console.error(`Container ${containerId} not found`);
            return;
        }

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.jerseyMesh = null;
        this.animationId = null;
        this.gltfLoader = new GLTFLoader();
        this.texture = null;
        this.current3DObject = null;
        this._loadId = 0; // Used to ignore stale load callbacks (race condition fix)

        // Materials to exclude from texture application (stitches should keep original appearance)
        this.currentPart = 'front';
        this.partCanvases = {};
        this.partTextures = {};
        this.excludedMaterials = ['stitches_sleeves', 'cover_stitches', 'stitches_main'];

        // Detect if this is a shared page (read-only view)
        this.isSharedPage = window.location.pathname.includes('/share/');

        // Track active mode: 'colors' (stripes) or 'design' (SVG design)
        this.activeMode = 'colors'; // Default to colors & stripes mode

        // Loading state tracking for canvas loader
        this.loadingState = {
            modelLoaded: false,
            designLoaded: false
        };

        // Bounding boxes for jersey parts (as percentages of canvas)
        // Separate configurations for different shoulder types
        this.partBoundingBoxes_setIn = {
            'front': { x: 0.03, y: 0.1, width: 0.46, height: 0.63 },
            'back': { x: 0.53, y: 0.1, width: 0.46, height: 0.63 },
            'left-sleeve': { x: 0.58, y: 0.75, width: 0.35, height: 0.16 },
            'right-sleeve': { x: 0.08, y: 0.75, width: 0.35, height: 0.16 },
            'collar': { x: 0.0, y: 0.054, width: 0.5, height: 0.03 },
            'collar2': { x: 0.195, y: 0.095, width: 0.105, height: 0.021 },
            'hem': { x: 0.1, y: 0.925, width: 0.82, height: 0.035 },
        };

        this.partBoundingBoxes_reglan = {
            'front': { x: 0.03, y: 0.06, width: 0.43, height: 0.6 },
            'back': { x: 0.53, y: 0.06, width: 0.43, height: 0.6 },
            'left-sleeve': { x: 0.57, y: 0.65, width: 0.35, height: 0.26 },
            'right-sleeve': { x: 0.07, y: 0.65, width: 0.35, height: 0.26 },
            'collar': { x: 0.01, y: 0.05, width: 0.59, height: 0.03 },
            'collar2': { x: 0.2, y: 0.095, width: 0.104, height: 0.021 },
            'hem': { x: 0.1, y: 0.925, width: 0.82, height: 0.035 },
        };

        // Get current shoulder type from URL
        const urlParams = getURLParameters();
        this.currentShoulderType = urlParams.shoulder || 'reglan';

        // Set active bounding boxes based on shoulder type
        this.partBoundingBoxes = this.currentShoulderType === 'set_in'
            ? this.partBoundingBoxes_setIn
            : this.partBoundingBoxes_reglan;

        // Camera reset animation properties
        this.initialCameraPosition = new THREE.Vector3(0, 0.45, 4.8);
        this.initialControlsTarget = new THREE.Vector3(0, 0, 0);
        this.cameraResetDuration = 800; // Duration in milliseconds
        this.isAnimatingCamera = false;
        this.cameraAnimationStartTime = 0;

        // Pre-allocated reusable objects for camera animation (Safari performance optimization)
        this._animCenterVector = new THREE.Vector3(0, 0, 0); // Jersey center point
        this._animStartSpherical = new THREE.Spherical();
        this._animTargetSpherical = new THREE.Spherical();
        this._animCurrentSpherical = new THREE.Spherical();
        this._animTempVector = new THREE.Vector3(); // Temporary vector for calculations

        // Stripe configuration state
        // Per-part stripe orientation (horizontal or vertical)
        this.stripeOrientationByPart = {
            'front': 'horizontal',
            'back': 'horizontal',
            'left-sleeve': 'horizontal',
            'right-sleeve': 'horizontal',
            'collar': 'horizontal',
            'collar2': 'horizontal',
            'hem': 'horizontal'
        };


        // Helper function to create stripe layer config
        // enabled: boolean - whether this layer is active
        // defaultCounts: object with horizontal and vertical default stripe counts
        // rotation: number - rotation angle in degrees (-90 to 90)
        const createStripeLayer = (enabled, color, position, gap, thickness, defaultCounts, rotation = 0) => ({
            enabled,
            color,
            position,
            gap,
            thickness,
            defaultCounts,
            rotation
        });

        // Determine collar stripe rotation based on collar and shoulder type
        // V-neck reglan: -0.3 degrees, V-neck set_in: +0.3 degrees, others: 0 degrees
        const collarUrlParams = new URLSearchParams(window.location.search);
        const collarType = collarUrlParams.get('collar') || 'insert';
        const shoulderType = collarUrlParams.get('shoulder') || 'reglan';
        const isVNeck = collarType.includes('v_neck');

        let collarRotation = 0;
        if (isVNeck) {
            collarRotation = shoulderType === 'set_in' ? 0.3 : -0.3;
        }

        debugLog(`🔄 Initializing collar stripes - Collar: ${collarType}, Shoulder: ${shoulderType}, Rotation: ${collarRotation}°`);

        // Part-specific default stripe configurations
        // Each part has its own set of 4 stripe layers (tab1-tab4) with appropriate defaults
        this.stripeLayersByPart = {
            'front': {
                tab1: createStripeLayer(true, '#eaeef1', 10, 10, 10, { horizontal: 4, vertical: 3 }),
                tab2: createStripeLayer(false, '#eaeef1', 15, 10, 10, { horizontal: 4, vertical: 3 }),
                tab3: createStripeLayer(false, '#eaeef1', 20, 10, 10, { horizontal: 4, vertical: 3 }),
                tab4: createStripeLayer(false, '#eaeef1', 10, 10, 10, { horizontal: 4, vertical: 3 })
            },
            'back': {
                tab1: createStripeLayer(true, '#eaeef1', 10, 10, 10, { horizontal: 4, vertical: 3 }),
                tab2: createStripeLayer(false, '#eaeef1', 15, 10, 10, { horizontal: 4, vertical: 3 }),
                tab3: createStripeLayer(false, '#eaeef1', 20, 10, 10, { horizontal: 4, vertical: 3 }),
                tab4: createStripeLayer(false, '#eaeef1', 10, 10, 10, { horizontal: 4, vertical: 3 })
            },
            'left-sleeve': {
                tab1: createStripeLayer(true, '#eaeef1', 15, 10, 10, { horizontal: 3, vertical: 2 }),
                tab2: createStripeLayer(false, '#eaeef1', 10, 10, 10, { horizontal: 3, vertical: 2 }),
                tab3: createStripeLayer(false, '#eaeef1', 15, 10, 10, { horizontal: 3, vertical: 2 }),
                tab4: createStripeLayer(false, '#eaeef1', 20, 10, 10, { horizontal: 3, vertical: 2 })
            },
            'right-sleeve': {
                tab1: createStripeLayer(true, '#eaeef1', 15, 10, 10, { horizontal: 3, vertical: 2 }),
                tab2: createStripeLayer(false, '#eaeef1', 10, 10, 10, { horizontal: 3, vertical: 2 }),
                tab3: createStripeLayer(false, '#eaeef1', 15, 10, 10, { horizontal: 3, vertical: 2 }),
                tab4: createStripeLayer(false, '#eaeef1', 20, 10, 10, { horizontal: 3, vertical: 2 })
            },
            'collar': {
                tab1: createStripeLayer(true, '#eaeef1', 4, 1, 1, { horizontal: 2, vertical: 2 }, collarRotation),
                tab2: createStripeLayer(false, '#eaeef1', 4, 1, 1, { horizontal: 2, vertical: 2 }, collarRotation),
                tab3: createStripeLayer(false, '#eaeef1', 4, 1, 1, { horizontal: 2, vertical: 2 }, collarRotation),
                tab4: createStripeLayer(false, '#eaeef1', 4, 1, 1, { horizontal: 2, vertical: 2 }, collarRotation)
            },
            'collar2': {
                tab1: createStripeLayer(true, '#eaeef1', 1.7, 1, 1, { horizontal: 2, vertical: 2 }),
                tab2: createStripeLayer(false, '#eaeef1', 1.7, 1, 1, { horizontal: 2, vertical: 2 }),
                tab3: createStripeLayer(false, '#eaeef1', 1.7, 1, 1, { horizontal: 2, vertical: 2 }),
                tab4: createStripeLayer(false, '#eaeef1', 1.7, 1, 1, { horizontal: 2, vertical: 2 })
            },
            'hem': {
                tab1: createStripeLayer(true, '#eaeef1', 1.7, 1, 1, { horizontal: 2, vertical: 2 }),
                tab2: createStripeLayer(false, '#eaeef1', 1.7, 1, 1, { horizontal: 2, vertical: 2 }),
                tab3: createStripeLayer(false, '#eaeef1', 1.7, 1, 1, { horizontal: 2, vertical: 2 }),
                tab4: createStripeLayer(false, '#eaeef1', 1.7, 1, 1, { horizontal: 2, vertical: 2 })
            }
        };




        this.init();
        this.createLights();
        this.createGroundPlane();
        this.createTexture();
        this.setupCameraReset();
        this.setupLogoControls(); // Set up logo slider controls on initialization
        this.setupStripeControls(); // Set up stripe controls on initialization
        this.setupPartColorControl(); // Set up part color picker control
        this.updateStripeUIForCurrentPart(); // Initialize UI with default part's config
        this.animate();
        this.handleResize();


        // Setup 3D logo interaction (raycasting for drag-and-drop)
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDragging = false;
        this.draggedPart = null;
        this.setupLogoInteraction();

        // Load custom control icons
        // Determine correct path based on current page location
        const currentPath = window.location.pathname;
        const isInSubfolder = currentPath.includes('/admin-design/') || currentPath.includes('/share/');
        const iconBasePath = isInSubfolder ? '../../images/' : '../images/';

        this.deleteIcon = new Image();
        this.deleteIcon.src = iconBasePath + 'delete.svg';
        this.copyIcon = new Image();
        this.copyIcon.src = iconBasePath + 'copy.svg';
    }

    /**
     * Get the default collar stripe rotation based on collar type
     * V-neck jerseys get a -0.3 degree rotation, others get 0
     * @returns {number} The rotation angle in degrees
     */
    getCollarStripeRotation() {
        // Get collar and shoulder type from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const collar = urlParams.get('collar') || 'insert';
        const shoulder = urlParams.get('shoulder') || 'reglan';

        // Check if it's a v_neck type (v_neck, v_neck_crossed, etc.)
        const isVNeck = collar.includes('v_neck');

        let rotation = 0;
        if (isVNeck) {
            rotation = shoulder === 'set_in' ? 0.3 : -0.3;
        }

        debugLog(`🔄 Collar: ${collar}, Shoulder: ${shoulder}, isVNeck: ${isVNeck}, rotation: ${rotation}°`);

        return rotation;
    }


    // Monitor memory usage (helpful for performance debugging)
    logMemoryUsage() {
        if (performance.memory) {
            const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
            const total = (performance.memory.totalJSHeapSize / 1048576).toFixed(2);
            const limit = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2);
            debugLog(`💾 Memory Usage: ${used} MB / ${total} MB (Limit: ${limit} MB)`);
            return { used, total, limit };
        } else {
            debugLog('💾 Memory API not available (Chrome only)');
            return null;
        }
    }

    // Update loading state (for debugging/tracking)
    updateLoadingState(key, value) {
        this.loadingState[key] = value;
        debugLog(`🔄 Loading state updated: ${key} = ${value}`, this.loadingState);
    }

    // Hide the canvas loading overlay with smooth transition
    // Call this ONLY when ALL loading operations are complete
    hideCanvasLoader() {
        const overlay = document.getElementById('canvas-loading-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            debugLog('✅ Hiding canvas loader');
            overlay.classList.add('hidden');
            // Remove from DOM after transition completes
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 400);
        }
    }

    // Show the canvas loading overlay (if needed for re-loading)
    showCanvasLoader() {
        const overlay = document.getElementById('canvas-loading-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.classList.remove('hidden');
        }
    }

    // Mark design as loaded (for tracking)
    markDesignLoaded() {
        this.updateLoadingState('designLoaded', true);
    }

    // Mark model as loaded (for tracking)
    markModelLoaded() {
        this.updateLoadingState('modelLoaded', true);
    }

    // Helper method to check if a material should be excluded from texture application
    shouldExcludeMaterial(material) {
        const materialName = material?.name || '';
        return this.excludedMaterials.includes(materialName);
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = null; // Enable transparent canvas background

        // Create camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
        this.camera.position.set(this.initialCameraPosition.x, this.initialCameraPosition.y, this.initialCameraPosition.z);

        // Create renderer with proper PBR settings
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Configure tone mapping and exposure for neutral lighting
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // Remove placeholder and add renderer
        const placeholder = this.container.querySelector('.viewer-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        this.container.appendChild(this.renderer.domElement);

        // Create controls with specific camera limits for a premium, guided experience (front-facing focus for the statue)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 0);

        // Enforce boundary limits for the Messi statue view
        this.controls.enablePan = false;
        this.controls.minDistance = 3.0;
        this.controls.maxDistance = 5.0;

        // Polar Angle (Vertical rotation): Restrict looking directly under/over (60 deg to 105 deg)
        this.controls.minPolarAngle = Math.PI / 3;     // 60 deg
        this.controls.maxPolarAngle = Math.PI / 1.714; // 105 deg

        // Azimuth Angle (Horizontal rotation): Restrict rotating to the backside (-25 deg to +25 deg)
        this.controls.minAzimuthAngle = -25 * Math.PI / 180;  // -25 deg
        this.controls.maxAzimuthAngle = 25 * Math.PI / 180;   // +25 deg
    }

    createLights() {
        // Create an ambient light for base illumination
        this.lightsContainer = new THREE.Object3D();
        this.scene.add(this.lightsContainer);

        this.ambientLight = new THREE.AmbientLight(0xffffff, 1);
        this.lightsContainer.add(this.ambientLight);

        // Add directional lights similar to model-viewer's default setup
        this.keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
        this.keyLight.position.set(-2, 2, 2);
        this.lightsContainer.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
        this.fillLight.position.set(2, -1, -1);
        this.lightsContainer.add(this.fillLight);

        this.backLight = new THREE.DirectionalLight(0xffffff, 0.5);
        this.backLight.position.set(1, 3, -2);
        this.lightsContainer.add(this.backLight);

        this.lightsContainer.rotation.y = Math.PI;

        // Load neutral environment map for PBR lighting
        this.loadEnvironmentMap();
    }

    loadEnvironmentMap() {
        // Create a neutral environment using a data texture
        // This provides proper IBL (Image-Based Lighting) for PBR materials
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();

        // Create a simple neutral gray environment
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0xcccccc);

        const envMap = pmremGenerator.fromScene(envScene).texture;
        this.scene.environment = envMap;
        this.scene.environmentIntensity = 0.9;

        pmremGenerator.dispose();

        debugLog('✅ Neutral environment map loaded with exposure 1.0');
    }

    createGroundPlane() {
        // Create a circular ground plane with soft shadow
        const groundGeometry = new THREE.CircleGeometry(2.5, 64);

        // Create a canvas for the soft shadow gradient
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Create radial gradient for soft contact shadow
        const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.15)');     // Darker in center
        gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');   // Medium
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');        // Transparent at edges

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        // Create texture from canvas
        const shadowTexture = new THREE.CanvasTexture(canvas);
        shadowTexture.needsUpdate = true;

        // Create material with shadow texture
        const groundMaterial = new THREE.MeshBasicMaterial({
            map: shadowTexture,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            color: 0xffffff
        });

        this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        this.groundPlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
        this.groundPlane.position.y = -1.5; // Position below the model
        this.groundPlane.receiveShadow = true;

        this.scene.add(this.groundPlane);

        debugLog('✅ Ground plane with soft contact shadow created');
    }

    createTexture() {
        // Define jersey parts
        const parts = ['front', 'back', 'right-sleeve', 'left-sleeve', 'collar', 'collar2', 'hem'];

        // Initialize storage for canvases and textures
        this.partCanvases = {};
        this.partTextures = {};
        this.currentPart = 'front'; // Default active part

        // Material name to part mapping (based on GLB material names)
        this.materialToPartMap = {
            'body_F': 'front',
            'body_B': 'back',
            'sleeves_L': 'left-sleeve',
            'sleeves_R': 'right-sleeve',
            'collar': 'collar',
            'collar2': 'collar2',
            'hem': 'hem'
        };

        debugLog('🎨 Initializing multi-canvas architecture...');

        // Create Fabric canvas and Three.js texture for each part
        parts.forEach(part => {
            const canvasId = `fabric-canvas-${part}`;
            const fabricCanvasElement = document.getElementById(canvasId);

            if (!fabricCanvasElement) {
                console.error(`Canvas element not found: ${canvasId}`);
                return;
            }

            // Initialize Fabric.js canvas (optimized for performance)
            this.partCanvases[part] = new fabric.Canvas(fabricCanvasElement, {
                width: 2048,  // Reduced from 4096 for 75% memory reduction
                height: 2048,
                backgroundColor: '#ffffff',
                enableRetinaScaling: false  // Disabled for consistent memory usage
            });

            // Create Three.js texture from Fabric canvas (optimized settings)
            const texture = new THREE.CanvasTexture(fabricCanvasElement);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;  // Reduced from max (often 16x) for better performance
            texture.minFilter = THREE.LinearFilter;  // No mipmaps needed for flat textures
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;  // Disabled to save 33% texture memory
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.flipY = false; // Flip Y-axis for correct UV mapping

            this.partTextures[part] = texture;

            // Hide the canvas element by default (only visible in debug mode)
            fabricCanvasElement.style.display = 'none';
            fabricCanvasElement.style.position = 'absolute';
            fabricCanvasElement.style.left = '0px';

            // Add event listener for object selection to update UI sliders
            this.partCanvases[part].on('selection:created', (e) => {
                this.updateLogoSliders(e.selected[0]);
            });

            this.partCanvases[part].on('selection:updated', (e) => {
                this.updateLogoSliders(e.selected[0]);
            });

            this.partCanvases[part].on('selection:cleared', () => {
                this.resetLogoSliders();
            });

            debugLog(`✅ Initialized canvas for "${part}": 2048x2048 (optimized)`);
        });

        debugLog(`🎨 Multi-canvas setup complete. ${parts.length} canvases initialized.`);

        // Log memory usage after canvas creation (helps monitor optimization impact)
        this.logMemoryUsage();

        // Enable debug mode if DEBUG_MODE is true
        if (DEBUG_MODE) {
            this.setupDebugMode();
        }
    }

    setupDebugMode() {
        // Show only the active canvas in debug mode
        const activeCanvasId = `fabric-canvas-${this.currentPart}`;
        const fabricCanvasElement = document.getElementById(activeCanvasId);

        if (!fabricCanvasElement) return;

        fabricCanvasElement.setAttribute('data-debug', 'true');

        // Move canvas inside viewer-container and position it there
        const viewerContainer = document.querySelector('.viewer-container');
        if (viewerContainer) {
            // Ensure viewer-container has position relative
            viewerContainer.style.position = 'relative';

            // Move canvas into viewer-container
            viewerContainer.appendChild(fabricCanvasElement);

            // Style the canvas for debug view
            fabricCanvasElement.style.position = 'absolute';
            fabricCanvasElement.style.bottom = '20px';
            fabricCanvasElement.style.right = '20px';
            fabricCanvasElement.style.width = '400px';
            fabricCanvasElement.style.height = '400px';
            fabricCanvasElement.style.border = '3px solid #ff0000';
            fabricCanvasElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
            fabricCanvasElement.style.zIndex = '1000';
            fabricCanvasElement.style.pointerEvents = 'none';
            fabricCanvasElement.style.backgroundColor = '#ffffff';

            debugLog(`🐛 DEBUG MODE ENABLED: Showing "${this.currentPart}" canvas`);

            // Add a debug label
            const debugLabel = document.createElement('div');
            debugLabel.id = 'fabric-debug-label';
            debugLabel.textContent = `Debug: ${this.currentPart.toUpperCase()}`;
            debugLabel.style.cssText = `
                position: absolute;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #ff0000;
                color: white;
                padding: 6px 12px;
                border-radius: 4px;
                font-family: monospace;
                font-size: 12px;
                font-weight: bold;
                z-index: 1001;
                pointer-events: none;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;
            viewerContainer.appendChild(debugLabel);
        }

        // Create debug GUI for lighting controls
        this.createDebugGUI();
    }

    // Switch which canvas is shown in debug mode
    switchDebugCanvas(partName) {
        if (!DEBUG_MODE) return;

        const viewerContainer = document.querySelector('.viewer-container');
        if (!viewerContainer) return;

        // Hide all canvases first and remove debug attribute from containers
        Object.keys(this.partCanvases).forEach(part => {
            const canvasElement = document.getElementById(`fabric-canvas-${part}`);
            if (canvasElement && canvasElement.parentElement === viewerContainer) {
                canvasElement.style.display = 'none';
                // Remove debug attribute from container
                const container = canvasElement.closest('.canvas-container');
                if (container) {
                    container.removeAttribute('data-debug');
                }
            }
        });

        // Show the selected part's canvas
        const activeCanvasId = `fabric-canvas-${partName}`;
        const activeCanvas = document.getElementById(activeCanvasId);

        if (activeCanvas) {
            // Move to viewer container if not already there
            if (activeCanvas.parentElement !== viewerContainer) {
                viewerContainer.appendChild(activeCanvas);

                // Style the canvas for debug view
                activeCanvas.style.position = 'absolute';
                activeCanvas.style.bottom = '20px';
                activeCanvas.style.right = '20px';
                activeCanvas.style.width = '400px';
                activeCanvas.style.height = '400px';
                activeCanvas.style.maxWidth = '400px';
                activeCanvas.style.maxHeight = '400px';
                activeCanvas.style.boxSizing = 'border-box'; // Include border in 400px
                activeCanvas.style.border = '3px solid #ff0000';
                activeCanvas.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
                activeCanvas.style.zIndex = '1000';
                activeCanvas.style.pointerEvents = 'none';
                activeCanvas.style.backgroundColor = '#ffffff';
            }

            activeCanvas.style.display = 'block';
            activeCanvas.setAttribute('data-debug', 'true');

            // Mark the canvas-container wrapper as debug so it's visible
            const container = activeCanvas.closest('.canvas-container');
            if (container) {
                container.setAttribute('data-debug', 'true');
                container.style.display = 'block';
                container.style.position = 'absolute';
                container.style.inset = 'auto'; // Override Fabric.js default inset
                container.style.bottom = '20px';
                container.style.right = '20px';
                container.style.width = '400px';
                container.style.height = '400px';
                container.style.maxWidth = '400px';
                container.style.maxHeight = '400px';
                container.style.boxSizing = 'border-box';
                container.style.zIndex = '1000';
                container.style.overflow = 'hidden'; // Prevent overflow
            }

            // Update debug label
            const debugLabel = document.getElementById('fabric-debug-label');
            if (debugLabel) {
                debugLabel.textContent = `Debug: ${partName.toUpperCase()}`;
            }

            debugLog(`🐛 DEBUG: Switched to "${partName} " canvas`);
        }
    }

    // Setup 3D logo interaction with raycasting
    setupLogoInteraction() {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousedown', (event) => this.onLogoMouseDown(event));
        canvas.addEventListener('mousemove', (event) => this.onLogoMouseMove(event));
        canvas.addEventListener('mouseup', (event) => this.onLogoMouseUp(event));

        debugLog('🎯 3D logo interaction enabled (raycasting)');
    }

    // Handle mouse down for logo dragging
    onLogoMouseDown(event) {
        // Disable logo interaction on shared pages
        if (this.isSharedPage) return;

        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for intersections with 3D model
        if (!this.current3DObject) return;

        const intersects = this.raycaster.intersectObject(this.current3DObject, true);

        if (intersects.length > 0) {
            const intersection = intersects[0];
            const materialName = intersection.object.material?.name || '';

            // Skip excluded materials (stitches)
            if (this.shouldExcludeMaterial(intersection.object.material)) {
                return;
            }

            // Get the part name from material
            const partName = this.materialToPartMap[materialName];

            if (partName && intersection.uv) {
                debugLog(`🎯 Clicked on "${partName}" (material: "${materialName}")`);

                // Get the canvas for this part
                const fabricCanvas = this.partCanvases[partName];
                if (!fabricCanvas) return;

                // Convert UV to canvas coordinates
                const clickPositionCanvas = {
                    x: intersection.uv.x * 2048,
                    y: intersection.uv.y * 2048
                };

                // Try to get active object, or find the logo on this canvas
                let activeObject = fabricCanvas.getActiveObject();
                let wasJustActivated = false;

                // If no active object, look for the logo (not the base design)
                if (!activeObject) {
                    const objects = fabricCanvas.getObjects();

                    // Find logo object that contains the click point
                    for (let i = objects.length - 1; i >= 0; i--) {
                        const obj = objects[i];
                        if (obj.type === 'image' && i > 0) {
                            if (obj.containsPoint({ x: clickPositionCanvas.x, y: clickPositionCanvas.y })) {
                                activeObject = obj;
                                fabricCanvas.setActiveObject(activeObject);
                                fabricCanvas.renderAll();
                                // Update texture to show selection borders
                                this.updateTexture(partName);
                                wasJustActivated = true;
                                debugLog(`✨ Selected logo on "${partName}" - click again to drag`);
                                break;
                            }
                        }
                    }
                }

                // Check if we have an active logo object
                if (activeObject && activeObject.type === 'image') {
                    // If logo was just activated, don't start dragging yet
                    if (wasJustActivated) {
                        return; // Exit early - user needs to click again to drag
                    }

                    // Check if click is on delete or clone control
                    if (activeObject.controls.deleteControl && activeObject.controls.cloneControl) {
                        const deleteControl = activeObject.controls.deleteControl;
                        const cloneControl = activeObject.controls.cloneControl;
                        const angle = activeObject.angle * Math.PI / 180;
                        const objectCenter = activeObject.getCenterPoint();

                        // Calculate delete icon position with rotation
                        const deleteOffsetX = (deleteControl.x * activeObject.width * activeObject.scaleX) + deleteControl.offsetX;
                        const deleteOffsetY = (deleteControl.y * activeObject.height * activeObject.scaleY) + deleteControl.offsetY;
                        const rotatedDeleteX = deleteOffsetX * Math.cos(angle) - deleteOffsetY * Math.sin(angle);
                        const rotatedDeleteY = deleteOffsetX * Math.sin(angle) + deleteOffsetY * Math.cos(angle);
                        const deleteIconLeft = objectCenter.x + rotatedDeleteX;
                        const deleteIconTop = objectCenter.y + rotatedDeleteY;

                        // Calculate clone icon position with rotation
                        const cloneOffsetX = (cloneControl.x * activeObject.width * activeObject.scaleX) + cloneControl.offsetX;
                        const cloneOffsetY = (cloneControl.y * activeObject.height * activeObject.scaleY) + cloneControl.offsetY;
                        const rotatedCloneX = cloneOffsetX * Math.cos(angle) - cloneOffsetY * Math.sin(angle);
                        const rotatedCloneY = cloneOffsetX * Math.sin(angle) + cloneOffsetY * Math.cos(angle);
                        const cloneIconLeft = objectCenter.x + rotatedCloneX;
                        const cloneIconTop = objectCenter.y + rotatedCloneY;

                        const iconSize = deleteControl.cornerSize || 24;

                        // Check if click is on delete icon
                        if (clickPositionCanvas.x >= deleteIconLeft - iconSize / 2 &&
                            clickPositionCanvas.x <= deleteIconLeft + iconSize / 2 &&
                            clickPositionCanvas.y >= deleteIconTop - iconSize / 2 &&
                            clickPositionCanvas.y <= deleteIconTop + iconSize / 2) {
                            // Click is on delete icon
                            debugLog(`🗑️ Delete icon clicked`);
                            fabricCanvas.remove(activeObject);
                            fabricCanvas.renderAll();
                            this.updateTexture(partName);
                            return; // Exit early to prevent dragging
                        }
                        // Check if click is on clone icon
                        else if (clickPositionCanvas.x >= cloneIconLeft - iconSize / 2 &&
                            clickPositionCanvas.x <= cloneIconLeft + iconSize / 2 &&
                            clickPositionCanvas.y >= cloneIconTop - iconSize / 2 &&
                            clickPositionCanvas.y <= cloneIconTop + iconSize / 2) {
                            // Click is on clone icon
                            debugLog(`📋 Clone icon clicked`);
                            activeObject.clone((cloned) => {
                                // Copy all visual and control properties from original
                                cloned.set({
                                    left: cloned.left + 40,
                                    top: cloned.top + 40,
                                    // Copy styling properties
                                    cornerSize: activeObject.cornerSize,
                                    transparentCorners: activeObject.transparentCorners,
                                    cornerColor: activeObject.cornerColor,
                                    borderColor: activeObject.borderColor,
                                    cornerStyle: activeObject.cornerStyle,
                                    centeredScaling: activeObject.centeredScaling,
                                    padding: activeObject.padding,
                                    selectable: activeObject.selectable,
                                    hasControls: activeObject.hasControls,
                                    hasBorders: activeObject.hasBorders
                                });

                                // Copy control visibility settings
                                cloned.setControlsVisibility({
                                    mt: false,    // middle top
                                    mb: false,    // middle bottom
                                    ml: false,    // middle left
                                    mr: false,    // middle right
                                    mtr: false    // disable rotation control
                                });

                                // Copy custom controls (delete and clone)
                                cloned.controls.deleteControl = activeObject.controls.deleteControl;
                                cloned.controls.cloneControl = activeObject.controls.cloneControl;

                                fabricCanvas.add(cloned);
                                fabricCanvas.setActiveObject(cloned);
                                fabricCanvas.renderAll();
                                this.updateTexture(partName);
                            });
                            return; // Exit early to prevent dragging
                        }
                    }

                    // Logo is already selected, now enable dragging
                    this.isDragging = true;
                    this.draggedPart = partName;

                    // Disable orbit controls during drag
                    if (this.controls) {
                        this.controls.enabled = false;
                    }

                    debugLog(`🎯 Started dragging logo on "${partName}"`);

                    // Update logo position
                    this.updateLogoPositionFromUV(partName, intersection.uv, activeObject);
                } else {
                    debugLog(`📍 UV coordinates: (${intersection.uv.x.toFixed(3)}, ${intersection.uv.y.toFixed(3)})`);
                    debugLog(`ℹ️ No logo found on "${partName}"`);
                }
            }
        } else {
            // No intersection with 3D model - deselect all logos to allow OrbitControls
            debugLog(`🔄 Clicked outside 3D model - deselecting logos`);
            this.clearAllLogoSelections();
        }
    }

    // Handle mouse move for logo dragging
    onLogoMouseMove(event) {
        // Disable logo interaction on shared pages
        if (this.isSharedPage) return;

        if (!this.isDragging || !this.draggedPart) return;

        // Calculate mouse position
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for intersections
        if (!this.current3DObject) return;

        const intersects = this.raycaster.intersectObject(this.current3DObject, true);

        if (intersects.length > 0) {
            const intersection = intersects[0];
            const materialName = intersection.object.material?.name || '';
            const partName = this.materialToPartMap[materialName];

            // Only update if still on the same part
            if (partName === this.draggedPart && intersection.uv) {
                const fabricCanvas = this.partCanvases[partName];
                const activeObject = fabricCanvas?.getActiveObject();

                if (activeObject) {
                    this.updateLogoPositionFromUV(partName, intersection.uv, activeObject);
                }
            }
        }
    }

    // Handle mouse up to end dragging
    onLogoMouseUp(event) {
        if (this.isDragging) {
            debugLog(`✅ Logo drag complete on "${this.draggedPart}"`);

            // Re-enable orbit controls
            if (this.controls) {
                this.controls.enabled = true;
            }

            this.isDragging = false;
            this.draggedPart = null;
        }
    }

    /**
     * Clear all logo selections across all canvases
     * Used when clicking outside the 3D model or switching parts
     */
    clearAllLogoSelections() {
        debugLog(`🔄 Clearing all logo selections`);

        // Deselect active objects on all canvases and update textures
        Object.entries(this.partCanvases).forEach(([partName, canvas]) => {
            canvas.discardActiveObject();
            canvas.renderAll();
            // Update texture to remove selection borders from 3D model
            this.updateTexture(partName);
        });

        // Re-enable orbit controls
        if (this.controls) {
            this.controls.enabled = true;
        }
    }

    // Update logo position based on UV coordinates
    updateLogoPositionFromUV(partName, uv, logoObject) {
        const fabricCanvas = this.partCanvases[partName];
        if (!fabricCanvas) return;

        // Convert UV (0-1) to canvas coordinates (0-2048)
        // UV origin is bottom-left, canvas origin is top-left
        const canvasX = uv.x * 2048;
        const canvasY = uv.y * 2048;

        // Update logo position (center it on click point)
        logoObject.set({
            left: canvasX,
            top: canvasY
        });

        fabricCanvas.renderAll();
        this.updateTexture(partName);

        debugLog(`📍 Logo moved to canvas position: (${canvasX.toFixed(0)}, ${canvasY.toFixed(0)})`);
    }

    createDebugGUI() {
        // Create lil-gui panel for debug controls
        const gui = new lil.GUI({
            title: 'Debug Controls',
            autoPlace: false  // Disable auto-placement
        });

        // Position the GUI to the left of the fabric canvas
        gui.domElement.style.position = 'absolute';
        gui.domElement.style.width = '400px';
        gui.domElement.style.top = '400px';
        gui.domElement.style.left = '0px';
        gui.domElement.style.zIndex = '1000';

        // Append to viewer container
        const viewerContainer = document.querySelector('.viewer-container');
        if (viewerContainer) {
            viewerContainer.appendChild(gui.domElement);
        }

        // ========== LIGHTING CONTROLS FOLDER ==========
        const lightingControlsFolder = gui.addFolder('Lighting Controls');

        // Environment Lighting subfolder
        const envFolder = lightingControlsFolder.addFolder('Environment Lighting');

        // Tone mapping options
        const toneMappingOptions = {
            'No Tone Mapping': THREE.NoToneMapping,
            'Linear': THREE.LinearToneMapping,
            'Reinhard': THREE.ReinhardToneMapping,
            'Cineon': THREE.CineonToneMapping,
            'ACES Filmic': THREE.ACESFilmicToneMapping
        };

        const envSettings = {
            toneMapping: 'No Tone Mapping',
            exposure: this.renderer.toneMappingExposure,
            envIntensity: 0.9,
            aoIntensity: 1.0
        };

        envFolder.add(envSettings, 'toneMapping', Object.keys(toneMappingOptions))
            .name('Tone Mapping')
            .onChange((value) => {
                this.renderer.toneMapping = toneMappingOptions[value];
            });

        envFolder.add(envSettings, 'exposure', 0, 3, 0.1)
            .name('Exposure')
            .onChange((value) => {
                this.renderer.toneMappingExposure = value;
                debugLog('📸 Exposure changed to:', value);
                // Force material updates
                if (this.current3DObject) {
                    this.current3DObject.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.needsUpdate = true;
                        }
                    });
                }
            });

        envFolder.add(envSettings, 'envIntensity', 0, 3, 0.1)
            .name('Environment Intensity')
            .onChange((value) => {
                if (this.scene.environment) {
                    this.scene.environmentIntensity = value;
                    debugLog('🌍 Environment intensity changed to:', value);
                }
            });

        envFolder.add(envSettings, 'aoIntensity', 0, 2, 0.1)
            .name('AO Intensity')
            .onChange((value) => {
                debugLog('🎨 AO intensity changed to:', value);
                if (this.current3DObject) {
                    this.current3DObject.traverse((child) => {
                        if (child.isMesh && child.material && child.material.aoMap) {
                            child.material.aoMapIntensity = value;
                            child.material.needsUpdate = true;
                        }
                    });
                }
            });

        // Add ground shadow control
        const groundSettings = {
            shadowOpacity: 1.0
        };

        envFolder.add(groundSettings, 'shadowOpacity', 0, 1, 0.05)
            .name('Ground Shadow')
            .onChange((value) => {
                debugLog('🌑 Ground shadow opacity changed to:', value);
                if (this.groundPlane && this.groundPlane.material) {
                    this.groundPlane.material.opacity = value;
                }
            });

        // Light Intensities subfolder
        const lightingFolder = lightingControlsFolder.addFolder('Light Intensities');
        lightingFolder.add(this.ambientLight, 'intensity', 0, 3, 0.1).name('Ambient');
        lightingFolder.add(this.keyLight, 'intensity', 0, 3, 0.1).name('Key Light');
        lightingFolder.add(this.fillLight, 'intensity', 0, 3, 0.1).name('Fill Light');
        lightingFolder.add(this.backLight, 'intensity', 0, 3, 0.1).name('Back Light');

        // Lighting Rotation subfolder
        const rotationFolder = lightingControlsFolder.addFolder('Lighting Rotation');
        const rotationControl = {
            rotationY: (this.lightsContainer.rotation.y * 180 / Math.PI) % 360
        };
        rotationFolder.add(rotationControl, 'rotationY', 0, 360, 1)
            .name('Y Rotation (°)')
            .onChange((value) => {
                this.lightsContainer.rotation.y = value * Math.PI / 180;
            });

        // ========== CAMERA CONTROLS FOLDER ==========
        const cameraFolder = gui.addFolder('Camera Controls');

        // Camera position tracking (live updates)
        const cameraPosition = {
            x: '0.00',
            y: '0.00',
            z: '0.00',
            copyPosition: () => {
                const pos = {
                    x: parseFloat(this.camera.position.x.toFixed(2)),
                    y: parseFloat(this.camera.position.y.toFixed(2)),
                    z: parseFloat(this.camera.position.z.toFixed(2))
                };
                const posString = JSON.stringify(pos, null, 2);
                navigator.clipboard.writeText(posString).then(() => {
                    debugLog('📋 Camera position copied to clipboard:', posString);
                    alert('Camera position copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            }
        };

        // Add read-only position displays
        cameraFolder.add(cameraPosition, 'x').name('Position X').listen().disable();
        cameraFolder.add(cameraPosition, 'y').name('Position Y').listen().disable();
        cameraFolder.add(cameraPosition, 'z').name('Position Z').listen().disable();

        // Add copy button
        cameraFolder.add(cameraPosition, 'copyPosition').name('📋 Copy Position');

        // Update camera position every frame
        const updateCameraPosition = () => {
            cameraPosition.x = this.camera.position.x.toFixed(2);
            cameraPosition.y = this.camera.position.y.toFixed(2);
            cameraPosition.z = this.camera.position.z.toFixed(2);
        };

        // Store the update function so we can call it in the render loop
        this.updateCameraPositionDebug = updateCameraPosition;

        // Camera lookAt/target tracking (live updates)
        const cameraTarget = {
            x: '0.00',
            y: '0.00',
            z: '0.00',
            copyTarget: () => {
                const target = {
                    x: parseFloat(this.controls.target.x.toFixed(2)),
                    y: parseFloat(this.controls.target.y.toFixed(2)),
                    z: parseFloat(this.controls.target.z.toFixed(2))
                };
                const targetString = JSON.stringify(target, null, 2);
                navigator.clipboard.writeText(targetString).then(() => {
                    debugLog('📋 Camera target copied to clipboard:', targetString);
                    alert('Camera target (lookAt) copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            }
        };

        // Add read-only target displays
        cameraFolder.add(cameraTarget, 'x').name('LookAt X').listen().disable();
        cameraFolder.add(cameraTarget, 'y').name('LookAt Y').listen().disable();
        cameraFolder.add(cameraTarget, 'z').name('LookAt Z').listen().disable();

        // Add copy button for target
        cameraFolder.add(cameraTarget, 'copyTarget').name('📋 Copy LookAt');

        // Update camera target every frame
        const updateCameraTarget = () => {
            cameraTarget.x = this.controls.target.x.toFixed(2);
            cameraTarget.y = this.controls.target.y.toFixed(2);
            cameraTarget.z = this.controls.target.z.toFixed(2);
        };

        // Store the update function so we can call it in the render loop
        this.updateCameraTargetDebug = updateCameraTarget;

        cameraFolder.add(this, 'cameraResetDuration', 500, 2500, 50)
            .name('Reset Duration (ms)')
            .onChange((value) => {
                debugLog(`⏱️ Camera reset duration changed to: ${value}ms`);
            });

        // ========== PERFORMANCE MONITOR FOLDER ==========
        const perfFolder = gui.addFolder('Performance Monitor');

        // Memory stats object (will be updated periodically)
        const memoryStats = {
            usedMemory: '0 MB',
            totalMemory: '0 MB',
            memoryLimit: '0 MB',
            canvasCount: 6,
            canvasSize: '2048x2048'
        };

        // Add read-only displays
        perfFolder.add(memoryStats, 'usedMemory').name('Used Memory').listen().disable();
        perfFolder.add(memoryStats, 'totalMemory').name('Total Memory').listen().disable();
        perfFolder.add(memoryStats, 'memoryLimit').name('Memory Limit').listen().disable();
        perfFolder.add(memoryStats, 'canvasCount').name('Canvas Count').listen().disable();
        perfFolder.add(memoryStats, 'canvasSize').name('Canvas Size').listen().disable();

        // Update memory stats every second
        setInterval(() => {
            if (performance.memory) {
                memoryStats.usedMemory = (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB';
                memoryStats.totalMemory = (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB';
                memoryStats.memoryLimit = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB';
            } else {
                memoryStats.usedMemory = 'N/A (Chrome only)';
                memoryStats.totalMemory = 'N/A';
                memoryStats.memoryLimit = 'N/A';
            }
        }, 1000);

        debugLog('🎛️ Debug GUI created with organized folder structure');
    }

    // Helper function to update texture on current 3D object
    // partName: optional, if specified only update that part's texture
    updateTexture(partName = null) {
        if (!this.current3DObject) {
            console.warn('No 3D object loaded yet');
            return;
        }

        // If partName specified, update only that part's texture
        if (partName) {
            const texture = this.partTextures[partName];
            if (!texture) {
                console.error(`Texture not found for part: ${partName}`);
                return;
            }

            texture.needsUpdate = true;

            // Update only meshes that belong to this part
            this.current3DObject.traverse((child) => {
                if (child.isMesh && child.material) {
                    // Skip stitch materials
                    if (this.shouldExcludeMaterial(child.material)) {
                        return;
                    }

                    // Check if this material belongs to the specified part
                    const materialName = child.material.name;
                    const mappedPart = this.materialToPartMap[materialName];

                    if (mappedPart === partName) {
                        child.material.map = texture;
                        child.material.map.needsUpdate = true;
                        child.material.needsUpdate = true;
                        debugLog(`✅ Updated texture for "${materialName}" → "${partName}"`);
                    }
                }
            });

            debugLog(`Texture updated for part: ${partName}`);
        } else {
            // Update all parts' textures
            Object.keys(this.partTextures).forEach(part => {
                this.updateTexture(part);
            });
        }
    }

    // Helper to adjust canvas size based on SVG complexity
    adjustCanvasSize(svgPath) {
        // Use consistent 2048x2048 for all SVGs to ensure full texture coverage
        // The pre-rasterization optimization provides performance benefits
        // without needing to reduce canvas size
        debugLog('📐 Using consistent 2048x2048 canvas for full texture coverage');
        return 2048;
    }

    // Load SVG design with HYBRID approach (SVG DOM + rasterization)
    // Keeps SVG in hidden container for color editing, rasterizes for display
    loadSVGDesign(svgPath) {
        debugLog('Loading SVG design (hybrid mode):', svgPath);
        const startTime = performance.now();

        // Fetch the SVG content
        fetch(svgPath)
            .then(response => response.text())
            .then(svgText => {
                // Create or get hidden SVG container
                let svgContainer = document.getElementById('hidden-svg-container');
                if (!svgContainer) {
                    svgContainer = document.createElement('div');
                    svgContainer.id = 'hidden-svg-container';
                    svgContainer.style.position = 'absolute';
                    svgContainer.style.left = '-9999px';
                    svgContainer.style.top = '-9999px';
                    svgContainer.style.width = '2048px';
                    svgContainer.style.height = '2048px';
                    document.body.appendChild(svgContainer);
                }

                // Parse and store SVG
                svgContainer.innerHTML = svgText;
                const svgElement = svgContainer.querySelector('svg');

                if (!svgElement) {
                    console.error('Failed to parse SVG');
                    return;
                }

                // Set SVG dimensions for rasterization
                svgElement.setAttribute('width', '2048');
                svgElement.setAttribute('height', '2048');

                // Store reference for color editing
                this.currentSVGElement = svgElement;
                this.currentSVGPath = svgPath;

                debugLog('SVG loaded into hidden container, rasterizing...');

                // Rasterize and load to Fabric.js
                this.rasterizeAndLoadSVG();
            })
            .catch(error => {
                console.error('Error loading SVG:', error);
                // Mark design as loaded on error
                this.markDesignLoaded();
            });
    }

    // Rasterize current SVG and load to all Fabric canvases
    rasterizeAndLoadSVG() {
        if (!this.currentSVGElement) {
            console.warn('[DEBUG] No SVG element to rasterize');
            return;
        }
        debugLog('[DEBUG] rasterizeAndLoadSVG called with SVG element', this.currentSVGElement);

        const startTime = performance.now();

        // Convert SVG to data URL
        const svgData = new XMLSerializer().serializeToString(this.currentSVGElement);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        // Create image from SVG
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            debugLog('[DEBUG] SVG rasterization started via img.onload');
            debugLog('SVG rasterizing...');

            // Rasterize to canvas
            const rasterCanvas = document.createElement('canvas');
            const referenceCanvas = this.partCanvases['front'];
            rasterCanvas.width = referenceCanvas.width;
            rasterCanvas.height = referenceCanvas.height;
            const ctx = rasterCanvas.getContext('2d');

            // Fill with white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, rasterCanvas.width, rasterCanvas.height);

            // Draw SVG
            ctx.drawImage(img, 0, 0, rasterCanvas.width, rasterCanvas.height);

            // Convert to data URL
            const dataUrl = rasterCanvas.toDataURL('image/png');

            // Clean up
            URL.revokeObjectURL(url);

            // Load to all Fabric canvases
            let loadedCount = 0;
            const totalParts = Object.keys(this.partCanvases).length;

            Object.entries(this.partCanvases).forEach(([partName, fabricCanvas]) => {
                fabric.Image.fromURL(dataUrl, (fabricImg) => {
                    if (!fabricImg) {
                        console.error(`Failed to create Fabric image for ${partName}`);
                        return;
                    }

                    // Save existing logos and stripes
                    // Include both original logos (name='logoLayer') and cloned logos (have custom controls)
                    const existingLogos = fabricCanvas.getObjects().filter(obj => {
                        if (obj.type !== 'image') return false;
                        const hasLogoName = obj.name === 'logoLayer';
                        const hasCustomControls = obj.controls && (obj.controls.deleteControl || obj.controls.cloneControl);
                        return hasLogoName || hasCustomControls;
                    });
                    const existingStripes = fabricCanvas.getObjects().filter(obj =>
                        obj.name && obj.name.startsWith('stripeLayer')
                    );

                    debugLog(`📦 Preserving ${existingLogos.length} logos and ${existingStripes.length} stripes for ${partName}`);

                    // Clear existing design (but preserve logos and stripes)
                    fabricCanvas.getObjects().forEach(obj => {
                        // NEVER preserve the design layer - it must always be replaced
                        if (obj.name === 'designLayer') {
                            debugLog(`  🗑️ Removing design layer from ${partName}`);
                            fabricCanvas.remove(obj);
                            if (obj.dispose) obj.dispose();
                            return;
                        }

                        // Check if it's a logo
                        const hasLogoName = obj.type === 'image' && obj.name === 'logoLayer';
                        const hasCustomControls = obj.type === 'image' && obj.controls && (obj.controls.deleteControl || obj.controls.cloneControl);
                        const isLogo = hasLogoName || hasCustomControls;

                        const isStripe = obj.name && obj.name.startsWith('stripeLayer');

                        if (!isLogo && !isStripe) {
                            debugLog(`  🗑️ Removing ${obj.type} (name: ${obj.name}) from ${partName}`);
                            fabricCanvas.remove(obj);
                            if (obj.dispose) obj.dispose();
                        } else {
                            debugLog(`  ✅ Preserving ${obj.type} (name: ${obj.name}) on ${partName}`);
                        }
                    });

                    // Scale and position image
                    fabricImg.scaleToWidth(fabricCanvas.width);
                    fabricImg.scaleToHeight(fabricCanvas.height);
                    fabricImg.set({
                        originX: 'center',
                        originY: 'center',
                        name: 'designLayer',
                        selectable: false,
                        evented: false,
                        visible: this.activeMode === 'design' // Show only if in design mode
                    });

                    // Add to canvas
                    fabricCanvas.add(fabricImg);
                    fabricCanvas.sendToBack(fabricImg);
                    fabricCanvas.centerObject(fabricImg);

                    // Restore layer order
                    existingStripes.forEach(stripe => stripe.moveTo(1));
                    existingLogos.forEach(logo => logo.bringToFront());

                    fabricCanvas.renderAll();
                    this.updateTexture(partName);

                    loadedCount++;
                    debugLog(`✅ Design loaded on "${partName}" (${loadedCount}/${totalParts})`);
                    debugLog(`🎨 Updated texture for ${partName}`);

                    if (loadedCount === totalParts) {
                        const totalTime = performance.now() - startTime;
                        debugLog(`⚡ Total time: ${totalTime.toFixed(0)}ms - Design applied to all parts`);

                        // Mark design as loaded (for tracking, loader hidden by script.js)
                        this.markDesignLoaded();
                    }
                }, { crossOrigin: 'anonymous' });
            });
        };

        img.onerror = () => {
            console.error('Error rasterizing SVG');
            URL.revokeObjectURL(url);
            // Mark design as loaded on error
            this.markDesignLoaded();
        };

        img.src = url;
    }

    // ==================== STRIPE GENERATION METHODS ====================

    /**
     * Get the stripe layer configuration for the currently selected part
     * @returns {Object} The stripe layers object for the current part
     */
    getCurrentPartStripeLayers() {
        const partSelect = document.getElementById('jersey-part-select-colors');
        const selectedPart = partSelect ? partSelect.value : 'front';
        return this.stripeLayersByPart[selectedPart];
    }

    /**
     * Update all stripe UI controls to reflect the current part's configuration
     */
    updateStripeUIForCurrentPart() {
        const partSelect = document.getElementById('jersey-part-select-colors');
        const selectedPart = partSelect ? partSelect.value : 'front';
        const partConfig = this.stripeLayersByPart[selectedPart];

        debugLog(`🔄 Updating stripe UI for part: ${selectedPart}`);

        // Update part background color picker from the canvas
        const partColorInput = document.getElementById('jersey-part-color');
        if (partColorInput) {
            const fabricCanvas = this.partCanvases[selectedPart];
            if (fabricCanvas) {
                // Get current background color from the fabric canvas
                const bgColor = fabricCanvas.backgroundColor || '#ffffff';
                partColorInput.value = bgColor;
                debugLog(`🎨 Updated part color picker to: ${bgColor} for ${selectedPart}`);
            } else {
                // Default to white if canvas not found
                partColorInput.value = '#ffffff';
            }
        }

        // Update orientation radio buttons for current part
        const currentOrientation = this.stripeOrientationByPart[selectedPart] || 'horizontal';
        const orientationRadio = document.querySelector(
            `input[name="jersey-orientation"][value="${currentOrientation}"]`
        );
        if (orientationRadio) {
            orientationRadio.checked = true;
            // Update the visual background position
            if (window.updateStripeOrientationBackground) {
                window.updateStripeOrientationBackground();
            }
        }

        // Update all 4 tabs
        ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
            const config = partConfig[tabId];

            // Update toggle checkbox
            const toggle = document.getElementById(`jersey-stripes-toggle-${tabId}`);
            if (toggle) toggle.checked = config.enabled;

            // Update color picker
            const colorInput = document.getElementById(`jersey-stripes-color-${tabId}`);
            if (colorInput) colorInput.value = config.color;

            // Update position slider and display
            const positionSlider = document.getElementById(`jersey-stripes-position-${tabId}`);
            if (positionSlider) {
                positionSlider.value = config.position;
                const valueDisplay = positionSlider.closest('.settings-group')?.querySelector('.range-value');
                if (valueDisplay) valueDisplay.textContent = config.position;
            }

            // Update gap slider and display
            const gapSlider = document.getElementById(`jersey-stripes-gap-${tabId}`);
            if (gapSlider) {
                gapSlider.value = config.gap;
                const valueDisplay = gapSlider.closest('.settings-group')?.querySelector('.range-value');
                if (valueDisplay) valueDisplay.textContent = config.gap;
            }

            // Update thickness slider and display
            const thicknessSlider = document.getElementById(`jersey-stripes-thickness-${tabId}`);
            if (thicknessSlider) {
                thicknessSlider.value = config.thickness;
                const valueDisplay = thicknessSlider.closest('.settings-group')?.querySelector('.range-value');
                if (valueDisplay) valueDisplay.textContent = config.thickness;
            }

            // Update rotation slider and display
            const rotationSlider = document.getElementById(`jersey-stripes-rotation-${tabId}`);
            if (rotationSlider) {
                rotationSlider.value = config.rotation || 0;
                const valueDisplay = rotationSlider.closest('.settings-group')?.querySelector('.range-value');
                if (valueDisplay) valueDisplay.textContent = (config.rotation || 0) + '°';
            }
        });

        debugLog(`✅ Stripe UI updated for ${selectedPart}`);
    }


    /**
     * Generate stripes for the currently selected part based on the specified tab configuration
     * @param {string} tabId - The tab identifier (tab1, tab2, tab3, tab4)
     */
    generateStripesForSelectedPart(tabId) {
        // Get the currently selected part from the dropdown
        const partSelect = document.getElementById('jersey-part-select-colors');
        if (!partSelect) {
            console.error('Part select dropdown not found');
            return;
        }

        const selectedPart = partSelect.value;
        debugLog(`🎨 Generating stripes for selected part: ${selectedPart} - Layer: ${tabId}`);
        const startTime = performance.now();

        // Get stripe configuration for this tab from the current part
        const config = this.getCurrentPartStripeLayers()[tabId];
        if (!config) {
            console.error(`Invalid tab ID: ${tabId}`);
            return;
        }

        // Get the canvas for the selected part
        const fabricCanvas = this.partCanvases[selectedPart];
        if (!fabricCanvas) {
            console.error(`Canvas not found for part: ${selectedPart}`);
            return;
        }

        // Apply stripes to the selected part's canvas
        this.generateStripesForCanvas(fabricCanvas, selectedPart, tabId);

        const totalTime = performance.now() - startTime;
        debugLog(`✅ Stripes generated for ${selectedPart} in ${totalTime.toFixed(0)}ms`);
    }

    /**
     * Generate stripes for a single canvas
     * @param {fabric.Canvas} fabricCanvas - The Fabric.js canvas
     * @param {string} partName - The part name (front, back, etc.)
     * @param {string} tabId - The tab identifier (tab1, tab2, tab3, tab4)
     */
    generateStripesForCanvas(fabricCanvas, partName, tabId) {
        const config = this.stripeLayersByPart[partName][tabId];
        const layerName = `stripeLayer${tabId.replace('tab', '')}`;

        // Clear existing stripes for this layer
        this.clearStripesLayer(fabricCanvas, layerName);

        // Calculate actual count based on enabled state and orientation
        const orientation = this.stripeOrientationByPart[partName] || 'horizontal';
        const actualCount = config.enabled
            ? (config.defaultCounts[orientation] || 0)
            : 0;

        // If count is 0 (disabled), just clear and return
        if (actualCount === 0) {
            fabricCanvas.renderAll();
            this.updateTexture(partName);
            return;
        }

        // Get bounding box for this part
        const bbox = this.partBoundingBoxes[partName] || this.partBoundingBoxes['front'];
        debugLog(`📦 Using bounding box for ${partName}:`, bbox);

        // Create stripe rectangles with bounding box
        const stripes = this.createStripeRectangles(
            orientation,
            actualCount,  // Use calculated count
            config.thickness,
            config.gap,
            config.color,
            config.position,
            layerName,
            bbox,
            config.rotation || 0  // Pass rotation from config
        );

        // Create a group containing all stripes, then rotate the group
        // This maintains spacing between stripes during rotation
        if (stripes.length > 0) {
            // Get bounding box center for rotation origin
            let bboxCenterX = bbox ? (bbox.x + bbox.width / 2) * 2048 : 1024;
            let bboxCenterY = bbox ? (bbox.y + bbox.height / 2) * 2048 : 1024;

            // Apply position offset to the group center based on orientation
            // Position shifts the pattern along the orientation axis BEFORE rotation
            const offset = config.position * 10; // Convert to pixels
            if (orientation === 'horizontal') {
                bboxCenterY += offset; // Shift pattern up/down for horizontal stripes
            } else {
                bboxCenterX += offset; // Shift pattern left/right for vertical stripes
            }

            // Create a group from all the stripes
            const stripeGroup = new fabric.Group(stripes, {
                left: bboxCenterX,
                top: bboxCenterY,
                originX: 'center',
                originY: 'center',
                selectable: false,
                evented: false,
                name: layerName,
                angle: config.rotation || 0  // Rotate the entire group around its center
            });

            // Add the group to canvas
            fabricCanvas.add(stripeGroup);
            // Send stripe group behind logos but above base design
            stripeGroup.moveTo(1); // Position 0 is the base design, position 1+ are stripes
        }

        // Ensure logos stay on top
        const objects = fabricCanvas.getObjects();
        objects.forEach(obj => {
            if (obj.type === 'image' && obj.name === 'logoLayer') {
                obj.bringToFront();
            }
        });

        fabricCanvas.renderAll();
        this.updateTexture(partName);

        debugLog(`✅ Stripes added to \"${partName}\" - Layer: ${layerName}, Count: ${config.count}`);
    }

    /**
     * Clear all stripes of a specific layer from a canvas
     * @param {fabric.Canvas} fabricCanvas - The Fabric.js canvas
     * @param {string} layerName - The layer name to clear (e.g., 'stripeLayer1')
     */
    clearStripesLayer(fabricCanvas, layerName) {
        const objectsToRemove = fabricCanvas.getObjects().filter(obj => obj.name === layerName);
        objectsToRemove.forEach(obj => {
            fabricCanvas.remove(obj);
            if (obj.dispose) obj.dispose();
        });
    }

    /**
     * Create stripe rectangle objects (adapted from sock configurator)
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {number} numStripes - Number of stripes to create
     * @param {number} stripeThickness - Thickness of each stripe (in units)
     * @param {number} stripeGap - Gap between stripes (in units)
     * @param {string} stripeColor - Color of the stripes (hex or rgb)
     * @param {number} stripesOffsetTop - Offset from top/left (in units)
     * @param {string} layerName - Name for the stripe layer
     * @param {number} rotation - Rotation angle in degrees (-90 to 90)
     * @returns {Array} Array of Fabric.js rectangle objects
     */
    createStripeRectangles(orientation, numStripes, stripeThickness, stripeGap, stripeColor, stripesOffsetTop, layerName, bbox = null, rotation = 0) {
        const stripes = [];
        const canvasWidth = 2048;  // Jersey canvas size
        const canvasHeight = 2048;

        // Convert units to pixels (multiply by 10 for scaling)
        const thickness = stripeThickness * 10;
        const gap = stripeGap * 10;
        const offset = stripesOffsetTop * 10;

        // Use bounding box coordinates if provided, otherwise use legacy values
        let startX = 0;
        let startY = canvasHeight - 400; // Legacy default
        let bboxWidth = canvasWidth;
        let bboxHeight = canvasHeight;

        if (bbox) {
            // Convert normalized bbox coordinates (0-1) to pixel coordinates
            startX = bbox.x * canvasWidth;
            startY = bbox.y * canvasHeight;
            bboxWidth = bbox.width * canvasWidth;
            bboxHeight = bbox.height * canvasHeight;
            debugLog(`📍 Stripe positioning: startX=${startX.toFixed(0)}, startY=${startY.toFixed(0)}, width=${bboxWidth.toFixed(0)}, height=${bboxHeight.toFixed(0)}`);
        }

        if (orientation === 'horizontal') {
            // Horizontal stripes - calculate number to fill bounding box height
            const effectiveGap = gap + thickness;
            const numStripesHorizontal = (numStripes === 0) ? 0 : Math.ceil((bboxHeight + gap) / (thickness + gap));

            for (let i = 0; i < numStripesHorizontal; i++) {
                const stripe = new fabric.Rect({
                    left: startX + (bboxWidth / 2),
                    top: startY + offset + (i * effectiveGap),
                    width: bboxWidth * 1.5, // Extra wide to cover the part
                    height: thickness,
                    fill: stripeColor,
                    selectable: false,
                    evented: false,
                    originX: 'center',
                    originY: 'top',
                    name: layerName
                });

                stripes.push(stripe);
            }
        } else {
            // Vertical stripes
            const numStripesVertical = (numStripes === 0) ? 0 : Math.ceil((bboxWidth + gap) / (thickness + gap));

            for (let i = 0; i < numStripesVertical; i++) {
                const stripe = new fabric.Rect({
                    left: startX + offset + (i * (thickness + gap)),
                    top: startY + (bboxHeight / 2),
                    width: thickness,
                    height: bboxHeight * 1.5, // Extra tall to cover the part
                    fill: stripeColor,
                    selectable: false,
                    evented: false,
                    originX: 'left',
                    originY: 'center',
                    name: layerName
                });

                stripes.push(stripe);
            }
        }

        return stripes;
    }

    /**
     * Setup event listeners for stripe controls
     */
    setupStripeControls() {
        debugLog('🎛️ Setting up stripe controls...');

        // Stripe orientation
        const orientationRadios = document.querySelectorAll('input[name="jersey-orientation"]');
        orientationRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const partSelect = document.getElementById('jersey-part-select-colors');
                const selectedPart = partSelect ? partSelect.value : 'front';
                this.stripeOrientationByPart[selectedPart] = e.target.value;
                debugLog(`🔄 Stripe orientation changed to: ${e.target.value} for part: ${selectedPart}`);

                // Regenerate all active stripe layers for selected part
                ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
                    if (this.getCurrentPartStripeLayers()[tabId].enabled) {
                        this.generateStripesForSelectedPart(tabId);
                    }
                });
            });
        });

        // Setup controls for each tab
        ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
            // Stripe toggle (enable/disable layer)
            const toggle = document.getElementById(`jersey-stripes-toggle-${tabId}`);
            if (toggle) {
                toggle.addEventListener('change', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].enabled = e.target.checked;
                    debugLog(`🔘 ${tabId} stripe enabled: ${this.getCurrentPartStripeLayers()[tabId].enabled}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe color
            const colorInput = document.getElementById(`jersey-stripes-color-${tabId}`);
            if (colorInput) {
                colorInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].color = e.target.value;
                    debugLog(`🎨 ${tabId} stripe color: ${this.getCurrentPartStripeLayers()[tabId].color}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe position
            const positionInput = document.getElementById(`jersey-stripes-position-${tabId}`);
            if (positionInput) {
                positionInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].position = parseFloat(e.target.value);
                    debugLog(`📍 ${tabId} stripe position: ${this.getCurrentPartStripeLayers()[tabId].position}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe gap
            const gapInput = document.getElementById(`jersey-stripes-gap-${tabId}`);
            if (gapInput) {
                gapInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].gap = parseFloat(e.target.value);
                    debugLog(`↔️ ${tabId} stripe gap: ${this.getCurrentPartStripeLayers()[tabId].gap}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe thickness
            const thicknessInput = document.getElementById(`jersey-stripes-thickness-${tabId}`);
            if (thicknessInput) {
                thicknessInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].thickness = parseFloat(e.target.value);
                    debugLog(`📏 ${tabId} stripe thickness: ${this.getCurrentPartStripeLayers()[tabId].thickness}`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }

            // Stripe rotation
            const rotationInput = document.getElementById(`jersey-stripes-rotation-${tabId}`);
            if (rotationInput) {
                rotationInput.addEventListener('input', (e) => {
                    this.getCurrentPartStripeLayers()[tabId].rotation = parseFloat(e.target.value);
                    debugLog(`🔄 ${tabId} stripe rotation: ${this.getCurrentPartStripeLayers()[tabId].rotation}°`);
                    this.generateStripesForSelectedPart(tabId);
                });
            }
        });

        debugLog('✅ Stripe controls setup complete');
    }

    /**
     * Initialize default stripes (called when switching to Colors & Stripes tab)
     */
    initializeDefaultStripes() {
        debugLog('🎨 Initializing default stripes...');

        // Generate default stripes for tab1 (count: 1) on the selected part
        if (this.getCurrentPartStripeLayers().tab1.count > 0) {
            this.generateStripesForSelectedPart('tab1');
        }
    }

    /**
     * Setup event listener for part color picker
     */
    setupPartColorControl() {
        debugLog('🎨 Setting up part color control...');

        const partColorInput = document.getElementById('jersey-part-color');
        const partSelect = document.getElementById('jersey-part-select-colors');

        if (partColorInput) {
            partColorInput.addEventListener('input', (e) => {
                const selectedPart = partSelect ? partSelect.value : 'front';
                const newColor = e.target.value;

                debugLog(`🎨 Part color changed to: ${newColor} for part: ${selectedPart}`);

                // Apply color to the selected part's canvas
                const fabricCanvas = this.partCanvases[selectedPart];
                if (fabricCanvas) {
                    fabricCanvas.backgroundColor = newColor;
                    fabricCanvas.renderAll();
                    this.updateTexture(selectedPart);
                    debugLog(`✅ Applied color ${newColor} to ${selectedPart}`);
                }
            });

            debugLog('✅ Part color control setup complete');
        } else {
            debugLog('⚠️ Part color input not found');
        }
    }

    /**
     * Regenerate all stripe layers for a specific part
     * Used when loading saved configurations
     */
    regenerateStripesForPart(partName) {
        debugLog(`🔄 Regenerating stripes for part: ${partName}`);

        const partStripes = this.stripeLayersByPart[partName];
        if (!partStripes) {
            debugLog(`⚠️ No stripe configuration found for ${partName}`);
            return;
        }

        // First, clear ALL stripe layers for this part (including disabled ones)
        ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
            const layerName = `stripeLayer${tabId.replace('tab', '')}`;
            this.clearStripesLayer(this.partCanvases[partName], layerName);
        });

        // Then, generate stripes only for enabled layers
        ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
            const layerConfig = partStripes[tabId];
            if (layerConfig && layerConfig.enabled) {
                debugLog(`  ✓ Generating stripes for ${partName} ${tabId} (enabled)`);
                this.generateStripesForCanvas(
                    this.partCanvases[partName],
                    partName,
                    tabId
                );
            }
        });

        // Update the 3D texture for this part
        this.updateTexture(partName);
        debugLog(`✅ Completed stripe regeneration for ${partName}`);
    }




    // Load uploaded logo image onto Fabric canvas
    readLogo(publicUrl) {
        debugLog('📸 Loading uploaded logo:', publicUrl);
        const startTime = performance.now();

        // Get selected jersey part from dropdown based on active tab
        let partSelect;
        const colorsTab = document.getElementById('colors-tab');
        const designsTab = document.getElementById('designs-tab');

        // Check which tab is active and use the corresponding part selector
        if (colorsTab && colorsTab.classList.contains('active')) {
            partSelect = document.getElementById('jersey-part-select-colors');
        } else if (designsTab && designsTab.classList.contains('active')) {
            partSelect = document.getElementById('jersey-part-select-working');
        } else {
            // Fallback to any available selector
            partSelect = document.getElementById('jersey-part-select-working') ||
                document.getElementById('jersey-part-select-colors') ||
                document.getElementById('jersey-part-select');
        }

        const selectedPart = partSelect ? partSelect.value : 'front';
        this.currentPart = selectedPart;

        // Get the canvas for the selected part
        const fabricCanvas = this.partCanvases[this.currentPart];
        if (!fabricCanvas) {
            console.error(`Canvas not found for part: ${this.currentPart}`);
            return;
        }

        // Get bounding box for selected part
        const bbox = this.partBoundingBoxes[this.currentPart] || this.partBoundingBoxes['front'];

        debugLog(`📍 Adding logo to "${this.currentPart}" canvas at bbox:`, bbox);

        // Use Fabric.js Image.fromURL to load the logo
        fabric.Image.fromURL(publicUrl, (img) => {
            if (!img) {
                console.error('❌ Failed to load logo image');
                return;
            }

            debugLog('✅ Logo image loaded successfully');

            // DON'T clear canvas - add logo as a new layer on top
            debugLog('➕ Adding logo as a new layer on top of existing design...');

            // Scale logo to fit canvas while maintaining aspect ratio
            const canvasWidth = fabricCanvas.width;
            const canvasHeight = fabricCanvas.height;
            const imgWidth = img.width;
            const imgHeight = img.height;

            // Calculate available space within the bounding box
            const bboxWidth = canvasWidth * bbox.width;
            const bboxHeight = canvasHeight * bbox.height;

            // Calculate scale to fit within bounding box (max 80% of bbox size)
            const maxWidth = bboxWidth * 0.8;
            const maxHeight = bboxHeight * 0.8;
            const scaleX = maxWidth / imgWidth;
            const scaleY = maxHeight / imgHeight;
            const scale = Math.min(scaleX, scaleY);

            // Calculate position at center of bounding box
            const bboxCenterX = canvasWidth * (bbox.x + bbox.width / 2);
            const bboxCenterY = canvasHeight * (bbox.y + bbox.height / 2);

            // Apply scaling and position at bbox center with enhanced styling
            img.set({
                scaleX: scale,
                scaleY: scale,
                originX: 'center',
                originY: 'center',
                left: bboxCenterX,
                top: bboxCenterY,
                selectable: true,
                hasControls: true,
                hasBorders: true,
                // Enhanced styling from previous project
                cornerSize: 10,
                transparentCorners: false,
                cornerColor: 'blue',
                borderColor: 'blue',
                cornerStyle: 'circle',
                centeredScaling: true,
                padding: 5,
                name: "logoLayer"
            });

            // Enable uniform scaling (maintain aspect ratio)
            // Disable middle handles and rotation to prevent distortion
            img.setControlsVisibility({
                mt: false,    // middle top
                mb: false,    // middle bottom
                ml: false,    // middle left
                mr: false,    // middle right
                mtr: false    // disable rotation control (we'll use custom controls)
            });

            // Add custom delete control
            img.controls.deleteControl = new fabric.Control({
                x: 0.5,
                y: 0.0,
                offsetY: 0,
                offsetX: 48,
                cursorStyle: 'pointer',
                mouseUpHandler: this.deleteLogoObject.bind(this),
                render: this.renderDeleteIcon.bind(this),
                cornerSize: 36,
            });

            // Add custom clone control
            img.controls.cloneControl = new fabric.Control({
                x: -0.5,
                y: 0.0,
                offsetY: 0,
                offsetX: -48,
                cursorStyle: 'pointer',
                mouseUpHandler: this.cloneLogoObject.bind(this),
                render: this.renderCloneIcon.bind(this),
                cornerSize: 36,
            });

            debugLog(`📏 Logo scaled by ${scale.toFixed(2)}x and centered at (${bboxCenterX.toFixed(0)}, ${bboxCenterY.toFixed(0)}) on ${this.currentPart} canvas`);

            // Add logo to canvas as a new layer
            fabricCanvas.add(img);

            // Clear active selections on ALL other canvases to remove blue borders
            // This ensures that when uploading to a different part, the old logo is fully deselected
            Object.entries(this.partCanvases).forEach(([partName, canvas]) => {
                if (canvas !== fabricCanvas) {
                    canvas.discardActiveObject();
                    canvas.renderAll(); // Force re-render to clear visual borders
                }
            });

            // Set the newly uploaded logo as active
            fabricCanvas.setActiveObject(img);

            // Store reference to the logo for UI controls
            this.currentLogo = img;
            this.logoBaseScale = scale; // Store the initial scale for relative adjustments

            fabricCanvas.renderAll();

            // Update the 3D texture for this part
            this.updateTexture(this.currentPart);

            const totalTime = performance.now() - startTime;
            debugLog(`⚡ Logo added to ${this.currentPart} and applied to 3D model in ${totalTime.toFixed(0)}ms`);
        }, { crossOrigin: 'anonymous' });
    }

    // Load logo with saved configuration (position, scale, rotation)
    readLogoWithConfig(publicUrl, logoConfig, partName) {
        debugLog('📸 Loading logo with saved config:', publicUrl, logoConfig);
        const startTime = performance.now();

        // Get the canvas for the specified part
        const fabricCanvas = this.partCanvases[partName];
        if (!fabricCanvas) {
            console.error(`Canvas not found for part: ${partName}`);
            return;
        }

        // Use Fabric.js Image.fromURL to load the logo
        fabric.Image.fromURL(publicUrl, (img) => {
            if (!img) {
                console.error('❌ Failed to load logo image');
                return;
            }

            debugLog('✅ Logo image loaded successfully, applying saved configuration...');

            // Apply saved configuration directly
            img.set({
                left: logoConfig.left,
                top: logoConfig.top,
                scaleX: logoConfig.scaleX,
                scaleY: logoConfig.scaleY,
                angle: logoConfig.angle || 0,
                originX: logoConfig.originX || 'center',
                originY: logoConfig.originY || 'center',
                selectable: true,
                hasControls: true,
                hasBorders: true,
                // Enhanced styling
                cornerSize: 10,
                transparentCorners: false,
                cornerColor: 'blue',
                borderColor: 'blue',
                cornerStyle: 'circle',
                centeredScaling: true,
                padding: 5,
                name: "logoLayer"
            });

            // Enable uniform scaling (maintain aspect ratio)
            img.setControlsVisibility({
                mt: false,    // middle top
                mb: false,    // middle bottom
                ml: false,    // middle left
                mr: false,    // middle right
                mtr: false    // disable rotation control
            });

            // Add custom delete control
            img.controls.deleteControl = new fabric.Control({
                x: 0.5,
                y: 0.0,
                offsetY: 0,
                offsetX: 48,
                cursorStyle: 'pointer',
                mouseUpHandler: this.deleteLogoObject.bind(this),
                render: this.renderDeleteIcon.bind(this),
                cornerSize: 36,
            });

            // Add custom clone control
            img.controls.cloneControl = new fabric.Control({
                x: -0.5,
                y: 0.0,
                offsetY: 0,
                offsetX: -48,
                cursorStyle: 'pointer',
                mouseUpHandler: this.cloneLogoObject.bind(this),
                render: this.renderCloneIcon.bind(this),
                cornerSize: 36,
            });

            debugLog(`📏 Logo restored at (${logoConfig.left.toFixed(0)}, ${logoConfig.top.toFixed(0)}) with scale ${logoConfig.scaleX.toFixed(2)}x and rotation ${logoConfig.angle}° on ${partName} canvas`);

            // Add logo to canvas
            fabricCanvas.add(img);

            fabricCanvas.renderAll();

            // Update the 3D texture for this part
            this.updateTexture(partName);

            const totalTime = performance.now() - startTime;
            debugLog(`⚡ Logo restored to ${partName} in ${totalTime.toFixed(0)}ms`);
        }, { crossOrigin: 'anonymous' });
    }

    // Delete logo object handler
    deleteLogoObject(eventData, transform) {
        const target = transform.target;
        const canvas = target.canvas;
        canvas.remove(target);
        canvas.requestRenderAll();

        // Update 3D texture after deletion
        const partName = this.currentPart;
        this.updateTexture(partName);

        debugLog(`🗑️ Logo deleted from "${partName}"`);
        return true;
    }

    // Clone logo object handler
    cloneLogoObject(eventData, transform) {
        const target = transform.target;
        const canvas = target.canvas;

        target.clone((cloned) => {
            cloned.set({
                left: cloned.left + 40,
                top: cloned.top + 40
            });

            // Set name property directly (not through set() to avoid issues)
            cloned.name = 'logoLayer';

            // Copy custom controls to cloned object
            cloned.controls.deleteControl = target.controls.deleteControl;
            cloned.controls.cloneControl = target.controls.cloneControl;

            // Copy baseScale property for slider functionality
            if (target.baseScale) {
                cloned.baseScale = target.baseScale;
            } else {
                // If original doesn't have baseScale, use its current scale
                cloned.baseScale = target.scaleX;
            }

            canvas.add(cloned);
            canvas.setActiveObject(cloned);
            canvas.requestRenderAll();

            // Update 3D texture after cloning
            const partName = this.currentPart;
            this.updateTexture(partName);

            debugLog(`📋 Logo cloned on "${partName}" with name: "${cloned.name}", baseScale: ${cloned.baseScale}`);
        });

        return true;
    }

    // Render delete icon (red circle with white X)
    renderDeleteIcon(ctx, left, top, styleOverride, fabricObject) {
        const size = 36;

        ctx.save();
        ctx.translate(left, top);

        // Draw the delete icon image if loaded and valid
        if (this.deleteIcon && this.deleteIcon.complete && this.deleteIcon.naturalWidth > 0) {
            ctx.drawImage(this.deleteIcon, -size / 2, -size / 2, size, size);
        } else {
            // Fallback: Draw red circle with white X if image not loaded
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff4444';
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const offset = size / 4;
            ctx.beginPath();
            ctx.moveTo(-offset, -offset);
            ctx.lineTo(offset, offset);
            ctx.moveTo(offset, -offset);
            ctx.lineTo(-offset, offset);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Render clone icon (using copy.svg)
    renderCloneIcon(ctx, left, top, styleOverride, fabricObject) {
        const size = 36;

        ctx.save();
        ctx.translate(left, top);

        // Draw the copy icon image if loaded and valid
        if (this.copyIcon && this.copyIcon.complete && this.copyIcon.naturalWidth > 0) {
            ctx.drawImage(this.copyIcon, -size / 2, -size / 2, size, size);
        } else {
            // Fallback: Draw green circle with white + if image not loaded
            ctx.beginPath();
            ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
            ctx.fillStyle = '#44cc44';
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const offset = size / 4;
            ctx.beginPath();
            ctx.moveTo(-offset, 0);
            ctx.lineTo(offset, 0);
            ctx.moveTo(0, -offset);
            ctx.lineTo(0, offset);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Setup UI controls for logo scale and rotation
    setupLogoControls() {
        // Get sliders for both tabs
        const scaleSlider = document.getElementById('logo-scale');
        const rotateSlider = document.getElementById('logo-rotate');
        const scaleSliderColors = document.getElementById('logo-scale-colors');
        const rotateSliderColors = document.getElementById('logo-rotate-colors');

        if (!scaleSlider || !rotateSlider) {
            console.warn('Logo controls not found for Designs tab');
        }

        if (!scaleSliderColors || !rotateSliderColors) {
            console.warn('Logo controls not found for Colors & Stripes tab');
        }

        // Helper function to setup scale slider
        const setupScaleSlider = (slider) => {
            if (!slider) return;

            // Remove existing event listeners to avoid duplicates
            const newSlider = slider.cloneNode(true);
            slider.parentNode.replaceChild(newSlider, slider);

            // Scale control - works with active object
            newSlider.addEventListener('input', (e) => {
                // Find the canvas with an active object
                let activeObject = null;
                let activeCanvas = null;

                for (const [partName, fabricCanvas] of Object.entries(this.partCanvases)) {
                    const obj = fabricCanvas.getActiveObject();

                    // Check if it's a logo - either has correct name OR is a selectable image with custom controls
                    if (obj && obj.type === 'image') {
                        const hasLogoName = obj.name === 'logoLayer';
                        const hasCustomControls = obj.controls && (obj.controls.deleteControl || obj.controls.cloneControl);

                        if (hasLogoName || hasCustomControls) {
                            activeObject = obj;
                            activeCanvas = fabricCanvas;
                            break;
                        }
                    }
                }

                if (!activeObject || !activeCanvas) {
                    debugLog('No logo selected - scale slider has no effect');
                    return;
                }

                const scaleMultiplier = parseFloat(e.target.value);

                // Calculate base scale from current object if not stored
                if (!activeObject.baseScale) {
                    activeObject.baseScale = activeObject.scaleX;
                }

                const newScale = activeObject.baseScale * scaleMultiplier;

                activeObject.set({
                    scaleX: newScale,
                    scaleY: newScale
                });

                activeCanvas.renderAll();

                // Update texture for the part where the logo is
                const partName = Object.keys(this.partCanvases).find(
                    key => this.partCanvases[key] === activeCanvas
                );
                if (partName) {
                    this.updateTexture(partName);
                }
            });
        };

        // Helper function to setup rotation slider
        const setupRotationSlider = (slider) => {
            if (!slider) return;

            // Remove existing event listeners to avoid duplicates
            const newSlider = slider.cloneNode(true);
            slider.parentNode.replaceChild(newSlider, slider);

            // Rotation control - works with active object
            newSlider.addEventListener('input', (e) => {
                // Find the canvas with an active object
                let activeObject = null;
                let activeCanvas = null;

                debugLog('🔍 Searching for active logo across all canvases...');
                for (const [partName, fabricCanvas] of Object.entries(this.partCanvases)) {
                    const obj = fabricCanvas.getActiveObject();
                    debugLog(`  Checking ${partName}: activeObject =`, obj ? `type=${obj.type}, name=${obj.name}` : 'null');

                    // Check if it's a logo - either has correct name OR is a selectable image with custom controls
                    if (obj && obj.type === 'image') {
                        const hasLogoName = obj.name === 'logoLayer';
                        const hasCustomControls = obj.controls && (obj.controls.deleteControl || obj.controls.cloneControl);

                        if (hasLogoName || hasCustomControls) {
                            activeObject = obj;
                            activeCanvas = fabricCanvas;
                            debugLog(`  ✅ Found active logo on ${partName}`);
                            break;
                        }
                    }
                }

                if (!activeObject || !activeCanvas) {
                    debugLog('No logo selected - rotation slider has no effect');
                    return;
                }

                const angle = parseFloat(e.target.value);
                activeObject.set({ angle: angle });

                activeCanvas.renderAll();

                // Update texture for the part where the logo is
                const partName = Object.keys(this.partCanvases).find(
                    key => this.partCanvases[key] === activeCanvas
                );
                if (partName) {
                    this.updateTexture(partName);
                }
            });
        };

        // Setup sliders for both tabs
        setupScaleSlider(scaleSlider);
        setupScaleSlider(scaleSliderColors);
        setupRotationSlider(rotateSlider);
        setupRotationSlider(rotateSliderColors);

        debugLog(`✅ Logo controls connected to UI sliders for both tabs (works with active object)`);
    }

    // Update logo sliders when a logo is selected
    updateLogoSliders(selectedObject) {
        if (!selectedObject || selectedObject.type !== 'image') {
            return;
        }

        // Check if it's a logo - either has correct name OR is a selectable image with custom controls
        const hasLogoName = selectedObject.name === 'logoLayer';
        const hasCustomControls = selectedObject.controls && (selectedObject.controls.deleteControl || selectedObject.controls.cloneControl);

        if (!hasLogoName && !hasCustomControls) {
            return;
        }

        // Get sliders from both tabs
        const scaleSlider = document.getElementById('logo-scale');
        const rotateSlider = document.getElementById('logo-rotate');
        const scaleSliderColors = document.getElementById('logo-scale-colors');
        const rotateSliderColors = document.getElementById('logo-rotate-colors');

        // Store base scale if not already stored
        if (!selectedObject.baseScale) {
            selectedObject.baseScale = selectedObject.scaleX;
        }

        // Calculate current scale multiplier
        const scaleMultiplier = selectedObject.scaleX / selectedObject.baseScale;
        const rotation = selectedObject.angle || 0;

        // Update Designs tab sliders
        if (scaleSlider && rotateSlider) {
            scaleSlider.value = scaleMultiplier;
            rotateSlider.value = rotation;

            // Update range value displays
            const scaleValueDisplay = scaleSlider.parentElement.querySelector('.range-value');
            const rotateValueDisplay = rotateSlider.parentElement.querySelector('.range-value');
            if (scaleValueDisplay) scaleValueDisplay.textContent = scaleMultiplier.toFixed(1) + 'x';
            if (rotateValueDisplay) rotateValueDisplay.textContent = rotation + '°';
        }

        // Update Colors tab sliders
        if (scaleSliderColors && rotateSliderColors) {
            scaleSliderColors.value = scaleMultiplier;
            rotateSliderColors.value = rotation;

            // Update range value displays
            const scaleValueDisplay = scaleSliderColors.parentElement.querySelector('.range-value');
            const rotateValueDisplay = rotateSliderColors.parentElement.querySelector('.range-value');
            if (scaleValueDisplay) scaleValueDisplay.textContent = scaleMultiplier.toFixed(1) + 'x';
            if (rotateValueDisplay) rotateValueDisplay.textContent = rotation + '°';
        }

        debugLog(`📊 Updated sliders for selected logo: scale=${scaleMultiplier.toFixed(2)}, rotation=${rotation}°`);
    }

    // Reset logo sliders when no logo is selected
    resetLogoSliders() {
        // Get sliders from both tabs
        const scaleSlider = document.getElementById('logo-scale');
        const rotateSlider = document.getElementById('logo-rotate');
        const scaleSliderColors = document.getElementById('logo-scale-colors');
        const rotateSliderColors = document.getElementById('logo-rotate-colors');

        // Reset Designs tab sliders
        if (scaleSlider && rotateSlider) {
            scaleSlider.value = 1;
            rotateSlider.value = 0;

            // Update range value displays
            const scaleValueDisplay = scaleSlider.parentElement.querySelector('.range-value');
            const rotateValueDisplay = rotateSlider.parentElement.querySelector('.range-value');
            if (scaleValueDisplay) scaleValueDisplay.textContent = '1x';
            if (rotateValueDisplay) rotateValueDisplay.textContent = '0°';
        }

        // Reset Colors tab sliders
        if (scaleSliderColors && rotateSliderColors) {
            scaleSliderColors.value = 1;
            rotateSliderColors.value = 0;

            // Update range value displays
            const scaleValueDisplay = scaleSliderColors.parentElement.querySelector('.range-value');
            const rotateValueDisplay = rotateSliderColors.parentElement.querySelector('.range-value');
            if (scaleValueDisplay) scaleValueDisplay.textContent = '1x';
            if (rotateValueDisplay) rotateValueDisplay.textContent = '0°';
        }

        debugLog('📊 Reset sliders (no logo selected)');
    }

    // Load initial configuration from saved data
    loadInitialConfig(config) {
        if (!config) {
            debugLog('No configuration to load, using defaults');
            // No SVG design to load, mark design as loaded
            this.markDesignLoaded();
            return;
        }

        debugLog('Loading initial configuration:', config);

        let willLoadSVG = false;

        if (config.activeTab === 'designs' && config.design) {
            // Load design mode configuration
            if (config.design.svgPath) {
                // Recalculate SVG path to ensure correct depth for current page location
                let svgPath = config.design.svgPath;

                // Try to recalculate path if we have the necessary info
                if (config.design.familyId && config.collar && config.shoulder) {
                    const designId = window.getDesignIdFromSvgPath ? window.getDesignIdFromSvgPath(config.design.svgPath) : null;
                    if (designId && window.getDesignSvgPath) {
                        svgPath = window.getDesignSvgPath(config.design.familyId, designId, config.collar, config.shoulder);
                        debugLog(`📐 Recalculated SVG path in loadInitialConfig: ${svgPath} (was: ${config.design.svgPath})`);
                    }
                }

                debugLog(`Loading SVG design: ${svgPath}`);
                this.loadSVGDesign(svgPath);
                willLoadSVG = true;
            }

            // Apply design colors (color pickers are already set by script.js)
            // The SVG design will use these colors if it supports color replacement
        } else if (config.activeTab === 'colors') {
            // Load colors & stripes mode configuration
            if (config.colorsAndStripes) {
                // Apply part colors and stripe configurations to the 3D model
                Object.entries(config.colorsAndStripes).forEach(([partName, partConfig]) => {
                    const fabricCanvas = this.partCanvases[partName];

                    // Apply background color
                    if (partConfig.backgroundColor && fabricCanvas) {
                        debugLog(`Applying background color ${partConfig.backgroundColor} to part: ${partName}`);
                        fabricCanvas.backgroundColor = partConfig.backgroundColor;
                        fabricCanvas.renderAll();
                    }

                    // Apply stripe orientation
                    if (partConfig.stripeOrientation) {
                        debugLog(`Setting stripe orientation for ${partName}: ${partConfig.stripeOrientation}`);
                        this.stripeOrientationByPart[partName] = partConfig.stripeOrientation;
                    }

                    // Apply stripe layer configurations
                    if (partConfig.stripes) {
                        debugLog(`Loading stripe configurations for ${partName}:`, partConfig.stripes);
                        this.stripeLayersByPart[partName] = partConfig.stripes;

                        // Regenerate stripes for this part to apply the configuration
                        debugLog(`Regenerating stripes for ${partName}`);
                        this.regenerateStripesForPart(partName);
                    } else if (fabricCanvas) {
                        // No stripes configured, just update the texture with background color
                        this.updateTexture(partName);
                    }
                });

                debugLog('✅ Colors and stripes configuration loaded and applied');
            }
        }

        // Load logos if present
        if (config.logos) {
            Object.entries(config.logos).forEach(([partName, logos]) => {
                if (logos && logos.length > 0) {
                    logos.forEach(logoConfig => {
                        if (logoConfig.url) {
                            debugLog(`Loading logo for ${partName}:`, logoConfig);

                            // Load logo with saved configuration (position, scale, rotation)
                            this.readLogoWithConfig(logoConfig.url, logoConfig, partName);
                        }
                    });
                }
            }); // Close forEach
        } // Close if (config.logos)

        // If no SVG was loaded, mark design as loaded immediately
        if (!willLoadSVG) {
            this.markDesignLoaded();
        }

        debugLog('✅ Initial configuration loaded');
    } // Close loadInitialConfig method

    /**
     * Generate initial default stripes for all parts
     * Called when first switching to Colors & Stripes mode without a saved config
     */
    generateInitialDefaultStripes() {
        debugLog('🎨 Generating initial default stripes for all parts...');

        Object.keys(this.partCanvases).forEach(partName => {
            const partStripes = this.stripeLayersByPart[partName];
            if (partStripes) {
                ['tab1', 'tab2', 'tab3', 'tab4'].forEach(tabId => {
                    const layerConfig = partStripes[tabId];
                    if (layerConfig && layerConfig.enabled) {
                        debugLog(`  ✓ Generating default stripes for ${partName} ${tabId}`);
                        this.generateStripesForCanvas(
                            this.partCanvases[partName],
                            partName,
                            tabId
                        );
                    }
                });
            }
        });

        debugLog('✅ Initial default stripes generated');
    }

    // Get all logos configuration from all parts
    getLogosConfiguration() {
        const logosConfig = {
            front: [],
            back: [],
            'right-sleeve': [],
            'left-sleeve': []
        };

        // Iterate through all part canvases
        Object.keys(this.partCanvases).forEach(partName => {
            const fabricCanvas = this.partCanvases[partName];
            if (!fabricCanvas) return;

            // Get all objects from the canvas
            const objects = fabricCanvas.getObjects();

            // Filter for logo objects (images that are selectable and have controls)
            // This catches logos regardless of their name property
            const logos = objects.filter(obj => {
                // Check if it's an image with logo-like properties
                const isImage = obj.type === 'image';
                const hasLogoName = obj.name === 'logoLayer';
                const isSelectable = obj.selectable === true;
                const hasCustomControls = obj.controls && (obj.controls.deleteControl || obj.controls.cloneControl);

                // Exclude design images (they're centered at canvas center with scale 1)
                const isCentered = obj.left === 1024 && obj.top === 1024 && obj.scaleX === 1 && obj.scaleY === 1;

                // Accept if it has the correct name OR if it's BOTH selectable AND has custom controls
                // (SVG designs are not selectable, so this excludes them)
                // Also exclude centered images (design backgrounds)
                return isImage && !isCentered && (hasLogoName || (isSelectable && hasCustomControls));
            });

            debugLog(`💾 Saving ${logos.length} logo(s) from ${partName}`);

            // Store logo data for this part
            logosConfig[partName] = logos.map(logo => ({
                url: logo.getSrc(), // Get the image source URL
                left: logo.left,
                top: logo.top,
                scaleX: logo.scaleX,
                scaleY: logo.scaleY,
                angle: logo.angle || 0,
                originX: logo.originX,
                originY: logo.originY
            }));
        });

        return logosConfig;
    }

    // Get all stripes configuration from all parts
    getStripesConfiguration() {
        const stripesConfig = {};
        const partNames = ['front', 'back', 'left-sleeve', 'right-sleeve', 'collar', 'collar2', 'hem'];

        partNames.forEach(partName => {
            const fabricCanvas = this.partCanvases[partName];
            const partStripes = this.stripeLayersByPart[partName];

            stripesConfig[partName] = {
                backgroundColor: fabricCanvas ? fabricCanvas.backgroundColor : '#ffffff',
                stripeOrientation: this.stripeOrientationByPart[partName] || 'horizontal',  // Per-part orientation
                stripes: JSON.parse(JSON.stringify(partStripes))  // Deep copy to avoid reference issues
            };
        });

        debugLog('📊 Captured stripes configuration for all parts:', stripesConfig);
        return stripesConfig;
    }



    loadModel(modelPath) {
        // Store current model path for later reference (e.g., ribbed collar logic)
        this.currentModelPath = modelPath;

        // Remove existing model if any
        if (this.current3DObject) {
            this.scene.remove(this.current3DObject);
            this.current3DObject = null;
        }

        // Capture load id so we can ignore this callback if a newer load started (race condition fix)
        const loadId = ++this._loadId;

        // Load GLB model
        this.gltfLoader.load(
            modelPath,
            (gltf) => {
                // Ignore result if a newer load was started (prevents multiple models in scene)
                if (loadId !== this._loadId) {
                    debugLog(`⏭️ Ignoring stale model load (loadId ${loadId}, current ${this._loadId})`);
                    gltf.scene.traverse((child) => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                            else child.material.dispose();
                        }
                    });
                    return;
                }

                this.current3DObject = gltf.scene;

                let meshCount = 0;
                let texturedMeshCount = 0;
                const isStatue = modelPath.includes('messi_statue.glb');

                // First pass: Log all materials found in the model
                debugLog('🔍 === MATERIAL DISCOVERY ===');
                const foundMaterials = new Set();
                this.current3DObject.traverse((child) => {
                    if (child.isMesh && child.material) {
                        const matName = child.material.name || 'unnamed';
                        foundMaterials.add(matName);
                    }
                });
                debugLog('📋 All materials in model:', Array.from(foundMaterials));
                debugLog('🗺️ Current material mapping:', this.materialToPartMap);
                debugLog('🔍 === END MATERIAL DISCOVERY ===\n');

                if (!isStatue) {
                    // Apply texture to all meshes in the model while preserving AO and normal maps
                    this.current3DObject.traverse((child) => {
                        if (child.isMesh) {
                            meshCount++;

                            // Skip stitch materials - they should keep their original appearance
                            if (this.shouldExcludeMaterial(child.material)) {
                                debugLog(`⏭️ Skipping material: "${child.material.name}" (stitch material)`);
                                return; // Skip this mesh
                            }

                            // Get the material name and find corresponding part
                            const materialName = child.material?.name || '';
                            const partName = this.materialToPartMap[materialName];

                            if (!partName) {
                                console.warn(`⚠️ No part mapping for material: "${materialName}" - This material will not receive textures!`);
                                return;
                            }

                            // Get the texture for this part
                            const partTexture = this.partTextures[partName];
                            if (!partTexture) {
                                console.warn(`⚠️ No texture found for part: "${partName}"`);
                                return;
                            }

                            // Log UV coordinates for debugging
                            if (child.geometry.attributes.uv) {
                                const uvs = child.geometry.attributes.uv;
                                debugLog(`🔍 Mesh "${child.name}" (${materialName}) UV range:`, {
                                    count: uvs.count,
                                    itemSize: uvs.itemSize
                                });
                            } else {
                                console.warn(`⚠️ Mesh "${child.name}" has NO UV mapping!`);
                            }

                            // Preserve the original material properties (AO, normal maps, etc.)
                            const originalMaterial = child.material;

                            // Clone the material to avoid modifying the original
                            if (originalMaterial.isMeshStandardMaterial || originalMaterial.isMeshPhysicalMaterial) {
                                child.material = originalMaterial.clone();

                                // Apply the part-specific texture while preserving other maps
                                child.material.map = partTexture;

                                // Log what maps are present
                                debugLog(`📦 Mesh "${child.name}" (${materialName} → ${partName}) maps:`, {
                                    hasAO: !!child.material.aoMap,
                                    hasNormal: !!child.material.normalMap,
                                    hasRoughness: !!child.material.roughnessMap,
                                    hasMetalness: !!child.material.metalnessMap
                                });
                            } else {
                                // Fallback: create new material if original is not PBR
                                child.material = new THREE.MeshStandardMaterial({
                                    map: this.texture,
                                    roughness: 0.5,
                                    metalness: 0.1,
                                    side: THREE.DoubleSide
                                });
                            }

                            // Apply texture filtering and wrapping for crisp rendering
                            if (child.material.map) {
                                child.material.map.magFilter = THREE.LinearFilter;
                                child.material.map.minFilter = THREE.LinearMipmapLinearFilter;

                                // Enable texture wrapping (important for UV mapping)
                                child.material.map.wrapS = THREE.RepeatWrapping;
                                child.material.map.wrapT = THREE.RepeatWrapping;

                                // Force texture update
                                child.material.map.needsUpdate = true;
                                child.material.needsUpdate = true;

                                texturedMeshCount++;
                            }

                            // Ensure material updates
                            child.material.needsUpdate = true;
                        }
                    });

                    debugLog(`✅ Model loaded: ${meshCount} meshes found, ${texturedMeshCount} textured`);
                } else {
                    debugLog(`🗿 Statue model detected - bypassing custom canvas texture loop`);
                    // Rotate statue to face camera (z-axis positive)
                    this.current3DObject.rotation.y = 0;
                }

                // Scale and position the model appropriately
                const box = new THREE.Box3().setFromObject(this.current3DObject);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                // Scale to fit in view (target size of 2 units)
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2 / maxDim;
                this.current3DObject.scale.setScalar(scale);

                // Center the model
                this.current3DObject.position.sub(center.multiplyScalar(scale));

                this.scene.add(this.current3DObject);
                debugLog('📦 Model positioned and added to scene');

                if (!isStatue) {
                    // Store original normal maps for collar/hem materials (for ribbed collar toggle)
                    this.storeOriginalCollarNormalMaps();
                }

                // Mark model as loaded (for tracking)
                this.markModelLoaded();
            },
            (progress) => {
                debugLog('Loading progress:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading model:', error);
                // Only mark as loaded if this was the latest load (avoid stale callback side effects)
                if (loadId === this._loadId) {
                    this.markModelLoaded();
                }
            }
        );
    }

    setupCameraReset() {
        // Add double-click event listener to reset camera
        this.renderer.domElement.addEventListener('dblclick', () => {
            this.resetCamera();
        });
    }

    resetCamera() {
        if (this.isAnimatingCamera) return; // Prevent multiple animations

        debugLog(`🎥 Resetting camera to initial position (duration: ${this.cameraResetDuration}ms)`);

        // Store current positions
        this.cameraStartPosition = this.camera.position.clone();
        this.controlsStartTarget = this.controls.target.clone();

        // Start animation with timestamp
        this.isAnimatingCamera = true;
        this.cameraAnimationStartTime = performance.now();
    }

    updateCameraAnimation() {
        if (!this.isAnimatingCamera) return;

        // Calculate elapsed time and progress
        const currentTime = performance.now();
        const elapsedTime = currentTime - this.cameraAnimationStartTime;
        const progress = Math.min(elapsedTime / this.cameraResetDuration, 1);

        if (progress >= 1) {
            // Animation complete
            if (this.isAnimatingToPart && this.targetCameraPosition) {
                // Animating to part position
                this.camera.position.copy(this.targetCameraPosition);
                this.controls.target.copy(this.targetControlsTarget);
                this.isAnimatingToPart = false;
            } else {
                // Animating to initial/reset position
                this.camera.position.copy(this.initialCameraPosition);
                this.controls.target.copy(this.initialControlsTarget);
            }
            this.isAnimatingCamera = false;
        } else {
            // Ease-in-out quadratic easing for gentle, smooth start and end
            const easeProgress = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            // Determine target based on animation type
            const targetPos = this.isAnimatingToPart && this.targetCameraPosition
                ? this.targetCameraPosition
                : this.initialCameraPosition;
            const targetCtrl = this.isAnimatingToPart && this.targetControlsTarget
                ? this.targetControlsTarget
                : this.initialControlsTarget;

            // Use spherical interpolation for orbital movement (for all animations)
            // OPTIMIZATION: Reuse pre-allocated objects to avoid per-frame allocations (Safari performance)

            // Get start spherical coordinates (reuse _animTempVector and _animStartSpherical)
            this._animTempVector.copy(this.cameraStartPosition).sub(this._animCenterVector);
            this._animStartSpherical.setFromVector3(this._animTempVector);

            // Get target spherical coordinates (reuse _animTempVector and _animTargetSpherical)
            this._animTempVector.copy(targetPos).sub(this._animCenterVector);
            this._animTargetSpherical.setFromVector3(this._animTempVector);

            // Interpolate spherical coordinates (reuse _animCurrentSpherical)
            this._animCurrentSpherical.set(
                THREE.MathUtils.lerp(this._animStartSpherical.radius, this._animTargetSpherical.radius, easeProgress),
                THREE.MathUtils.lerp(this._animStartSpherical.phi, this._animTargetSpherical.phi, easeProgress),
                THREE.MathUtils.lerp(this._animStartSpherical.theta, this._animTargetSpherical.theta, easeProgress)
            );

            // Convert back to Cartesian coordinates
            this.camera.position.setFromSpherical(this._animCurrentSpherical).add(this._animCenterVector);

            // Interpolate controls target (always linear)
            this.controls.target.lerpVectors(
                this.controlsStartTarget,
                targetCtrl,
                easeProgress
            );
        }

        this.controls.update();
    }

    // Switch to Design mode (show design, hide stripes)
    switchToDesignMode() {
        debugLog('🎨 Switching to Design mode');
        this.activeMode = 'design';

        // Iterate through all part canvases
        Object.entries(this.partCanvases).forEach(([partName, canvas]) => {
            if (!canvas) return;

            let updated = false;

            // Toggle visibility of layers
            canvas.getObjects().forEach(obj => {
                if (obj.name === 'designLayer') {
                    // Show design layer
                    if (!obj.visible) {
                        obj.visible = true;
                        updated = true;
                    }
                } else if (obj.name && obj.name.startsWith('stripeLayer')) {
                    // Hide stripe layers
                    if (obj.visible) {
                        obj.visible = false;
                        updated = true;
                    }
                }
                // Logos (logoLayer) remain visible
            });

            // Re-render and update texture if changes were made
            if (updated) {
                canvas.renderAll();
                this.updateTexture(partName);
                debugLog(`  ✓ Updated ${partName} to design mode`);
            }
        });

        debugLog('✅ Design mode activated');
    }

    /**
     * Store original normal maps from collar/hem materials for later restoration
     * Should be called after model loads
     */
    storeOriginalCollarNormalMaps() {
        if (!this.current3DObject) return;

        const targetMaterials = ['collar', 'collar2', 'hem'];

        this.current3DObject.traverse((child) => {
            if (child.isMesh && child.material) {
                const materialName = child.material.name;

                if (targetMaterials.includes(materialName)) {
                    // Store original normal map if it exists and hasn't been stored yet
                    if (child.material.normalMap && !child.material.userData.originalNormalMapStored) {
                        child.material.userData.originalNormalMap = child.material.normalMap;
                        child.material.userData.originalNormalMapRepeat = {
                            x: child.material.normalMap.repeat.x,
                            y: child.material.normalMap.repeat.y
                        };
                        child.material.userData.originalNormalMapStored = true;
                        debugLog(`  📐 Stored original normal map for ${materialName}: ${child.material.normalMap.repeat.x}x${child.material.normalMap.repeat.y}`);
                    } else if (!child.material.normalMap) {
                        // Mark that there was no original normal map
                        child.material.userData.originalNormalMap = null;
                        child.material.userData.originalNormalMapStored = true;
                        debugLog(`  📐 ${materialName} has no original normal map`);
                    }
                }
            }
        });
    }

    /**
     * Toggle normal maps on collar materials for ribbed collar effect
     * @param {boolean} enabled - Whether to enable (ribbed) or disable (smooth) normal maps
     */
    toggleCollarNormalMaps(enabled) {
        if (!this.current3DObject) {
            debugLog('No 3D object loaded, cannot toggle collar normal maps');
            return;
        }

        debugLog(`Toggling collar normal maps: ${enabled ? 'ON (ribbed)' : 'OFF (smooth)'}`);

        // Check if current model is an insert_collar model (has collar2 material)
        const isInsertCollarModel = this.currentModelPath &&
            (this.currentModelPath.includes('insert_collar_reglan') ||
                this.currentModelPath.includes('insert_collar_set_in'));

        // Materials to apply ribbed effect: collar, hem, and collar2 (only for insert_collar models)
        const targetMaterials = ['collar', 'hem'];
        if (isInsertCollarModel) {
            targetMaterials.push('collar2');
        }

        debugLog(`Target materials for ribbed effect: ${targetMaterials.join(', ')}`);

        // Ensure original normal maps are stored before toggling
        this.storeOriginalCollarNormalMaps();

        // Load ribbed collar normal map texture if not already loaded
        if (enabled && !this.ribbedCollarNormalMap) {
            const textureLoader = new THREE.TextureLoader();
            const basePath = getBasePath();
            this.ribbedCollarNormalMap = textureLoader.load(`${basePath}images/collar_nm.jpg`,
                (texture) => {
                    debugLog('✓ Ribbed collar normal map loaded successfully');
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    // Apply to materials after texture loads
                    this.applyRibbedNormalMap(targetMaterials, true);
                },
                undefined,
                (error) => {
                    console.error('Error loading ribbed collar normal map:', error);
                }
            );
            return; // Wait for texture to load before applying
        }

        this.applyRibbedNormalMap(targetMaterials, enabled);
    }

    /**
     * Apply or remove ribbed normal map to target materials
     * @param {Array} targetMaterials - Array of material names to apply to
     * @param {boolean} enabled - Whether to enable or disable the ribbed effect
     */
    applyRibbedNormalMap(targetMaterials, enabled) {
        if (!this.current3DObject) return;

        const ribbedNormalIntensity = 5; // Increase bump strength for ribbed collar

        this.current3DObject.traverse((child) => {
            if (child.isMesh && child.material) {
                const materialName = child.material.name;

                // Only process target materials
                if (targetMaterials.includes(materialName)) {
                    if (enabled) {
                        // Enable ribbed normal map
                        if (this.ribbedCollarNormalMap) {
                            // Clone the ribbed texture to allow different repeat settings per material
                            const ribbedTexture = this.ribbedCollarNormalMap.clone();
                            ribbedTexture.wrapS = THREE.RepeatWrapping;
                            ribbedTexture.wrapT = THREE.RepeatWrapping;
                            ribbedTexture.needsUpdate = true;

                            // Default tiling values for ribbed texture (optimized for collar/hem appearance)
                            const defaultTiling = {
                                collar: { x: 8, y: 2 },
                                collar2: { x: 8, y: 2 },
                                hem: { x: 12, y: 2 }
                            };

                            // Copy the tiling settings from the original normal map, or use defaults
                            if (child.material.userData.originalNormalMapRepeat) {
                                ribbedTexture.repeat.set(
                                    child.material.userData.originalNormalMapRepeat.x,
                                    child.material.userData.originalNormalMapRepeat.y
                                );
                                debugLog(`  📐 Applied original tiling to ribbed texture for ${materialName}: ${ribbedTexture.repeat.x}x${ribbedTexture.repeat.y}`);
                            } else {
                                // Use default tiling based on material name
                                const tiling = defaultTiling[materialName] || { x: 8, y: 2 };
                                ribbedTexture.repeat.set(tiling.x, tiling.y);
                                debugLog(`  📐 Applied default tiling to ribbed texture for ${materialName}: ${tiling.x}x${tiling.y}`);
                            }

                            // Store original normal scale once
                            if (!child.material.userData.originalNormalScaleStored) {
                                child.material.userData.originalNormalScaleStored = true;
                                child.material.userData.originalNormalScale = child.material.normalScale
                                    ? child.material.normalScale.clone()
                                    : new THREE.Vector2(1, 1);
                            }

                            child.material.normalMap = ribbedTexture;
                            // Increase normal intensity for ribbed effect
                            child.material.normalScale = child.material.userData.originalNormalScale.clone().multiplyScalar(ribbedNormalIntensity);
                            child.material.needsUpdate = true;
                            debugLog(`  ✓ Applied ribbed normal map to ${materialName} with intensity ${ribbedNormalIntensity}x`);
                        }
                    } else {
                        // Disable ribbed normal map - restore original
                        if (child.material.userData.originalNormalMapStored) {
                            // Restore the original normal map (could be null if there wasn't one)
                            child.material.normalMap = child.material.userData.originalNormalMap;
                            // Restore original normal scale if stored
                            if (child.material.userData.originalNormalScaleStored && child.material.userData.originalNormalScale) {
                                child.material.normalScale = child.material.userData.originalNormalScale.clone();
                            }
                            child.material.needsUpdate = true;
                            if (child.material.userData.originalNormalMap) {
                                debugLog(`  ✓ Restored original normal map for ${materialName}`);
                            } else {
                                debugLog(`  ✓ Removed normal map from ${materialName} (no original)`);
                            }
                        } else {
                            // Original wasn't stored, don't modify
                            debugLog(`  ⚠️ Original normal map not stored for ${materialName}, skipping`);
                        }
                    }
                }
            }
        });
    }

    /**
     * Take a screenshot of the 3D model for thumbnail generation
     * @returns {Promise<Blob>} A promise that resolves to a WebP image blob with transparency
     */
    async takeScreenshot() {
        if (!this.renderer || !this.camera || !this.scene) {
            throw new Error('3D viewer not fully initialized');
        }

        // Save original states
        const originalPosition = this.camera.position.clone();
        const originalQuaternion = this.camera.quaternion.clone();
        const originalAspect = this.camera.aspect;
        const originalBackground = this.scene.background;
        const originalGroundPlaneVisible = this.groundPlane ? this.groundPlane.visible : false;

        // Use getSize() to get actual display size (not canvas buffer size with devicePixelRatio)
        const originalSize = new THREE.Vector2();
        this.renderer.getSize(originalSize);

        // Save original clear color and alpha (design-viewer approach)
        const originalClearColor = this.renderer.getClearColor(new THREE.Color());
        const originalClearAlpha = this.renderer.getClearAlpha();

        // Hide ground plane for transparent background
        if (this.groundPlane) {
            this.groundPlane.visible = false;
        }

        // Set transparent background (design-viewer approach)
        this.renderer.setClearColor(originalClearColor, 0); // alpha 0 for transparency
        this.scene.background = null;

        // Use exact "Front" view camera position from CAMERA_POSITION_FOR_PART
        const frontPosition = CAMERA_POSITION_FOR_PART['front']; // { x: 0.00, y: 0.45, z: 4.80 }
        const frontTarget = CAMERA_TARGET_FOR_PART['front']; // { x: 0.0, y: 0.0, z: 0.0 }

        this.camera.position.set(frontPosition.x, frontPosition.y, frontPosition.z);
        this.camera.lookAt(frontTarget.x, frontTarget.y, frontTarget.z);

        // Set screenshot dimensions (16:9)
        const width = 1600;
        const height = 900;

        // Resize renderer to screenshot size
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // Render the scene directly to the canvas (preserves all lighting/AO settings)
        this.renderer.render(this.scene, this.camera);

        // Get the rendered canvas
        const canvas = this.renderer.domElement;

        // Create a copy canvas with transparency handling
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = width;
        offscreenCanvas.height = height;
        const ctx = offscreenCanvas.getContext('2d');

        // Draw the rendered image
        // IMPORTANT: canvas.width/height accounts for devicePixelRatio, so we draw from full canvas
        ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height);

        // Restore original states
        this.camera.position.copy(originalPosition);
        this.camera.quaternion.copy(originalQuaternion);
        this.camera.aspect = originalAspect;
        this.camera.updateProjectionMatrix();
        this.scene.background = originalBackground;
        if (this.groundPlane) {
            this.groundPlane.visible = originalGroundPlaneVisible;
        }

        // Restore original clear color and alpha (design-viewer approach)
        this.renderer.setClearColor(originalClearColor, originalClearAlpha);

        // Restore original renderer size
        this.renderer.setSize(originalSize.x, originalSize.y);
        this.camera.aspect = originalSize.x / originalSize.y;
        this.camera.updateProjectionMatrix();

        // Re-render with original settings
        this.renderer.render(this.scene, this.camera);

        // Convert the canvas to a WebP Blob with transparency
        return new Promise(resolve => {
            offscreenCanvas.toBlob(resolve, 'image/webp', 0.9);
        });
    }

    /**
     * Take a screenshot of the current view and download it as PNG
     * This captures the exact current camera position and viewport
     */
    takeCurrentViewScreenshot() {
        if (!this.renderer || !this.camera || !this.scene) {
            console.error('3D viewer not fully initialized');
            return;
        }

        // Store original render settings
        const originalRenderTarget = this.renderer.getRenderTarget();
        const originalAspect = this.camera.aspect;
        const originalToneMapping = this.renderer.toneMapping;
        const originalExposure = this.renderer.toneMappingExposure;
        const originalOutputEncoding = this.renderer.outputEncoding;

        // Save original clear color and alpha for transparent background (design-viewer approach)
        const originalClearColor = this.renderer.getClearColor(new THREE.Color());
        const originalClearAlpha = this.renderer.getClearAlpha();
        const originalBackground = this.scene.background;
        const originalGroundPlaneVisible = this.groundPlane ? this.groundPlane.visible : false;

        // Hide ground plane and set transparent background
        if (this.groundPlane) {
            this.groundPlane.visible = false;
        }
        this.renderer.setClearColor(originalClearColor, 0); // alpha 0 for transparency
        this.scene.background = null;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const aspectRatio = viewportWidth / viewportHeight;

        let newWidth, newHeight;
        if (aspectRatio > 16 / 9) {
            newWidth = 3200;
            newHeight = Math.round(3200 / aspectRatio);
        } else {
            newHeight = 1800;
            newWidth = Math.round(1800 * aspectRatio);
        }

        // Adjust camera aspect ratio
        this.camera.aspect = newWidth / newHeight;
        this.camera.updateProjectionMatrix();

        const renderTarget = new THREE.WebGLRenderTarget(newWidth, newHeight, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            encoding: this.renderer.outputEncoding, // Preserve renderer's encoding
        });

        // Render to offscreen target
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.render(this.scene, this.camera);

        // Read pixels from the render target
        const gl = this.renderer.getContext();
        const pixels = new Uint8Array(newWidth * newHeight * 4);
        gl.readPixels(0, 0, newWidth, newHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Create an offscreen canvas
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = newWidth;
        offscreenCanvas.height = newHeight;
        const ctx = offscreenCanvas.getContext('2d');

        // Convert linear colors to sRGB for correct brightness
        // Helper function to convert a single linear color value to sRGB
        const linearToSRGB = (c) => {
            return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
        };

        const imageData = ctx.createImageData(newWidth, newHeight);
        for (let y = 0; y < newHeight; y++) {
            const sourceY = newHeight - y - 1; // Flip vertically
            const sourceOffset = sourceY * newWidth * 4;
            const destOffset = y * newWidth * 4;

            // Copy and convert each pixel from linear to sRGB
            for (let x = 0; x < newWidth; x++) {
                const pixelSourceOffset = sourceOffset + x * 4;
                const pixelDestOffset = destOffset + x * 4;

                // Convert RGB channels from linear (0-255) to sRGB
                const r = pixels[pixelSourceOffset] / 255.0;
                const g = pixels[pixelSourceOffset + 1] / 255.0;
                const b = pixels[pixelSourceOffset + 2] / 255.0;
                const a = pixels[pixelSourceOffset + 3];

                imageData.data[pixelDestOffset] = Math.round(linearToSRGB(r) * 255);
                imageData.data[pixelDestOffset + 1] = Math.round(linearToSRGB(g) * 255);
                imageData.data[pixelDestOffset + 2] = Math.round(linearToSRGB(b) * 255);
                imageData.data[pixelDestOffset + 3] = a; // Alpha stays the same
            }
        }
        ctx.putImageData(imageData, 0, 0);

        // Restore original render settings
        this.renderer.setRenderTarget(originalRenderTarget);
        this.camera.aspect = originalAspect;
        this.camera.updateProjectionMatrix();
        this.renderer.toneMapping = originalToneMapping;
        this.renderer.toneMappingExposure = originalExposure;
        this.renderer.outputEncoding = originalOutputEncoding;

        // Restore clear color, alpha, scene background, and ground plane (design-viewer approach)
        this.renderer.setClearColor(originalClearColor, originalClearAlpha);
        this.scene.background = originalBackground;
        if (this.groundPlane) {
            this.groundPlane.visible = originalGroundPlaneVisible;
        }

        this.renderer.render(this.scene, this.camera);

        // Convert canvas to data URL and trigger download
        // Using data URL instead of blob for better Chrome filename support
        const dataUrl = offscreenCanvas.toDataURL('image/png');

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'current_view_screenshot.png';
        link.style.display = 'none';

        // Append to body, click, and clean up
        document.body.appendChild(link);
        link.click();

        // Clean up after download
        setTimeout(() => {
            document.body.removeChild(link);
        }, 100);

        // Cleanup
        renderTarget.dispose();
    }


    // Switch to Colors & Stripes mode (hide design, show stripes)
    switchToColorsMode() {
        debugLog('🎨 Switching to Colors & Stripes mode');
        this.activeMode = 'colors';

        // Iterate through all part canvases
        Object.entries(this.partCanvases).forEach(([partName, canvas]) => {
            if (!canvas) return;

            let updated = false;

            // Toggle visibility of layers
            canvas.getObjects().forEach(obj => {
                if (obj.name === 'designLayer') {
                    // Hide design layer
                    if (obj.visible) {
                        obj.visible = false;
                        updated = true;
                    }
                } else if (obj.name && obj.name.startsWith('stripeLayer')) {
                    // Show stripe layers
                    if (!obj.visible) {
                        obj.visible = true;
                        updated = true;
                    }
                }
                // Logos (logoLayer) remain visible
            });

            // Note: Stripe generation is NOT done here to avoid conflicts with config loading.
            // Stripes are generated by:
            // 1. regenerateStripesForPart() when loading a config
            // 2. Toggle/control changes by the user
            // 3. Initial default stripes are generated in loadInitialConfig()

            // Re-render and update texture if changes were made
            if (updated) {
                canvas.renderAll();
                this.updateTexture(partName);
                debugLog(`  ✓ Updated ${partName} to colors mode`);
            }
        });

        debugLog('✅ Colors & Stripes mode activated');
    }

    // Animate camera to a specific part's position
    animateCameraToPart(partName) {
        // Check if we have a predefined position for this part
        const targetPosition = CAMERA_POSITION_FOR_PART[partName];
        const targetLookAt = CAMERA_TARGET_FOR_PART[partName];

        if (!targetPosition) {
            console.warn(`No camera position defined for part: ${partName}`);
            return;
        }

        if (!targetLookAt) {
            console.warn(`No camera target defined for part: ${partName}`);
            return;
        }

        debugLog(`🎥 Animating camera to "${partName}" position:`, targetPosition, 'target:', targetLookAt);

        // Store current camera position and target as start points
        this.cameraStartPosition = this.camera.position.clone();
        this.controlsStartTarget = this.controls.target.clone();

        // Set target position (convert to THREE.Vector3)
        this.targetCameraPosition = new THREE.Vector3(
            targetPosition.x,
            targetPosition.y,
            targetPosition.z
        );

        // Set target lookAt position (where camera should point)
        this.targetControlsTarget = new THREE.Vector3(
            targetLookAt.x,
            targetLookAt.y,
            targetLookAt.z
        );

        // Start animation with timestamp
        this.isAnimatingCamera = true;
        this.cameraAnimationStartTime = performance.now();
        this.isAnimatingToPart = true; // Flag to differentiate from reset animation
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        // Update camera animation if active
        this.updateCameraAnimation();

        // Update camera position in debug panel (if debug mode is enabled)
        if (DEBUG_MODE && this.updateCameraPositionDebug) {
            this.updateCameraPositionDebug();
        }

        // Update camera target in debug panel (if debug mode is enabled)
        if (DEBUG_MODE && this.updateCameraTargetDebug) {
            this.updateCameraTargetDebug();
        }

        // Update controls
        this.controls.update();

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        window.addEventListener('resize', () => {
            if (!this.container) return;

            const width = this.container.clientWidth;
            const height = this.container.clientHeight;

            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(width, height);
        });
    }

    updateScroll(scrollPercent) {
        if (!this.current3DObject) return;

        // Store base centered position of the 3D model if not already stored
        if (!this.baseModelPosition) {
            this.baseModelPosition = this.current3DObject.position.clone();
        }

        // Shift statue to the right as we scroll into the timeline.
        // At scrollPercent = 0 (landing page), centered (shift = 0)
        // At scrollPercent = 1 (timeline), shifted to the right (shift = 0.65 units)
        // We use a smooth ease-in-out interpolation for a more premium feel.
        const ease = scrollPercent < 0.5 
            ? 2 * scrollPercent * scrollPercent 
            : 1 - Math.pow(-2 * scrollPercent + 2, 2) / 2;

        const maxShift = 0.65; 
        const shiftX = ease * maxShift;

        this.current3DObject.position.x = this.baseModelPosition.x + shiftX;
    }

    // Method to update jersey color
    updateColor(part, color) {
        if (!this.jerseyMesh) return;

        // This will be expanded to handle different parts
        debugLog(`Updating ${part} to color ${color}`);
    }

    // Cleanup method
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.controls) {
            this.controls.dispose();
        }
    }
}

// Initialize the viewer when DOM is ready
let jerseyViewer;

// Expose JerseyViewer class globally for share page to use
window.JerseyViewer = JerseyViewer;

// Only auto-initialize if not on share page
if (!window.location.pathname.includes('/jersey-configurator/share/')) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initViewer);
    } else {
        initViewer();
    }
}

function initViewer() {
    jerseyViewer = new JerseyViewer('.viewer-container');

    // Also expose on window for share page
    window.jerseyViewer = jerseyViewer;

    // Get user selections from URL parameters
    const { collar, shoulder } = getURLParameters();
    debugLog(`Loading model for: ${collar} collar + ${shoulder} shoulder`);

    // Load the appropriate model based on selections
    const modelPath = getModelPath(collar, shoulder);
    jerseyViewer.loadModel(modelPath);

    // Listen for design selection events from script.js
    window.addEventListener('designSelected', (event) => {
        const { svgPath } = event.detail;
        debugLog('Design selected event received:', svgPath);
        jerseyViewer.loadSVGDesign(svgPath);
    });

    // Listen for part selection changes to update debug canvas
    const partSelectors = [
        document.getElementById('jersey-part-select-working'),
        document.getElementById('jersey-part-select'),
        document.getElementById('jersey-part-select-colors')  // Colors & Stripes tab
    ];

    partSelectors.forEach(selector => {
        if (selector) {
            // Store previous value on focus for login guard
            selector.addEventListener('focusin', () => {
                selector.dataset.prevValue = selector.value;
            });

            selector.addEventListener('change', async (event) => {
                // Check login guard for jersey-part-select-working (upload image dropdown)
                if (selector.id === 'jersey-part-select-working') {
                    if (window.requireLoginGuard) {
                        const allowed = await window.requireLoginGuard(event, selector);
                        if (!allowed) return;
                    }

                    // Mark design as dirty if login guard passes
                    if (window.markDesignDirty) {
                        window.markDesignDirty();
                    }
                }

                const selectedPart = event.target.value;
                debugLog(`Part changed to: ${selectedPart}`);
                jerseyViewer.currentPart = selectedPart;
                jerseyViewer.switchDebugCanvas(selectedPart);

                // Clear all logo selections when switching parts
                jerseyViewer.clearAllLogoSelections();

                // Animate camera to the selected part's position
                jerseyViewer.animateCameraToPart(selectedPart);

                // Update stripe UI if this is the Colors & Stripes tab selector
                if (selector.id === 'jersey-part-select-colors') {
                    jerseyViewer.updateStripeUIForCurrentPart();
                }
            });
        }
    });

    // Initialize debug canvas to show current part
    if (DEBUG_MODE) {
        jerseyViewer.switchDebugCanvas(jerseyViewer.currentPart);
    }

    // Expose readLogo method globally for upload handler
    window.readLogo = (publicUrl) => {
        jerseyViewer.readLogo(publicUrl);
    };

    // Expose getLogosConfiguration method globally for save functionality
    window.getLogosConfiguration = () => {
        return jerseyViewer.getLogosConfiguration();
    };

    // Expose getStripesConfiguration method globally for save functionality
    window.getStripesConfiguration = () => {
        return jerseyViewer.getStripesConfiguration();
    };

    // Expose takeScreenshot method globally for save functionality
    window.takeScreenshot = async () => {
        return jerseyViewer.takeScreenshot();
    };

    // Expose takeCurrentViewScreenshot method globally for screenshot button
    window.takeCurrentViewScreenshot = () => {
        jerseyViewer.takeCurrentViewScreenshot();
    };


    // Expose hideCanvasLoader globally for script.js to call when ALL loading is complete
    window.hideCanvasLoader = () => {
        jerseyViewer.hideCanvasLoader();
    };

    // Expose jerseyViewer globally for loadJustThe3DConfig
    window.jerseyViewer = jerseyViewer;

    // Check if there's a pending configuration to load
    if (window.pendingJerseyConfig) {
        debugLog('Applying pending jersey configuration...');
        jerseyViewer.loadInitialConfig(window.pendingJerseyConfig);
        window.pendingJerseyConfig = null;
    }
}

// Export for use in other scripts
export { jerseyViewer, JerseyViewer };
