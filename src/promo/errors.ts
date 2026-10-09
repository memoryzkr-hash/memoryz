/** One place that turns any failure into a short Korean sentence for reports and notifications. */
import Anthropic from '@anthropic-ai/sdk';
import { PromoAiError } from './ai/claude';
import { PlatformError } from './platforms/http';

export function describeError(e: unknown): string {
  if (e instanceof PromoAiError) return e.message;
  if (e instanceof PlatformError) {
    if (e.code === 190) return `토큰이 만료됐거나 취소됐어요 — docs/promo/SETUP.md의 "토큰 다시 받기"를 봐 주세요 (${e.message})`;
    if (e.status === 401 || e.status === 403) return `권한이 없어요 — 토큰·비밀번호와 권한(scope)을 확인해 주세요 (${e.message})`;
    return e.message;
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'Anthropic API 키가 맞지 않아요';
  if (e instanceof Anthropic.RateLimitError) return 'Claude 사용량 한도에 걸렸어요. 콘솔의 한도와 잔액을 확인해 주세요';
  if (e instanceof Anthropic.APIConnectionError) return 'Claude에 연결하지 못했어요';
  if (e instanceof Anthropic.APIError) return `Claude 서버 오류 (${e.status ?? '?'})`;
  return e instanceof Error ? e.message : String(e);
}
