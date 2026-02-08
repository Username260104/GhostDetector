export default class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;

        // 폰트 설정
        this.fontSize = 14; // 요청: 14px
        this.fontFamily = 'Courier New, monospace';
    }

    render(result, video) {
        // 캔버스 초기화
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!result) return;

        // Draw Options
        this.ctx.lineWidth = 0.5; // 요청: 0.5
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        this.ctx.textAlign = 'center'; // 요청: CENTER
        this.ctx.textBaseline = 'middle'; // 요청: CENTER

        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.fillStyle = '#00FF00';
        this.ctx.font = `12px monospace`;

        // Debug Info
        const info = result ? `State: ${result.state} | ID: ${result.id || 'N/A'}` : "No Result";
        this.ctx.fillText(info, 10, 10);

        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;

        // 1. Scanning State
        if (!result || result.state === 'SCANNING') {
            // 아무것도 안 잡혀도 뭔가 작동 중임을 표시
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.fillText("SCANNING...", this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        // 2. Locked State
        if (result.state === 'LOCKED') {
            const videoRatio = video.videoWidth / video.videoHeight;
            const canvasRatio = this.canvas.width / this.canvas.height;

            let drawW, drawH, startX, startY;

            if (canvasRatio > videoRatio) {
                drawW = this.canvas.width;
                drawH = this.canvas.width / videoRatio;
                startX = 0;
                startY = (this.canvas.height - drawH) / 2;
            } else {
                drawH = this.canvas.height;
                drawW = this.canvas.height * videoRatio;
                startX = (this.canvas.width - drawW) / 2;
                startY = 0;
            }

            const x = startX + result.x * drawW;
            const y = startY + result.y * drawH;
            const w = result.w * drawW;
            const h = result.h * drawH;

            // 박스 그리기
            this.ctx.strokeRect(x, y, w, h);

            // 텍스트 그리기 (정중앙)
            // 요청: rect.x + rect.w/2, rect.y + rect.h/2
            const cx = x + w / 2;
            const cy = y + h / 2;

            this.ctx.fillText(result.id, cx, cy);
        }
    }
}
