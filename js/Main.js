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
        try {
            await this.camera.start();
            console.log("Camera started");
            this.loop(0);
        } catch (error) {
            console.error("Failed to start camera:", error);
            alert("카메라를 시작할 수 없습니다. 권한을 확인해주세요.");
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
        const detectionResult = this.detector.detect(this.video);

        // 2. 결과 시각화
        // Render: 캔버스를 지우고 결과를 그림
        this.renderer.render(detectionResult, this.video);

        requestAnimationFrame(this.loop.bind(this));
    }
}

window.onload = () => {
    new App();
};
