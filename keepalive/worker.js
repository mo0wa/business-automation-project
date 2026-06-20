/**
 * Render 무료 인스턴스 깨우기(keepalive) Cloudflare Worker.
 * 업무시간(KST 08:00~21:59)에 10분마다 /health 를 호출해 잠들지 않게 유지한다.
 * 크론은 wrangler.toml 의 [triggers] 에서 UTC 기준으로 설정.
 */
const TARGET = 'https://business-automation-project.onrender.com/health';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      fetch(TARGET, { method: 'GET' })
        .then((r) => console.log('keepalive', r.status))
        .catch((e) => console.log('keepalive 실패', e.message))
    );
  },
  // 수동 확인용: 워커 URL을 브라우저로 열면 즉시 한 번 핑
  async fetch() {
    const r = await fetch(TARGET).catch(() => null);
    return new Response(`keepalive ping → ${r ? r.status : 'failed'}`);
  },
};
