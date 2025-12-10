export const config = {
  runtime: 'edge',
};

const NOTION_HOST = 'www.notion.so';
// ⚠️ 记得改成你的 Vercel 域名 或 自定义域名
const PROXY_HOST = 'vernotion.rustyzuo.top'; 

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    // 1. 定义要访问的 Notion 目标地址
    // 直接把用户访问的 pathname (比如 /123456) 拼接到 notion.so 后面
    const destinationUrl = new URL(url.pathname + url.search, `https://${NOTION_HOST}`);

    // 2. 构造请求头
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('Host', NOTION_HOST);
    requestHeaders.set('Referer', `https://${NOTION_HOST}`);
    requestHeaders.set('Origin', `https://${NOTION_HOST}`);
    
    // 3. 请求 Notion
    const response = await fetch(destinationUrl, {
      method: request.method,
      headers: requestHeaders,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'follow' // 自动追踪 Notion 的跳转
    });

    // 4. 处理返回
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Content-Security-Policy'); // 删除安全策略以允许加载资源
    responseHeaders.delete('X-Content-Security-Policy');

    const contentType = responseHeaders.get('content-type');
    
    // 5. 如果是网页或 JS，需要把里面的 notion.so 替换成你的加速域名
    // 只有这样，你在网页里点击下一层链接时，才会继续走加速通道
    if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
      let text = await response.text();
      
      // 核心替换：把 notion.so 换成你的域名
      text = text.replace(new RegExp(NOTION_HOST, 'g'), PROXY_HOST);
      text = text.replace(/([a-zA-Z0-9-]+\.)?notion\.site/g, PROXY_HOST);
      text = text.replace(new RegExp('https://www.notion.so', 'g'), `https://${PROXY_HOST}`);

      return new Response(text, {
        status: response.status,
        headers: responseHeaders
      });
    }

    // 6. 其他资源（图片、字体）直接透传
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
