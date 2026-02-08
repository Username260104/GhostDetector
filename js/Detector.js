export default class Detector {
    constructor() {
        // 분석 해상도 (그리드 크기)
        this.gridW = 32;
        this.gridH = 24;

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.objectCounter = 1;

        // 상태 머신
        this.state = 'SCANNING'; // 'SCANNING' | 'LOCKED'
        this.lastBestCell = null; // {x, y, score, minX, minY, maxX, maxY}
        this.lastBestScore = 0;
        this.frameCounter = 0;

        // 파라미터 (튜닝 필요)
        this.params = {
            edgeThreshold: 30,
            attractionWeight: 1.0,
            repulsionWeight: 2.0,
            noiseWeight: 15.0,
            lockThreshold: 40.0,
            clusterThreshold: 30.0, // 클러스터 포함 기준 점수
            hysteresis: 1.2
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

        // Repulsion (Edge)
        let edgeScore = 0;
        if (x < w - 1) {
            const idxR = (y * w + (x + 1)) * 4;
            edgeScore += Math.abs(brightness - (data[idxR] + data[idxR + 1] + data[idxR + 2]) / 3);
        }
        if (y < h - 1) {
            const idxD = ((y + 1) * w + x) * 4;
            edgeScore += Math.abs(brightness - (data[idxD] + data[idxD + 1] + data[idxD + 2]) / 3);
        }

        let repulsion = 0;
        if (edgeScore > this.params.edgeThreshold) {
            repulsion = edgeScore * this.params.repulsionWeight;
        }

        // Attraction (Brightness Range)
        let attraction = 0;
        if (brightness > 20 && brightness < 230) {
            attraction = 10;
        }

        // Noise
        const noiseInput = (x * 0.1) + (y * 0.1) + (this.frameCounter * 0.05);
        const noiseVal = Math.sin(noiseInput * 10) * Math.cos(noiseInput * 23);
        const randomScore = noiseVal * this.params.noiseWeight;

        return attraction - repulsion + randomScore;
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
                // 기존 타겟 위치 유지 (단, 점수는 현재 프레임의 해당 위치 점수로 업데이트 필요)
                // 하지만 '파르르' 떨리는 효과를 위해 매 프레임 재계산된 Bounding Box를 사용하는 것이 더 '날것' 같음.
                // 따라서 Locked 상태여도 현재 프레임의 Max Score 위치를 기반으로 하되, 
                // ID만 유지하는 전략으로 변경 (사용자 요구사항: "Bounding Box 크기에 맞춰 매 프레임 즉각적으로(Snap) 변해야 합니다")

                // 다만 히스테리시스 때문에, 점수가 조금 낮아져도 기존 위치를 고수해야 하는데...
                // 여기서는 "가장 점수가 높은 곳"이 바뀌지 않았다면 그곳을 사용.
                // 만약 가장 점수가 높은 곳이 바뀌었는데 그 차이가 크지 않다면? 

                // 단순화: Global Max가 짱임. 다만 ID 변경만 히스테리시스를 적용.
            }
        }

        // 클러스터링 수행
        if (targetSeed && targetSeed.score > this.params.lockThreshold) {
            cluster = this.calculateCluster(targetSeed, scoreMap, gw, gh);
        }

        // 상태 전이
        if (cluster) {
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
                state: this.state
            };

        } else {
            // 타겟 없음
            if (this.state === 'LOCKED') {
                // 바로 풀지 말고, 잠시 유예를 둘 수도 있지만, 여기선 즉시 해제 (Snap)
                this.state = 'SCANNING';
            }
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
        const maxClusterSize = gw * gh * 0.5; // 화면 절반 이상은 무시 (너무 큼)

        while (queue.length > 0) {
            const { x, y } = queue.pop();
            count++;

            if (count > maxClusterSize) break;

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
