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
