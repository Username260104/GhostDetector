export default {
    // 그리드 설정
    GRID: {
        CELL_SIZE: 32, // 분석 해상도 (약 32px)
        WIDTH: 64,     // 가로 그리드 개수 (초기값, 리사이즈 시 변경됨)
        HEIGHT: 48     // 세로 그리드 개수
    },

    // 점수 계산 가중치
    SCORE: {
        VARIANCE_WEIGHT: 1.5,    // 표준편차(자글거림) 가중치 (+)
        EDGE_WEIGHT: 3.0,        // 경계선(뚜렷한 선) 가중치 (-)
        THRESHOLD: 15.0          // 이진화 임계값 (이 점수 이상이어야 활성 셀)
    },

    // 연결 요소 병합 및 필터링
    BLOB: {
        MIN_CLUSTER_SIZE: 4,      // 최소 셀 개수 (너무 작은 노이즈 제거)
        MAX_CLUSTER_SIZE: 0.15,   // 화면 전체 대비 최대 크기 비율 (15%)
        MIN_ASPECT_RATIO: 0.2,    // 최소 가로세로 비율 (너무 길쭉한 것 제외)
        MAX_ASPECT_RATIO: 5.0,    // 최대 가로세로 비율
        SMOOTHING: 0.1            // 위치 보간 계수 (LPF, 낮을수록 부드러움)
    },

    // 기타 설정
    DEBUG: {
        SHOW_GRID: false,         // 그리드 디버그 표시 여부
        SHOW_SCORE: false         // 점수 디버그 표시 여부
    }
};
