#!/usr/bin/env python3
"""Arena: many sub-agents solve the same task with different reasoning cards, then a single-elimination
tournament (attack -> defend -> judge) leaves one answer.

This script only keeps the bookkeeping: it draws cards, writes the prompt file for every sub-agent job,
checks which outputs exist, pairs the bracket, scores the judges' verdicts and writes the result.
The orchestrating Claude runs the sub-agents. Standard library only, Python 3.8+.

  arena.py plan [--agents N]          cost table (rounds, sub-agent calls)
  arena.py init [--agents N] [--seed S]  create .arena/<id>/ ; then write the task to <id>/task.md
  arena.py next <run>                 jobs to run now (advances the phase when everything is in)
  arena.py status <run>               bracket so far
  arena.py forfeit <run> <agent>      give up on an agent that keeps failing (its opponent wins)
  arena.py decide <run> <match> <agent>  set a match winner by hand when its judge keeps failing

<run> is a run directory, a run id under .arena/, or "latest".
"""

import argparse
import datetime
import json
import os
import random
import re
import sys
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cards as cardlib  # noqa: E402

ROOT = ".arena"
DEFAULT_AGENTS = 16
QUICK_AGENTS = 8
FULL_AGENTS = 100
CALLS_PER_MATCH = 5  # two attacks, two defenses, one judge

RUBRIC: List[Tuple[str, str, int, str]] = [
    ("accuracy", "정확성", 30, "사실·논리·계산·코드가 맞는가"),
    ("completeness", "완결성", 25, "과제가 요구한 것을 빠짐없이 다뤘는가"),
    ("robustness", "견고성", 20, "공격을 버텼는가, 엣지 케이스와 실패 조건에서도 성립하는가"),
    ("specificity", "구체성", 15, "바로 쓸 수 있을 만큼 구체적인가(수치·예시·단계·코드)"),
    ("clarity", "명료성", 10, "읽기 쉽고 구조가 분명한가"),
]
SEVERITIES = ("FATAL", "MAJOR", "MINOR")
SEVERITY_RE = re.compile(r"등급\s*[:：]\s*[*_`\s]*(FATAL|MAJOR|MINOR)", re.IGNORECASE)


# ---------------------------------------------------------------- bracket math


