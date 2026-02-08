export default class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;

        // 폰트 설정
        this.fontSize = 14;
        this.fontFamily = 'Courier New, monospace';
    }

    render(result, video) {
        // 1. 캔버스 초기화 (비디오를 그리지 않음, 투명 유지)
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);

        this.ctx.clearRect(0, 0, width, height);

        if (!result) return;

        // 2. 그리기 옵션 설정
        // mix-blend-mode: difference가 CSS에 적용되어 있으므로, 
        // 여기서 흰색(#FFFFFF)으로 그리면 배경과 반전됨.
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
    }
}
