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
        // 박스 크기에 비례하되, 사람의 비율을 유지함.
        // 기준: 박스의 긴 쪽을 기준으로 뼈대 크기 설정
        const baseSize = Math.max(boxW, boxH);
        const skeletonHeight = baseSize * 0.9; // 박스 꽉 차게
        const headSize = skeletonHeight * 0.1;
        const shoulderWidth = skeletonHeight * 0.25;
        const hipWidth = skeletonHeight * 0.2;
        const torseHeight = skeletonHeight * 0.35;
        const legLength = skeletonHeight * 0.45;
        const armLength = skeletonHeight * 0.35;

        // 2. Keypoints Generation (Procedural)
        // 시간 기반 노이즈로 "살아있는" 움직임 추가
        const t = performance.now() * 0.002;
        const noise = (offset) => Math.sin(t + offset) * (baseSize * 0.05);

        // Center Spine
        const noseY = cy - skeletonHeight * 0.4;
        const neckY = noseY + headSize;
        const hipY = neckY + torseHeight;

        const joints = {
            // Face
            nose: { x: cx, y: noseY + noise(0) },
            eyeL: { x: cx - headSize * 0.3, y: noseY - headSize * 0.3 + noise(1) },
            eyeR: { x: cx + headSize * 0.3, y: noseY - headSize * 0.3 + noise(2) },
            earL: { x: cx - headSize * 0.6, y: noseY + noise(3) },
            earR: { x: cx + headSize * 0.6, y: noseY + noise(4) },

            // Upper Body
            shoulderL: { x: cx - shoulderWidth / 2, y: neckY + noise(5) },
            shoulderR: { x: cx + shoulderWidth / 2, y: neckY + noise(6) },

            // Lower Body
            hipL: { x: cx - hipWidth / 2, y: hipY + noise(7) },
            hipR: { x: cx + hipWidth / 2, y: hipY + noise(8) },
        };

        // Derived Limbs (Elbows, Wrists, Knees, Ankles)
        // Arms (A-Pose / Relaxed)
        joints.elbowL = { x: joints.shoulderL.x - armLength * 0.3, y: joints.shoulderL.y + armLength * 0.5 + noise(9) };
        joints.elbowR = { x: joints.shoulderR.x + armLength * 0.3, y: joints.shoulderR.y + armLength * 0.5 + noise(10) };
        joints.wristL = { x: joints.elbowL.x - armLength * 0.2, y: joints.elbowL.y + armLength * 0.5 + noise(11) };
        joints.wristR = { x: joints.elbowR.x + armLength * 0.2, y: joints.elbowR.y + armLength * 0.5 + noise(12) };

        // Hand Tips
        joints.indexL = { x: joints.wristL.x, y: joints.wristL.y + headSize * 0.5 };
        joints.indexR = { x: joints.wristR.x, y: joints.wristR.y + headSize * 0.5 };

        // Legs (Standing)
        joints.kneeL = { x: joints.hipL.x - baseSize * 0.02, y: joints.hipL.y + legLength * 0.5 + noise(13) };
        joints.kneeR = { x: joints.hipR.x + baseSize * 0.02, y: joints.hipR.y + legLength * 0.5 + noise(14) };
        joints.ankleL = { x: joints.kneeL.x, y: joints.kneeL.y + legLength * 0.5 + noise(15) };
        joints.ankleR = { x: joints.kneeR.x, y: joints.kneeR.y + legLength * 0.5 + noise(16) };

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
