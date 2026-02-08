import Config from './Config.js';

export default class Detector {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.gridW = Config.GRID.WIDTH;
        this.gridH = Config.GRID.HEIGHT;

        this.currentBlob = null; // { x, y, w, h }
        this.objectCounter = 1;
        this.lastId = null;
    }

    detect(video) {
        if (video.readyState < 2) return null;

        // 1. 그리드 크기 조정 (화면 비율에 맞춤)
        const aspect = video.videoWidth / video.videoHeight;
        const gw = Math.floor(video.videoWidth / Config.GRID.CELL_SIZE);
        const gh = Math.floor(video.videoHeight / Config.GRID.CELL_SIZE);

        if (this.canvas.width !== gw || this.canvas.height !== gh) {
            this.canvas.width = gw;
            this.canvas.height = gh;
            this.gridW = gw;
            this.gridH = gh;
        }

        // 다운샘플링하여 그리기
        this.ctx.drawImage(video, 0, 0, gw, gh);
        const frameData = this.ctx.getImageData(0, 0, gw, gh);
        const data = frameData.data;

        // 2. 1단계: 그리드 점수화 (Grid Scoring)
        const scoreMap = new Float32Array(gw * gh);
        const activeMap = new Uint8Array(gw * gh); // 0: Inactive, 1: Active

        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                const score = this.calculateCellScore(data, gw, gh, x, y);
                scoreMap[y * gw + x] = score;

                // 3. 2단계: 이진화 (Binary Thresholding)
                if (score > Config.SCORE.THRESHOLD) {
                    activeMap[y * gw + x] = 1;
                }
            }
        }

        // 4. 3단계: 연결 요소 병합 (Connected Component Labeling)
        const blobs = this.findConnectedComponents(activeMap, gw, gh);

        // 5. 4단계: 바운딩 박스 피팅 (Bounding Box Fitting)
        const bestBlob = this.selectBestBlob(blobs, gw, gh);

        // 6. 결과 보정 (Smoothing & ID Management)
        return this.processResult(bestBlob, gw, gh);
    }

    calculateCellScore(data, w, h, x, y) {
        const idx = (y * w + x) * 4;

        // A. Variance (표준편차) - 자글거림 계산
        // 현재 픽셀과 주변 4방향 픽셀의 밝기 차이를 분산으로 근사
        let sum = 0;
        let sqSum = 0;
        let count = 0;

        // 중심 픽셀
        const centerVal = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        sum += centerVal;
        sqSum += centerVal * centerVal;
        count++;

        const neighbors = [
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
            { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
        ];

        for (const n of neighbors) {
            const nx = x + n.dx;
            const ny = y + n.dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                const nIdx = (ny * w + nx) * 4;
                const val = (data[nIdx] + data[nIdx + 1] + data[nIdx + 2]) / 3;
                sum += val;
                sqSum += val * val;
                count++;
            }
        }

        const mean = sum / count;
        const variance = (sqSum / count) - (mean * mean); // E[X^2] - (E[X])^2
        const stdDev = Math.sqrt(Math.max(0, variance)); // 표준편차

        // B. Edge Strength (경계선) - Sobel Filter 간략화
        // 가로/세로 밝기 변화량의 합
        let edgeStrength = 0;
        if (x < w - 1) {
            const rIdx = (y * w + (x + 1)) * 4;
            const rVal = (data[rIdx] + data[rIdx + 1] + data[rIdx + 2]) / 3;
            edgeStrength += Math.abs(centerVal - rVal);
        }
        if (y < h - 1) {
            const dIdx = ((y + 1) * w + x) * 4;
            const dVal = (data[dIdx] + data[dIdx + 1] + data[dIdx + 2]) / 3;
            edgeStrength += Math.abs(centerVal - dVal);
        }

        // C. 최종 점수 계산
        // 공식: Score = (Variance * 1.5) - (EdgeStrength * 3.0)
        return (stdDev * Config.SCORE.VARIANCE_WEIGHT) - (edgeStrength * Config.SCORE.EDGE_WEIGHT);
    }

    findConnectedComponents(activeMap, w, h) {
        const visited = new Uint8Array(w * h);
        const blobs = [];
        const labelMap = new Int32Array(w * h).fill(-1);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                if (activeMap[idx] === 1 && visited[idx] === 0) {
                    // 새로운 덩어리 발견 -> Flood Fill 시작
                    const blob = {
                        minX: x, maxX: x,
                        minY: y, maxY: y,
                        count: 0
                    };
                    const queue = [{ x, y }];
                    visited[idx] = 1;
                    blob.count++;

                    while (queue.length > 0) {
                        const curr = queue.pop();

                        // 바운딩 박스 갱신
                        if (curr.x < blob.minX) blob.minX = curr.x;
                        if (curr.x > blob.maxX) blob.maxX = curr.x;
                        if (curr.y < blob.minY) blob.minY = curr.y;
                        if (curr.y > blob.maxY) blob.maxY = curr.y;

                        // 4방향 탐색
                        const dirs = [
                            { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
                            { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
                        ];

                        for (const d of dirs) {
                            const nx = curr.x + d.dx;
                            const ny = curr.y + d.dy;

                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                const nIdx = ny * w + nx;
                                if (activeMap[nIdx] === 1 && visited[nIdx] === 0) {
                                    visited[nIdx] = 1;
                                    blob.count++;
                                    queue.push({ x: nx, y: ny });
                                }
                            }
                        }
                    }

                    blobs.push(blob);
                }
            }
        }
        return blobs;
    }

    selectBestBlob(blobs, gw, gh) {
        if (blobs.length === 0) return null;

        // 필터링 및 점수(크기) 기반 정렬
        const validBlobs = blobs.filter(b => {
            const w = b.maxX - b.minX + 1;
            const h = b.maxY - b.minY + 1;
            const size = b.count;
            const ratio = w / h;

            // 1. 너무 작은 노이즈 제거
            if (size < Config.BLOB.MIN_CLUSTER_SIZE) return false;

            // 2. 너무 큰 덩어리 제거 (화면 전체 덮는 경우)
            if (size > (gw * gh) * Config.BLOB.MAX_CLUSTER_SIZE) return false;

            // 3. 비율 체크 (너무 길쭉한 것 제거)
            if (ratio < Config.BLOB.MIN_ASPECT_RATIO || ratio > Config.BLOB.MAX_ASPECT_RATIO) return false;

            return true;
        });

        if (validBlobs.length === 0) return null;

        // 가장 큰 덩어리를 선택 (또는 중심에 가까운 것 등 로직 추가 가능)
        return validBlobs.reduce((prev, curr) => (prev.count > curr.count) ? prev : curr);
    }

    processResult(bestBlob, gw, gh) {
        if (!bestBlob) {
            this.currentBlob = null;
            return { state: 'SCANNING' }; // 아무것도 못 찾음
        }

        // 정규화 좌표 (0.0 ~ 1.0)
        const targetX = bestBlob.minX / gw;
        const targetY = bestBlob.minY / gh;
        const targetW = (bestBlob.maxX - bestBlob.minX + 1) / gw;
        const targetH = (bestBlob.maxY - bestBlob.minY + 1) / gh;

        if (!this.currentBlob) {
            // 처음 발견
            this.currentBlob = { x: targetX, y: targetY, w: targetW, h: targetH };
            this.objectCounter++;
        } else {
            // 위치 보간 (LPF)
            const t = Config.BLOB.SMOOTHING;
            this.currentBlob.x += (targetX - this.currentBlob.x) * t;
            this.currentBlob.y += (targetY - this.currentBlob.y) * t;
            this.currentBlob.w += (targetW - this.currentBlob.w) * t;
            this.currentBlob.h += (targetH - this.currentBlob.h) * t;

            // 거리가 멀어지면 ID 갱신 (선택 사항)
            const dist = Math.hypot(targetX - this.currentBlob.x, targetY - this.currentBlob.y);
            if (dist > 0.3) { // 30% 이상 점프 시
                this.objectCounter++;
            }
        }

        return {
            x: this.currentBlob.x,
            y: this.currentBlob.y,
            w: this.currentBlob.w,
            h: this.currentBlob.h,
            id: `Object_${String(this.objectCounter).padStart(2, '0')}`,
            state: 'LOCKED',
            score: bestBlob.count // 점수 대신 픽셀 수 반환
        };
    }
}
