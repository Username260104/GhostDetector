export default class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;

        // 폰트 설정
        this.fontSize = 14;
        this.fontFamily = 'Courier New, monospace';
    }

    render(result, video) {
        // 1. 비디오 프레임을 캔버스 바닥에 그리기 (Base Layer)
        // High DPI가 적용된 상태이므로, 캔버스 크기에 맞춰서 그려야 함.
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);

        // 캔버스 초기화 겸 비디오 그리기
        this.ctx.drawImage(video, 0, 0, width, height);

        if (!result) return;

        // 2. 블렌딩 모드 설정 (Difference)
        // 이후 그려지는 모든 것은 바닥(비디오)과 색상 차이값으로 계산됨
        this.ctx.globalCompositeOperation = 'difference';

        // Draw Options (항상 흰색 사용 -> 반전 효과)
        this.ctx.lineWidth = 1.0;
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Debug Info (좌상단)
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        this.ctx.font = `12px monospace`;
        const info = result ? `State: ${result.state} | ID: ${result.id || 'N/A'}` : "No Result";
        this.ctx.fillText(info, 10, 10);

        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;

        // 3. Scanning State
        if (!result || result.state === 'SCANNING') {
            this.ctx.fillText("SCANNING...", width / 2, height / 2);
            this.ctx.globalCompositeOperation = 'source-over';
            return;
        }

        // 4. Locked State
        if (result.state === 'LOCKED') {
            const w = result.w * width;
            const h = result.h * height;
            const x = result.x * width;
            const y = result.y * height;

            // 박스 그리기
            this.ctx.strokeRect(x, y, w, h);

            // 텍스트 그리기 (정중앙)
            const cx = x + w / 2;
            const cy = y + h / 2;

            this.ctx.fillText(result.id, cx, cy);
        }

        // 5. 블렌딩 모드 복구
        this.ctx.globalCompositeOperation = 'source-over';
    }
}
