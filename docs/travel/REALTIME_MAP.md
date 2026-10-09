# 카카오맵처럼 "실시간 + 내 위치" 지도 만들기

지금 여행 플래너가 하는 것과 못 하는 것, 그리고 카카오맵처럼 실시간 교통·내 위치·길찾기를 붙이는 방법을 정리했습니다.

## 1. "실시간"은 네 가지로 나뉩니다

| 원하는 것 | 필요한 것 | 지금 앱 |
| --- | --- | --- |
| **내 위치** (파란 점, 걸으면 따라 움직임) | 브라우저 위치 기능(Geolocation API). 키 필요 없음 | ✅ 지도 오른쪽 위 📍 버튼. 가장 가까운 일정 장소와 가는 시간·요금도 보여 줌 |
| **실시간 교통** (막히는 길 빨갛게) | 지도 회사의 교통 레이어 (카카오·네이버·구글) | ❌ 무료 지도엔 없음 |
| **실시간 길찾기 시간** (지금 출발하면 몇 분) | 길찾기 API (카카오모빌리티, TMAP, 구글) | ⚠️ 실제 도로 경로(OSRM)는 있지만 교통 상황은 반영 안 됨 (출퇴근 시간만 1.35배) |
| **대중교통 노선·실시간 도착** | ODsay(대중교통 길찾기), 서울 열린데이터광장·공공데이터포털(버스·지하철 도착) | ❌ 지하철·버스는 곡선으로만 그림 |

> 📍 내 위치는 **HTTPS 주소나 localhost**에서만 됩니다. GitHub Pages(`https://…github.io`)와 내 컴퓨터(`http://localhost:5173`)는 되고,
> 같은 와이파이에서 휴대폰으로 `http://192.168.x.x:5173` 처럼 열면 브라우저가 막습니다(아래 6번 참고). claude.ai 링크에서도 안 됩니다.

## 2. 어떤 지도를 쓸까

| | 카카오맵 | 네이버 지도 | 구글 지도 | 지금 방식 (MapLibre + OpenFreeMap) |
| --- | --- | --- | --- | --- |
| 키 | JavaScript 키 (도메인 등록) | Client ID (NCP) | API 키 + 결제 카드 등록 | 필요 없음 |
| 실시간 교통 레이어 | ✅ `MapTypeId.TRAFFIC` | ✅ `TrafficLayer` | ✅ `TrafficLayer` | ❌ |
| 국내 상세도 (골목·가게) | 아주 좋음 | 아주 좋음 | 보통 | 보통 (OpenStreetMap) |
| 해외 | 약함 | 약함 | 아주 좋음 | 좋음 |
| 3D 건물·기울이기 | ❌ (로드뷰는 있음) | 제한적 | ✅ (사실적 3D는 별도 API) | ✅ |
| 비용 | 무료 한도 넘으면 제한 | 무료 한도 후 유료 | 월 무료 크레딧 후 유료 | 무료 (공개 서버라 느릴 수 있음) |

**추천**: 국내 여행이면 **카카오맵 지도 + 카카오모빌리티 길찾기 + ODsay 대중교통**, 해외 여행은 **지금 방식** 그대로.
여행지 나라(`plan.region === 'KR'`)와 키가 있는지에 따라 지도를 골라 쓰면 됩니다. 정확한 무료 한도와 요금은 각 콘솔에서 확인하세요(자주 바뀝니다).

## 3. 카카오맵 붙이기 (국내 지도 + 실시간 교통 + 내 위치)

### 3-1. 키 만들기
1. https://developers.kakao.com 로그인 → **내 애플리케이션 → 애플리케이션 추가하기**
2. 만든 앱 → **앱 설정 → 플랫폼 → Web 플랫폼 등록**에 사이트 주소를 넣습니다.
   - `http://localhost:5173` (내 컴퓨터에서 개발)
   - `https://memoryzkr-hash.github.io` (배포본)
3. **앱 키**에서 **JavaScript 키**를 복사합니다. (지도에 쓰는 키. 등록한 주소에서만 동작하므로 웹페이지에 들어가도 괜찮습니다)
4. 지도 API 사용 설정이 따로 있으면 켭니다 (**카카오맵** 항목).

