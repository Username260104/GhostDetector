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

        // 이전 프레임 잔상 방지를 위해 clearRect 불필요 (drawImage가 덮어씀)
        // 하지만 투명 픽셀 처리를 위해 필요할 수도 있으나, 여기선 비디오가 꽉 차므로 생략 가능.
        // 안전을 위해 비디오가 로드된 경우에만 그림.
        if (video.readyState >= 2) {
            this.ctx.globalCompositeOperation = 'source-over'; // 기본 모드
            this.ctx.drawImage(video, 0, 0, width, height);
        }

        if (!result) return;

        // 2. 블렌딩 모드 설정 (Difference)
        // Canvas에 이미 그려진 비디오 이미지와 새로 그릴 도형(흰색)의 차이값을 계산하여 렌더링
        this.ctx.globalCompositeOperation = 'difference';

        // Draw Options (항상 흰색 사용 -> 반전 효과)
        this.ctx.lineWidth = 1.0;
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Debug Info (좌상단) - Main.js의 HTML 디버그와 겹치므로 제거
        // const info = result ? `State: ${result.state} | ID: ${result.id || 'N/A'}` : "No Result";
        // this.ctx.fillText(info, 10, 10);

        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.font = `${this.fontSize}px ${this.fontFamily}`;

        // 3. Scanning State
        if (!result || result.state === 'SCANNING') {
            this.ctx.fillText("SCANNING...", width / 2, height / 2);
            // 블렌딩 모드 복구 (필수)
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

            // 스켈레톤 그리기 (Procedural MediaPipe Style)
            this.drawSkeleton(cx, cy, w, h);
        }

        // 5. 블렌딩 모드 복구 (다음 프레임을 위해)
        this.ctx.globalCompositeOperation = 'source-over';
    }

    drawSkeleton(cx, cy, boxW, boxH) {
        // 1. Scale Calculation (Aspect-Ratio Preserved)
        const baseSize = Math.max(boxW, boxH);
        const skeletonHeight = baseSize * 0.9;
        const headSize = skeletonHeight * 0.1;
        const shoulderWidth = skeletonHeight * 0.25;
        const hipWidth = skeletonHeight * 0.2;
        const torseHeight = skeletonHeight * 0.35;
        const legLength = skeletonHeight * 0.45;
        const armLength = skeletonHeight * 0.35;

        // 2. Glitch Animation State
        const now = performance.now();

        // Initialize state if not exists
        if (!this.animState) {
            this.animState = {
                lastUpdate: 0,
                nextInterval: 0,
                offsets: new Array(20).fill(0) // 20 joints * 1 dim (simplified) or separate x/y?
                // actually we applied noise to x/y separately in previous code.
                // easier to just store "seed" or pre-calculated offsets.
            };
        }

        // Check time
        if (now - this.animState.lastUpdate > this.animState.nextInterval) {
            this.animState.lastUpdate = now;
            // Random interval: 50ms ~ 250ms
            this.animState.nextInterval = Math.random() * 200 + 50;

            // Generate new random offsets for each joint slot
            // Range: -5% ~ +5% of baseSize
            const range = baseSize * 0.05;
            this.animState.offsets = Array.from({ length: 30 }, () => (Math.random() - 0.5) * 2 * range);
        }

        const O = this.animState.offsets; // Short alias

        // Helper to get offset for index
        const nx = (i) => O[i];
        const ny = (i) => O[i + 15]; // Using second half for Y

        // Center Spine
        const noseY = cy - skeletonHeight * 0.4;
        const neckY = noseY + headSize;
        const hipY = neckY + torseHeight;

        const joints = {
            // Face
            nose: { x: cx + nx(0), y: noseY + ny(0) },
            eyeL: { x: cx - headSize * 0.3 + nx(1), y: noseY - headSize * 0.3 + ny(1) },
            eyeR: { x: cx + headSize * 0.3 + nx(2), y: noseY - headSize * 0.3 + ny(2) },
            earL: { x: cx - headSize * 0.6 + nx(3), y: noseY + ny(3) },
            earR: { x: cx + headSize * 0.6 + nx(4), y: noseY + ny(4) },

            // Upper Body
            shoulderL: { x: cx - shoulderWidth / 2 + nx(5), y: neckY + ny(5) },
            shoulderR: { x: cx + shoulderWidth / 2 + nx(6), y: neckY + ny(6) },

            // Lower Body
            hipL: { x: cx - hipWidth / 2 + nx(7), y: hipY + ny(7) },
            hipR: { x: cx + hipWidth / 2 + nx(8), y: hipY + ny(8) },
        };

        // Derived Limbs with stored noise
        joints.elbowL = { x: joints.shoulderL.x - armLength * 0.3 + nx(9), y: joints.shoulderL.y + armLength * 0.5 + ny(9) };
        joints.elbowR = { x: joints.shoulderR.x + armLength * 0.3 + nx(10), y: joints.shoulderR.y + armLength * 0.5 + ny(10) };
        joints.wristL = { x: joints.elbowL.x - armLength * 0.2 + nx(11), y: joints.elbowL.y + armLength * 0.5 + ny(11) };
        joints.wristR = { x: joints.elbowR.x + armLength * 0.2 + nx(12), y: joints.elbowR.y + armLength * 0.5 + ny(12) };

        // Hand Tips
        joints.indexL = { x: joints.wristL.x, y: joints.wristL.y + headSize * 0.5 };
        joints.indexR = { x: joints.wristR.x, y: joints.wristR.y + headSize * 0.5 };

        // Legs (Standing)
        joints.kneeL = { x: joints.hipL.x - baseSize * 0.02 + nx(13), y: joints.hipL.y + legLength * 0.5 + ny(13) };
        joints.kneeR = { x: joints.hipR.x + baseSize * 0.02 + nx(14), y: joints.hipR.y + legLength * 0.5 + ny(14) };
        joints.ankleL = { x: joints.kneeL.x + nx(14), y: joints.kneeL.y + legLength * 0.5 + ny(15) }; // Reusing nx(14) to fit array size 15 for X
        joints.ankleR = { x: joints.kneeR.x + nx(0), y: joints.kneeR.y + legLength * 0.5 + ny(0) }; // Wrap around index

        // Feet
        joints.heelL = { x: joints.ankleL.x, y: joints.ankleL.y + headSize * 0.3 };
        joints.heelR = { x: joints.ankleR.x, y: joints.ankleR.y + headSize * 0.3 };
        joints.footIndexL = { x: joints.ankleL.x - headSize * 0.5, y: joints.ankleL.y + headSize * 0.5 };
        joints.footIndexR = { x: joints.ankleR.x + headSize * 0.5, y: joints.ankleR.y + headSize * 0.5 };

        // 3. Draw Connections (Bones)
        this.ctx.beginPath();
        const connections = [
            // Torso
            ['shoulderL', 'shoulderR'], ['shoulderL', 'hipL'], ['shoulderR', 'hipR'], ['hipL', 'hipR'],
            // Arms
            ['shoulderL', 'elbowL'], ['elbowL', 'wristL'], ['wristL', 'indexL'],
            ['shoulderR', 'elbowR'], ['elbowR', 'wristR'], ['wristR', 'indexR'],
            // Legs
            ['hipL', 'kneeL'], ['kneeL', 'ankleL'], ['ankleL', 'heelL'], ['heelL', 'footIndexL'], ['footIndexL', 'ankleL'],
            ['hipR', 'kneeR'], ['kneeR', 'ankleR'], ['ankleR', 'heelR'], ['heelR', 'footIndexR'], ['footIndexR', 'ankleR'],
            // Head
            ['nose', 'eyeL'], ['nose', 'eyeR'], ['eyeL', 'earL'], ['eyeR', 'earR']
        ];

        connections.forEach(([start, end]) => {
            if (joints[start] && joints[end]) {
                this.ctx.moveTo(joints[start].x, joints[start].y);
                this.ctx.lineTo(joints[end].x, joints[end].y);
            }
        });
        this.ctx.stroke();

        // 4. Draw Joints (Circles)
        for (const key in joints) {
            const p = joints[key];
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, Math.max(2, baseSize * 0.015), 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
}
