// api/index.js

export const config = {
  runtime: 'edge',
};

const NOTION_HOST = 'www.notion.so';
const WORKERS_HOST = 'vernotion.rustyzuo.top'; // 你的域名

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    // 1. 构造目标 URL
    const notionUrl = new URL(url.pathname + url.search, `https://${NOTION_HOST}`);

    // 2. 构造请求头
    const newHeaders = new Headers();
    for (const [key, value] of request.headers) {
      if (!['host', 'referer', 'origin', 'content-length', 'cookie'].includes(key.toLowerCase())) {
        newHeaders.set(key, value);
      }
    }
    
    newHeaders.set('Host', NOTION_HOST);
    newHeaders.set('Referer', `https://${NOTION_HOST}`);
    newHeaders.set('Origin', `https://${NOTION_HOST}`);
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 处理 OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    // 3. 发起请求 (保持 manual 模式)
    const notionRequest = new Request(notionUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'manual' 
    });

    let response = await fetch(notionRequest);

    // 4. === 修复核心：增强重定向处理 ===
    if ([301, 302, 307, 308].includes(response.status)) {
      let location = response.headers.get('location');
      if (location) {
        // 修复 A：替换 notion.so
        location = location.replace(NOTION_HOST, WORKERS_HOST);
        location = location.replace('www.notion.so', WORKERS_HOST);
        
        // 修复 B：替换 notion.site (分片域名)
        // 只要遇到 xxx.notion.site，统统换成你的域名
        location = location.replace(/([a-zA-Z0-9-]+\.)?notion\.site/, WORKERS_HOST);
        
        // 修复 C：确保协议是 https
        if (location.startsWith('http://')) {
            location = location.replace('http://', 'https://');
        }

        return new Response(null, {
          status: response.status,
          headers: {
            'Location': location,
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // 5. 处理响应体
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Security-Policy');

    const contentType = responseHeaders.get('content-type');
    
    if (contentType?.includes('text/html') || contentType?.includes('application/javascript') || contentType?.includes('application/json')) {
      let text = await response.text();
      
      // === 修复核心：增强内容替换 ===
      // 1. 替换 notion.so
      text = text.replace(new RegExp(NOTION_HOST, 'g'), WORKERS_HOST);
      text = text.replace(/www\.notion\.so/g, WORKERS_HOST);
      
      // 2. 替换 notion.site
      text = text.replace(/([a-zA-Z0-9-]+\.)?notion\.site/g, WORKERS_HOST);
      
      // 3. 修复 https 前缀重复问题
      text = text.replace(new RegExp('https://' + WORKERS_HOST, 'g'), 'https://' + WORKERS_HOST);

      return new Response(text, {
        status: response.status,
        headers: responseHeaders
      });
    } else {
      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      });
    }

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