### 3-2. 키를 코드 밖에 두기
프로젝트 폴더에 `.env.local` 파일을 만들고 (Git에 올라가지 않음):
```
VITE_KAKAO_JS_KEY=복사한_JavaScript_키
```

### 3-3. 지도 띄우기 + 교통 + 내 위치 (핵심 코드)
```ts
// src/travel/ui/kakaoMap.ts — 예시
declare const kakao: any;

function loadKakao(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    s.onload = () => kakao.maps.load(() => resolve());
    s.onerror = () => reject(new Error('카카오맵을 불러오지 못했어요'));
    document.head.append(s);
  });
}

export async function createKakaoMap(el: HTMLElement) {
  await loadKakao(import.meta.env.VITE_KAKAO_JS_KEY);
  const map = new kakao.maps.Map(el, { center: new kakao.maps.LatLng(37.5665, 126.978), level: 5 });

  // 실시간 교통: 막히는 도로를 색으로 표시
  map.addOverlayMapTypeId(kakao.maps.MapTypeId.TRAFFIC);

  // 경로선 (우리 앱의 seg.path = [위도, 경도][])
  const drawPath = (path: [number, number][], color: string) =>
    new kakao.maps.Polyline({ map, path: path.map(([la, ln]) => new kakao.maps.LatLng(la, ln)), strokeWeight: 6, strokeColor: color });

  // 여행자 아이콘: HTML을 그대로 올리는 CustomOverlay
  const traveller = new kakao.maps.CustomOverlay({ map, content: '<div class="traveller"><span>🧳</span></div>', zIndex: 10 });
  const moveTraveller = ([la, ln]: [number, number]) => traveller.setPosition(new kakao.maps.LatLng(la, ln));

  // 내 위치: 걸으면 계속 갱신
  const me = new kakao.maps.CustomOverlay({ content: '<div class="me-dot"></div>', zIndex: 11 });
  navigator.geolocation.watchPosition(
    (p) => {
      me.setPosition(new kakao.maps.LatLng(p.coords.latitude, p.coords.longitude));
      me.setMap(map);
    },
    () => {},
    { enableHighAccuracy: true },
  );

  return { map, drawPath, moveTraveller };
}
```
이 앱에 붙일 때는 `src/travel/ui/map.ts`의 `TripMap`과 같은 메서드(`show`, `update`, `fit`, `focus`, `invalidate`)를 가진
`KakaoTripMap`을 만들고, `main.ts`에서 `plan.region === 'KR' && import.meta.env.VITE_KAKAO_JS_KEY`일 때 그걸 쓰게 하면 됩니다.
카카오맵은 3D 기울이기가 없으니 "3D로 따라가기" 대신 지도 중심만 여행자에게 맞춥니다(`map.panTo`).

## 4. 실시간 교통이 반영된 길찾기 (자동차·택시)

카카오모빌리티 **길찾기 API**는 지금 교통 상황으로 계산한 소요 시간, 거리, **예상 택시비**까지 줍니다.
이 키(REST API 키)는 **웹페이지에 넣으면 안 됩니다** (누구나 가져다 쓸 수 있음). 작은 서버(프록시)를 하나 두고 거기서 부릅니다.

