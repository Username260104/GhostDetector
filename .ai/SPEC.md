# 프로젝트 명세서 (SPEC.md)

## 1. 개요 (Overview)
- **프로젝트명**: GhostDetector
- **목표**: 모바일 후면 카메라를 이용한 빈 공간 노이즈 탐지 및 시각화
- **주요 기능**:
    - **전체 화면 카메라**: 비율 유지(`cover`) 및 화면 꽉 채움.
    - **광각 카메라 지원**: 'wide', 'ultra' 등의 라벨을 가진 카메라 우선 활성화.
    - **노이즈 탐지 (Algorithm v2)**:
        - **Target**: 평평하고 균일한 영역 (Low Gradient) 선호 (**FlatnessWeight: 2.0**).
        - **Scoring**: `MaxGradient - CurrentGradient` + **Edge Penalty** (가장자리 회피) + **Boredom** (지루함).
        - **Stability**: `Low Pass Filter (LPF)`로 위치 보간.
        - **Stickiness**: `Spatial Memory`로 이전 위치 유지 (과도한 고정 방지, **StickinessWeight: 20.0**).
        - **ID Renewal**: 위치가 급격히 변하거나(**30%**) 지루함이 극에 달하면 새로운 ID 부여/이동.
        - **Constraints**:
            - **Max Size**: 화면의 15%.
            - **Aspect Ratio**: 1:2 ~ 2:1 제한 (길쭉한 형태 방지).
        - **Clustering**: Flood Fill + Aspect Ratio Check.
        - **State Machine**: Scanning <-> Locked.
    - **시각화 (Snap & Invert)**:
        - 감지된 위치로 부드럽게 이동 (LPF).
        - **CSS `mix-blend-mode: difference`**를 이용한 강력한 자동 색상 반전.
        - 타겟 ID ("**Object_XX**") 표시.

## 2. 데이터 구조 (Data Structure)
- **DetectionResult**:
    ```json
    {
        "x": 0.5, "y": 0.5, // 0~1 정규화 좌표
        "w": 0.1, "h": 0.1, // 0~1 정규화 크기
        "id": "Object_01"   // 타겟 식별자
    }
    ```

## 3. 파일 구조 (File Structure)
- **Root**
    - `index.html`: 메인 진입점, 비디오 및 캔버스 레이아웃.
    - `css/style.css`: 전체 화면 스타일링, `mix-blend-mode` 설정.
- **js/**
    - `Main.js`: 앱 초기화, Game Loop 실행.
    - `Camera.js`: `getUserMedia` 래핑, 광각 카메라 검색 로직.
    - `Detector.js`: 픽셀 데이터 분석, 노이즈 감지 알고리즘.
    - `Renderer.js`: Canvas API 드로잉, UI 시각화.
