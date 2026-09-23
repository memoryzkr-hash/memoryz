import { describe, expect, it } from 'vitest';
import { AiPlayer } from '../src/core/ai';
import { DOUBLE_ELIXIR_AT, ELIXIR_MAX, ELIXIR_START, REGULAR_TIME, TICK_RATE } from '../src/core/constants';
import { canDeploy, playCard, step } from '../src/core/sim';
import { forceHand, newGame, towers } from './helpers';

const run = (state: ReturnType<typeof newGame>, seconds: number) => {
  for (let i = 0; i < seconds * TICK_RATE && state.phase !== 'ended'; i++) step(state);
};

describe('setup', () => {
  it('spawns 3 towers per side with a dormant king', () => {
    const s = newGame();
    for (const side of [0, 1] as const) {
      const t = towers(s, side);
      expect(t).toHaveLength(3);
      expect(t.find((x) => x.type === 'king')!.active).toBe(false);
    }
    expect(s.players[0].elixir).toBe(ELIXIR_START);
  });
});

describe('elixir', () => {
  it('regenerates 1 per 2.8s and caps at 10', () => {
    const s = newGame();
    run(s, 2.8);
    expect(s.players[0].elixir).toBeCloseTo(ELIXIR_START + 1, 1);
    run(s, 60);
    expect(s.players[0].elixir).toBe(ELIXIR_MAX);
  });

  it('doubles in the last minute', () => {
    const s = newGame();
    run(s, DOUBLE_ELIXIR_AT);
    s.players[0].elixir = 0;
    run(s, 2.8);
    expect(s.players[0].elixir).toBeCloseTo(2, 1);
  });
});

describe('deploying', () => {
  it('only allows troops on your own half, spells anywhere', () => {
    const s = newGame();
    expect(canDeploy(s, 0, 'knight', 9.5, 20.5)).toBe(true);
    expect(canDeploy(s, 0, 'knight', 9.5, 10.5)).toBe(false);
    expect(canDeploy(s, 0, 'knight', 9.5, 16)).toBe(false);
    expect(canDeploy(s, 0, 'fireball', 9.5, 5.5)).toBe(true);
    expect(canDeploy(s, 1, 'knight', 9.5, 10.5)).toBe(true);
  });

  it('opens the pocket after an enemy princess tower falls', () => {
    const s = newGame();
    expect(canDeploy(s, 0, 'knight', 3.5, 12.5)).toBe(false);
    towers(s, 1).find((t) => t.type === 'princess' && t.x < 9)!.hp = 0;
    step(s);
    expect(canDeploy(s, 0, 'knight', 3.5, 12.5)).toBe(true);
    expect(canDeploy(s, 0, 'knight', 14.5, 12.5)).toBe(false);
  });

  it('spends elixir and spawns the card count', () => {
    const s = newGame();
    forceHand(s, 0, 'skeletons');
    expect(playCard(s, { side: 0, handIndex: 0, x: 9.5, y: 22.5 })).toBe(true);
    expect(s.players[0].elixir).toBe(7);
    expect(s.entities.filter((e) => e.type === 'skeletons')).toHaveLength(12);
  });

  it('rejects plays without enough elixir', () => {
    const s = newGame();
    forceHand(s, 0, 'giant');
    s.players[0].elixir = 4;
    expect(playCard(s, { side: 0, handIndex: 0, x: 9.5, y: 22.5 })).toBe(false);
  });
});