### 4-1. 프록시 예시 (Cloudflare Workers, 무료 플랜으로 충분)
```js
// worker.js — 환경 변수 KAKAO_REST_KEY 에 REST API 키 저장
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const origin = u.searchParams.get('origin');           // "경도,위도"
    const destination = u.searchParams.get('destination'); // "경도,위도"
    const res = await fetch(
      `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${destination}&priority=RECOMMEND`,
      { headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` } },
    );
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': 'https://memoryzkr-hash.github.io' },
    });
  },
};
```
응답에서 쓰는 값: `routes[0].summary.distance`(m), `summary.duration`(초, 교통 반영), `summary.fare.taxi`(원),
경로 좌표는 `routes[0].sections[].roads[].vertexes` (`[경도, 위도, 경도, 위도, …]` 한 줄로 이어짐).

### 4-2. 이 앱에 연결하는 곳
`src/travel/ui/roadbook.ts`가 지금 OSRM 공개 서버에 묻는 곳입니다.
- `urls()`에 자동차일 때 프록시 주소를 먼저 넣고,
- `parseRoute()`에서 카카오 응답 모양도 읽게 하면 (`vertexes`를 두 개씩 묶어 `[위도, 경도]`로),
- 거리·경로는 그대로 엔진에 들어가 시간·요금이 실제 도로 기준으로 바뀝니다.
- 교통 반영 **시간**까지 쓰려면 `core/roads.ts`의 `Road`에 `minutes`를 더하고, `core/modes.ts`의 `estimateLeg`가
  그 값이 있으면 속도 계산 대신 쓰게 바꿉니다. 택시비도 `summary.fare.taxi`가 있으면 그 값을 쓰면 됩니다.

## 5. 대중교통 (지하철·버스 노선과 실시간 도착)

| 하고 싶은 것 | 쓸 API | 메모 |
| --- | --- | --- |
| 지하철·버스 경로 (환승, 소요 시간, 요금) | **ODsay** (lab.odsay.com) | 키 발급 후 서버 IP·도메인 등록. `searchPubTransPathT`에 출발·도착 좌표 |
| 서울 지하철 실시간 도착 | **서울 열린데이터광장** 실시간 지하철 도착정보 | 역 이름으로 조회 |
| 버스 실시간 도착 | **공공데이터포털** 버스 도착정보 (지역별) | 정류소 ID 필요 |

이 키들도 REST 방식이라 4-1처럼 프록시를 거치는 게 안전합니다. 연결 위치는 4-2와 같고, 지하철·버스 구간(`subway`, `bus`)에
`ROAD_PROFILE` 대신 대중교통 조회를 추가하면 됩니다.

## 6. 휴대폰에서 내 위치까지 써 보기

- **가장 쉬움**: GitHub Pages에 배포된 주소(`https://memoryzkr-hash.github.io/memoryz/travel.html`)를 휴대폰으로 엽니다.
- **내 컴퓨터에서 개발 중일 때**: `npm run dev -- --host`로 켜고 휴대폰에서 `http://컴퓨터IP:5173`을 열면 화면은 나오지만
  위치는 막힙니다. HTTPS 터널을 쓰면 됩니다: `npx cloudflared tunnel --url http://localhost:5173` → 나오는 `https://….trycloudflare.com` 주소를
  휴대폰에서 열기. (카카오맵을 쓴다면 이 주소도 카카오 개발자 콘솔 Web 플랫폼에 추가해야 지도가 뜹니다)

## 7. Claude Code에게 맡길 때 쓰는 지시문

그대로 복사해서 쓰면 됩니다. 한 번에 하나씩 시키는 게 좋습니다.

1. **카카오맵 지도**
   > `docs/travel/REALTIME_MAP.md` 3번을 따라 `src/travel/ui/kakaoMap.ts`에 `TripMap`과 같은 메서드를 가진 카카오맵 버전을 만들어 줘.
   > `VITE_KAKAO_JS_KEY`가 있고 여행지가 한국(`region === 'KR'`)이면 카카오맵, 아니면 지금 MapLibre 지도를 쓰게 해 줘.
   > 실시간 교통 레이어를 켜고 끄는 버튼도 넣어 줘. 키가 없을 때 지금처럼 동작하는지 테스트해 줘.
2. **실시간 길찾기 프록시**
   > `docs/travel/REALTIME_MAP.md` 4번대로 Cloudflare Worker 프록시(`proxy/worker.js`)와 배포 방법을 만들고,
   > `roadbook.ts`가 `VITE_ROUTE_PROXY` 주소가 있으면 카카오 길찾기를 먼저 쓰게 해 줘. 교통 반영 시간과 택시비가 있으면
   > 엔진이 그 값을 쓰도록 `Road`에 `minutes`, `taxiFare`를 추가하고 테스트도 써 줘.
3. **대중교통**
   > ODsay로 지하철·버스 구간의 실제 노선과 소요 시간·요금을 받아 오게 해 줘. 프록시를 거치고, 실패하면 지금 추정으로 돌아가게.
