"""Reasoning cards: 15 ways of thinking x 12 workflows x 12 strategies = 2,160 combinations.

Each agent in a run draws one distinct card, so agents attack the same task from different angles.
"""

import random
from typing import Dict, List, Tuple

THINKING: List[Tuple[str, str]] = [
    ("제1원리", "관행과 기존 답을 내려놓고, 문제를 더 쪼갤 수 없는 사실까지 분해한 뒤 거기서부터 다시 쌓아 올린다."),
    ("역발상", "'어떻게 하면 완전히 실패할까'를 먼저 떠올리고, 그 실패를 하나씩 뒤집어 답을 만든다."),
    ("유추", "전혀 다른 분야에서 같은 구조의 문제를 찾아 그 분야의 검증된 해법을 빌려 온다."),
    ("시스템 사고", "부분이 아니라 요소 사이의 관계, 되먹임 고리, 병목을 먼저 그리고 거기서 답을 찾는다."),
    ("확률적 사고", "확신 대신 가능성의 크기로 생각한다. 각 주장에 얼마나 확실한지 매기고 불확실한 곳을 줄인다."),
    ("반례 사냥", "떠오른 답마다 그것을 깨뜨리는 반례를 먼저 찾고, 반례가 안 나올 때까지 다듬는다."),
    ("단순화", "같은 결과를 내는 가장 단순한 답을 찾는다. 필요 없는 가정, 단계, 장식을 걷어 낸다."),
    ("사용자 관점", "이 답을 실제로 받아서 쓸 사람의 자리에 앉아, 그 사람이 막히거나 헷갈릴 곳부터 해결한다."),
    ("사전 부검", "이 답이 6개월 뒤 실패했다고 가정하고, 그 이유를 최대한 많이 적은 다음 미리 막는다."),
    ("제약 중심", "시간·비용·환경·규칙 같은 제약을 먼저 전부 적고, 그 안에서만 가능한 답을 고른다."),
    ("구조적 분해", "문제를 겹치지도 빠지지도 않는(MECE) 하위 문제로 나누고 각각을 끝까지 푼다."),
    ("트레이드오프 비교", "가능한 접근을 여러 개 놓고 장단점을 비교해서, 왜 이것을 골랐는지 근거와 함께 답한다."),
    ("시간축 사고", "지금 당장의 결과뿐 아니라 2차 효과, 장기적 결과, 시간이 지나면 바뀌는 조건까지 따진다."),
    ("증거 우선", "검증 가능한 사실, 수치, 출처, 실행 결과에만 기대고, 추측은 추측이라고 표시한다."),
    ("악마의 변호인", "가장 그럴듯한 통념을 의심하고, 다수가 놓친 반대 입장을 진지하게 검토한 뒤 결론을 낸다."),
]

WORKFLOWS: List[Tuple[str, str]] = [
    ("초안 후 세 번 퇴고", "빠르게 전체 초안을 쓴 뒤 정확성 → 빠진 것 → 표현 순서로 세 번 고친다."),
    ("뼈대 먼저", "목차와 핵심 주장부터 확정한 다음, 각 칸을 채운다."),
    ("예시에서 일반화", "구체적인 예시 두세 개를 먼저 풀어 보고, 거기서 공통 규칙을 끌어내 답으로 정리한다."),
    ("검증 기준 먼저", "답을 쓰기 전에 '좋은 답이면 반드시 만족할 조건'을 목록으로 적고, 마지막에 하나씩 확인한다."),
    ("가장 어려운 부분부터", "제일 불확실하고 어려운 부분을 먼저 해결하고, 쉬운 부분은 나중에 채운다."),
    ("작은 단계로 순서대로", "문제를 작은 단계로 쪼개 한 단계씩 확정하며 앞으로 간다. 앞 단계가 틀리면 되돌아간다."),
    ("세 가지 안 중 고르기", "서로 다른 안을 세 개 만들고, 비교해서 가장 나은 것을 골라 다듬는다."),
    ("결론부터 역산", "결론을 먼저 한 문장으로 정하고, 그 결론을 받치는 근거와 단계를 거꾸로 채운다."),
    ("체크리스트", "과제의 요구사항을 한 줄씩 체크리스트로 옮기고, 답의 어디서 각각을 충족하는지 대응시킨다."),
    ("질문 목록", "이 과제에 답하려면 풀어야 할 질문을 전부 적고, 질문마다 답한 뒤 하나로 엮는다."),
    ("가정 명시", "답이 기대는 가정을 먼저 드러내 적고, 각 가정이 틀리면 어떻게 되는지까지 처리한다."),
    ("최소판 → 확장", "핵심만 되는 가장 작은 답을 먼저 완성하고, 남는 여력으로 범위와 깊이를 넓힌다."),
]