describe('combat', () => {
  it('a troop walks over a bridge and damages an enemy tower', () => {
    const s = newGame();
    forceHand(s, 0, 'giant');
    playCard(s, { side: 0, handIndex: 0, x: 3.5, y: 20.5 });
    const giant = s.entities.find((e) => e.type === 'giant')!;
    const tower = towers(s, 1).find((t) => t.type === 'princess' && t.x < 9)!;
    run(s, 20);
    expect(giant.y).toBeLessThan(15);
    expect(tower.hp).toBeLessThan(tower.maxHp);
  });

  it('ground troops never stand in the river off a bridge', () => {
    const s = newGame();
    forceHand(s, 0, 'knight');
    playCard(s, { side: 0, handIndex: 0, x: 9.5, y: 18.5 });
    const knight = s.entities.find((e) => e.type === 'knight')!;
    for (let i = 0; i < 20 * TICK_RATE; i++) {
      step(s);
      if (knight.y > 15 && knight.y < 17) expect(Math.min(Math.abs(knight.x - 3.5), Math.abs(knight.x - 14.5))).toBeLessThanOrEqual(1);
    }
  });

  it('ground-only troops ignore air units', () => {
    const s = newGame();
    forceHand(s, 0, 'babydragon');
    playCard(s, { side: 0, handIndex: 0, x: 9.5, y: 20.5 });
    forceHand(s, 1, 'knight');
    playCard(s, { side: 1, handIndex: 0, x: 9.5, y: 12.5 });
    run(s, 8);
    const dragon = s.entities.find((e) => e.type === 'babydragon');
    const knight = s.entities.find((e) => e.type === 'knight');
    expect(dragon?.hp).toBe(dragon?.maxHp);
    expect(knight === undefined || knight.hp < knight.maxHp).toBe(true);
  });

  it('fireball deals reduced damage to crown towers', () => {
    const s = newGame();
    forceHand(s, 0, 'fireball');
    const tower = towers(s, 1).find((t) => t.type === 'princess' && t.x < 9)!;
    playCard(s, { side: 0, handIndex: 0, x: tower.x, y: tower.y });
    run(s, 3);
    expect(tower.maxHp - tower.hp).toBeCloseTo(325 * 0.35, 0);
  });

  it('destroying a princess tower gives a crown and wakes the king', () => {
    const s = newGame();
    const tower = towers(s, 1).find((t) => t.type === 'princess')!;
    tower.hp = 0;
    step(s);
    expect(s.players[0].crowns).toBe(1);
    expect(towers(s, 1).find((t) => t.type === 'king')!.active).toBe(true);
  });

  it('destroying the king tower wins immediately with 3 crowns', () => {
    const s = newGame();
    towers(s, 1).find((t) => t.type === 'king')!.hp = 0;
    step(s);
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(0);
    expect(s.players[0].crowns).toBe(3);
  });
});

describe('match flow', () => {
  it('goes to overtime when tied and ends by tiebreak', () => {
    const s = newGame();
    run(s, REGULAR_TIME + 0.1);
    expect(s.phase).toBe('overtime');
    towers(s, 1)[1].hp = 100;
    run(s, 61);
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(0);
  });

  it('is deterministic for the same seed and inputs', () => {
    const play = () => {
      const s = newGame(7);
      const ai0 = new AiPlayer(0, 'hard', 1);
      const ai1 = new AiPlayer(1, 'normal', 2);
      for (let i = 0; i < 90 * TICK_RATE; i++) {
        for (const ai of [ai0, ai1]) {
          const cmd = ai.update(s);
          if (cmd) playCard(s, cmd);
        }
        step(s);
      }
      return JSON.stringify({ e: s.entities, p: s.players });
    };
    expect(play()).toBe(play());
  });
});

describe('ai', () => {
  it('plays cards and a full AI vs AI match finishes', () => {
    const s = newGame(3);
    const ai0 = new AiPlayer(0, 'hard', 11);
    const ai1 = new AiPlayer(1, 'hard', 12);
    let plays = 0;
    for (let i = 0; i < 300 * TICK_RATE && s.phase !== 'ended'; i++) {
      for (const ai of [ai0, ai1]) {
        const cmd = ai.update(s);
        if (cmd && playCard(s, cmd)) plays++;
      }
      step(s);
    }
    expect(plays).toBeGreaterThan(20);
    expect(s.phase).toBe('ended');
  });
});
