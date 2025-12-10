export const config = {
  runtime: 'edge',
};

const NOTION_HOST = 'www.notion.so';
const WORKERS_HOST = 'vernotion.rustyzuo.top'; // 你的加速域名

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const notionUrl = new URL(url.pathname + url.search, `https://${NOTION_HOST}`);

    const newHeaders = new Headers();
    for (const [key, value] of request.headers) {
      if (!['host', 'referer', 'origin', 'content-length', 'cookie'].includes(key.toLowerCase())) {
        newHeaders.set(key, value);
      }
    }
    
    newHeaders.set('Host', NOTION_HOST);
    newHeaders.set('Referer', `https://${NOTION_HOST}`);
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 1. 发起请求
    const response = await fetch(notionUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'manual' // 保持 manual 模式
    });

    // 2. === 修复核心：拦截 notion.site 的跳转 ===
    if ([301, 302, 307, 308].includes(response.status)) {
      let location = response.headers.get('location');
      if (location) {
        // 关键修改：不管它是 notion.so 还是 notion.site，统统替换成你的域名
        location = location.replace('www.notion.so', WORKERS_HOST);
        location = location.replace(/([a-zA-Z0-9-]+\.)?notion\.site/, WORKERS_HOST);
        
        // 确保是 https
        if (location.startsWith('http://')) location = location.replace('http://', 'https://');

        return new Response(null, {
          status: response.status,
          headers: {
            'Location': location,
            'Access-Control-Allow-Origin': '*' // 允许跨域
          }
        });
      }
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Security-Policy');

    const contentType = responseHeaders.get('content-type');
    
    if (contentType?.includes('text/html') || contentType?.includes('application/json')) {
      let text = await response.text();
      // 3. 内容也需要把 notion.site 替换掉
      text = text.replace(new RegExp(NOTION_HOST, 'g'), WORKERS_HOST);
      text = text.replace(/([a-zA-Z0-9-]+\.)?notion\.site/g, WORKERS_HOST);
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
