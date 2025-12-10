export const config = {
  runtime: 'edge',
};

// 入口依然是 Notion 官网，让它自己决定把我们踢到哪个分片去
const ENTRY_POINT = 'www.notion.so';
// 你的加速域名
const PROXY_HOST = 'vernotion.rustyzuo.top'; 

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    // 1. 构造目标 URL
    // 我们总是先去敲 notion.so 的门
    const targetUrl = new URL(url.pathname + url.search, `https://${ENTRY_POINT}`);

    // 2. 构造请求头 (关键修改！)
    const requestHeaders = new Headers(request.headers);
    
    // !!! 核心改动 !!!
    // 不要手动 set('Host')！
    // 删掉 Host，让 fetch 函数根据 targetUrl 自动生成正确的 Host
    // 这样当发生 302 跳转时，Host 会自动更新为 shard-xxx.notion.site
    requestHeaders.delete('Host'); 
    requestHeaders.delete('Referer'); // 删掉来源，避免被 Notion 防盗链拦截
    
    // 只伪装 User-Agent，假装是浏览器
    requestHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 3. 发起请求
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: requestHeaders,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'follow' // 自动追踪所有跳转
    });

    // 4. 处理响应
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Security-Policy');
    responseHeaders.delete('X-Frame-Options');

    const contentType = responseHeaders.get('content-type');

    // 5. 暴力替换域名
    if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
      let text = await response.text();

      // 替换 notion.so 为你的域名
      text = text.replace(new RegExp('www.notion.so', 'g'), PROXY_HOST);
      text = text.replace(new RegExp('notion.so', 'g'), PROXY_HOST);
      
      // 关键：替换所有的 notion.site 分片域名
      // 这会让 shard-tadpole-39f.notion.site 也变成你的域名
      text = text.replace(/([a-zA-Z0-9-]+\.)?notion\.site/g, PROXY_HOST);

      // 修复协议
      text = text.replace(new RegExp('https://' + PROXY_HOST, 'g'), 'https://' + PROXY_HOST);

      return new Response(text, {
        status: response.status,
        headers: responseHeaders
      });
    }

    // 透传其他资源
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
