export const config = {
  runtime: 'edge',
};

// ⚠️ 关键修改：直接代理这个特定的分片域名
// 只有这样，后续的 API 请求才能正确找到服务器
const NOTION_HOST = 'shard-tadpole-39f.notion.site';

// 你的加速域名
const WORKERS_HOST = 'vernotion.rustyzuo.top'; 

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    // 构造请求 URL
    const notionUrl = new URL(url.pathname + url.search, `https://${NOTION_HOST}`);

    const requestHeaders = new Headers(request.headers);
    // 伪装 Host 为分片域名
    requestHeaders.set('Host', NOTION_HOST);
    requestHeaders.set('Referer', `https://${NOTION_HOST}`);
    requestHeaders.set('Origin', `https://${NOTION_HOST}`);
    
    // 移除可能造成冲突的头
    requestHeaders.delete('Content-Security-Policy');
    requestHeaders.delete('X-Content-Security-Policy');
    requestHeaders.delete('Cookie'); // 尝试移除 Cookie，避免 Session 冲突

    const response = await fetch(notionUrl, {
      method: request.method,
      headers: requestHeaders,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'follow'
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Security-Policy');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    const contentType = responseHeaders.get('content-type');
    
    if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
      let text = await response.text();
      
      // 暴力替换：把分片域名替换成你的加速域名
      text = text.replace(new RegExp(NOTION_HOST, 'g'), WORKERS_HOST);
      
      // 同时也把 notion.so 替换掉，防止漏网之鱼
      text = text.replace(/www\.notion\.so/g, WORKERS_HOST);
      
      // 修复 https 协议
      text = text.replace(new RegExp('https://' + WORKERS_HOST, 'g'), 'https://' + WORKERS_HOST);

      return new Response(text, {
        status: response.status,
        headers: responseHeaders
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
