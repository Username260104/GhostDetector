import Config from './Config.js';

export default class Detector {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.gridW = Config.GRID.WIDTH;
        this.gridH = Config.GRID.HEIGHT;

        this.currentBlob = null; // { x, y, w, h }
        this.objectCounter = 1;
    }

    detect(video) {
        if (video.readyState < 2) return null;

        // 1. 그리드 크기 조정
        const gw = Math.floor(video.videoWidth / Config.GRID.CELL_SIZE);
        const gh = Math.floor(video.videoHeight / Config.GRID.CELL_SIZE);

        if (this.canvas.width !== gw || this.canvas.height !== gh) {
            this.canvas.width = gw;
            this.canvas.height = gh;
            this.gridW = gw;
            this.gridH = gh;
        }

        // 다운샘플링
        this.ctx.drawImage(video, 0, 0, gw, gh);
        const frameData = this.ctx.getImageData(0, 0, gw, gh);
        const data = frameData.data;

        // 2. Sobel Edge Detection & Invert
        const binaryMap = this.applySobelAndInvert(data, gw, gh);

        // 3. Morphology (Closing: Dilation -> Erosion)
        // 빈 공간(White)을 뭉쳐서 더 단단한 덩어리로 만듦
        const dilatedMap = this.applyDilation(binaryMap, gw, gh);
        const closedMap = this.applyErosion(dilatedMap, gw, gh);

        // 디버그용 (Config.DEBUG.SHOW_GRID가 true일 때 캔버스에 그리기 위함)
        if (Config.DEBUG.SHOW_GRID) {
            this.debugDraw(closedMap, gw, gh);
        }

        // 4. CCL (Connected Component Labeling)
        const blobs = this.findConnectedComponents(closedMap, gw, gh);

        // 5. 가장 넓은 영역 선택
        const bestBlob = this.selectBestBlob(blobs, gw, gh);

        // 6. 결과 처리 (Centroid 계산 및 시각화 데이터 생성)
        return this.processResult(bestBlob, gw, gh);
    }

    applySobelAndInvert(data, w, h) {
        const output = new Uint8Array(w * h); // 0: Edge, 1: Void
        const threshold = Config.EDGE.THRESHOLD;

        // Sobel Kernels
        // X: -1 0 1
        //    -2 0 2
        //    -1 0 1
        // Y: -1 -2 -1
        //     0  0  0
        //     1  2  1

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                let gx = 0;
                let gy = 0;

                // 3x3 Window
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const idx = ((y + dy) * w + (x + dx)) * 4;
                        // Grayscale approximation (R+G+B)/3
                        const val = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

                        // Sobel X
                        if (dx !== 0) {
                            const weight = (dy === 0) ? 2 : 1;
                            gx += val * dx * weight;
                        }

                        // Sobel Y
                        if (dy !== 0) {
                            const weight = (dx === 0) ? 2 : 1;
                            gy += val * dy * weight;
                        }
                    }
                }

                const magnitude = Math.abs(gx) + Math.abs(gy);

                // Invert Logic: Edge(High Mag) -> 0, Flat(Low Mag) -> 1
                if (magnitude < threshold) {
                    output[y * w + x] = 1; // Void
                } else {
                    output[y * w + x] = 0; // Edge
                }
            }
        }
        return output;
    }

    applyDilation(map, w, h) {
        const output = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                if (map[y * w + x] === 1) {
                    output[y * w + x] = 1;
                    continue;
                }
                // 주변에 1이 하나라도 있으면 1로 만듦 (팽창 based on 4-connectivity)
                if (map[(y - 1) * w + x] || map[(y + 1) * w + x] || map[y * w + (x - 1)] || map[y * w + (x + 1)]) {
                    output[y * w + x] = 1;
                }
            }
        }
        return output;
    }

    applyErosion(map, w, h) {
        const output = new Uint8Array(w * h);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                if (map[y * w + x] === 0) continue;

                // 주변이 모두 1이어야 1 유지 (아니면 0으로 깎임)
                if (map[(y - 1) * w + x] && map[(y + 1) * w + x] && map[y * w + (x - 1)] && map[y * w + (x + 1)]) {
                    output[y * w + x] = 1;
                } else {
                    output[y * w + x] = 0;
                }
            }
        }
        return output;
    }

    findConnectedComponents(activeMap, w, h) {
        const visited = new Uint8Array(w * h);
        const blobs = [];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                if (activeMap[idx] === 1 && visited[idx] === 0) {
                    const blob = {
                        points: [], // 무게중심 계산을 위해 좌표 수집
                        minX: x, maxX: x,
                        minY: y, maxY: y,
                        count: 0
                    };
                    const queue = [{ x, y }];
                    visited[idx] = 1;
                    blob.points.push({ x, y });
                    blob.count++;

                    while (queue.length > 0) {
                        const curr = queue.pop();

                        if (curr.x < blob.minX) blob.minX = curr.x;
                        if (curr.x > blob.maxX) blob.maxX = curr.x;
                        if (curr.y < blob.minY) blob.minY = curr.y;
                        if (curr.y > blob.maxY) blob.maxY = curr.y;

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
                                    blob.points.push({ x: nx, y: ny });
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

        const validBlobs = blobs.filter(b => {
            const size = b.count;
            const w = b.maxX - b.minX + 1;
            const h = b.maxY - b.minY + 1;
            const ratio = w / h;

            if (size < Config.BLOB.MIN_CLUSTER_SIZE) return false;
            if (size > (gw * gh) * Config.BLOB.MAX_CLUSTER_SIZE) return false;
            //if (ratio < Config.BLOB.MIN_ASPECT_RATIO || ratio > Config.BLOB.MAX_ASPECT_RATIO) return false;

            return true;
        });

        if (validBlobs.length === 0) return null;

        // 가장 큰 덩어리 반환
        return validBlobs.reduce((prev, curr) => (prev.count > curr.count) ? prev : curr);
    }

    processResult(bestBlob, gw, gh) {
        if (!bestBlob) {
            this.currentBlob = null;
            return { state: 'SCANNING' };
        }

        // 무게 중심(Centroid) 계산
        let sumX = 0;
        let sumY = 0;
        for (const p of bestBlob.points) {
            sumX += p.x;
            sumY += p.y;
        }
        const centerX = sumX / bestBlob.count;
        const centerY = sumY / bestBlob.count;

        // 정규화 좌표 (0.0 ~ 1.0)
        let targetX = centerX / gw;
        let targetY = centerY / gh;

        // 크기도 박스 기준이 아니라 블롭 면적 기준으로 대략적 계산 (Visual)
        // 기존 w, h는 박스 크기였음. 여기서는 박스 크기를 그대로 쓸지 고민.
        // 유저 요청: "가장 넓은 흰색 영역의 중심점을 추적".
        // 시각화 유지를 위해 기존 W/H 포맷 사용
        let targetW = (bestBlob.maxX - bestBlob.minX + 1) / gw;
        let targetH = (bestBlob.maxY - bestBlob.minY + 1) / gh;

        if (!this.currentBlob) {
            this.currentBlob = { x: targetX, y: targetY, w: targetW, h: targetH };
            this.objectCounter++;
        } else {
            // LPF Smoothing
            const t = Config.BLOB.SMOOTHING;
            this.currentBlob.x += (targetX - this.currentBlob.x) * t;
            this.currentBlob.y += (targetY - this.currentBlob.y) * t;
            this.currentBlob.w += (targetW - this.currentBlob.w) * t;
            this.currentBlob.h += (targetH - this.currentBlob.h) * t;

            // 너무 멀면 ID 갱신
            const dist = Math.hypot(targetX - this.currentBlob.x, targetY - this.currentBlob.y);
            if (dist > 0.4) {
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
            score: bestBlob.count
        };
    }

    debugDraw(map, w, h) {
        const imageData = this.ctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            const val = map[i] * 255;
            imageData.data[i * 4] = val;     // R
            imageData.data[i * 4 + 1] = val; // G
            imageData.data[i * 4 + 2] = val; // B
            imageData.data[i * 4 + 3] = 255; // A
        }
        this.ctx.putImageData(imageData, 0, 0);
    }
}
