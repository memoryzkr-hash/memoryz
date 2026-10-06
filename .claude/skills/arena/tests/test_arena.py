"""Plays whole tournaments with fake sub-agents. Run: python3 -m unittest discover -s .claude/skills/arena/tests"""

import contextlib
import io
import json
import os
import random
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
import arena  # noqa: E402
import cards  # noqa: E402


def quiet(fn, *args):
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def fake_agent(job, strength):
    """Writes what a sub-agent would write. Stronger agents (lower id here) get better scores."""
    prompt = read(job["prompt"])
    for out in job["outputs"]:
        if out.endswith("judge.json"):
            # The prompt lists answer 1 / answer 2 paths; the agent id is in the file name.
            a1 = re.search(r"2\. 답 1 \(최종\): `[^`]*answer_(a\d+)\.md`", prompt).group(1)
            a2 = re.search(r"5\. 답 2 \(최종\): `[^`]*answer_(a\d+)\.md`", prompt).group(1)
            side = {}
            for key, aid in (("1", a1), ("2", a2)):
                s = strength[aid]
                side[key] = {"accuracy": s, "completeness": 20, "robustness": 15, "specificity": 10,
                             "clarity": 8, "fatal": False}
            text = "```json\n" + json.dumps({**side, "winner": "1", "reason": "답 1이 답 2보다 낫다"}) + "\n```"
        elif "attack_by_" in out:
            text = "## 공격 1\n등급: **MAJOR**\n지적: x\n근거: y\n\n## 공격 2\n등급: MINOR\n지적: x\n근거: y\n"
        else:
            text = f"답 내용 ({os.path.basename(out)})\n"
        with open(out, "w", encoding="utf-8") as f:
            f.write(text)


class BracketMath(unittest.TestCase):
    def test_sizes_and_calls_match_the_published_table(self):
        self.assertEqual(arena.bracket_sizes(100), [100, 50, 25, 13, 7, 4, 2, 1])
        self.assertEqual(arena.total_calls(100), 595)
        self.assertEqual(arena.total_calls(64), 379)
        self.assertEqual(arena.total_calls(32), 187)
        self.assertEqual(arena.total_calls(16), 91)
        self.assertEqual(arena.total_calls(8), 43)

    def test_cards_are_distinct_and_spread(self):
        self.assertEqual(cards.TOTAL, 2160)
        drawn = cards.draw(100, random.Random(1))
        self.assertEqual(len(set(drawn)), 100)
        first12 = drawn[:12]
        for dim in range(3):
            self.assertEqual(len({c[dim] for c in first12}), 12)
        self.assertEqual(len(set(cards.draw(2160, random.Random(2)))), 2160)


class Judge(unittest.TestCase):
    def write(self, data):
        fd, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as f:
            f.write(data if isinstance(data, str) else json.dumps(data))
        self.addCleanup(os.remove, path)
        return path

    def side(self, acc, fatal=False):
        return {"accuracy": acc, "completeness": 20, "robustness": 15, "specificity": 10, "clarity": 8,
                "fatal": fatal}

    def test_fatal_answer_cannot_beat_a_sound_one(self):
        v = arena.parse_judge(self.write({"1": self.side(30, fatal=True), "2": self.side(5), "winner": "1"}))
        self.assertEqual(v["winner"], "2")

    def test_scores_decide_and_are_clamped(self):
        v = arena.parse_judge(self.write({"1": self.side(99), "2": self.side(29), "winner": "2"}))
        self.assertEqual(v["1"]["accuracy"], 30)
        self.assertEqual(v["winner"], "1")

    def test_tie_uses_judge_winner(self):
        v = arena.parse_judge(self.write({"1": self.side(20), "2": self.side(20), "winner": "2"}))
        self.assertEqual(v["winner"], "2")

    def test_unusable_verdicts(self):
        self.assertIsNone(arena.parse_judge(self.write("판정: 1번 승")))
        self.assertIsNone(arena.parse_judge(self.write({"1": self.side(20), "winner": "1"})))
        self.assertIsNone(arena.parse_judge(self.write({"1": self.side(20), "2": {"accuracy": "high"}})))


class FullRun(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    def start(self, n):
        quiet(arena.main, ["init", "--agents", str(n), "--seed", "7"])
        run = arena.resolve_run("latest")
        with open(os.path.join(run, "task.md"), "w", encoding="utf-8") as f:
            f.write("1부터 10까지 더하면?\n")
        return run

    def play(self, run, n, before_each=None):
        strength = {f"a{i + 1:03d}": 30 - (i % 30) for i in range(n)}  # a001 strongest
        calls = 0
        while True:
            if before_each:
                before_each()
            state, jobs = arena.step(run)
            if not jobs:
                return state, calls
            for j in jobs:
                fake_agent(j, strength)
                calls += 1

    def test_thirteen_agents_with_byes(self):
        run = self.start(13)
        state, calls = self.play(run, 13)
        self.assertEqual(state["phase"], "done")
        self.assertEqual(state["winner"], "a001")
        self.assertEqual(calls, arena.total_calls(13))
        self.assertEqual([len(r["matches"]) for r in state["rounds"]], [6, 3, 2, 1])
        byes = [r["bye"] for r in state["rounds"] if r["bye"]]
        self.assertEqual(len(byes), len(set(byes)))
        result = read(os.path.join(run, "result.md"))
        self.assertIn("우승: **a001**", result)
        self.assertNotIn("답 1", result)  # judge labels are mapped back to agent ids
        self.assertIn("MAJOR 4", result)  # two MAJOR per attack, survived in each of the matches it played
        self.assertTrue(read(os.path.join(run, "final.md")).startswith("답 내용"))

    def test_judge_does_not_see_agent_order(self):
        run = self.start(16)
        self.play(run, 16)
        orders = [m["order"][0] == m["a"] for r in arena.load(run)["rounds"] for m in r["matches"]]
        self.assertIn(True, orders)
        self.assertIn(False, orders)

    def test_forfeit_and_manual_decision(self):
        run = self.start(4)
        state, jobs = arena.step(run)
        for j in jobs:
            if "a002" not in j["id"]:
                fake_agent(j, {f"a{i:03d}": 20 for i in range(1, 5)})
        quiet(arena.main, ["forfeit", run, "a002"])
        state, jobs = arena.step(run)
        self.assertEqual(state["alive"], ["a001", "a003", "a004"])
        while state["phase"] != "judge":
            for j in jobs:
                fake_agent(j, {})
            state, jobs = arena.step(run)
        self.assertEqual(arena.current_round(state)["bye"], "a004")
        quiet(arena.main, ["decide", run, jobs[0]["id"].split("-")[1], "a003"])
        state, jobs = arena.step(run)
        self.assertEqual(state["round"], 2)
        self.assertEqual(state["alive"], ["a003", "a004"])

    def test_missing_task_is_refused(self):
        quiet(arena.main, ["init", "--quick"])
        run = arena.resolve_run("latest")
        with self.assertRaises(SystemExit):
            arena.step(run)


if __name__ == "__main__":
    unittest.main()
