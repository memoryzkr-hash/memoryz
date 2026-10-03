# memoryz

| 폴더 | 내용 | 주소 |
| --- | --- | --- |
| `public/daycare/` | 더한방 주간보호센터 랜딩페이지 | https://memoryzkr-hash.github.io/memoryz/daycare/ |
| `care/`, `src/care/` | 주간보호 돌봄수첩 (모바일 PWA) | https://memoryzkr-hash.github.io/memoryz/care/ |
| `orchestra/` | 클로드 두 명과 지피티가 서로 보완하는 AI 단톡방 | [`orchestra/README.md`](orchestra/README.md) |

사이트 첫 주소(https://memoryzkr-hash.github.io/memoryz/)는 랜딩페이지로 넘어갑니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173/daycare/index.html, http://localhost:5173/care/
npm test         # 돌봄수첩·블로그 연동 단위 테스트
npm run build    # dist/ 에 정적 빌드
```

## 배포 (GitHub Pages)

`.github/workflows/ci.yml`이 모든 push에서 테스트와 빌드를 돌리고, 저장소 **기본 브랜치**에 push되면
https://memoryzkr-hash.github.io/memoryz/ 로 자동 배포합니다. 처음 한 번은 저장소 **Settings → Pages → Source**를
**GitHub Actions**로 바꾼 뒤, Actions 탭에서 CI를 다시 실행하면 됩니다.

## 주간보호센터 랜딩페이지 (`public/daycare/`)

`public/daycare/index.html`은 더한방 주간보호센터 홍보용 한 페이지 사이트입니다. 빌드하면 `dist/daycare/`로 그대로 복사되고,
기본 브랜치에 반영되면 https://memoryzkr-hash.github.io/memoryz/daycare/ 에 게시됩니다
(개발 서버에서는 `http://localhost:5173/daycare/index.html`).

- CSS와 JS가 모두 들어 있는 HTML 파일 하나입니다. 글꼴(Pretendard)만 jsDelivr CDN에서 불러옵니다.
- 로고는 센터 간판 사진을 보고 SVG로 다시 그린 것입니다(`#logo-mark`). 원본 로고 파일이 있으면 교체하세요.
- 전화번호(`000-000-0000`), 문자 받을 휴대폰(`010-0000-0000`), 주소·대표자·사업자번호(`○○`), 운영 시간과 송영 지역은
  임시 값입니다. 실제 정보로 바꾼 뒤 공개하세요.
- 상담 신청서는 서버 없이 동작합니다. 입력한 내용으로 보호자 휴대폰의 문자 앱에 신청 문자를 채워 주고,
  받는 번호는 `<form data-sms="...">`에서 정합니다.
- **센터 소식(네이버 블로그 연동)**: CI가 빌드 뒤 `scripts/fetch-blog.mjs`로 블로그 RSS
  (`https://rss.blog.naver.com/thehanbang0157.xml`)를 읽어 최신 글 6개를 `dist/daycare/posts.json`과 썸네일(`dist/daycare/blog/`)로
  만듭니다. 페이지는 이 파일이 있으면 글 카드를 보여 주고, 없으면 블로그 바로가기만 보여 줍니다.
  매일 오전 6시(한국 시간)에 다시 빌드되어 새 글이 반영됩니다. GitHub는 저장소에 60일 동안 활동이 없으면 예약 실행을 멈추니,
  그때는 Actions 탭에서 다시 켜 주세요.
- 같은 폴더의 `og.png`는 카카오톡 등에서 링크를 공유할 때 보이는 미리보기 이미지이고, `apple-touch-icon.png`는 홈 화면 아이콘입니다.
  센터 이름이나 문구가 바뀌면 `og.png`도 다시 만들어야 합니다.

## 주간보호 돌봄수첩 (`care/`)

주간보호센터 선생님이 휴대폰으로 어르신을 관리하는 앱입니다. 랜딩페이지와 같이 빌드되고
배포 후에는 https://memoryzkr-hash.github.io/memoryz/care/ 에서 열립니다 (개발 중: `http://localhost:5173/care/`).
홈 화면에 추가하면 앱처럼 전체 화면으로 열리고, 한 번 열어 두면 인터넷이 없어도 동작합니다.

| 탭 | 하는 일 |
| --- | --- |
| 오늘 | 요일별 이용 명단, 한 번에 등원·하원·결석(사유) 처리, 출석 현황, **확인할 일**(혈압·체온 등 이상 수치, 투약 전, 건강 체크 전) |
| (어르신 기록) | 건강 체크(혈압·맥박·체온·혈당, 기준 밖이면 바로 경고), 투약 체크(시각 기록), 점심·간식 섭취량, 배설, 기분, 프로그램 참여, 특이사항, **보호자 알림장** 자동 작성 → 문자·공유·복사 |
| 송영 | 차량별 등원/하원 탑승 체크, 보호자 전화, 도착 시 탑승자 일괄 등원 처리 |
| 어르신 | 등록·수정: 등급, 이용 요일, 보호자, 질환, 알레르기, 식이, 이동 방법, 센터 투약 약, 차량·주소, 퇴소 처리 |
| 통계 | 월간 출석률, 어르신별 혈압 추이 그래프와 건강 기록 표 |
| 설정 | 센터 이름, 차량·프로그램 목록, 백업 내려받기/불러오기, 예시 데이터 |

- 데이터는 서버 없이 **그 기기의 브라우저(localStorage)에만** 저장됩니다. 개인정보가 밖으로 나가지 않는 대신,
  기기를 바꾸기 전에 설정 → 백업 파일로 옮겨야 합니다. 여러 선생님이 실시간으로 함께 쓰려면 서버 동기화가 필요합니다(다음 단계).
- 건강 경고 기준은 `src/care/logic.ts`의 `VITAL_RANGES`에서 바꿀 수 있습니다.
- 처음이라면 **예시 데이터로 둘러보기**를 누르면 가상의 어르신 5명과 한 달 치 기록이 들어갑니다.

```
src/care/  logic.ts(출결·건강·통계·알림장 계산, 테스트 대상) store.ts(저장·예시 데이터)
           main.ts(화면) chart.ts(혈압 그래프) ui.ts care.css
care/index.html, public/care/ (매니페스트, 아이콘, 오프라인용 서비스 워커)
tests/care.test.ts
```
