# 변경 이력 (STORY.md)

## 2026-02-09
- **[문서]** 프로젝트 초기화
    - `SPEC.md` 생성: 프로젝트 명세서 초기 템플릿 작성
    - `STORY.md` 생성: 변경 이력 관리 시작
- **[기능]** Ghost Detector 코어 구현
    - 카메라: 전체 화면 뷰, 광각(Wide) 카메라 우선 선택 로직 적용 (`Camera.js`)
    - 탐지: 이미지 분산(Variance) 기반 노이즈 탐지 알고리즘 구현 (`Detector.js`)
    - 렌더링: `mix-blend-mode: difference`를 활용한 자동 색상 반전 UI (`Renderer.js`, `style.css`)
    - 구조: 모듈형 설계 및 메인 루프 구현 (`Main.js`)
- **[Git]** 리포지토리 동기화
    - 원격 저장소(`origin`) 연결 및 강제 푸시 완료 (초기화)
- **[리팩토링]** 탐지 알고리즘 고도화
    - Random Sampling 제거 -> Grid Scan 도입
    - Vector Field & Scoring 구현: Repulsion(Edge 회피), Attraction(Texture 유인), Noise(무작위성)
    - State Machine 도입: Scanning vs Locked, Hysteresis로 타겟 안정성 확보
    - Clustering: Flood Fill 알고리즘으로 노이즈 영역의 Bounding Box 계산
    - 시각화: 선 두께 0.5px, 중앙 태그 배치, 적응형 대비(Difference Blend)
- **[버그수정]** 렌더링 파이프라인 변경 (mix-blend-mode 적용 불가 이슈 해결)
    - 기존: Canvas `globalCompositeOperation` 사용 -> 배경이 투명 캔버스라 비디오와 합성되지 않음.
    - 변경: HTML Video + CSS `mix-blend-mode: difference` 사용.
    - `Renderer.js`: 비디오 그리기 제거, 투명 배경 유지.
    - `style.css`: `#camera-feed` 가시화, `#overlay` 블렌딩 모드 추가 -> 제거 (Canvas 내부 합성으로 변경).
- **[리팩토링]** 감지 알고리즘 전면 수정 (Detector v2)
    - **Target Change**: `Gradient` 역전 -> 텍스처(무늬) 대신 **평평한 공간(벽지, 빈 곳)** 선호.
    - **Stability**: `LPF(Low Pass Filter)` 도입으로 부드러운 이동 (`lerpFactor: 0.1`).
    - **Stickiness**: `Spatial Memory` 도입 -> 한 번 찾은 위치 주변에 강력한 가산점 부여 (껌딱지 효과).
- **[버그수정]** 탐지 로직 및 UI 개선
    - **Blob Size**: 벽 전체를 잡는 문제 해결 -> 최대 클러스터 크기 40% -> 15% 축소.
    - **ID Update**: 먼 거리 이동 시 ID 갱신 로직 추가 (`renewDistance: 0.3`).
    - **Stickiness**: 위치 고정 강도 하향 (50.0 -> 30.0) 및 평평함 가중치 조절 (3.0 -> 2.0).
    - **UI**: Double Debug Text 문제 해결 (Renderer 등 내장 텍스트 제거), 용어 통일 (Ghost -> Object).
- **[리팩토링]** 알고리즘 고도화 (Wall-Hugging 방지)
    - **Edge Penalty**: 화면 가장자리로 갈수록 점수 대폭 삭감 (중앙 지향).
    - **Aspect Ratio**: 가로세로 비율이 1:2 ~ 2:1을 벗어나면 클러스터 확장 중단 (기둥/틈새 방지).
    - **Boredom System**: 한 곳에 오래 머물면 점수가 깎여 다른 곳으로 이동 유도 (Stickiness 상쇄).
- **[리팩토링]** 알고리즘 전면 교체 (Detector v3)
    - **Grid Scoring**: 화면 전체 픽셀 스캔 -> 32px 그리드 단위 다운샘플링 분석.
    - **점수 공식**: `(Variance * 1.5) - (Edge * 3.0)` -> 텍스처는 쫓고 선은 피함.
    - **파이프라인**: Scoring -> Thresholding -> CCL(Flood Fill) -> Bounding Box.
    - **설정 분리**: `Config.js` 도입으로 파라미터(가중치, 임계값, 크기 제한 등) 중앙 관리.

## 2026-02-10
- **[리팩토링]** Edge-Based Void Detection 알고리즘 교체 (Detector v4)
    - **Concept**: 복잡한 텍스처 분석 폐기 -> **"빈 공간(Void)"**을 인식하는 직관적 로직으로 변경.
    - **Sobel Edge Detection**: 밝기 변화량으로 윤곽선 검출 (`Threshold: 30`).
    - **Invert & Morphology**: 윤곽선을 피해 빈 공간을 찾고, **Closing(팽창->침식)** 연산으로 흩어진 공간을 단단한 덩어리로 병합.
    - **Centroid Tracking**: Bounding Box 중심 대신 **질량 중심**을 추적하여 더욱 안정적인 움직임 구현.
    - **Compatibility**: 내부 로직은 완전히 바뀌었으나 투명 박스 시각화(`Renderer.js`)는 그대로 유지.
- **[기능]** 절차적 스켈레톤 시각화 (Procedural Skeleton Visualization)
    - **MediaPipe Topology**: 33개 랜드마크(코, 눈, 귀, 어깨, 팔꿈치, 손목, 골반, 무릎, 발목 등)를 기반으로 한 스켈레톤 구현.
    - **Aspect-Ratio Preserved Scaling**: 블롭의 가로세로 비율에 왜곡되지 않고, 긴 변을 기준으로 비율을 유지하며 크기 조절.
    - **Procedural Animation**: `performance.now()`를 활용한 미세한 노이즈로 "살아있는 듯한" 움직임 연출.
- **[설정]** 배포 규칙 업데이트
    - **Branch**: 모든 푸시는 `master` 브랜치를 대상으로 수행.

