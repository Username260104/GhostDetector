export default class Detector {
    constructor() {
        // 분석을 위한 오프스크린 캔버스 (성능을 위해 작게 축소)
        this.analysisChoice = 32; // 32xN 비율로 축소
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.objectCounter = 1;
        this.lastDetection = null;

        // 감지 파라미터 (미세 조정 필요)
        this.thresholds = {
            minVariable: 5,   // 너무 매끈하면 안됨 (완전 단색 벽지 등)
            maxVariable: 50,  // 너무 복잡하면 안됨 (뚜렷한 물체)
            brightnessMin: 20, // 너무 어두우면 안됨
            brightnessMax: 230 // 너무 밝으면 안됨
        };
    }

    detect(video) {
        if (video.readyState < 2) return null;

        const w = this.analysisChoice;
        const h = Math.floor(w * (video.videoHeight / video.videoWidth));

        this.canvas.width = w;
        this.canvas.height = h;

        // 비디오 프레임을 축소해서 그리기
        this.ctx.drawImage(video, 0, 0, w, h);

        // 픽셀 데이터 추출
        const frameData = this.ctx.getImageData(0, 0, w, h);
        const data = frameData.data;

        // 랜덤한 그리드 셀 검사 (전수 조사 대신 확률적 접근으로 '파르르' 하는 느낌 유도)
        // 4x4 크기의 셀을 랜덤하게 찍어서 검사 (원본 비율로는 꽤 큰 영역)
        const cellW = 4;
        const cellH = 4;
        const attempts = 20; // 프레임당 시도 횟수

        for (let i = 0; i < attempts; i++) {
            const gx = Math.floor(Math.random() * (w - cellW));
            const gy = Math.floor(Math.random() * (h - cellH));

            if (this.analyzeCell(data, w, gx, gy, cellW, cellH)) {
                // 찾았다! (Snap 효과를 위해 바로 리턴)
                // 좌표를 0~1 정규화 좌표로 변환
                const result = {
                    x: gx / w,
                    y: gy / h,
                    w: cellW / w,
                    h: cellH / h,
                    id: `Object_${String(this.objectCounter).padStart(2, '0')}`
                };

                // 이전과 다른 위치라면 카운터 증가 (너무 자잘한 변경은 무시하도록 할 수도 있지만, Raw한 느낌을 위해 매번 증가시킬 수도 있음)
                // 여기서는 "새로운 타겟"을 잡았을 때만 증가시키기는 어려우므로(프레임마다 다르니까),
                // 일정 거리 이상 떨어지면 증가시키는 로직 추가
                if (!this.lastDetection || this.distance(result, this.lastDetection) > 0.2) {
                    this.objectCounter++;
                    result.id = `Object_${String(this.objectCounter).padStart(2, '0')}`;
                } else {
                    result.id = this.lastDetection.id;
                }

                this.lastDetection = result;
                return result;
            }
        }

        return this.lastDetection; // 못 찾으면 이전 위치 유지 (혹은 null 리턴해서 사라지게 할 수도 있음)
    }

    analyzeCell(data, totalW, x, y, cw, ch) {
        let rSum = 0, gSum = 0, bSum = 0;
        let pixelCount = 0;
        let brightnessAcc = 0;

        // 1. 평균 구하기
        for (let dy = 0; dy < ch; dy++) {
            for (let dx = 0; dx < cw; dx++) {
                const idx = ((y + dy) * totalW + (x + dx)) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                rSum += r;
                gSum += g;
                bSum += b;
                brightnessAcc += (r + g + b) / 3;
                pixelCount++;
            }
        }

        const avgR = rSum / pixelCount;
        const avgG = gSum / pixelCount;
        const avgB = bSum / pixelCount;
        const avgBrightness = brightnessAcc / pixelCount;

        // 2. 분산(변동성) 구하기 - 이게 '질감'이 됨
        let varSum = 0;
        for (let dy = 0; dy < ch; dy++) {
            for (let dx = 0; dx < cw; dx++) {
                const idx = ((y + dy) * totalW + (x + dx)) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                // 평균과의 차이 절대값 합산
                const diff = Math.abs(r - avgR) + Math.abs(g - avgG) + Math.abs(b - avgB);
                varSum += diff;
            }
        }

        const noiseLevel = varSum / pixelCount;

        // 조건 검사
        // 1. 너무 어둡거나 밝지 않을 것
        if (avgBrightness < this.thresholds.brightnessMin || avgBrightness > this.thresholds.brightnessMax) return false;

        // 2. 노이즈 레벨이 적당할 것 (너무 매끈하지도, 너무 복잡하지도 않음)
        if (noiseLevel > this.thresholds.minVariable && noiseLevel < this.thresholds.maxVariable) {
            return true;
        }

        return false;
    }

    distance(a, b) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }
}
