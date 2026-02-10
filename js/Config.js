export default {
    // 그리드 설정
    GRID: {
        CELL_SIZE: 32, // 분석 해상도 (약 32px)
        WIDTH: 64,     // 가로 그리드 개수 (초기값, 리사이즈 시 변경됨)
        HEIGHT: 48     // 세로 그리드 개수
    },

    // 엣지 검출 및 이진화 설정
    EDGE: {
        THRESHOLD: 30, // 엣지로 판단할 밝기 변화량 임계값 (0~255)
    },

    // 연결 요소 병합 및 필터링
    BLOB: {
        MIN_CLUSTER_SIZE: 10,     // 최소 셀 개수 (노이즈 제거)
        MAX_CLUSTER_SIZE: 0.4,    // 화면 전체 대비 최대 크기 비율 (40%)
        MIN_ASPECT_RATIO: 0.2,    // 최소 가로세로 비율
        MAX_ASPECT_RATIO: 5.0,    // 최대 가로세로 비율
        SMOOTHING: 0.1            // 위치 보간 계수 (Lower = Supportier)
    },

    // 디버그
    DEBUG: {
        SHOW_GRID: false,         // 그리드/이진화 맵 디버그 표시
        SHOW_SCORE: false         // (미사용)
    }
};
