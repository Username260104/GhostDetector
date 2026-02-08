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
    - `style.css`: `#camera-feed` 가시화, `#overlay` 블렌딩 모드 추가.
