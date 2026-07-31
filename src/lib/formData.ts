import type { NextRequest } from "next/server";

export function emptyToNull(value: string | null): string | null {
  return value === null || value === "" ? null : value;
}

// 버릴 본문을 읽어들이는 상한. formData()가 어차피 본문 전체를 메모리에 올리므로
// 성공 경로보다 넉넉할 필요는 없고, 상한을 넘기면 그냥 드레인을 포기한다
// (= 이 수정 이전과 같은 동작). 무한정 읽어주는 것을 막기 위한 값이다.
const MAX_DRAIN_BYTES = 64 * 1024 * 1024;

/**
 * 아직 읽지 않은 요청 본문을 버퍼에 쌓지 않고 흘려보낸다.
 *
 * 멀티파트 업로드는 클라이언트가 수 MB를 스트리밍하는 중인데, 서버가 본문을 한
 * 바이트도 읽지 않고 응답한 뒤 연결을 닫으면 프록시(Railway edge)에게는 HTTP/1.1
 * 에서 업로드를 멈추게 할 수단이 RST뿐이다. 그러면 클라이언트는 401/403/404 대신
 * ECONNRESET을 받고, 401 기반 토큰 갱신도 영영 발동하지 않는다.
 * 본문이 작을 때는 응답 전에 이미 다 도착해 있어 증상이 없고, 이미지 업로드처럼
 * 소켓 버퍼를 넘길 때만 터지므로 "간헐적 업로드 실패"로 보인다.
 */
async function drainRequestBody(request: NextRequest): Promise<void> {
  const body = request.body;
  if (!body) return;

  const reader = body.getReader();
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      seen += value?.byteLength ?? 0;
      if (seen > MAX_DRAIN_BYTES) break;
    }
    await reader.cancel();
  } catch {
    // 클라이언트가 먼저 끊었으면 응답도 어차피 못 받는다. 조용히 넘어간다.
  }
}

/**
 * 본문을 읽기 전에 에러 응답으로 빠져나갈 때 쓴다.
 * 응답을 돌려주기 전에 남은 본문을 드레인해, 클라이언트가 RST 대신
 * 실제 상태 코드를 받도록 보장한다.
 */
export async function drainThenRespond<T>(
  request: NextRequest,
  response: T
): Promise<T> {
  await drainRequestBody(request);
  return response;
}
