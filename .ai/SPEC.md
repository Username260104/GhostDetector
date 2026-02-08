# 프로젝트 명세서 (SPEC.md)

## 1. 개요 (Overview)
- **프로젝트명**: GhostDetector
- **목표**: 모바일 후면 카메라를 이용한 빈 공간 노이즈 탐지 및 시각화
- **주요 기능**:
    - **전체 화면 카메라**: 비율 유지(`cover`) 및 화면 꽉 채움.
    - **광각 카메라 지원**: 'wide', 'ultra' 등의 라벨을 가진 카메라 우선 활성화.
    - **노이즈 탐지 (Algorithm v3)**:
        - **1단계: Grid Scoring**:
            - 32px 단위 그리드 분석.
            - **Variance (표준편차)**: 자글거림(노이즈)이 심할수록 가산점 (+).
            - **EdgeStrength**: 뚜렷한 경계선이 있으면 대폭 감점 (-).
            - `Score = (Variance * 1.5) - (Edge * 3.0)`
        - **2단계: Binary Thresholding**:
            - 임계값(15.0) 이상인 셀만 'Active'로 분류.
        - **3단계: CCL (Connected Component Labeling)**:
            - Flood Fill 알고리즘으로 인접한 Active Cell 병합.
        - **4단계: Bounding Box Fitting**:
            - 병합된 덩어리의 Min/Max 좌표로 박스 생성.
            - 크기(4~15%) 및 비율(0.2~5.0) 필터링.
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
