export const GAME_W = 720;
export const GAME_H = 1280;

/** Top of the card panel; the 3D camera frames the arena above this line. */
export const UI_Y = 1088;

export const FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', 'WenQuanYi Zen Hei', sans-serif";

export const COLORS = {
  side: [0x3b82f6, 0xef4444],
  elixir: 0xd946ef,
  panel: 0x1f2433,
};

export const cardArtKey = (cardId: string) => `card-${cardId}`;