def bracket_sizes(n: int) -> List[int]:
    """Alive counts per round: 100 -> [100, 50, 25, 13, 7, 4, 2, 1]."""
    sizes = [n]
    while sizes[-1] > 1:
        sizes.append((sizes[-1] + 1) // 2)
    return sizes


def total_calls(n: int) -> int:
    # Every match eliminates exactly one agent, so there are n - 1 matches.
    return n + CALLS_PER_MATCH * (n - 1)


def plan_text(n: int) -> str:
    sizes = bracket_sizes(n)
    lines = [
        f"참가 {n}명 · 라운드 {len(sizes) - 1}개 · 하위 에이전트 호출 {total_calls(n)}회",
        f"  풀이: {n}회",
    ]
    for r, alive in enumerate(sizes[:-1], start=1):
        matches = alive // 2
        bye = " + 부전승 1" if alive % 2 else ""
        lines.append(
            f"  라운드 {r}: {alive}명 → {sizes[r]}명 · 경기 {matches}{bye} · 호출 {matches * CALLS_PER_MATCH}회"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------- run storage


def now_id() -> str:
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"{stamp}-{random.randrange(16 ** 4):04x}"


def resolve_run(arg: str) -> str:
    if arg == "latest":
        if not os.path.isdir(ROOT):
            sys.exit("아직 만든 아레나가 없습니다 (.arena 폴더 없음)")
        runs = sorted(d for d in os.listdir(ROOT) if os.path.isfile(os.path.join(ROOT, d, "state.json")))
        if not runs:
            sys.exit("아직 만든 아레나가 없습니다")
        arg = runs[-1]
    for cand in (arg, os.path.join(ROOT, arg)):
        if os.path.isfile(os.path.join(cand, "state.json")):
            return os.path.abspath(cand)
    sys.exit(f"아레나를 찾을 수 없습니다: {arg}")


def load(run: str) -> Dict:
    with open(os.path.join(run, "state.json"), encoding="utf-8") as f:
        return json.load(f)


def save(run: str, state: Dict) -> None:
    path = os.path.join(run, "state.json")
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(path + ".tmp", path)


def read_text(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, UnicodeDecodeError):
        return ""


def has_text(path: str) -> bool:
    return bool(read_text(path).strip())


def write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def p(run: str, *parts: str) -> str:
    return os.path.join(run, *parts)


def match_dir(run: str, rnd: int, mid: str) -> str:
    return p(run, "rounds", f"r{rnd}", mid)


# ---------------------------------------------------------------- prompts

DONE_LINE = '다 저장했으면 다른 말 없이 "완료" 한 단어로만 답하세요.'

NO_SIDE_EFFECTS = """## 금지
- 지정된 출력 파일 말고는 어떤 파일도 만들거나 고치거나 지우지 마세요. 코드가 필요하면 답 안에 코드 블록으로 쓰세요.
- `.arena` 폴더에서는 위에 적힌 파일만 여세요. 다른 참가자의 파일을 엿보면 안 됩니다.
- 사용자에게 질문하지 마세요. 정보가 모자라면 합리적인 가정을 밝히고 진행하세요."""


def card_block(state: Dict, aid: str) -> str:
    c = state["cards"][aid]
    return (
        "## 당신의 사고 카드\n"
        f"- 사고법 — {c['thinking']['name']}: {c['thinking']['how']}\n"
        f"- 작업흐름 — {c['workflow']['name']}: {c['workflow']['how']}\n"
        f"- 전략 — {c['strategy']['name']}: {c['strategy']['how']}\n"
        "이 카드대로 생각하고 일하세요. 단, 카드는 접근 방법일 뿐이고 답의 정확성과 완결성이 언제나 먼저입니다."
    )


def solve_prompt(run: str, state: Dict, aid: str, out: str) -> str:
    return f"""# 아레나 — 풀이 ({aid})

당신은 '아레나' 토너먼트의 참가자 {aid}입니다. {state['agents']}명이 같은 과제를 서로 다른 사고 카드로 풀고,
답끼리 공격 · 방어 · 심판을 거쳐 마지막 한 답만 남습니다.

{card_block(state, aid)}

## 할 일
1. 과제를 읽으세요: `{p(run, 'task.md')}`
   과제에 경로가 적힌 파일(코드, 문서 등)은 읽어도 됩니다.
2. 과제에 대한 완성된 답을 쓰세요.
   - 과제가 정한 형식과 언어를 따르세요. 정해진 게 없으면 과제와 같은 언어로 쓰세요.
   - 답만 쓰세요. 카드 이야기나 "저는 이렇게 생각했습니다" 같은 메타 설명은 빼세요.
   - 이 답은 나중에 다른 참가자가 공격합니다. 다른 파일 없이 이것만 읽어도 완결되어야 합니다.
3. 답을 이 파일에 저장하세요(Write 도구): `{out}`

{NO_SIDE_EFFECTS}

{DONE_LINE}
"""


def attack_prompt(run: str, state: Dict, aid: str, opp_answer: str, rnd: int, mid: str, out: str) -> str:
    return f"""# 아레나 — 공격 (라운드 {rnd}, 경기 {mid}, 참가자 {aid})

당신은 '아레나' 토너먼트의 참가자 {aid}입니다. 지금은 공격 단계입니다.
상대의 답에서 진짜 결함을 찾아내세요. 심판이 상대 답을 낮게 보면 당신이 다음 라운드로 갑니다.

{card_block(state, aid)}

## 읽을 파일
1. 과제: `{p(run, 'task.md')}` (과제에 경로가 적힌 파일도 읽어도 됩니다)
2. 상대의 답: `{opp_answer}`

## 공격 규칙
- 실제로 존재하는 결함만 지적하세요. 트집, 취향 차이, 과제에 없는 요구는 공격이 아닙니다.
  심판은 근거 없는 공격을 무시하고, 틀린 공격을 한 쪽을 신뢰하지 않습니다.
- 세 방향으로 보세요.
  1) 정확성: 틀린 사실, 논리 비약, 계산 실수, 동작하지 않는 코드
  2) 요구사항: 과제가 요구했는데 빠졌거나 잘못 이해한 것
  3) 실패 조건: 어떤 입력·상황·가정에서 이 답이 무너지는지
- 결함마다 등급을 매기세요.
  - FATAL: 이대로 쓰면 답이 틀리거나 과제를 이루지 못함
  - MAJOR: 쓸 수는 있지만 중요한 부분이 빠지거나 잘못됨
  - MINOR: 작은 부정확, 누락, 모호함
- 심각한 것부터 최대 7개. 정말 결함이 없으면 "결함 없음"이라고만 쓰세요.
- 근거에는 상대 답의 해당 부분을 짧게 인용하고, 가능하면 반례나 올바른 내용을 함께 쓰세요.

## 출력 형식
아래 형식 그대로 `{out}` 에 저장하세요(Write 도구).

```
## 공격 1
등급: FATAL
지적: (한 문장)
근거: (인용 + 왜 틀렸는지 + 반례나 올바른 내용)

## 공격 2
등급: MINOR
...
```

{NO_SIDE_EFFECTS}

{DONE_LINE}
"""


def defend_prompt(run: str, state: Dict, aid: str, own_answer: str, attack: str, rnd: int, mid: str,
                  out_defense: str, out_answer: str) -> str:
    return f"""# 아레나 — 방어 (라운드 {rnd}, 경기 {mid}, 참가자 {aid})

당신은 '아레나' 토너먼트의 참가자 {aid}입니다. 상대가 당신의 답을 공격했습니다.
공격마다 인정하거나 근거를 들어 반박하고, 인정한 것을 고쳐 답을 다시 쓰세요.
이 다음에 심판이 당신의 고친 답과 상대의 고친 답을 비교합니다.

{card_block(state, aid)}

## 읽을 파일
1. 과제: `{p(run, 'task.md')}` (과제에 경로가 적힌 파일도 읽어도 됩니다)
2. 당신의 지금 답: `{own_answer}`
3. 당신의 답에 대한 공격: `{attack}`

## 방어 규칙
- 공격마다 판단하세요: 인정 / 일부 인정 / 반박.
  - 맞는 지적은 인정하고 고치세요. 틀린 지적을 억지로 인정할 필요도 없습니다.
  - 반박에는 반드시 근거(사실, 계산, 과제 문구 인용, 반례)를 쓰세요. 근거 없는 반박은 심판이 무시합니다.
- 고친 답은 전체를 처음부터 다시 쓰세요. "앞과 같음", "변경 없음" 같은 참조 없이 그 파일만으로 완결되어야 합니다.
- 공격받지 않은 좋은 부분은 지우지 마세요. 길게 늘리는 것이 아니라 결함을 없애는 것이 목표입니다.
- 공격이 "결함 없음"이었다면 방어 파일에 "공격 없음"이라고 쓰고, 답을 스스로 한 번 검토해 고칠 점이 있으면 고쳐 저장하세요.

## 출력 — 파일 두 개를 저장하세요(Write 도구)
1. 방어문: `{out_defense}`
```
## 공격 1 — 인정
어떻게 고쳤는지 한두 문장.

## 공격 2 — 반박
근거.
```
2. 고친 답 전체: `{out_answer}`

{NO_SIDE_EFFECTS}

{DONE_LINE}
"""


def judge_prompt(run: str, rnd: int, mid: str, files: Dict[str, str], out: str) -> str:
    rubric = "\n".join(f"- {key} ({ko}, 0~{mx}점): {desc}" for key, ko, mx, desc in RUBRIC)
    example = {
        "1": {key: mx - 3 for key, _, mx, _ in RUBRIC},
        "2": {key: mx - 6 for key, _, mx, _ in RUBRIC},
        "winner": "1",
        "reason": "답 1은 … 때문에 이기고, 답 2는 공격 2(FATAL)를 반박하지 못했고 고치지도 않았다.",
    }
    example["1"]["fatal"] = False
    example["2"]["fatal"] = False
    return f"""# 아레나 — 심판 (라운드 {rnd}, 경기 {mid})

당신은 '아레나' 토너먼트의 중립 심판입니다. 같은 과제에 대한 두 답 중 더 나은 답을 고르세요.
두 참가자는 서로의 답을 공격했고, 각자 방어한 뒤 답을 고쳤습니다. 당신이 평가할 것은 고친 최종 답입니다.

## 읽을 파일
1. 과제: `{files['task']}` (과제에 경로가 적힌 파일도 읽어도 됩니다)
2. 답 1 (최종): `{files['answer1']}`
3. 답 1이 받은 공격: `{files['attack1']}`
4. 답 1의 방어: `{files['defense1']}`
5. 답 2 (최종): `{files['answer2']}`
6. 답 2가 받은 공격: `{files['attack2']}`
7. 답 2의 방어: `{files['defense2']}`

## 판정 규칙
- 공격과 방어는 참고 증거일 뿐입니다. 어느 쪽 말이 맞는지 당신이 직접 확인하세요.
  맞는 공격인데 최종 답에서 고쳐지지 않았다면 감점, 틀린 공격이면 무시하세요.
- 최종 답 자체를 평가하세요. 길이, 자신감 있는 말투, 답의 순서는 품질이 아닙니다.
- fatal은 최종 답에 치명적 결함(이대로 쓰면 틀리거나 과제를 이루지 못함)이 남아 있다고 당신이 확인했을 때만 true입니다.
  치명적 결함이 있는 답은 그런 결함이 없는 답을 이길 수 없습니다.
- 점수 기준:
{rubric}

## 출력
아래 형식의 JSON만 `{out}` 에 저장하세요(Write 도구). 다른 글자, 마크다운 코드 울타리를 넣지 마세요.
점수는 정수입니다. reason은 한두 문장으로, 승부를 가른 결정적 차이를 쓰세요.

{json.dumps(example, ensure_ascii=False, indent=2)}

## 금지
- 지정된 출력 파일 말고는 어떤 파일도 만들거나 고치지 마세요. `.arena` 폴더에서는 위에 적힌 파일만 여세요.

{DONE_LINE}
"""


# ---------------------------------------------------------------- judge parsing


def parse_judge(path: str) -> Optional[Dict]:
    """Returns {"1": {...,"total"}, "2": {...}, "winner": "1"|"2", "reason"} or None if unusable."""
    text = read_text(path).strip()
    if not text:
        return None
    text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    out: Dict = {}
    for side in ("1", "2"):
        raw = data.get(side)
        if not isinstance(raw, dict):
            return None
        scores: Dict = {}
        for key, _, mx, _ in RUBRIC:
            val = raw.get(key)
            if isinstance(val, bool) or not isinstance(val, (int, float)):
                return None
            scores[key] = max(0, min(mx, int(round(val))))
        fatal = raw.get("fatal", False)
        scores["fatal"] = fatal is True or (isinstance(fatal, str) and fatal.strip().lower() == "true")
        scores["total"] = sum(scores[key] for key, _, _, _ in RUBRIC)
        out[side] = scores
    said = str(data.get("winner", "")).strip()
    out["judge_said"] = said if said in ("1", "2") else None
    out["reason"] = str(data.get("reason", "")).strip()
    s1, s2 = out["1"], out["2"]
    if s1["fatal"] != s2["fatal"]:
        winner = "2" if s1["fatal"] else "1"
    elif s1["total"] != s2["total"]:
        winner = "1" if s1["total"] > s2["total"] else "2"
    elif out["judge_said"]:
        winner = out["judge_said"]
    else:
        return None
    out["winner"] = winner
    return out


def count_severities(path: str) -> Dict[str, int]:
    counts = {s: 0 for s in SEVERITIES}
    for m in SEVERITY_RE.finditer(read_text(path)):
        counts[m.group(1).upper()] += 1
    return counts


# ---------------------------------------------------------------- state machine


def new_state(run_id: str, n: int, seed: int) -> Dict:
    rng = random.Random(seed)
    drawn = cardlib.draw(n, rng)
    ids = [f"a{i + 1:03d}" for i in range(n)]
    return {
        "id": run_id,
        "agents": n,
        "seed": seed,
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
        "cards": {aid: cardlib.describe(card) for aid, card in zip(ids, drawn)},
        "phase": "solve",
        "round": 0,
        "alive": ids,
        "forfeited": [],
        "byes_had": [],
        "answers": {},
        "rounds": [],
        "winner": None,
    }


def current_round(state: Dict) -> Dict:
    return state["rounds"][-1]


def walkover_winner(state: Dict, m: Dict) -> Optional[str]:
    """If someone in the match forfeited, the other side wins without a judge."""
    fa, fb = m["a"] in state["forfeited"], m["b"] in state["forfeited"]
    if fa and not fb:
        return m["b"]
    if fb and not fa:
        return m["a"]
    if fa and fb:
        return ""
    return None


def match_files(run: str, state: Dict, rnd: int, m: Dict) -> Dict[str, str]:
    d = match_dir(run, rnd, m["id"])
    files = {}
    for x, y in ((m["a"], m["b"]), (m["b"], m["a"])):
        files[f"attack_by_{x}"] = os.path.join(d, f"attack_by_{x}.md")
        files[f"defense_{x}"] = os.path.join(d, f"defense_{x}.md")
        files[f"answer_{x}"] = os.path.join(d, f"answer_{x}.md")
    files["judge"] = os.path.join(d, "judge.json")
    return files


def job(job_id: str, prompt_path: str, prompt: str, outputs: List[str], note: str = "") -> Dict:
    write_text(prompt_path, prompt)
    for out in outputs:
        os.makedirs(os.path.dirname(out), exist_ok=True)
    return {"id": job_id, "prompt": prompt_path, "outputs": outputs, "note": note}


def pending_jobs(run: str, state: Dict) -> List[Dict]:
    jobs: List[Dict] = []
    phase = state["phase"]
    if phase == "solve":
        for aid in state["alive"]:
            if aid in state["forfeited"]:
                continue
            out = p(run, "answers", f"{aid}.md")
            if not has_text(out):
                jobs.append(job(f"solve-{aid}", p(run, "prompts", f"solve-{aid}.md"),
                                solve_prompt(run, state, aid, out), [out]))
        return jobs

    rnd = state["round"]
    for m in current_round(state)["matches"]:
        if walkover_winner(state, m) is not None:
            continue
        f = match_files(run, state, rnd, m)
        d = match_dir(run, rnd, m["id"])
        pair = ((m["a"], m["b"]), (m["b"], m["a"]))
        if phase == "attack":
            for me, opp in pair:
                out = f[f"attack_by_{me}"]
                if not has_text(out):
                    prompt = attack_prompt(run, state, me, state["answers"][opp], rnd, m["id"], out)
                    jobs.append(job(f"r{rnd}-{m['id']}-attack-{me}", os.path.join(d, f"prompt-attack-{me}.md"),
                                    prompt, [out]))
        elif phase == "defend":
            for me, opp in pair:
                outs = [f[f"defense_{me}"], f[f"answer_{me}"]]
                if not all(has_text(o) for o in outs):
                    prompt = defend_prompt(run, state, me, state["answers"][me], f[f"attack_by_{opp}"], rnd,
                                           m["id"], outs[0], outs[1])
                    jobs.append(job(f"r{rnd}-{m['id']}-defend-{me}", os.path.join(d, f"prompt-defend-{me}.md"),
                                    prompt, outs))
        elif phase == "judge":
            out = f["judge"]
            if parse_judge(out) is None:
                one, two = m["order"]
                files = {
                    "task": p(run, "task.md"),
                    "answer1": f[f"answer_{one}"], "attack1": f[f"attack_by_{two}"], "defense1": f[f"defense_{one}"],
                    "answer2": f[f"answer_{two}"], "attack2": f[f"attack_by_{one}"], "defense2": f[f"defense_{two}"],
                }
                note = "이전 판정 JSON을 읽을 수 없어 다시 실행" if has_text(out) else ""
                jobs.append(job(f"r{rnd}-{m['id']}-judge", os.path.join(d, "prompt-judge.md"),
                                judge_prompt(run, rnd, m["id"], files, out), [out], note))
    return jobs


def pick_bye(state: Dict, alive: List[str]) -> str:
    for aid in reversed(alive):
        if aid not in state["byes_had"]:
            return aid
    return alive[-1]


def start_round(state: Dict) -> None:
    alive = list(state["alive"])
    state["round"] += 1
    rnd = state["round"]
    bye = None
    if len(alive) % 2:
        bye = pick_bye(state, alive)
        alive.remove(bye)
        state["byes_had"].append(bye)
    matches = []
    for i in range(0, len(alive), 2):
        a, b = alive[i], alive[i + 1]
        order = [a, b]
        random.Random(f"{state['seed']}-{rnd}-{i}").shuffle(order)  # hides who is who from the judge
        matches.append({"id": f"m{i // 2 + 1:02d}", "a": a, "b": b, "order": order,
                        "winner": None, "scores": None, "reason": "", "attacks": {}})
    state["rounds"].append({"round": rnd, "matches": matches, "bye": bye})
    state["phase"] = "attack"


def finish(run: str, state: Dict, winner: str) -> None:
    state["winner"] = winner
    state["phase"] = "done"
    write_text(p(run, "final.md"), read_text(state["answers"][winner]))
    write_text(p(run, "result.md"), result_markdown(state))


def advance(run: str, state: Dict) -> None:
    """Moves to the next phase. Only called once every job of the current phase has its output."""
    phase = state["phase"]
    if phase == "solve":
        state["alive"] = [a for a in state["alive"] if a not in state["forfeited"]]
        for aid in state["alive"]:
            state["answers"][aid] = p(run, "answers", f"{aid}.md")
        if not state["alive"]:
            sys.exit("모든 참가자가 기권해서 남은 답이 없습니다")
        if len(state["alive"]) == 1:
            finish(run, state, state["alive"][0])
        else:
            start_round(state)
        return

    rnd = state["round"]
    current = current_round(state)
    if phase == "attack":
        state["phase"] = "defend"
    elif phase == "defend":
        for m in current["matches"]:
            if walkover_winner(state, m) is not None:
                continue
            f = match_files(run, state, rnd, m)
            for x, y in ((m["a"], m["b"]), (m["b"], m["a"])):
                state["answers"][x] = f[f"answer_{x}"]
                m["attacks"][x] = count_severities(f[f"attack_by_{y}"])  # attacks x received
        state["phase"] = "judge"
    elif phase == "judge":
        for m in current["matches"]:
            if m["winner"]:
                continue  # set by hand with `decide`
            wo = walkover_winner(state, m)
            if wo is not None:
                m["winner"] = wo or None
                m["reason"] = "상대 기권" if wo else "둘 다 기권"
                continue
            verdict = parse_judge(match_files(run, state, rnd, m)["judge"])
            one, two = m["order"]
            m["winner"] = one if verdict["winner"] == "1" else two
            m["scores"] = {one: verdict["1"], two: verdict["2"]}
            m["reason"] = verdict["reason"]
            if verdict["judge_said"] and verdict["judge_said"] != verdict["winner"]:
                m["reason"] += " (심판의 winner와 점수가 어긋나 점수를 따름)"
        order = {aid: i for i, aid in enumerate(sorted(state["cards"]))}
        survivors = [m["winner"] for m in current["matches"] if m["winner"]]
        if current["bye"] and current["bye"] not in state["forfeited"]:
            survivors.append(current["bye"])
        state["alive"] = sorted(survivors, key=order.__getitem__)
        if not state["alive"]:
            sys.exit("모든 참가자가 기권해서 남은 답이 없습니다")
        if len(state["alive"]) == 1:
            finish(run, state, state["alive"][0])
        else:
            start_round(state)


def step(run: str) -> Tuple[Dict, List[Dict]]:
    state = load(run)
    if not has_text(p(run, "task.md")):
        sys.exit(f"과제가 비어 있습니다. 먼저 {p(run, 'task.md')} 에 과제를 쓰세요.")
    while state["phase"] != "done":
        jobs = pending_jobs(run, state)
        if jobs:
            save(run, state)
            return state, jobs
        advance(run, state)
        save(run, state)
    return state, []


# ---------------------------------------------------------------- reports

PHASE_KO = {"solve": "풀이", "attack": "공격", "defend": "방어", "judge": "심판", "done": "끝"}


def card_line(state: Dict, aid: str) -> str:
    c = state["cards"][aid]
    return f"{c['thinking']['name']} · {c['workflow']['name']} · {c['strategy']['name']}"


def survived(state: Dict, aid: str) -> Dict[str, int]:
    total = {s: 0 for s in SEVERITIES}
    for r in state["rounds"]:
        for m in r["matches"]:
            for s, k in m["attacks"].get(aid, {}).items():
                total[s] += k
    return total


def match_line(m: Dict) -> str:
    def side(aid: str) -> str:
        score = ""
        if m["scores"]:
            s = m["scores"][aid]
            score = f" {s['total']}점" + (" ☠치명" if s["fatal"] else "")
        name = f"**{aid}**" if m["winner"] == aid else aid
        return name + score
    tail = f" — {m['reason']}" if m["reason"] else ""
    return f"- {m['id']}: {side(m['a'])} vs {side(m['b'])}{tail}"


def bracket_markdown(state: Dict) -> str:
    out = []
    for r in state["rounds"]:
        out.append(f"### 라운드 {r['round']}")
        out.extend(match_line(m) for m in r["matches"])
        if r["bye"]:
            out.append(f"- 부전승: {r['bye']}")
        out.append("")
    return "\n".join(out)


def result_markdown(state: Dict) -> str:
    w = state["winner"]
    sv = survived(state, w)
    path_rows = []
    for r in state["rounds"]:
        if r["bye"] == w:
            path_rows.append(f"| {r['round']} | 부전승 | | | |")
        for m in r["matches"]:
            if w not in (m["a"], m["b"]):
                continue
            opp = m["b"] if m["a"] == w else m["a"]
            score = f"{m['scores'][w]['total']} : {m['scores'][opp]['total']}" if m["scores"] else "-"
            got = m["attacks"].get(w, {})
            got_s = " · ".join(f"{s} {got.get(s, 0)}" for s in SEVERITIES) if got else "-"
            path_rows.append(f"| {r['round']} | {opp} | {score} | {got_s} | {m['reason']} |")
    played = sum(1 for r in state["rounds"] if any(w in (m["a"], m["b"]) for m in r["matches"]))
    return f"""# 아레나 결과 — {state['id']}

- 우승: **{w}** ({card_line(state, w)})
- 이긴 경기 {played}번 · 버텨 낸 공격 FATAL {sv['FATAL']} · MAJOR {sv['MAJOR']} · MINOR {sv['MINOR']}
- 참가 {state['agents']}명 · 라운드 {len(state['rounds'])}개 · 하위 에이전트 호출 최대 {total_calls(state['agents'])}회
- 최종 답 파일: `final.md`

## 최종 답

{read_text(state['answers'][w]).strip()}

## 우승까지

| 라운드 | 상대 | 점수 (우승자 : 상대) | 받은 공격 | 판정 이유 |
| --- | --- | --- | --- | --- |
{chr(10).join(path_rows)}

## 대진표

{bracket_markdown(state)}"""


def status_text(run: str, state: Dict) -> str:
    sizes = bracket_sizes(state["agents"])
    head = (f"아레나 {state['id']} · 참가 {state['agents']}명 · "
            f"라운드 {state['round']}/{len(sizes) - 1} · 단계: {PHASE_KO[state['phase']]} · 남은 {len(state['alive'])}명")
    lines = [head]
    if state["forfeited"]:
        lines.append(f"기권: {', '.join(state['forfeited'])}")
    if state["winner"]:
        lines.append(f"우승: {state['winner']} ({card_line(state, state['winner'])}) → {p(run, 'result.md')}")
    lines.append("")
    lines.append(bracket_markdown(state))
    return "\n".join(lines)


# ---------------------------------------------------------------- commands


def agents_from(args: argparse.Namespace) -> int:
    if args.full:
        return FULL_AGENTS
    if args.quick:
        return QUICK_AGENTS
    return args.agents


def add_size_flags(sp: argparse.ArgumentParser) -> None:
    sp.add_argument("--agents", type=int, default=DEFAULT_AGENTS, help=f"참가자 수 (기본 {DEFAULT_AGENTS})")
    sp.add_argument("--quick", action="store_true", help=f"참가자 {QUICK_AGENTS}명")
    sp.add_argument("--full", action="store_true", help=f"참가자 {FULL_AGENTS}명")


def cmd_plan(args: argparse.Namespace) -> None:
    n = agents_from(args)
    if n < 2:
        sys.exit("참가자는 2명 이상이어야 합니다")
    print(plan_text(n))
    if not (args.quick or args.full) and args.agents == DEFAULT_AGENTS:
        print()
        for k in (QUICK_AGENTS, 32, 64, FULL_AGENTS):
            print(f"  참고: {k}명이면 라운드 {len(bracket_sizes(k)) - 1}개 · 호출 {total_calls(k)}회")


def cmd_init(args: argparse.Namespace) -> None:
    n = agents_from(args)
    if not 2 <= n <= cardlib.TOTAL:
        sys.exit(f"참가자는 2~{cardlib.TOTAL}명이어야 합니다")
    run_id = now_id()
    run = os.path.abspath(os.path.join(ROOT, run_id))
    os.makedirs(run)
    seed = args.seed if args.seed is not None else random.randrange(2 ** 31)
    save(run, new_state(run_id, n, seed))
    gi = os.path.join(ROOT, ".gitignore")
    if not os.path.exists(gi):
        write_text(gi, "*\n")
    print(f"아레나를 만들었습니다: {run}")
    print(plan_text(n))
    print(f"\n다음: 과제를 {os.path.join(run, 'task.md')} 에 쓰고 `arena.py next {run_id}` 를 실행하세요.")


def cmd_next(args: argparse.Namespace) -> None:
    run = resolve_run(args.run)
    state, jobs = step(run)
    if args.json:
        print(json.dumps({"run": run, "phase": state["phase"], "round": state["round"], "jobs": jobs,
                          "result": p(run, "result.md") if state["phase"] == "done" else None},
                         ensure_ascii=False, indent=2))
        return
    if state["phase"] == "done":
        print(f"DONE 우승: {state['winner']} ({card_line(state, state['winner'])})")
        print(f"결과: {p(run, 'result.md')}")
        print(f"최종 답: {p(run, 'final.md')}")
        return
    sizes = bracket_sizes(state["agents"])
    rnd = f"라운드 {state['round']}/{len(sizes) - 1}" if state["round"] else "라운드 0 (풀이)"
    print(f"아레나 {state['id']} · {rnd} · {PHASE_KO[state['phase']]} 단계 · 실행할 작업 {len(jobs)}개 · 남은 참가자 {len(state['alive'])}명")
    print("작업마다 하위 에이전트를 하나씩 띄우고, 프롬프트로 다음 한 줄만 주세요:")
    print('  "<프롬프트 파일> 파일을 읽고 그 안의 지시를 그대로 따르세요."')
    print()
    for j in jobs:
        note = f"  ({j['note']})" if j["note"] else ""
        print(f"{j['id']}\t{j['prompt']}{note}")


def cmd_status(args: argparse.Namespace) -> None:
    run = resolve_run(args.run)
    print(status_text(run, load(run)))


def cmd_forfeit(args: argparse.Namespace) -> None:
    run = resolve_run(args.run)
    state = load(run)
    if args.agent not in state["cards"]:
        sys.exit(f"그런 참가자가 없습니다: {args.agent}")
    if args.agent not in state["alive"]:
        sys.exit(f"{args.agent} 는 이미 탈락했습니다")
    if args.agent not in state["forfeited"]:
        state["forfeited"].append(args.agent)
    save(run, state)
    print(f"{args.agent} 기권 처리했습니다. `arena.py next {state['id']}` 로 계속하세요.")


def cmd_decide(args: argparse.Namespace) -> None:
    run = resolve_run(args.run)
    state = load(run)
    if state["phase"] != "judge":
        sys.exit("심판 단계에서만 쓸 수 있습니다")
    for m in current_round(state)["matches"]:
        if m["id"] == args.match:
            if args.agent not in (m["a"], m["b"]):
                sys.exit(f"{args.agent} 는 {args.match} 경기 참가자가 아닙니다 ({m['a']} vs {m['b']})")
            m["winner"] = args.agent
            m["reason"] = "오케스트레이터가 직접 판정 (심판 실패)"
            # A placeholder verdict so `next` stops asking for this judge.
            write_text(match_files(run, state, state["round"], m)["judge"], json.dumps({
                "1": {**{k: 0 for k, _, _, _ in RUBRIC}, "fatal": False},
                "2": {**{k: 0 for k, _, _, _ in RUBRIC}, "fatal": False},
                "winner": "1" if m["order"][0] == args.agent else "2",
                "reason": m["reason"],
            }, ensure_ascii=False))
            save(run, state)
            print(f"{args.match} 승자를 {args.agent} 로 정했습니다.")
            return
    sys.exit(f"이번 라운드에 {args.match} 경기가 없습니다")


def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(prog="arena.py", description="아레나 토너먼트 진행기")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("plan", help="비용(라운드·호출 수) 미리 보기")
    add_size_flags(sp)
    sp.set_defaults(fn=cmd_plan)

    sp = sub.add_parser("init", help="새 아레나 만들기")
    add_size_flags(sp)
    sp.add_argument("--seed", type=int)
    sp.set_defaults(fn=cmd_init)

    sp = sub.add_parser("next", help="지금 실행할 작업 목록 (다 끝난 단계는 자동으로 넘김)")
    sp.add_argument("run")
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(fn=cmd_next)

    sp = sub.add_parser("status", help="대진표 보기")
    sp.add_argument("run")
    sp.set_defaults(fn=cmd_status)

    sp = sub.add_parser("forfeit", help="계속 실패하는 참가자 기권 처리")
    sp.add_argument("run")
    sp.add_argument("agent")
    sp.set_defaults(fn=cmd_forfeit)

    sp = sub.add_parser("decide", help="심판이 계속 실패한 경기의 승자를 직접 정하기")
    sp.add_argument("run")
    sp.add_argument("match")
    sp.add_argument("agent")
    sp.set_defaults(fn=cmd_decide)

    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
