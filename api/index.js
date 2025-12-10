// api/index.js

export const config = {
  runtime: 'edge', // 声明这是一个 Edge Function，即类似 Cloudflare Worker
};

const NOTION_HOST = 'www.notion.so';

// !!! 注意：这里换成你后面在 Vercel 获得的域名，不带 https://
// 例如：'project-name.vercel.app'
const WORKERS_HOST = 'vernotion.rustyzuo.top'; 

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    
    // 处理 Notion 的静态资源路径
    if (url.pathname.startsWith('/app') || url.pathname.startsWith('/api')) {
      // 也可以根据需要做特殊处理，这里保持逻辑一致
    }

    // 构造目标 URL
    const notionUrl = new URL(url.pathname + url.search, `https://${NOTION_HOST}`);

    // 重组请求头
    const newHeaders = new Headers();
    for (const [key, value] of request.headers) {
      if (!['host', 'referer', 'origin', 'content-length'].includes(key.toLowerCase())) {
        newHeaders.set(key, value);
      }
    }
    
    newHeaders.set('Host', NOTION_HOST);
    newHeaders.set('Referer', `https://${NOTION_HOST}`);
    newHeaders.set('Origin', `https://${NOTION_HOST}`);
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // 处理 OPTIONS 请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    const notionRequest = new Request(notionUrl, {
      method: request.method,
      headers: newHeaders,
      body: request.method !== 'GET' ? request.body : null,
      redirect: 'manual' // 手动处理重定向
    });

    let response = await fetch(notionRequest);

    // 如果遇到 302/301 重定向，且跳回了 notion.so，要把它拉回来
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const newLocation = location.replace(NOTION_HOST, WORKERS_HOST);
        return new Response(null, {
          status: response.status,
          headers: {
            'Location': newLocation
          }
        });
      }
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    // 删除 CSP 头，防止样式加载报错
    responseHeaders.delete('Content-Security-Policy');
    responseHeaders.delete('X-Content-Security-Policy');

    const contentType = responseHeaders.get('content-type');
    
    if (contentType?.includes('text/html') || contentType?.includes('application/javascript')) {
      let text = await response.text();
      
      // 核心替换逻辑
      text = text.replace(new RegExp(NOTION_HOST, 'g'), WORKERS_HOST);
      text = text.replace(new RegExp('https://www.notion.so', 'g'), `https://${WORKERS_HOST}`);
      
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
    return new Response(JSON.stringify({
      error: 'Worker Error',
      message: err.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

}