STRATEGIES: List[Tuple[str, str]] = [
    ("정확성 최우선", "틀린 내용을 하나라도 넣느니 덜 말한다. 확실한 것만 확실하게 말한다."),
    ("완결성", "과제가 요구한 것을 하나도 빠뜨리지 않는다. 빠진 요구사항이 없는지 끝까지 확인한다."),
    ("바로 쓸 수 있게", "읽은 사람이 그대로 복사해 쓰거나 바로 실행할 수 있는 수준까지 만든다."),
    ("간결함", "같은 내용을 가장 짧고 명확하게 전달한다. 반복과 군더더기를 뺀다."),
    ("핵심 깊게", "가장 중요한 한두 지점을 누구보다 깊게 파고든다."),
    ("견고함", "엣지 케이스, 잘못된 입력, 예외 상황에서도 무너지지 않게 만든다."),
    ("독창성", "뻔한 답보다 더 나은, 남들이 생각 못 한 접근을 찾는다. 단, 정확성은 지킨다."),
    ("구체성", "추상적인 말 대신 숫자, 예시, 이름, 단계, 코드처럼 손에 잡히는 것으로 말한다."),
    ("위험 관리", "무엇이 잘못될 수 있는지, 그때 어떻게 알아채고 대응하는지까지 답에 넣는다."),
    ("모범 사례 준수", "해당 분야의 표준, 관례, 검증된 모범 사례를 따르고 거기서 벗어나면 이유를 밝힌다."),
    ("눈높이 맞춤", "과제를 낸 사람의 수준과 목적을 추정해서, 그 사람에게 딱 맞는 깊이와 용어로 답한다."),
    ("반박 대비", "상대가 공격할 만한 약점을 미리 찾아 답 안에서 먼저 막아 둔다."),
]

TOTAL = len(THINKING) * len(WORKFLOWS) * len(STRATEGIES)


def draw(n: int, rng: random.Random) -> List[Tuple[int, int, int]]:
    """Draws n distinct cards, spreading each dimension as evenly as possible."""
    if n > TOTAL:
        raise ValueError(f"카드는 {TOTAL}장뿐이라 {n}명에게 다른 카드를 줄 수 없습니다")
    t_order = rng.sample(range(len(THINKING)), len(THINKING))
    w_order = rng.sample(range(len(WORKFLOWS)), len(WORKFLOWS))
    s_order = rng.sample(range(len(STRATEGIES)), len(STRATEGIES))
    used = set()
    cards = []
    for i in range(n):
        card = (
            t_order[i % len(THINKING)],
            w_order[(i + i // len(WORKFLOWS)) % len(WORKFLOWS)],
            s_order[(i + 2 * (i // len(STRATEGIES))) % len(STRATEGIES)],
        )
        while card in used:
            card = (
                rng.randrange(len(THINKING)),
                rng.randrange(len(WORKFLOWS)),
                rng.randrange(len(STRATEGIES)),
            )
        used.add(card)
        cards.append(card)
    return cards


def describe(card: Tuple[int, int, int]) -> Dict[str, Dict[str, str]]:
    t, w, s = card
    return {
        "thinking": {"name": THINKING[t][0], "how": THINKING[t][1]},
        "workflow": {"name": WORKFLOWS[w][0], "how": WORKFLOWS[w][1]},
        "strategy": {"name": STRATEGIES[s][0], "how": STRATEGIES[s][1]},
    }
