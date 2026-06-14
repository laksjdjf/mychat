import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

const llamaHost = process.env.LLAMA_HOST || 'localhost'
const llamaPort = process.env.LLAMA_PORT || '8080'
const llamaTarget = `http://${llamaHost}:${llamaPort}`

const comfyHost = process.env.COMFY_HOST || 'localhost'
const comfyPort = process.env.COMFY_PORT || '8188'
const comfyTarget = `http://${comfyHost}:${comfyPort}`

const DATA_DIR = path.resolve(__dirname, 'data')
const PERSONAS_DIR = path.join(DATA_DIR, 'personas')
const TEMPLATES_DIR = path.join(DATA_DIR, 'templates')

function ensureDirs() {
  fs.mkdirSync(PERSONAS_DIR, { recursive: true })
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true })
}

function readJsonDir(dir: string): unknown[] {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try { return [JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))] }
      catch { return [] }
    })
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: string) => (data += chunk))
    req.on('end', () => {
      try { resolve(JSON.parse(data)) }
      catch { reject(new Error('Bad JSON')) }
    })
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'store-api',
      configureServer(server) {
        ensureDirs()
        server.middlewares.use('/store', async (req, res, next) => {
          const url = req.url ?? ''

          function json(data: unknown, status = 200) {
            res.statusCode = status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data))
          }

          try {
            // GET /store/personas
            if (url === '/personas' && req.method === 'GET') {
              return json(readJsonDir(PERSONAS_DIR))
            }
            // PUT /store/personas/:id
            if (url.startsWith('/personas/') && req.method === 'PUT') {
              const id = path.basename(url)
              const body = await parseBody(req)
              fs.writeFileSync(path.join(PERSONAS_DIR, `${id}.json`), JSON.stringify(body, null, 2))
              return json({ ok: true })
            }
            // DELETE /store/personas/:id
            if (url.startsWith('/personas/') && req.method === 'DELETE') {
              const id = path.basename(url)
              try { fs.unlinkSync(path.join(PERSONAS_DIR, `${id}.json`)) } catch {}
              return json({ ok: true })
            }
            // GET /store/templates
            if (url === '/templates' && req.method === 'GET') {
              return json(readJsonDir(TEMPLATES_DIR))
            }
            // PUT /store/templates/:id
            if (url.startsWith('/templates/') && req.method === 'PUT') {
              const id = path.basename(url)
              const body = await parseBody(req)
              fs.writeFileSync(path.join(TEMPLATES_DIR, `${id}.json`), JSON.stringify(body, null, 2))
              return json({ ok: true })
            }
            // DELETE /store/templates/:id
            if (url.startsWith('/templates/') && req.method === 'DELETE') {
              const id = path.basename(url)
              try { fs.unlinkSync(path.join(TEMPLATES_DIR, `${id}.json`)) } catch {}
              return json({ ok: true })
            }
          } catch (e) {
            return json({ error: String(e) }, 500)
          }

          next()
        })
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: llamaTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/comfy': {
        target: comfyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/comfy/, ''),
        // ComfyUIはHostとOriginの不一致を403で弾くため、Originも書き換える
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', comfyTarget)
          })
        },
      },
    },
  },
})
