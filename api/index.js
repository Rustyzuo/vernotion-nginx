export const config = {
  runtime: 'edge',
};

// 目标依然是 Notion 的总入口
const NOTION_HOST = 'www.notion.so';
// 你的加速域名
const WORKERS_HOST = 'vernotion.rustyzuo.top'; 

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    // 1. 构造去 Notion 的请求
    // 我们总是向 notion.so 发起请求，让 notion.so 自动帮我们处理到 notion.site 的跳转
    const notionUrl = new URL(url.pathname + url.search, `https://${NOTION_HOST}`);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('Host', NOTION_HOST);
    requestHeaders.set('Referer', `https://${NOTION_HOST}`);
    requestHeaders.set('Origin', `https://${NOTION_HOST}`); 
    
    // 2. 发起请求，关键在于 redirect: 'follow'
    // 这会让 Vercel 自动追踪 Notion 的 302 跳转，直接拿到最终页面的 HTML
    const response = await fetch(notionUrl, {
      method: request.method,
      headers: requestHeaders,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'follow' 
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Security-Policy');

    const contentType = responseHeaders.get('content-type');

    // 3. 核心：暴力替换所有可能的 Notion 域名
    if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
      let text = await response.text();
      
      // 替换 notion.so
      text = text.replace(new RegExp(NOTION_HOST, 'g'), WORKERS_HOST);
      
      // 替换 notion.site (解决你的 shard-tadpole 问题)
      // 这一句的意思是：把所有 xxx.notion.site 的链接也都换成你的域名
      text = text.replace(/([a-zA-Z0-9-]+\.)?notion\.site/g, WORKERS_HOST);
      
      // 确保 https 协议头正确
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
