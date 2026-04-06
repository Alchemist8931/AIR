// ============================================
// Вентиляционная шахта - фоновая анимация
// Для сайта ВентПром
// ============================================

// import * as THREE from 'https://esm.sh/three@0.160.0';
// import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import * as THREE from './lib/three.module.min.js';
import { OrbitControls } from './lib/OrbitControls.js';

export function initVentilationAnimation(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    // ==========================================
    // 1. КОНФИГУРАЦИЯ
    // ==========================================
    const CONFIG = {
        scene: {
            bgColor: 0x0D0D0D,
            gridColor: 0x888888,
            gridOpacity: 0.15
        },
        colors: { fill: 0x1A1A1A, line: 0xE5E5E5, lineMuted: 0x666666 },
        duct: {
            width: 1.5,
            height: 1.5,
            opacity: 0.08,
            mainLength: 8,
            verticalLength: 4,
            bendRadius: 1.5
        },
        particles: { count: 2000 },
        components: {
            damperX: -3.5,
            fanX: 0,
            bendX: 3.5
        }
    };

    const layers = [
        { color: 0xFFBF00, size: 0.15, maxLife: 250, speed: 1, frequency: 5 },
        { color: 0xFDDA0D, size: 0.25, maxLife: 200, speed: 0.9, frequency: 7 },
        { color: 0xFFC805, size: 0.35, maxLife: 150, speed: 0.7, frequency: 7 },
        { color: 0xED8900, size: 0.45, maxLife: 100, speed: 0.5, frequency: 8 }
    ];

    let scene, camera, renderer, controls;
    let fanRotor, damperBlades, particleSystem;
    const clock = new THREE.Clock();
    let frameCount = 0;

    let systemState = {
        fanSpeed: 0.5,
        damperOpen: true
    };

    // --- Переменные для анимации камеры ---
    let currentAngle = 0;         // Текущий азимутальный угол
    let orbitSpeed = 0.025;       // Скорость (рад/сек). ~1.5 град/сек (в 2 раза медленнее)
    let rotationDirection = 1;    // 1 или -1
    let minAngle = 0;
    let maxAngle = 0;
    let radius = 0;               // Радиус орбиты
    let phi = 0;                  // Угол возвышения (высота)
    // -------------------------------------

    // ==========================================
    // 2. ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    function init() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(CONFIG.scene.bgColor);

        camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(-14, 6, -12); // Позиция камеры оставлена без изменений

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.domElement.style.pointerEvents = 'none';
        container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, 2, 0);
        controls.enableZoom = false;
        controls.enablePan = false;
        
        // ОТКЛЮЧАЕМ стандартное авто-вращение, управляем позицией вручную
        controls.autoRotate = false;
        controls.enabled = false; // Блокируем управление пользователем, если нужно
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        scene.add(ambientLight);

        createEnvironment();
        createDuctSystem();
        createInternalComponents();
        initParticleSystem();
        
        // Инициализация параметров вращения
        setupCameraOrbit();

        animate();

        window.addEventListener('resize', onWindowResize);
    }

    // Вычисляем начальные углы и границы вращения
    function setupCameraOrbit() {
        const target = controls.target;
        const offset = new THREE.Vector3().subVectors(camera.position, target);
        
        radius = offset.length();
        
        // Вычисляем начальный азимут (угол в плоскости XZ)
        // Используем atan2(x, z) для удобства (0 = впереди)
        currentAngle = Math.atan2(offset.x, offset.z);
        
        // Угол возвышения (от оси Y)
        phi = Math.acos(offset.y / radius);

        // Диапазон вращения: +/- 30 градусов (PI/6) от начальной позиции
        // Это соответствует диапазону "от 5 до 3 часов" (60 градусов)
        const sweepRange = Math.PI / 6; 
        minAngle = currentAngle - sweepRange;
        maxAngle = currentAngle + sweepRange;
    }

    function onWindowResize() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    // ==========================================
    // 3. ФАБРИКА ОБЪЕКТОВ
    // ==========================================
    function createGhostMaterial(opacity = 0.05) {
        return new THREE.MeshBasicMaterial({
            color: CONFIG.colors.fill,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
    }

    function createTechEdges(geometry, color = CONFIG.colors.line) {
        const edges = new THREE.EdgesGeometry(geometry, 15);
        const lineMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
        return new THREE.LineSegments(edges, lineMat);
    }

    function createBlueprintPart(geometry, pos = {x:0,y:0,z:0}, opacity = 0.03) {
        const group = new THREE.Group();
        const faceMat = new THREE.MeshBasicMaterial({
            color: CONFIG.colors.fill,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(geometry, faceMat);
        group.add(mesh);

        const edges = createTechEdges(geometry);
        group.add(edges);

        group.position.set(pos.x, pos.y, pos.z);
        return group;
    }

    // ==========================================
    // 4. ПОСТРОЕНИЕ ВОЗДУХОВОДА
    // ==========================================
    function createDuctSystem() {
        const mainGroup = new THREE.Group();
        const W = CONFIG.duct.width;
        const H = CONFIG.duct.height;
        const R = CONFIG.duct.bendRadius;
        const op = CONFIG.duct.opacity;

        const horizLength = CONFIG.duct.mainLength;
        const horizGeo = new THREE.BoxGeometry(horizLength, H, W);
        const horizDuct = new THREE.Mesh(horizGeo, createGhostMaterial(op));
        horizDuct.position.set(-horizLength/2, H/2 + 0.5, 0);
        mainGroup.add(horizDuct);

        const hEdges = createTechEdges(horizGeo).clone();
        hEdges.position.copy(horizDuct.position);
        mainGroup.add(hEdges);

        for(let i = -horizLength + 1; i < 0; i += 2) {
            const ringGeo = new THREE.BoxGeometry(0.1, H + 0.1, W + 0.1);
            const ring = createBlueprintPart(ringGeo, {x: i, y: H/2 + 0.5, z: 0});
            mainGroup.add(ring);
        }

        // --- ИЗГИБ ---
        const shape = new THREE.Shape();
        shape.moveTo(-W/2, -H/2);
        shape.lineTo(W/2, -H/2);
        shape.lineTo(W/2, H/2);
        shape.lineTo(-W/2, H/2);
        shape.lineTo(-W/2, -H/2);

        const startY = H/2 + 0.5;

        const P0 = new THREE.Vector3(0, startY, 0);
        const P1 = new THREE.Vector3(R, startY, 0);
        const P2 = new THREE.Vector3(R, startY + R, 0);

        const curve = new THREE.QuadraticBezierCurve3(P0, P1, P2);

        const extrudeSettings = { steps: 20, bevelEnabled: false, extrudePath: curve };
        const bendGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const bendMesh = new THREE.Mesh(bendGeo, createGhostMaterial(op));
        mainGroup.add(bendMesh);

        const edgesBend = new THREE.EdgesGeometry(bendGeo, 30);
        const linesBend = new THREE.LineSegments(edgesBend, new THREE.LineBasicMaterial({ color: CONFIG.colors.line, transparent: true, opacity: 0.5 }));
        mainGroup.add(linesBend);

        // --- ВЕРТИКАЛЬНЫЙ УЧАСТОК ---
        const vertStartX = R;
        const vertStartY = startY + R;
        const vertLength = CONFIG.duct.verticalLength;

        const vertGeo = new THREE.BoxGeometry(W, vertLength, H);
        const vertDuct = new THREE.Mesh(vertGeo, createGhostMaterial(op));
        vertDuct.position.set(vertStartX, vertStartY + vertLength/2, 0);
        mainGroup.add(vertDuct);

        const vEdges = createTechEdges(vertGeo).clone();
        vEdges.position.copy(vertDuct.position);
        mainGroup.add(vEdges);

        for(let i = vertStartY + 1; i < vertStartY + vertLength; i += 2) {
            const ringGeo = new THREE.BoxGeometry(W + 0.1, 0.1, H + 0.1);
            const ring = createBlueprintPart(ringGeo, {x: vertStartX, y: i, z: 0});
            mainGroup.add(ring);
        }

        scene.add(mainGroup);

        window.ductBounds = {
            minX: -horizLength,
            maxX: 0,
            startY: startY,
            maxY: vertStartY + vertLength,
            curvePoints: { p0: P0, p1: P1, p2: P2 }
        };
    }

    function createInternalComponents() {
        const W = CONFIG.duct.width;
        const H = CONFIG.duct.height;
        const Y = H/2 + 0.5;

        // --- ШЛЮЗ ---
        const damperGroup = new THREE.Group();
        damperGroup.position.set(CONFIG.components.damperX, Y, 0);

        const body = createBlueprintPart(new THREE.BoxGeometry(0.3, H + 0.1, W + 0.1));
        damperGroup.add(body);

        damperBlades = new THREE.Group();
        const bladeThickness = 0.04;
        const bladeWidth = W * 0.48;
        const bladeGeo = new THREE.BoxGeometry(bladeThickness, H * 0.95, bladeWidth);

        const blade1G = new THREE.Group();
        const b1Mesh = new THREE.Mesh(bladeGeo, createGhostMaterial(0.4));
        const b1Edges = createTechEdges(bladeGeo);
        b1Mesh.position.z = W / 4;
        b1Edges.position.z = W / 4;
        blade1G.add(b1Mesh);
        blade1G.add(b1Edges);
        damperBlades.add(blade1G);

        const blade2G = new THREE.Group();
        const b2Mesh = new THREE.Mesh(bladeGeo, createGhostMaterial(0.4));
        const b2Edges = createTechEdges(bladeGeo);
        b2Mesh.position.z = -W / 4;
        b2Edges.position.z = -W / 4;
        blade2G.add(b2Mesh);
        blade2G.add(b2Edges);
        damperBlades.add(blade2G);

        const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, H * 0.95, 8);
        const shaftMesh = new THREE.Mesh(shaftGeo, createGhostMaterial(0.3));
        shaftMesh.rotation.x = Math.PI / 2;
        damperBlades.add(shaftMesh);
        damperBlades.add(createTechEdges(shaftGeo).clone().rotateX(Math.PI/2));

        damperGroup.add(damperBlades);
        scene.add(damperGroup);

        // --- ВЕНТИЛЯТОР ---
        const fanGroup = new THREE.Group();
        fanGroup.position.set(CONFIG.components.fanX, Y, 0);
        const fanSectionGeo = new THREE.BoxGeometry(0.3, H, W);
        fanGroup.add(createBlueprintPart(fanSectionGeo));

        fanRotor = new THREE.Group();
        const hubRadius = 0.1;
        const hubLen = 0.1;
        const hubGeo = new THREE.CylinderGeometry(hubRadius, hubRadius, hubLen, 16);
        const hubMesh = new THREE.Mesh(hubGeo, createGhostMaterial(0.3));
        hubMesh.rotation.z = Math.PI / 2;
        fanRotor.add(hubMesh);
        fanRotor.add(createTechEdges(hubGeo).clone().rotateZ(Math.PI / 2));

        const bladeCount = 8;
        const rotorRadius = W/1.8 - 0.1;
        const bladeLength = rotorRadius - hubRadius;
        const bGeo = new THREE.BoxGeometry(0.02, bladeLength, 0.15);

        for(let i=0; i<bladeCount; i++) {
            const angle = (i/bladeCount) * Math.PI * 2;
            const bladePivot = new THREE.Group();
            const bMesh = new THREE.Mesh(bGeo, createGhostMaterial(0.4));
            const bEdges = createTechEdges(bGeo);
            bMesh.position.y = hubRadius + bladeLength/2;
            bEdges.position.y = hubRadius + bladeLength/2;
            bMesh.rotation.y = 0.8;
            bEdges.rotation.y = 0.7;
            bladePivot.add(bMesh);
            bladePivot.add(bEdges);
            bladePivot.rotation.x = angle;
            fanRotor.add(bladePivot);
        }

        const ringGeo = new THREE.TorusGeometry(rotorRadius, 0, 8, 32);
        const ringMesh = new THREE.Mesh(ringGeo, createGhostMaterial(0.2));
        ringMesh.rotation.y = Math.PI / 2;
        fanRotor.add(ringMesh);
        fanRotor.add(createTechEdges(ringGeo).clone().rotateY(Math.PI / 2));

        fanGroup.add(fanRotor);
        scene.add(fanGroup);

        window.sceneObjects = {
            damper: damperGroup,
            fan: fanGroup,
            rotor: fanRotor
        };
    }

    function createEnvironment() {
        const grid = new THREE.GridHelper(30, 60, CONFIG.scene.gridColor, CONFIG.scene.bgColor);
        grid.material.opacity = CONFIG.scene.gridOpacity;
        grid.material.transparent = true;
        scene.add(grid);
    }

    // ==========================================
    // 5. СИСТЕМА ЧАСТИЦ
    // ==========================================
    let particles = [];

    function initParticleSystem() {
        const geometry = new THREE.BufferGeometry();
        const MAX_PARTICLES = CONFIG.particles.count;
        const positions = new Float32Array(MAX_PARTICLES * 3);
        const alphas = new Float32Array(MAX_PARTICLES);
        const sizes = new Float32Array(MAX_PARTICLES);
        const colors = new Float32Array(MAX_PARTICLES * 3);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        const texture = new THREE.CanvasTexture(canvas);

        const material = new THREE.ShaderMaterial({
            uniforms: { pointTexture: { value: texture } },
            vertexShader: `
                attribute float alpha;
                attribute float size;
                attribute vec3 color;
                varying float vAlpha;
                varying vec3 vColor;
                void main() {
                    vAlpha = alpha; vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform sampler2D pointTexture;
                varying float vAlpha;
                varying vec3 vColor;
                void main() {
                    vec4 texColor = texture2D(pointTexture, gl_PointCoord);
                    gl_FragColor = vec4(vColor, vAlpha * texColor.a);
                }
            `,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        });

        particleSystem = new THREE.Points(geometry, material);
        scene.add(particleSystem);
    }

    class DuctParticle {
        constructor(x, y, z, colorHex, size, maxLife, layerSpeed) {
            this.pos = new THREE.Vector3(x, y, z);
            this.color = new THREE.Color(colorHex);
            this.size = size;
            this.maxLife = maxLife;
            this.layerSpeed = layerSpeed;
            this.life = 0;
            this.alpha = 1.0;
            this.stage = 0;
            this.vel = new THREE.Vector3();
            this.t = 0;
            this.initialYoffset = 0;

            this.setupVelocity();
        }

        setupVelocity() {
            const speedFactor = systemState.fanSpeed;
            const damperIsOpen = systemState.damperOpen;
            if (!damperIsOpen) {
                this.vel.set((Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02, (Math.random() - 0.5) * 0.02);
            } else {
                const baseSpeed = 0.05 * speedFactor * this.layerSpeed;
                this.vel.set(baseSpeed, 0, 0);
            }
        }

        getBezierPoint(t, p0, p1, p2) {
            const cX = Math.pow(1-t, 2) * p0.x + 2 * (1-t) * t * p1.x + Math.pow(t, 2) * p2.x;
            const cY = Math.pow(1-t, 2) * p0.y + 2 * (1-t) * t * p1.y + Math.pow(t, 2) * p2.y;
            return {x: cX, y: cY};
        }

        getBezierNormal(t, p0, p1, p2) {
            const tx = 2 * (1-t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
            const ty = 2 * (1-t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);

            const len = Math.sqrt(tx*tx + ty*ty);
            const txNorm = tx / len;
            const tyNorm = ty / len;

            return {x: -tyNorm, y: txNorm};
        }

        update() {
            const cfg = CONFIG;
            const bounds = window.ductBounds;
            const speedFactor = systemState.fanSpeed;
            const damperIsOpen = systemState.damperOpen;
            this.life++;

            const limitY = cfg.duct.height / 2 - 0.1;
            const limitZ = cfg.duct.width / 2 - 0.1;

            if (!damperIsOpen) {
                this.vel.x += (Math.random() - 0.5) * 0.005;
                this.vel.y += (Math.random() - 0.5) * 0.005;
                this.vel.z += (Math.random() - 0.5) * 0.005;
                this.vel.clampLength(0, 0.03);

                this.pos.add(this.vel);

                if (this.pos.x < bounds.minX + 0.5) {
                    this.pos.x = bounds.minX + 0.5;
                    this.vel.x *= -1;
                }
                if (this.pos.x > cfg.components.damperX) {
                    this.pos.x = cfg.components.damperX;
                    this.vel.x *= -1;
                }

                const currentOffsetY = this.pos.y - bounds.startY;
                if (Math.abs(currentOffsetY) > limitY) {
                    this.pos.y = bounds.startY + Math.sign(currentOffsetY) * limitY;
                    this.vel.y *= -1;
                }
                if (Math.abs(this.pos.z) > limitZ) {
                    this.pos.z = Math.sign(this.pos.z) * limitZ;
                    this.vel.z *= -1;
                }

                this.alpha = 1.0;

            } else {
                const visualSpeedMultiplier = 5;

                if (this.stage === 0) {
                    this.vel.y *= 0.9;
                    this.vel.z *= 0.9;

                    const targetVx = 0.05 * speedFactor * this.layerSpeed * visualSpeedMultiplier;
                    this.vel.x += (targetVx - this.vel.x) * 0.1;
                    this.pos.add(this.vel);

                    if (this.pos.x > bounds.maxX) {
                        this.stage = 1;
                        this.t = 0;
                        this.initialYoffset = THREE.MathUtils.clamp(this.pos.y - bounds.startY, -limitY, limitY);
                    }
                } else if (this.stage === 1) {
                    const dt = (0.05 * speedFactor * this.layerSpeed * visualSpeedMultiplier * 0.15);
                    this.t += dt;

                    const P = bounds.curvePoints;

                    if (this.t >= 1.0) {
                        this.stage = 2;
                        this.t = 1.0;
                        this.vel.y = 0.05 * speedFactor * this.layerSpeed * visualSpeedMultiplier;
                    }

                    const center = this.getBezierPoint(this.t, P.p0, P.p1, P.p2);
                    const normal = this.getBezierNormal(this.t, P.p0, P.p1, P.p2);

                    this.pos.x = center.x + this.initialYoffset * normal.x;
                    this.pos.y = center.y + this.initialYoffset * normal.y;

                } else if (this.stage === 2) {
                    this.pos.y += this.vel.y;
                    if (this.pos.y > bounds.maxY - 3) {
                        this.alpha -= 0.05;
                    }
                }
            }
        }

        isFinished() { return this.life > this.maxLife || this.alpha <= 0; }
    }

    function updateParticles() {
        const cfg = CONFIG;
        const bounds = window.ductBounds;
        const speedFactor = systemState.fanSpeed;
        const startY = cfg.duct.height/2 + 0.5;

        if (speedFactor > 0.01) {
            layers.forEach(layer => {
                if (frameCount % layer.frequency === 0) {
                    const x = bounds.minX + 0.5;
                    const y = startY + (Math.random() - 0.5) * (cfg.duct.height - 0.5);
                    const z = (Math.random() - 0.5) * (cfg.duct.width - 0.5);
                    particles.push(new DuctParticle(x, y, z, layer.color, layer.size, 600, layer.speed));
                }
            });
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update();
            if (particles[i].isFinished()) particles.splice(i, 1);
        }

        const positions = particleSystem.geometry.attributes.position.array;
        const alphas = particleSystem.geometry.attributes.alpha.array;
        const sizes = particleSystem.geometry.attributes.size.array;
        const colors = particleSystem.geometry.attributes.color.array;

        let idx = 0;
        const MAX_RENDER = CONFIG.particles.count;

        for (let i = 0; i < particles.length; i++) {
            if (idx < MAX_RENDER) {
                let p = particles[i];
                positions[idx * 3] = p.pos.x;
                positions[idx * 3 + 1] = p.pos.y;
                positions[idx * 3 + 2] = p.pos.z;
                alphas[idx] = Math.max(0, p.alpha);
                sizes[idx] = p.size;
                colors[idx * 3] = p.color.r;
                colors[idx * 3 + 1] = p.color.g;
                colors[idx * 3 + 2] = p.color.b;
                idx++;
            }
        }
        for (let i = idx; i < MAX_RENDER; i++) alphas[i] = 0;
        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleSystem.geometry.attributes.alpha.needsUpdate = true;
        particleSystem.geometry.attributes.size.needsUpdate = true;
        particleSystem.geometry.attributes.color.needsUpdate = true;
    }

    // ==========================================
    // 6. ПУБЛИЧНЫЙ API
    // ==========================================
    function setFanSpeed(speed) {
        systemState.fanSpeed = speed;
    }

    function setDamperOpen(isOpen) {
        systemState.damperOpen = isOpen;
    }

    function getState() {
        return { ...systemState };
    }

    // ==========================================
    // 7. ОСНОВНОЙ ЦИКЛ (ИСПРАВЛЕНО)
    // ==========================================
    function animate() {
        requestAnimationFrame(animate);
        frameCount++;
        const delta = clock.getDelta();

        // --- РУЧНОЕ ВРАЩЕНИЕ КАМЕРЫ ---
        // Обновляем угол
        currentAngle += orbitSpeed * rotationDirection * delta;

        // Проверка границ (пинг-понг)
        if (currentAngle > maxAngle) {
            currentAngle = maxAngle;
            rotationDirection = -1;
        } else if (currentAngle < minAngle) {
            currentAngle = minAngle;
            rotationDirection = 1;
        }

        // Вычисляем новую позицию камеры
        // x = r * sin(phi) * sin(theta)
        // z = r * sin(phi) * cos(theta)
        // y = r * cos(phi)
        const target = controls.target;
        camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(currentAngle);
        camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(currentAngle);
        camera.position.y = target.y + radius * Math.cos(phi);

        // Так как controls отключены, обновляем lookAt вручную
        camera.lookAt(target);

        // --- Анимация вентилятора ---
        if (fanRotor) {
            fanRotor.rotation.x += delta * 15 * systemState.fanSpeed;
        }

        // --- Анимация заслонки ---
        if (damperBlades) {
            const targetAngle = systemState.damperOpen ? Math.PI / 2 : 0;

            const b1 = damperBlades.children[0];
            b1.rotation.y += (targetAngle - b1.rotation.y) * 0.1;

            const b2 = damperBlades.children[1];
            b2.rotation.y += (-targetAngle - b2.rotation.y) * 0.1;
        }

        updateParticles();
        // controls.update(); // Не нужен, так как enabled=false и позицию задаем вручную
        renderer.render(scene, camera);
    }

    // Запуск
    init();

    // Возвращаем API для управления извне
    return {
        setFanSpeed,
        setDamperOpen,
        getState,
        destroy: () => {
            window.removeEventListener('resize', onWindowResize);
            renderer.dispose();
            container.innerHTML = '';
        }
    };
}
