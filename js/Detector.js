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

        // 지루함 (Boredom) 상태: 한 곳에 오래 머물면 점수가 깎임
        this.boredom = 0;

        // 움직임 보간을 위한 현재 상태
        this.currentBlob = null; // { x, y, w, h }

        this.frameCounter = 0;

        // ★ 파라미터 대거 수정 (벽지/빈 공간 선호 + 끈적이 효과)
        this.params = {
            // 1. 평평함 선호 (Flatness Preference)
            // Gradient가 낮을수록 점수가 높아짐.
            // maxGradient보다 낮으면 가산점, 높으면 감점.
            maxGradient: 80,       // 이 값보다 변화량이 적으면 좋은 곳으로 판단
            flatnessWeight: 2.0,   // 평평할수록 주는 가산점 가중치 (3.0 -> 2.0 하향: 너무 민감하게 반응하지 않도록)

            // 2. 위치 고정 (Stickiness / Spatial Memory)
            // 한 번 찾은 위치 주변에 강력한 가산점을 줌.
            stickinessRadius: 5,   // 반경 5칸 이내에 가산점
            stickinessWeight: 20.0,// (30.0 -> 20.0 하향: Boredom과 시너지 효과를 위해 좀 더 유연하게)

            // 3. 노이즈 (Noise / Alive feel)
            // 아주 약간의 흔들림만 허용
            noiseWeight: 5.0,

            // 4. 임계값 (Thresholds)
            baseScore: 10.0,       // 기본 점수
            lockThreshold: 60.0,   // 락 걸리는 기준 점수
            clusterThreshold: 30.0,// 클러스터링 기준 점수

            // 5. 움직임 보간 (LPF)
            lerpFactor: 0.1,       // 10%씩만 이동 (부드럽게)

            // 6. ID 갱신 거리 (화면 비율)
            renewDistance: 0.3,     // 한 번에 30% 이상 점프하면 새 물체로 간주

            // 7. [NEW] 가장자리 페널티 (Edge Penalty)
            // 화면 구석에 처박히는 것 방지 (0.0 ~ 1.0)
            edgePenaltyWeight: 50.0,

            // 8. [NEW] 비율 제한 (Aspect Ratio)
            // 너무 길쭉한(벽 틈새 등) 형태 방지
            minAspectRatio: 0.5, // 1:2
            maxAspectRatio: 2.0, // 2:1

            // 9. [NEW] 지루함 (Boredom)
            // 움직이지 않으면 점수 감점 -> 다른 곳으로 튐
            boredomInc: 1.0,       // 프레임당 증가량
            boredomDec: 5.0,       // 움직임 발생 시 감소량
            maxBoredom: 50.0       // 최대 감점
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
        const noiseInput = (x * 0.1) + (y * 0.1) + (this.frameCounter * 0.02);
        const noiseVal = Math.sin(noiseInput * 5);
        score += noiseVal * this.params.noiseWeight;

        // --- E. [NEW] Edge Penalty (가장자리 기피) ---
        // 화면 중앙(0.5, 0.5)에서 멀어질수록 감점
        const nx = x / w; // 0.0 ~ 1.0
        const ny = y / h; // 0.0 ~ 1.0
        const distFromCenterSq = (nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5); // 0.0 ~ 0.5 (approx)

        // 거리가 멀수록 페널티 증가
        // 최대 거리 제곱은 0.5*0.5 + 0.5*0.5 = 0.5
        score -= distFromCenterSq * this.params.edgePenaltyWeight;


        // --- F. [NEW] Boredom (지루함) ---
        // 현재 상태가 LOCKED이고, 이 셀이 이전 위치 근처라면 지루함 적용
        if (this.state === 'LOCKED' && lastCell) {
            const dx = x - lastCell.x;
            const dy = y - lastCell.y;
            if (dx * dx + dy * dy < 25) { // 근처에 있으면
                score -= this.boredom;
            }
        }

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

                // ** ID 갱신 로직 추가 **
                // 만약 현재 위치와 목표 위치가 너무 멀다면(순간이동), 새로운 물체로 간주하고 ID 갱신
                const dist = Math.hypot(targetX - this.currentBlob.x, targetY - this.currentBlob.y);
                if (dist > this.params.renewDistance) {
                    this.objectCounter++;
                    this.boredom = 0; // [NEW] 새로운 물체니 지루함 초기화
                }

                const t = this.params.lerpFactor; // 0.1

                // 위치 및 크기 보간 (선형 보간)
                this.currentBlob.x = this.lerp(this.currentBlob.x, targetX, t);
                this.currentBlob.y = this.lerp(this.currentBlob.y, targetY, t);
                this.currentBlob.w = this.lerp(this.currentBlob.w, targetW, t);
                this.currentBlob.h = this.lerp(this.currentBlob.h, targetH, t);
            }

            // 다음 프레임을 위해 중심점 기억
            this.lastBestCell = {
                x: Math.floor((this.currentBlob.x + this.currentBlob.w / 2) * gw),
                y: Math.floor((this.currentBlob.y + this.currentBlob.h / 2) * gh)
            };

            // [NEW] Boredom Update
            // 움직임이 적으면 지루함 증가, 크면 감소
            // 이전 프레임 위치와의 거리 계산 (LPF 적용 전 RAW 타겟 기준이 더 정확할 수 있으나, 결과적 움직임인 currentBlob 기준)
            // 여기서는 단순하게 매 프레임 증가시키고, 큰 점프로 ID가 바뀌면 초기화하는 방식 사용 권장,
            // 또는 미세 움직임을 감지해야 함. 우선은 "계속 잡고 있으면" 증가하는 식으로 구현.
            this.boredom += this.params.boredomInc;
            if (this.boredom > this.params.maxBoredom) this.boredom = this.params.maxBoredom;

            return {
                x: this.currentBlob.x,
                y: this.currentBlob.y,
                w: this.currentBlob.w,
                h: this.currentBlob.h,
                id: `Object_${String(this.objectCounter).padStart(2, '0')}`,
                state: this.state,
                score: seedCell.score
            };

        } else {
            // 타겟 놓침
            // 지루함 초기화 (새로운 흥미거리 찾을 준비)
            this.boredom = 0;

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
        const maxClusterSize = gw * gh * 0.15; // 화면의 15%까지만 허용 (너무 큰 덩어리는 무시)

        while (queue.length > 0) {
            const { x, y } = queue.pop();
            count++;
            if (count > maxClusterSize) break;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            // [NEW] Aspect Ratio Check (실시간)
            // 현재까지의 너비와 높이 비율이 극단적이면 확장 중단
            // 단, 너무 작을 때는 체크하지 않음 (3x3 이상일 때만)
            const cw = maxX - minX + 1;
            const ch = maxY - minY + 1;
            if (cw > 3 && ch > 3) {
                const ratio = cw / ch;
                if (ratio < this.params.minAspectRatio || ratio > this.params.maxAspectRatio) {
                    // 비율이 깨지면 이 픽셀은 포함시키되, 큐에는 넣지 않음 (성장 멈춤)
                    // 또는 loop break? -> 여기서는 break하면 너무 일찍 멈출 수 있으므로 continue로 가지치기만 함.
                    // 엄격하게 하려면 break가 맞지만, 모양이 이상하게 잘릴 수 있음.
                    // 여기서는 continue로 "이 방향으로는 성장하지 않음" 처리
                    continue;
                }
            }

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
