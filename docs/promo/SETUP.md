# 홍보 에이전트 설정 가이드

처음 한 번만 하면 됩니다. 30~60분 정도 걸리고, 대부분은 메타(인스타그램·쓰레드) 토큰 받는 시간이에요.
기획 전체는 [PLAN.md](PLAN.md)에 있습니다.

> 메타 개발자 화면은 메뉴 이름이 자주 바뀝니다. 아래 이름과 조금 달라도 같은 뜻의 메뉴를 찾으면 됩니다.

## 0. 한눈에 보기

| 무엇 | 어디에 넣나 | 필수 |
| --- | --- | --- |
| 브랜드 설명, 글 구성, FAQ, 참고 계정 | `promo/` 폴더의 파일들 | ✅ |
| `ANTHROPIC_API_KEY` | GitHub Secrets | ✅ |
| `THREADS_ACCESS_TOKEN` | GitHub Secrets | 쓰레드를 켤 때 |
| `INSTAGRAM_ACCESS_TOKEN` | GitHub Secrets | 인스타그램을 켤 때 |
| `WORDPRESS_USER`, `WORDPRESS_APP_PASSWORD` | GitHub Secrets | 워드프레스를 켤 때 |
| `PROMO_SECRET_KEY` | GitHub Secrets | 권장 — 토큰 자동 연장 |
| `NOTIFY_WEBHOOK_URL` | GitHub Secrets | 선택 — 슬랙/디스코드 알림 |
| `PROMO_MEDIA_TOKEN` | GitHub Secrets | 이 저장소가 **비공개**일 때만 |
| `PROMO_ENABLED` = `true` | GitHub **Variables** | 다 확인한 뒤 마지막에 |

GitHub Secrets 넣는 곳: 저장소 → **Settings → Secrets and variables → Actions → New repository secret**.
Variables는 같은 화면의 **Variables** 탭입니다.

## 1. `promo/` 폴더 채우기

| 파일 | 할 일 |
| --- | --- |
| `promo/config.yml` | `brand`(이름·계정·색), `schedule`(요일·시간), `platforms`(켤 곳)을 바꿉니다. 나머지는 그대로 둬도 됩니다. |
| `promo/brand.md` | 무엇을 파는지, 누구에게, 말투, 강조할 것, **하지 말 것**. 에이전트가 가장 많이 보는 파일입니다. |
| `promo/templates/*.md` | 플랫폼별 글 구성. "이 순서로 써라"를 적는 곳입니다. |
| `promo/faq.md` | 댓글에 답할 때 쓰는 사실(가격, 배송, 해지…). 여기 없는 질문은 사람에게 넘깁니다. |
| `promo/references.md` | 참고할 글 주소·계정·키워드. 주소를 적으면 직접 열어 보고 *형식만* 참고합니다. |

예시 내용(가상의 도시락 브랜드 "단백한끼")은 모두 지우고 내 브랜드로 바꿔 주세요.

## 2. Anthropic API 키

1. https://console.anthropic.com/settings/keys 에서 키를 만듭니다.
2. **Settings → Limits에서 월 사용 한도를 꼭 걸어 두세요.** (주 3편 + 댓글 정도면 큰 금액은 아니지만, 안전장치입니다.)
3. GitHub Secret `ANTHROPIC_API_KEY`로 넣습니다.

## 3. 쓰레드 토큰

1. https://developers.facebook.com/apps 에서 **앱 만들기** → 사용 사례에서 **Threads API 액세스**를 고릅니다.
2. 권한(사용 사례 → 맞춤 설정)에서 다음을 추가합니다.
   `threads_basic`, `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`
3. **앱 역할 → 역할**에서 내 쓰레드 계정을 **Threads 테스터**로 추가하고,
   쓰레드 앱(또는 웹) **설정 → 계정 → 웹사이트 권한 → 초대**에서 수락합니다.
   (내 계정에만 쓰는 앱은 앱 검수나 공개 전환 없이 이 상태로 동작합니다.)
4. Threads API 설정 화면의 **사용자 토큰 생성기(User Token Generator)**로 내 계정 토큰을 만듭니다. 이 토큰은 60일짜리입니다.
   (화면에 없으면 OAuth로 받은 짧은 토큰을 `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<앱 시크릿>&access_token=<짧은 토큰>`으로 바꾸면 60일짜리가 됩니다.)
5. GitHub Secret `THREADS_ACCESS_TOKEN`으로 넣습니다.

## 4. 인스타그램 토큰

먼저 인스타그램 앱에서 **설정 → 계정 유형 및 도구 → 프로페셔널 계정으로 전환**(비즈니스 또는 크리에이터)합니다. 개인 계정은 API로 올릴 수 없습니다.

**방법 A — 인스타그램 로그인 (간단, 권장)**

