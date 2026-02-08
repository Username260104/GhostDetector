export default class Detector {
    constructor() {
        // 분석 해상도 (그리드 크기) - 해상도 2배 증가
        this.gridW = 64;
        this.gridH = 48;

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.objectCounter = 1;

        // 상태 머신
        this.state = 'SCANNING'; // 'SCANNING' | 'LOCKED'
        this.lastBestCell = null; // {x, y, score, minX, minY, maxX, maxY}
        this.lastBestScore = 0;
        this.frameCounter = 0;

        // 파라미터 튜닝
        this.params = {
            // Gradient(변화량) 기준
            minGradient: 2,        // 더 낮은 변화량도 허용
            maxGradient: 100,      // 엣지 기준 완화

            // 점수 가중치
            baseScore: 10.0,       // 기본 점수 하향 (정상화)
            attractionWeight: 2.0, // 텍스처 가중치 상향 (특징 있는 곳 위주)
            penaltyWeight: 2.0,    // 패널티 복구
            noiseWeight: 30.0,     // 노이즈는 여전히 중요함

            // 상태 임계값
            lockThreshold: 20.0,   // 임계값 복구 (아무거나 잡지 않도록)
            clusterThreshold: 15.0,// 클러스터링 기준 점수 상향
            hysteresis: 1.1
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

        // 1. 점수 맵 계산
        // Flood Fill을 위해 점수 맵을 미리 배열로 저장해야 함
        const scoreMap = new Float32Array(gw * gh);
        let maxScore = -Infinity;
        let seedCell = null;

        this.frameCounter++;

        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                const score = this.calculateCellScore(data, gw, gh, x, y);
                scoreMap[y * gw + x] = score;

                if (score > maxScore) {
                    maxScore = score;
                    seedCell = { x, y, score };
                }
            }
        }

        // 2. 상태 머신 및 타겟 처리
        return this.updateState(seedCell, scoreMap, gw, gh);
    }

    calculateCellScore(data, w, h, x, y) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r + g + b) / 3;

        // 1. Gradient 계산 (상하좌우 차이의 평균) -> 텍스처(질감) 측정
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

        // 2. 점수 계산 로직 변경
        // 목표: "적당한 변화(Texture)"는 좋고, "너무 큰 변화(Edge)"나 "변화 없음(Flat)"은 싫음.

        let score = this.params.baseScore; // 기본 점수 깔고 시작

        if (gradient < this.params.minGradient) {
            // 너무 매끈함 (벽지 빈 공간 등) -> 감점
            score -= 5;
        } else if (gradient < this.params.maxGradient) {
            // 적당한 텍스처 (Attraction)
            score += gradient * this.params.attractionWeight;
        } else {
            // 너무 강한 엣지 (Repulsion)
            score -= (gradient - this.params.maxGradient) * this.params.penaltyWeight;
        }

        // 3. Noise (탐색 유도)
        const noiseInput = (x * 0.1) + (y * 0.1) + (this.frameCounter * 0.05);
        const noiseVal = Math.sin(noiseInput * 10) * Math.cos(noiseInput * 23);
        // 노이즈가 음수일 때도 점수를 깎아서 더 contrast를 줌
        score += noiseVal * this.params.noiseWeight;

        // 너무 어둡거나 밝으면 감점 로직 제거 (무조건 탐지)
        /*
        if (brightness < 20 || brightness > 230) {
            score -= 20;
        }
        */

        return score;
    }

    updateState(seedCell, scoreMap, gw, gh) {
        // 클러스터링 (Bounding Box 계산)
        // 시드 셀을 기준으로 Flood Fill 수행하여 영역 확장
        let cluster = null;

        // 현재 State에 따라 시드를 결정
        let targetSeed = seedCell;

        if (this.state === 'LOCKED' && this.lastBestCell) {
            // Locked 상태라면, 이전 위치 근처에서 다시 검색하는 것이 좋지만,
            // 여기서는 전체 Max Score 셀(seedCell)이 히스테리시스를 넘는지 확인
            if (seedCell.score > this.lastBestScore * this.params.hysteresis) {
                // 새로운 강력한 타겟 등장 -> 교체
                targetSeed = seedCell;
            } else {
                // 기존 위치 유지하려 노력하지만, 너무 멀어지면 놓아줌
                // 여기서는 Global Max를 따라가도록 둠 (자연스러운 떨림)
            }
        }

        // 클러스터링 수행
        if (targetSeed && targetSeed.score > this.params.lockThreshold) {
            cluster = this.calculateCluster(targetSeed, scoreMap, gw, gh);
        }

        // 상태 전이
        if (cluster) {
            // 너무 크면 무시 (화면 전체를 다 덮는 경우)
            const clusterArea = (cluster.maxX - cluster.minX) * (cluster.maxY - cluster.minY);
            const totalArea = gw * gh;
            if (clusterArea > totalArea * 0.3) {
                // 너무 큼 -> 노이즈로 간주하고 무시
                return { state: 'SCANNING' };
            }

            if (this.state === 'SCANNING') {
                this.state = 'LOCKED';
                this.objectCounter++;
            }
            // LOCKED 상태 유지 (별다른 조건 없음, 점수가 낮아지면 해제됨)

            this.lastBestCell = targetSeed;
            this.lastBestScore = targetSeed.score;

            return {
                x: cluster.minX / gw,
                y: cluster.minY / gh,
                w: (cluster.maxX - cluster.minX + 1) / gw,
                h: (cluster.maxY - cluster.minY + 1) / gh,
                id: `Object_${String(this.objectCounter).padStart(2, '0')}`,
                state: this.state,
                score: targetSeed.score
            };

        } else {
            // 타겟 없음
            this.state = 'SCANNING';
            return { state: this.state };
        }
    }

    calculateCluster(seed, scoreMap, gw, gh) {
        // Flood Fill
        const visited = new Uint8Array(gw * gh); // 0 or 1
        const queue = [seed];
        const seedIdx = seed.y * gw + seed.x;
        visited[seedIdx] = 1;

        let minX = seed.x, maxX = seed.x;
        let minY = seed.y, maxY = seed.y;

        let count = 0;
        const maxClusterSize = gw * gh * 0.2; // 전체 화면의 20%까지만 허용

        while (queue.length > 0) {
            const { x, y } = queue.pop();
            count++;

            if (count > maxClusterSize) break; // 너무 커지면 중단

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            // 4방향 탐색
            const neighbors = [
                { x: x + 1, y: y }, { x: x - 1, y: y },
                { x: x, y: y + 1 }, { x: x, y: y - 1 }
            ];

            for (const n of neighbors) {
                if (n.x >= 0 && n.x < gw && n.y >= 0 && n.y < gh) {
                    const idx = n.y * gw + n.x;
                    if (visited[idx] === 0) {
                        const score = scoreMap[idx];
                        // 클러스터 포함 조건: 점수가 일정 이상이어야 함
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
}
