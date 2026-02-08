export default class Renderer {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;

        // 폰트 설정
        this.fontSize = 16;
        this.fontFamily = 'Courier New, monospace'; // 기계적인 느낌의 폰트
    }

    render(result, video) {
        // 캔버스 초기화
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!result) return;

        // 정규화된 좌표를 실제 캔버스 좌표로 변환
        // 비디오 비율과 캔버스 비율이 다를 수 있으므로 object-fit: cover에 맞춰 계산 필요

        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = this.canvas.width / this.canvas.height;

        let drawW, drawH, startX, startY;

        if (canvasRatio > videoRatio) {
            // 캔버스가 더 납작함 -> 비디오 가로를 맞춰서 자름 (상하 크롭) -> 아님 cover니까 꽉 채워야 함
            // cover 동작:
            drawW = this.canvas.width;
            drawH = this.canvas.width / videoRatio;
            startX = 0;
            startY = (this.canvas.height - drawH) / 2;
        } else {
            // 캔버스가 더 길쭉함 -> 비디오 세로를 맞춰서 자름 (좌우 크롭)
            drawH = this.canvas.height;
            drawW = this.canvas.height * videoRatio;
            startX = (this.canvas.width - drawW) / 2;
            startY = 0;
        }

        const x = startX + result.x * drawW;
        const y = startY + result.y * drawH;
        const w = result.w * drawW;
        const h = result.h * drawH;

        // 그리기 설정
        this.ctx.strokeStyle = '#FFFFFF'; // CSS mix-blend-mode: difference 때문에 흰색으로 그리면 반전됨
        this.ctx.lineWidth = 2;
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `bold ${this.fontSize}px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // 1. 사각형 그리기
        this.ctx.strokeRect(x, y, w, h);

        // 2. 십자선 그리기 (선택사항, 더 기계적인 느낌)
        const lineLen = 10;
        this.ctx.beginPath();
        this.ctx.moveTo(x + w / 2, y + h / 2 - lineLen);
        this.ctx.lineTo(x + w / 2, y + h / 2 + lineLen);
        this.ctx.moveTo(x + w / 2 - lineLen, y + h / 2);
        this.ctx.lineTo(x + w / 2 + lineLen, y + h / 2);
        this.ctx.stroke();

        // 3. 텍스트 그리기 (중앙)
        this.ctx.fillText(result.id, x + w / 2, y + h / 2 - 20); // 중앙보다 약간 위
    }
}