1. 쓰레드와 같은 메타 앱(또는 새 앱)에 **Instagram** 사용 사례/제품을 추가하고 **Instagram 로그인을 통한 API 설정**을 엽니다.
2. 권한: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`
3. **앱 역할**에 내 인스타그램 계정을 **Instagram 테스터**로 추가하고, 인스타그램 웹 **설정 → 앱 및 웹사이트 → 테스터 초대**에서 수락합니다.
4. 같은 화면의 **액세스 토큰 생성**에서 내 계정을 연결하고 토큰을 복사합니다(60일짜리).
5. GitHub Secret `INSTAGRAM_ACCESS_TOKEN`으로 넣습니다.

**방법 B — 페이스북 로그인 (페이스북 페이지에 연결된 계정, 만료 없는 토큰을 쓰고 싶을 때)**

1. 인스타그램 계정을 페이스북 페이지에 연결하고, 비즈니스 관리자에서 시스템 사용자 토큰(또는 페이지 토큰)을 `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `pages_read_engagement` 권한으로 만듭니다.
2. Secrets: `INSTAGRAM_ACCESS_TOKEN`(그 토큰), `INSTAGRAM_USER_ID`(인스타그램 비즈니스 계정 ID)
3. Variables: `INSTAGRAM_API_HOST` = `graph.facebook.com`

## 5. 워드프레스 (쓰는 경우)

1. 워드프레스 관리자 → **사용자 → 프로필 → 애플리케이션 비밀번호**에서 새 비밀번호를 만듭니다.
2. Secrets: `WORDPRESS_USER`(로그인 아이디), `WORDPRESS_APP_PASSWORD`(만든 비밀번호, 띄어쓰기 그대로 넣어도 됨)
3. `promo/config.yml`에서 `platforms.wordpress.enabled: true`, `url`에 블로그 주소.
   처음에는 `status: draft`로 두면 워드프레스에 임시글로 들어가 확인하기 좋습니다.

## 6. 네이버 블로그 · 티스토리

설정할 것이 없습니다. 네이버는 2020년 5월에 글쓰기 API를 닫았고 티스토리 Open API도 종료돼서, 에이전트가 **붙여넣기용 발행본**을 만들어 둡니다.
글이 준비되면 알림(또는 `report.md`)에 링크가 오고, 열어서 제목·본문·태그를 복사해 붙여넣고 발행하면 됩니다.

## 7. 카드 이미지 저장소

인스타그램은 이미지를 **공개 주소**에서 가져갑니다. 에이전트는 카드 이미지를 `promo-media` 브랜치에 올리고 `raw.githubusercontent.com` 주소를 씁니다.

