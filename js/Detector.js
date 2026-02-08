export default class Detector {
    constructor() {
        // 분석 해상도 (성능과 정밀도의 타협점)
        this.gridW = 64;
        this.gridH = 48;

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.objectCounter = 1;

        // 상태 머신
        this.state = 'SCANNING'; // 'SCANNING' | 'LOCKED'

        // 이전 프레임의 결과 저장 (Spatial Memory & LPF)
        this.lastBestCell = null;

        // 움직임 보간을 위한 현재 상태
        this.currentBlob = null; // { x, y, w, h }

        this.frameCounter = 0;

        // ★ 파라미터 대거 수정 (벽지/빈 공간 선호 + 끈적이 효과)
        this.params = {
            // 1. 평평함 선호 (Flatness Preference)
            // Gradient가 낮을수록 점수가 높아짐.
            // maxGradient보다 낮으면 가산점, 높으면 감점.
            maxGradient: 80,       // 이 값보다 변화량이 적으면 좋은 곳으로 판단
            flatnessWeight: 3.0,   // 평평할수록 주는 가산점 가중치

            // 2. 위치 고정 (Stickiness / Spatial Memory)
            // 한 번 찾은 위치 주변에 강력한 가산점을 줌.
            stickinessRadius: 5,   // 반경 5칸 이내에 가산점
            stickinessWeight: 50.0,// 엄청난 가산점 (다른 곳으로 시선 안 돌리게)

            // 3. 노이즈 (Noise / Alive feel)
            // 아주 약간의 흔들림만 허용
            noiseWeight: 5.0,      // 기존 30.0 -> 5.0 대폭 축소 (안정성 강화)

            // 4. 임계값 (Thresholds)
            baseScore: 10.0,       // 기본 점수
            lockThreshold: 60.0,   // 락 걸리는 기준 점수 (Stickiness 덕분에 한 번 걸리면 점수 뻥튀기됨)
            clusterThreshold: 30.0,// 클러스터링 기준 점수

            // 5. 움직임 보간 (LPF)
            lerpFactor: 0.1        // 10%씩만 이동 (부드럽게, 끈적하게)
        };
    }

    detect(video) {
        if (video.readyState < 2) return null;

        const aspect = video.videoWidth / video.videoHeight;
        const gw = this.gridW;
        const gh = Math.floor(gw / aspect);

        if (this.canvas.width !== gw || this.canvas.height !== gh) {
            this.canvas.width = gw;
            this.canvas.height = gh;
        }

        this.ctx.drawImage(video, 0, 0, gw, gh);
        const frameData = this.ctx.getImageData(0, 0, gw, gh);
        const data = frameData.data;

        // 1. 점수 맵 계산 & 시드 찾기
        const scoreMap = new Float32Array(gw * gh);
        let maxScore = -Infinity;
        let seedCell = null;

        this.frameCounter++;

        // 이전 위치가 있다면, 그 위치를 기억해둠 (Spatial Memory Center)
        const lastCell = this.lastBestCell;

        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                // 핵심: 점수 계산 로직 변경
                const score = this.calculateCellScore(data, gw, gh, x, y, lastCell);
                scoreMap[y * gw + x] = score;

                if (score > maxScore) {
                    maxScore = score;
                    seedCell = { x, y, score };
                }
            }
        }

        // 2. 상태 처리 및 위치 보간
        return this.updateState(seedCell, scoreMap, gw, gh);
    }

    calculateCellScore(data, w, h, x, y, lastCell) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r + g + b) / 3;

        // --- A. Gradient (변화량) 계산 ---
        // 주변 픽셀과의 차이를 계산하여 '얼마나 평평한가'를 측정
        let gradient = 0;
        let count = 0;

        if (x < w - 1) {
            const idxR = (y * w + (x + 1)) * 4;
            gradient += Math.abs(brightness - (data[idxR] + data[idxR + 1] + data[idxR + 2]) / 3);
            count++;
        }
        if (y < h - 1) {
            const idxD = ((y + 1) * w + x) * 4;
            gradient += Math.abs(brightness - (data[idxD] + data[idxD + 1] + data[idxD + 2]) / 3);
            count++;
        }
        if (count > 0) gradient /= count;


        // --- B. 점수 계산 (평평함 선호) ---
        let score = this.params.baseScore;

        // Gradient 역전 로직:
        // 변화량이 적을수록(평평할수록) 점수가 높아짐.
        // 변화량이 많으면(엣지, 복잡한 텍스처) 감점.
        const gradientScore = (this.params.maxGradient - gradient);
        score += gradientScore * this.params.flatnessWeight;


        // --- C. Spatial Memory (위치 고정 / Stickiness) ---
        // 이전에 찾았던 위치 주변이면 가산점 부여
        if (this.state === 'LOCKED' && lastCell) {
            const dx = x - lastCell.x;
            const dy = y - lastCell.y;
            const distSq = dx * dx + dy * dy;
            const radiusSq = this.params.stickinessRadius * this.params.stickinessRadius;

            if (distSq < radiusSq) {
                // 거리가 가까울수록 더 큰 가산점 (Gaussian-like distribution은 아니고 단순 거리 비례)
                // 1.0 ~ 0.0 비율로 가중치 적용
                const ratio = 1.0 - (distSq / radiusSq);
                score += ratio * this.params.stickinessWeight;
            }
        }


        // --- D. Noise (생동감) ---
        // 너무 정적이면 재미없으므로 약간의 노이즈 추가
        const noiseInput = (x * 0.1) + (y * 0.1) + (this.frameCounter * 0.02);
        const noiseVal = Math.sin(noiseInput * 5); // 주파수 낮춤 (천천히 변화)
        score += noiseVal * this.params.noiseWeight;

        return score;
    }

    updateState(seedCell, scoreMap, gw, gh) {
        // --- 클러스터링 (Bounding Box) ---
        let cluster = null;

        // 시드 셀이 충분히 강력한가?
        if (seedCell && seedCell.score > this.params.lockThreshold) {
            cluster = this.calculateCluster(seedCell, scoreMap, gw, gh);
        }

        // --- 상태 전이 및 데이터 업데이트 ---

        if (cluster) {
            // 유효한 클러스터 발견
            if (this.state === 'SCANNING') {
                this.state = 'LOCKED';
                this.objectCounter++;

                // 처음 발견했을 때는 LPF 없이 즉시 위치 설정
                this.currentBlob = {
                    x: cluster.minX / gw,
                    y: cluster.minY / gh,
                    w: (cluster.maxX - cluster.minX + 1) / gw,
                    h: (cluster.maxY - cluster.minY + 1) / gh
                };
            } else {
                // 이미 LOCKED 상태라면, 목표 위치로 부드럽게 이동 (LPF)
                const targetX = cluster.minX / gw;
                const targetY = cluster.minY / gh;
                const targetW = (cluster.maxX - cluster.minX + 1) / gw;
                const targetH = (cluster.maxY - cluster.minY + 1) / gh;

                const t = this.params.lerpFactor; // 0.1

                // 위치 및 크기 보간 (선형 보간)
                this.currentBlob.x = this.lerp(this.currentBlob.x, targetX, t);
                this.currentBlob.y = this.lerp(this.currentBlob.y, targetY, t);
                this.currentBlob.w = this.lerp(this.currentBlob.w, targetW, t);
                this.currentBlob.h = this.lerp(this.currentBlob.h, targetH, t);
            }

            // 다음 프레임을 위해 중심점 기억 (정수 좌표로 변환하여 저장)
            this.lastBestCell = {
                x: Math.floor((this.currentBlob.x + this.currentBlob.w / 2) * gw),
                y: Math.floor((this.currentBlob.y + this.currentBlob.h / 2) * gh)
            };

            return {
                x: this.currentBlob.x,
                y: this.currentBlob.y,
                w: this.currentBlob.w,
                h: this.currentBlob.h,
                id: `Ghost_${String(this.objectCounter).padStart(2, '0')}`,
                state: this.state,
                score: seedCell.score
            };

        } else {
            // 타겟 놓침
            // 하지만 바로 SCANNING으로 가지 않고, 잠시 버티기 (Decay)
            // 여기서는 단순화를 위해 바로 해제하지만, 
            // Stickiness Weight가 높아서 점수가 서서히 떨어지므로 자연스럽게 버티게 됨.
            this.state = 'SCANNING';
            this.lastBestCell = null;
            this.currentBlob = null;
            return { state: 'SCANNING' };
        }
    }

    calculateCluster(seed, scoreMap, gw, gh) {
        // Flood Fill (기존 로직 유지하되 Threshold만 파라미터 따름)
        const visited = new Uint8Array(gw * gh);
        const queue = [seed];
        const seedIdx = seed.y * gw + seed.x;
        visited[seedIdx] = 1;

        let minX = seed.x, maxX = seed.x;
        let minY = seed.y, maxY = seed.y;

        let count = 0;
        const maxClusterSize = gw * gh * 0.4; // 화면의 40%까지 허용 (벽 전체가 잡힐 수도 있으니 좀 크게)

        while (queue.length > 0) {
            const { x, y } = queue.pop();
            count++;
            if (count > maxClusterSize) break;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            const neighbors = [
                { x: x + 1, y: y }, { x: x - 1, y: y },
                { x: x, y: y + 1 }, { x: x, y: y - 1 }
            ];

            for (const n of neighbors) {
                if (n.x >= 0 && n.x < gw && n.y >= 0 && n.y < gh) {
                    const idx = n.y * gw + n.x;
                    if (visited[idx] === 0) {
                        const score = scoreMap[idx];
                        if (score > this.params.clusterThreshold) {
                            visited[idx] = 1;
                            queue.push(n);
                        }
                    }
                }
            }
        }

        return { minX, maxX, minY, maxY };
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }
}
