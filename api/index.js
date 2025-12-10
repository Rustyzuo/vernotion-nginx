// api/index.js
export const config = {
  runtime: 'edge',
};

const PROXY_HOST = 'vernotion.rustyzuo.top'; // 你的域名

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    
    // 1. 初始目标：总是先去 notion.so 碰运气
    // 因为只有 notion.so 知道你的 ID 到底在哪个分片上
    let targetUrl = new URL(url.pathname + url.search, 'https://www.notion.so');

    // 2. 准备请求头（注意：这里不设置 Host，后面动态设置）
    const headers = new Headers(request.headers);
    headers.set('Referer', 'https://www.notion.so');
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    // 删除可能引起权限问题的头
    headers.delete('Host'); 
    headers.delete('Cookie'); 
    headers.delete('Content-Security-Policy');

    // 3. 第一次请求：手动模式 (manual)，不自动跟随，我们要看它跳去哪里
    const initResponse = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'manual' 
    });

    let finalResponse = initResponse;

    // 4. === 关键逻辑：智能追踪分片 ===
    // 如果 notion.so 返回 307/302，说明笔记在分片服务器上
    if ([301, 302, 307, 308].includes(initResponse.status)) {
      const location = initResponse.headers.get('location');
      
      // 如果跳转地址是 notion.site (分片域名)
      if (location && location.includes('notion.site')) {
        // 提取新的目标 URL
        const newTargetUrl = new URL(location);
        
        // !!! 核心修正 !!!
        // 这一次，我们用分片域名的身份去请求
        headers.set('Host', newTargetUrl.host); // 比如 shard-tadpole-39f.notion.site
        headers.set('Referer', `https://${newTargetUrl.host}`);
        
        // 发起第二次请求 (去真正的分片服务器拿数据)
        finalResponse = await fetch(newTargetUrl, {
          method: request.method,
          headers: headers,
          body: request.method !== 'GET' ? request.body : null,
          redirect: 'follow'
        });
      }
    }

    // 5. 处理返回内容
    const responseHeaders = new Headers(finalResponse.headers);
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Security-Policy');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    const contentType = responseHeaders.get('content-type');
    
    if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
      let text = await finalResponse.text();

      // 暴力替换：把所有的 notion.so 和 notion.site 都换成你的域名
      // 这样无论它是哪个分片，在你的网站里点击都会保留在你的域名下
      text = text.replace(/www\.notion\.so/g, PROXY_HOST);
      text = text.replace(/notion\.so/g, PROXY_HOST);
      text = text.replace(/([a-zA-Z0-9-]+\.)?notion\.site/g, PROXY_HOST);

      // 修复协议
      text = text.replace(new RegExp('https://' + PROXY_HOST, 'g'), 'https://' + PROXY_HOST);

      return new Response(text, {
        status: finalResponse.status,
        headers: responseHeaders
      });
    }

    return new Response(finalResponse.body, {
      status: finalResponse.status,
      headers: responseHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
