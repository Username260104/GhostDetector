# 프로젝트 명세서 (SPEC.md)

## 1. 개요 (Overview)
- **프로젝트명**: GhostDetector
- **목표**: 모바일 후면 카메라를 이용한 빈 공간 노이즈 탐지 및 시각화
- **주요 기능**:
    - **전체 화면 카메라**: 비율 유지(`cover`) 및 화면 꽉 채움.
    - **광각 카메라 지원**: 'wide', 'ultra' 등의 라벨을 가진 카메라 우선 활성화.
    - **노이즈 탐지 (Edge-Based Void Detection Algorithm)**:
        - **1단계: Sobel Edge Detection & Invert**:
            - 32px 단위 그리드 다운샘플링.
            - 가로/세로 밝기 변화량(Gradient) 계산 -> Edge 검출.
            - **Invert**: Edge(0) / Void(1)로 이진화.
        - **2단계: Morphology (Closing)**:
            - **Dilation(팽창)** -> **Erosion(침식)** 과정을 통해 빈 공간의 홀(Line)을 메우고 덩어리화.
        - **3단계: CCL (Connected Component Labeling)**:
            - 인접한 Void Cell들을 하나의 Blob으로 병합.
        - **4단계: Centroid Tracking**:
            - 가장 넓은 Blob의 **무게 중심(Centroid)**을 타겟 좌표로 사용.
            - 기존 Bounding Box 크기(W, h) 유지로 시각화 호환성 확보.
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
