import Camera from './Camera.js';
import Detector from './Detector.js';
import Renderer from './Renderer.js';

class App {
    constructor() {
        this.video = document.getElementById('camera-feed');
        this.canvas = document.getElementById('overlay');
        this.ctx = this.canvas.getContext('2d');

        this.camera = new Camera(this.video);
        this.detector = new Detector();
        this.renderer = new Renderer(this.canvas, this.ctx);

        this.lastTime = 0;

        window.addEventListener('resize', this.onResize.bind(this));
        // 초기 사이즈 설정
        this.onResize();

        this.init();
    }

    async init() {
        // Debug UI 생성
        this.debugDiv = document.createElement('div');
        this.debugDiv.style.position = 'absolute';
        this.debugDiv.style.top = '10px';
        this.debugDiv.style.left = '10px';
        this.debugDiv.style.color = '#00FF00';
        this.debugDiv.style.zIndex = '9999';
        this.debugDiv.style.fontSize = '12px';
        this.debugDiv.style.whiteSpace = 'pre-wrap';
        this.debugDiv.innerHTML = 'Initializing...';
        document.body.appendChild(this.debugDiv);

        this.log("App initialized.");

        try {
            this.log("Requesting camera...");
            await this.camera.start();
            this.log("Camera started successfully.");
            this.loop(0);
        } catch (error) {
            this.log(`Camera Error: ${error.message}`);
            console.error("Failed to start camera:", error);
            alert("카메라를 시작할 수 없습니다. 권한을 확인해주세요.");
        }
    }

    log(msg) {
        const time = new Date().toLocaleTimeString();
        this.debugDiv.innerHTML += `\n[${time}] ${msg}`;
        // 로그가 너무 길어지면 자르기
        if (this.debugDiv.innerHTML.length > 500) {
            this.debugDiv.innerHTML = this.debugDiv.innerHTML.slice(-500);
        }
    }

    onResize() {
        // 캔버스 크기를 실제 화면 크기에 맞춤
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    loop(timestamp) {
        // 1. 카메라 프레임에서 데이터 분석
        // Detect: 비디오의 현재 프레임을 캡처해서 분석
        try {
            const detectionResult = this.detector.detect(this.video);

            // 디버그: 데이터가 null인지 확인
            if (!detectionResult) {
                // 너무 자주 찍히면 성능 저하되므로 60프레임마다 한 번만
                if (Math.random() < 0.01) this.log("Detection: null (Video not ready?)");
            } else if (detectionResult.state === 'LOCKED') {
                if (Math.random() < 0.05) this.log(`Locked: ${detectionResult.id} (${detectionResult.score?.toFixed(2)})`);
            }

            // 2. 결과 시각화
            // Render: 캔버스를 지우고 결과를 그림
            this.renderer.render(detectionResult, this.video);
        } catch (e) {
            this.log(`Loop Error: ${e.message}`);
        }

        requestAnimationFrame(this.loop.bind(this));
    }
}

window.onload = () => {
    new App();
};
