// This script handles the 3D visualization of the Messi Statue model

// DEBUG MODE: Add #debug to the URL to enable (e.g., http://localhost:8080/index.html#debug)
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

// Helper function to calculate the correct base path
function getBasePath() {
    return ''; // All assets are relative to the root in this repository
}

// Helper function to get model path based on selections (retained for backward compatibility)
function getModelPath() {
    const basePath = getBasePath();
    return `${basePath}jersey_3d_models/messi_statue_opt.glb`;
}

// Make paths available globally
window.getModelPath = getModelPath;
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
        this.animationId = null;
        this.gltfLoader = new GLTFLoader();
        this.current3DObject = null;
        this._loadId = 0; // Used to ignore stale load callbacks
        this.isAnimatingShowcase = false;
        this.showcaseStartTime = 0;

        // Loading state tracking
        this.loadingState = {
            modelLoaded: false
        };

        // Camera reset animation properties
        this.initialCameraPosition = new THREE.Vector3(0, 0.45, 4.8);
        this.cameraResetDuration = 800; // Duration in milliseconds

        this.init();
        this.createLights();
        this.createGroundPlane();
        this.animate();
        this.handleResize();
    }

    // Update loading state
    updateLoadingState(key, value) {
        this.loadingState[key] = value;
        debugLog(`🔄 Loading state updated: ${key} = ${value}`, this.loadingState);
    }

    // Hide the canvas loading overlay with smooth transition
    hideCanvasLoader() {
        const overlay = document.getElementById('canvas-loading-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            debugLog('✅ Hiding canvas loader');
            overlay.classList.add('hidden');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 400);
        }
    }

    // Mark model as loaded
    markModelLoaded() {
        this.updateLoadingState('modelLoaded', true);
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = null; // Enable transparent canvas background

        // Create camera with container dimension
        const width = this.container.clientWidth || window.innerWidth || 800;
        const height = this.container.clientHeight || window.innerHeight || 600;
        const aspect = width / height;
        this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 1000);
        this.camera.position.set(this.initialCameraPosition.x, this.initialCameraPosition.y, this.initialCameraPosition.z);

        // Create renderer with proper settings
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
            precision: "mediump"
        });
        this.renderer.setSize(width, height);
        
        // Detect mobile to optimize performance
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 1024;
        const maxPixelRatio = isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(maxPixelRatio);
        this.renderer.shadowMap.enabled = false;

        // Configure tone mapping and exposure
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // Remove placeholder and add renderer
        const placeholder = this.container.querySelector('.viewer-placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        this.container.appendChild(this.renderer.domElement);

        // Create controls with specific camera limits for Messi statue
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 0, 0);

        this.controls.enablePan = false;
        this.controls.minDistance = 3.0;
        this.controls.maxDistance = 4.5;

        // Polar Angle (Vertical rotation): Restrict looking directly under/over (60 deg to 105 deg)
        this.controls.minPolarAngle = Math.PI / 3;     // 60 deg
        this.controls.maxPolarAngle = Math.PI / 1.714; // 105 deg

        // Azimuth Angle (Horizontal rotation): Restrict rotating to the backside (-25 deg to +25 deg)
        this.controls.minAzimuthAngle = -25 * Math.PI / 180;  // -25 deg
        this.controls.maxAzimuthAngle = 25 * Math.PI / 180;   // +25 deg
    }

    createLights() {
        this.lightsContainer = new THREE.Object3D();
        this.scene.add(this.lightsContainer);

        this.ambientLight = new THREE.AmbientLight(0xffffff, 1);
        this.lightsContainer.add(this.ambientLight);

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

        this.loadEnvironmentMap();
    }

    loadEnvironmentMap() {
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();

        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0xcccccc);

        const envMap = pmremGenerator.fromScene(envScene).texture;
        this.scene.environment = envMap;
        this.scene.environmentIntensity = 0.9;

        pmremGenerator.dispose();
        debugLog('✅ Neutral environment map loaded');
    }

    createGroundPlane() {
        // Create a circular ground plane with soft shadow
        const groundGeometry = new THREE.CircleGeometry(2.5, 64);

        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
        gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);

        const shadowTexture = new THREE.CanvasTexture(canvas);
        shadowTexture.needsUpdate = true;

        const groundMaterial = new THREE.MeshBasicMaterial({
            map: shadowTexture,
            transparent: true,
            opacity: 1,
            depthWrite: false,
            color: 0xffffff
        });

        this.groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.position.y = -1.5;

        this.scene.add(this.groundPlane);
        debugLog('✅ Ground plane created');
    }

    loadModel(modelPath) {
        // Remove existing model if any
        if (this.current3DObject) {
            this.scene.remove(this.current3DObject);
            this.current3DObject = null;
        }

        const loadId = ++this._loadId;

        // Load GLB model
        this.gltfLoader.load(
            modelPath,
            (gltf) => {
                if (loadId !== this._loadId) {
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

                // Base Y rotation for the Messi statue
                this.current3DObject.rotation.y = -10 * Math.PI / 180;

                // Scale and position the model
                const box = new THREE.Box3().setFromObject(this.current3DObject);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2 / maxDim;
                this.current3DObject.scale.setScalar(scale);
                this.current3DObject.position.sub(center.multiplyScalar(scale));

                this.scene.add(this.current3DObject);
                debugLog('📦 Model loaded and positioned');

                this.markModelLoaded();
            },
            (progress) => {
                debugLog('Loading progress:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading model:', error);
                if (loadId === this._loadId) {
                    this.markModelLoaded();
                }
            }
        );
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        // Update showcase rotation animation if active
        this.updateShowcaseAnimation();

        // Update controls
        this.controls.update();

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        window.addEventListener('resize', () => {
            if (!this.container) return;

            const width = this.container.clientWidth || window.innerWidth || 800;
            const height = this.container.clientHeight || window.innerHeight || 600;

            if (width > 0 && height > 0) {
                this.camera.aspect = width / height;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(width, height);
            }
        });
    }

    updateScroll(scrollPercent) {
        if (!this.current3DObject) return;

        if (!this.baseModelPosition) {
            this.baseModelPosition = this.current3DObject.position.clone();
        }

        // Shift statue on timeline scroll
        const ease = scrollPercent < 0.5 
            ? 2 * scrollPercent * scrollPercent 
            : 1 - Math.pow(-2 * scrollPercent + 2, 2) / 2;

        const maxShift = 0.65; 
        const shiftX = ease * maxShift;

        this.current3DObject.position.x = this.baseModelPosition.x + shiftX;
    }

    playShowcaseAnimation() {
        if (!this.current3DObject) return;
        debugLog('🎬 Playing showcase animation...');
        this.isAnimatingShowcase = true;
        this.showcaseStartTime = performance.now();
    }

    updateShowcaseAnimation() {
        if (!this.isAnimatingShowcase || !this.current3DObject) return;

        const currentTime = performance.now();
        const elapsed = currentTime - this.showcaseStartTime;
        const duration = 4000;
        const progress = Math.min(elapsed / duration, 1.0);

        if (progress >= 1.0) {
            this.isAnimatingShowcase = false;
            
            const defaultPos = this.initialCameraPosition;
            this.camera.position.set(defaultPos.x, defaultPos.y, defaultPos.z);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
            debugLog('🎬 Showcase camera animation complete.');
        } else {
            const ease = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            const defaultPos = this.initialCameraPosition;
            const radius = Math.sqrt(defaultPos.x * defaultPos.x + defaultPos.y * defaultPos.y + defaultPos.z * defaultPos.z);
            const defaultPhi = Math.acos(defaultPos.y / radius);
            const defaultTheta = Math.atan2(defaultPos.x, defaultPos.z);

            const azimuthRange = 20 * Math.PI / 180;
            const theta = defaultTheta + Math.sin(ease * Math.PI * 2) * azimuthRange;

            const polarRange = 8 * Math.PI / 180;
            const phi = defaultPhi + (Math.cos(ease * Math.PI * 2) - 1) * polarRange;

            const x = radius * Math.sin(phi) * Math.sin(theta);
            const y = radius * Math.cos(phi);
            const z = radius * Math.sin(phi) * Math.cos(theta);

            this.camera.position.set(x, y, z);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }

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
window.JerseyViewer = JerseyViewer;

if (!window.location.pathname.includes('/jersey-configurator/share/')) {
    window.addEventListener('load', () => {
        setTimeout(initViewer, 100);
    });
}

function initViewer() {
    jerseyViewer = new JerseyViewer('.viewer-container');
    window.jerseyViewer = jerseyViewer;

    const modelPath = getModelPath();
    jerseyViewer.loadModel(modelPath);

    window.hideCanvasLoader = () => {
        jerseyViewer.hideCanvasLoader();
    };
}

export { jerseyViewer, JerseyViewer };
