/**
 * GitHub Gist HTTPS REST 客户端。
 * Node 20 自带 fetch，不依赖第三方库；token 用 PAT (scope: gist)。
 */

const API = 'https://api.github.com';

function headers(token: string): Record<string, string> {
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'french-deck',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

export interface GistFiles {
  [filename: string]: { content: string };
}

export async function fetchGist(token: string, gistId: string): Promise<GistFiles> {
  const r = await fetch(`${API}/gists/${gistId}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`fetchGist ${r.status}: ${await r.text()}`);
  const body = await r.json() as { files: Record<string, { content: string; truncated?: boolean; raw_url?: string }> };
  const out: GistFiles = {};
  for (const [name, f] of Object.entries(body.files || {})) {
    let content = f.content;
    // gist 单文件 >1MB 会 truncated，需要再去拉 raw_url
    if (f.truncated && f.raw_url) {
      const rr = await fetch(f.raw_url, { headers: { 'User-Agent': 'french-deck' } });
      if (rr.ok) content = await rr.text();
    }
    out[name] = { content };
  }
  return out;
}

export async function patchGist(token: string, gistId: string, files: GistFiles): Promise<void> {
  const r = await fetch(`${API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files })
  });
  if (!r.ok) throw new Error(`patchGist ${r.status}: ${await r.text()}`);
}

export async function createGist(token: string, files: GistFiles, description: string): Promise<string> {
  const r = await fetch(`${API}/gists`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, public: false, files })
  });
  if (!r.ok) throw new Error(`createGist ${r.status}: ${await r.text()}`);
  const body = await r.json() as { id: string };
  return body.id;
}

/** 测试 token 是否有效 */
export async function validateToken(token: string): Promise<boolean> {
  const r = await fetch(`${API}/user`, { headers: headers(token) });
  return r.ok;
}

/**
 * 列出当前 token 下所有 gist 的 (id, description)。
 * 用于发现别的机器创建过的同步 gist，避免重复创建。
 * 翻页：GitHub 默认 30 / 页，最多 100 / 页；这里取 100 / 页 + 翻 5 页 = 500 条够用。
 */
export async function listMyGists(token: string): Promise<Array<{ id: string; description: string | null }>> {
  const out: Array<{ id: string; description: string | null }> = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`${API}/gists?per_page=100&page=${page}`, { headers: headers(token) });
    if (!r.ok) throw new Error(`listMyGists ${r.status}: ${await r.text()}`);
    const body = await r.json() as Array<{ id: string; description: string | null }>;
    for (const g of body) out.push({ id: g.id, description: g.description });
    if (body.length < 100) break;
  }
  return out;
}