- **이 저장소가 공개**면 할 일이 없습니다.
- **비공개**라면: 이미지 전용 공개 저장소를 하나 만들고(예: `내아이디/promo-media`),
  `promo/config.yml`의 `media.repo`에 적은 뒤, 그 저장소에 **Contents: Read and write** 권한이 있는
  fine-grained 토큰(https://github.com/settings/personal-access-tokens)을 Secret `PROMO_MEDIA_TOKEN`으로 넣습니다.

## 8. 토큰 자동 연장 키 (권장)

쓰레드·인스타그램(방법 A) 토큰은 60일 뒤 만료됩니다. `PROMO_SECRET_KEY`를 넣어 두면 에이전트가 일주일마다 토큰을 연장하고,
새 토큰을 이 키로 암호화해 `promo-data` 브랜치에 보관합니다.

- 아무 긴 무작위 문자열이면 됩니다. 터미널에서 `openssl rand -hex 32`, 또는 비밀번호 생성기로 40자 이상.
- 이 키를 바꾸면 보관된 토큰을 못 읽으니, 그때는 토큰도 Secrets에 새로 넣어 주세요.

## 9. 알림 (선택)

슬랙 [Incoming Webhook](https://api.slack.com/messaging/webhooks) 주소나 디스코드 채널 **연동 → 웹후크** 주소를 Secret `NOTIFY_WEBHOOK_URL`로 넣으면
발행 완료, 발행 실패, 검토할 초안, 사람이 볼 댓글을 바로 알려 줍니다.

## 10. 켜기

> 예약 실행은 GitHub 규칙상 **저장소 기본 브랜치에 있는 워크플로만** 돕니다. 이 작업이 기본 브랜치에 합쳐진 뒤에 진행하세요.

1. 저장소 **Actions → Promo agent → Run workflow**에서 `check`를 실행합니다. 모든 줄이 ✅인지 확인합니다.
2. `preview`를 실행합니다. 아무 데도 올리지 않고 초안과 카드 이미지만 만듭니다.
   실행이 끝나면 `promo-data` 브랜치의 `drafts/`에서 글을, Actions 실행 화면의 Summary에서 기록을, 맨 아래 Artifacts의 `preview-cards`에서 카드 이미지를 봅니다.
3. 글이 마음에 들 때까지 `promo/brand.md`와 `templates/`를 고치고 `preview`를 반복합니다.
4. 처음 1~2주는 `config.yml`에서 `mode: review`로 시작하는 것을 권합니다. 초안만 만들어지고, 승인해야 올라갑니다.
5. Variables에 `PROMO_ENABLED` = `true`를 넣으면 매시간 자동 실행이 시작됩니다.

## 11. 평소 운영

가장 편한 방법은 **관제실** 웹 화면이에요: `https://<내아이디>.github.io/<저장소>/promo.html` (GitHub Pages가 켜져 있어야 해요).
휴대폰에서 열고 브라우저 메뉴의 **홈 화면에 추가**를 누르면 앱처럼 쓸 수 있어요.
**설정** 탭에서 저장소 이름과 토큰을 넣으면 연결됩니다. 토큰은 https://github.com/settings/personal-access-tokens 에서
이 저장소만 골라 **Contents: Read and write**, **Actions: Read and write** 권한으로 만드세요. 토큰은 그 브라우저에만 저장돼요.
관제실에서 초안 확인·수정·승인, 댓글 처리 완료, 지금 실행을 모두 할 수 있고, 아래 표의 GitHub 방법도 그대로 쓸 수 있어요.

| 하고 싶은 것 | 방법 |
| --- | --- |
| 무엇을 했는지 보기 | `promo-data` 브랜치의 `report.md`, 또는 Actions 실행의 Summary |
| 사람이 답할 댓글 보기 | `promo-data` 브랜치의 `inbox.md` (+ 알림) |
| 검토 모드에서 승인 | `promo-data/drafts/<날짜>.md`를 GitHub에서 열어 연필 아이콘 → 맨 위 `status: draft`를 `approved`로 → 저장. 본문을 고쳐도 고친 대로 올라갑니다. `skip`이면 버립니다. |
| 지금 바로 한 편 | Run workflow → `post-now` (주제 칸은 비워도 됨) |
| 특정 주제를 다음에 쓰게 | `config.yml`의 `content.topics`에 추가 |
| 잠깐 멈추기 | Variables의 `PROMO_ENABLED`를 `false`로 |
| 댓글 답글을 더 자주 | `.github/workflows/promo.yml`의 cron을 `'*/30 * * * *'`로 (Actions 사용 시간이 늘어요) |

## 12. 토큰 다시 받기

`report.md`나 알림에 "토큰이 만료됐거나 취소됐어요"가 보이면, 3번(쓰레드) 또는 4번(인스타그램)의 마지막 단계를 다시 해서 새 토큰을 Secrets에 넣으면 됩니다.
새 Secret을 넣으면 에이전트가 보관하던 예전 토큰 대신 새 토큰을 씁니다.

## 13. 내 컴퓨터에서 실행 (선택)

```bash
npm install
npx playwright-core install chromium     # 카드 이미지용 (한 번만)
cp .env.example .env                     # 키를 채웁니다 (.env는 git에 올라가지 않아요)
npm run promo -- check                   # 연결 확인
npm run promo -- preview --topic "점심 단백질 30g 채우기"   # 올리지 않고 미리보기 → .promo-data/drafts/
npm run promo -- run --dry-run           # 평소 실행을 흉내만 냄
```

## 14. 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| `설정을 고쳐 주세요` | 메시지에 나온 `config.yml` 줄을 고칩니다. |
| `환경 변수(또는 GitHub Secrets)가 비어 있어요` | 켠 플랫폼에 필요한 Secret 이름을 확인합니다(대소문자 포함). |
| 인스타그램 `이미지 주소가 공개되지 않았어요` | 7번 — 저장소가 비공개면 공개 저장소를 따로 둬야 합니다. |
| 인스타그램 `권한이 없어요` | 프로페셔널 계정인지, 토큰에 `content_publish`·`manage_comments` 권한이 있는지. |
| 쓰레드 답글이 안 달림 | 토큰에 `threads_manage_replies`가 있는지. 권한을 추가했다면 토큰을 새로 받아야 합니다. |
| 초안이 계속 "검수에서 막힘" | `drafts/` 파일 맨 위 `issues`를 봅니다. 금지어가 너무 넓거나 `brand.links`에 없는 링크를 쓰려는 경우가 많습니다. |
| 예약 실행이 안 돎 | `PROMO_ENABLED`가 Variables(Secrets 아님)에 `true`인지, 워크플로가 기본 브랜치에 있는지. 60일 동안 저장소 활동이 없으면 GitHub가 예약 실행을 멈춥니다. |
